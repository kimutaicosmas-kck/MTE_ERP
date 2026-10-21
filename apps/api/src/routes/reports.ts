import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { moduleAccess } from "../middleware/auth.js";
import { computeVatTotals, sumSaleLines } from "../lib/vat-totals.js";

export const reportsRouter = Router();

reportsRouter.get("/inventory", moduleAccess("reports"), async (_req, res) => {
  const parts = await prisma.part.findMany({ include: { movements: true, lines: true } });
  const now = Date.now();
  const rows = parts.map((p) => {
    const last = p.movements.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const sold = p.lines.reduce((s, l) => s + l.qty, 0);
    const revenue = p.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
    const days = last ? Math.floor((now - last.createdAt.getTime()) / 86400000) : 999;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      binLocation: p.binLocation,
      qtyOnHand: p.qtyOnHand,
      reorderLevel: p.reorderLevel,
      daysIdle: days,
      sold,
      revenue,
      dead: days >= 60 && sold === 0,
      low: p.qtyOnHand <= p.reorderLevel,
      critical: p.critical,
    };
  });
  const bucket = (days: number) => {
    if (days <= 30) return "0-30";
    if (days <= 60) return "31-60";
    if (days <= 90) return "61-90";
    return "90+";
  };
  const ageingBuckets = {
    "0-30": rows.filter((r) => bucket(r.daysIdle) === "0-30"),
    "31-60": rows.filter((r) => bucket(r.daysIdle) === "31-60"),
    "61-90": rows.filter((r) => bucket(r.daysIdle) === "61-90"),
    "90+": rows.filter((r) => bucket(r.daysIdle) === "90+"),
  };
  res.json({
    ageing: [...rows].sort((a, b) => b.daysIdle - a.daysIdle),
    ageingBuckets,
    fastest: [...rows].sort((a, b) => b.sold - a.sold).slice(0, 10),
    bestSellers: [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    dead: rows.filter((r) => r.dead),
    reorder: rows.filter((r) => r.low),
  });
});

function salesPeriod(when: string) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (when === "lastMonth") {
    start.setDate(1);
    start.setMonth(start.getMonth() - 1);
    const monthEnd = new Date(start);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    monthEnd.setHours(23, 59, 59, 999);
    return { start, end: monthEnd, label: "Last month" };
  }
  if (when === "year") {
    start.setMonth(0, 1);
    return { start, end, label: "This year" };
  }
  if (when === "all") {
    return { start: new Date(0), end, label: "All time" };
  }
  start.setDate(1);
  return { start, end, label: "This month" };
}

function orderRevenue(order: { lines: { qty: number; salePrice: number }[] }) {
  return order.lines.reduce((n, l) => n + l.qty * l.salePrice, 0);
}

function orderPaid(order: { payments: { amount: number }[] }) {
  return order.payments.reduce((n, p) => n + p.amount, 0);
}

reportsRouter.get("/sales", moduleAccess("sales", "reports"), async (req, res) => {
  const when = String(req.query.when || "month");
  const { start, end, label } = salesPeriod(when);
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["SALES", "ADMIN", "SUPER_ADMIN"] },
      active: true,
      ...(req.user!.role === "SALES" ? { id: req.user!.id } : {}),
    },
    include: {
      orders: { include: { lines: true, payments: true } },
      invoices: true,
    },
  });

  const rows = users.map((u) => {
    const periodOrders = u.orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= start && d <= end && o.status !== "DRAFT" && o.status !== "CANCELLED";
    });
    const periodInvoices = u.invoices.filter((inv) => {
      const d = new Date(inv.issuedAt);
      return d >= start && d <= end;
    });
    const revenue = periodOrders.reduce((s, o) => s + orderRevenue(o), 0);
    const paid = periodOrders.reduce((s, o) => s + orderPaid(o), 0);
    const markupCommission = periodInvoices.reduce((s, inv) => s + inv.markupCommission, 0);
    const completed = periodOrders.filter((o) => o.status === "DELIVERED" || o.status === "PAID").length;
    const target = when === "year" || when === "all"
      ? u.monthlyTarget * (when === "all" ? 12 : new Date().getMonth() + 1)
      : u.monthlyTarget;
    const attainment = target ? revenue / target : 0;
    const trend = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return periodOrders
        .filter((o) => o.createdAt >= d && o.createdAt < next)
        .reduce((s, o) => s + orderRevenue(o), 0);
    });
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      target,
      revenue,
      paid,
      attainment,
      commission: markupCommission,
      markupTotal: periodInvoices.reduce((s, inv) => s + inv.markupTotal, 0),
      orders: periodOrders.length,
      completed,
      avgOrder: periodOrders.length ? revenue / periodOrders.length : 0,
      trend,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const summary = {
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
    completed: rows.reduce((s, r) => s + r.completed, 0),
    target: rows.reduce((s, r) => s + r.target, 0),
    commission: rows.reduce((s, r) => s + r.commission, 0),
  };

  res.json({
    period: when,
    label,
    from: start.toISOString(),
    to: end.toISOString(),
    summary: {
      ...summary,
      attainment: summary.target ? summary.revenue / summary.target : 0,
    },
    rows,
  });
});

reportsRouter.get("/customers", moduleAccess("reports", "customers"), async (req, res) => {
  const customers = await prisma.customer.findMany({
    include: { orders: { include: { lines: true, payments: true } } },
  });
  const mine = req.user!.role === "SALES";
  res.json(
    customers
      .map((c) => {
        const live = c.orders.filter((o) => o.status !== "CANCELLED" && (!mine || o.salespersonId === req.user!.id));
        const revenue = live.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
        const paid = live.reduce((s, o) => s + o.payments.reduce((n, p) => n + p.amount, 0), 0);
        return { id: c.id, name: c.name, phone: c.phone, orders: live.length, revenue, paid, outstanding: Math.max(0, revenue * 1.16 - paid) };
      })
      .filter((c) => !mine || c.orders > 0)
      .sort((a, b) => b.revenue - a.revenue)
  );
});

reportsRouter.get("/customer-balances", moduleAccess("reports", "customers"), async (req, res) => {
  const asOfRaw = String(req.query.asOf || new Date().toISOString().slice(0, 10));
  const asOf = new Date(`${asOfRaw}T23:59:59.999`);
  if (Number.isNaN(+asOf)) return res.status(400).json({ error: "Invalid as-of date" });

  const salespeople = await prisma.user.findMany({
    where: { role: { in: ["SALES", "ADMIN", "SUPER_ADMIN"] }, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let salespersonId = req.query.salespersonId ? String(req.query.salespersonId) : "";
  if (req.user!.role === "SALES") salespersonId = req.user!.id;

  const invoices = await prisma.invoice.findMany({
    where: {
      issuedAt: { lte: asOf },
      ...(salespersonId ? { salespersonId } : {}),
    },
    include: {
      customer: true,
      order: { include: { lines: true, payments: true } },
    },
  });

  const map = new Map<string, { id: string; name: string; invoiced: number; paid: number; credit: number; balance: number }>();
  for (const inv of invoices) {
    const net = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
    const gross = Math.round((net + net * inv.vatRate) * 100) / 100;
    const paidRows = inv.order.payments.filter((p) => p.createdAt <= asOf);
    const paid = paidRows.reduce((s, p) => s + p.amount, 0);
    const credit = paidRows.filter((p) => p.method === "CREDIT_NOTE").reduce((s, p) => s + p.amount, 0);
    const balance = Math.round((gross - paid) * 100) / 100;
    const cur = map.get(inv.customerId) || { id: inv.customerId, name: inv.customer.name, invoiced: 0, paid: 0, credit: 0, balance: 0 };
    cur.invoiced += gross;
    cur.paid += paid;
    cur.credit += credit;
    cur.balance += balance;
    map.set(inv.customerId, cur);
  }

  const rows = [...map.values()]
    .map((r) => ({ ...r, balance: Math.round(r.balance * 100) / 100 }))
    .filter((r) => Math.abs(r.balance) > 0.01)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    asOf: asOfRaw,
    salespersonId: salespersonId || null,
    salespeople: req.user!.role === "SALES" ? salespeople.filter((s) => s.id === req.user!.id) : salespeople,
    total: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100,
    rows,
  });
});

reportsRouter.get("/collections", moduleAccess("finance", "reports"), async (_req, res) => {
  const invoices = await prisma.invoice.findMany({
    include: {
      customer: true,
      salesperson: { select: { id: true, name: true } },
      order: { include: { lines: true, payments: true } },
    },
    orderBy: { issuedAt: "desc" },
  });
  const now = Date.now();
  const rows = invoices
    .map((inv) => {
      const net = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
      const gross = Math.round((net + net * inv.vatRate) * 100) / 100;
      const paid = inv.order.payments.reduce((s, p) => s + p.amount, 0);
      const balance = Math.round((gross - paid) * 100) / 100;
      if (balance <= 0.01) return null;
      const dueAt = inv.dueAt || new Date(inv.issuedAt.getTime() + 30 * 86400000);
      const daysOverdue = Math.floor((now - dueAt.getTime()) / 86400000);
      const bucket = daysOverdue <= 0 ? "current" : daysOverdue <= 7 ? "7" : daysOverdue <= 14 ? "14" : daysOverdue <= 30 ? "30" : "30+";
      const phone = inv.customer.phone || "";
      const digits = phone.replace(/\D/g, "").replace(/^0/, "254");
      const msg = `Hello ${inv.customer.name}, invoice ${inv.number} for KES ${balance.toLocaleString()} is ${daysOverdue > 0 ? `${daysOverdue} days overdue` : "due"}. Please arrange payment. Thank you — MTE.`;
      return {
        id: inv.id,
        orderId: inv.orderId,
        number: inv.number,
        customerId: inv.customerId,
        customer: inv.customer.name,
        phone,
        salesperson: inv.salesperson?.name || "—",
        issuedAt: inv.issuedAt,
        dueAt,
        gross,
        balance,
        daysOverdue,
        bucket,
        creditLimit: inv.customer.creditLimit,
        reminderText: msg,
        mailto: inv.customer.email
          ? `mailto:${encodeURIComponent(inv.customer.email)}?subject=${encodeURIComponent(`Invoice ${inv.number}`)}&body=${encodeURIComponent(msg)}`
          : null,
        smsHint: digits ? `tel:+${digits}` : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.daysOverdue - a!.daysOverdue) || (b!.balance - a!.balance));

  const summary = {
    total: Math.round(rows.reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    overdue: rows.filter((r) => r!.daysOverdue > 0).length,
    overdueAmount: Math.round(rows.filter((r) => r!.daysOverdue > 0).reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    current: rows.filter((r) => r!.bucket === "current").length,
  };
  const agingMatrix = {
    current: Math.round(rows.filter((r) => r!.bucket === "current").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days1_7: Math.round(rows.filter((r) => r!.bucket === "7").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days8_14: Math.round(rows.filter((r) => r!.bucket === "14").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days15_30: Math.round(rows.filter((r) => r!.bucket === "30").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days30plus: Math.round(rows.filter((r) => r!.bucket === "30+").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
  };
  res.json({ summary, agingMatrix, rows });
});

reportsRouter.get("/payables-aging", moduleAccess("finance", "reports"), async (_req, res) => {
  const bills = await prisma.vendorBill.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    include: { vendor: true, purchase: { select: { number: true, expectedAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const now = Date.now();
  const rows = bills
    .map((b) => {
      const balance = Math.round((b.gross - b.paid) * 100) / 100;
      if (balance <= 0.01) return null;
      const dueAt = b.purchase?.expectedAt || new Date(b.createdAt.getTime() + 30 * 86400000);
      const daysOverdue = Math.floor((now - dueAt.getTime()) / 86400000);
      const bucket = daysOverdue <= 0 ? "current" : daysOverdue <= 7 ? "7" : daysOverdue <= 14 ? "14" : daysOverdue <= 30 ? "30" : "30+";
      return {
        id: b.id,
        number: b.number,
        vendor: b.vendor.name,
        purchase: b.purchase?.number || "—",
        dueAt,
        balance,
        daysOverdue,
        bucket,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.daysOverdue - a!.daysOverdue) || (b!.balance - a!.balance));

  const summary = {
    total: Math.round(rows.reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    overdue: rows.filter((r) => r!.daysOverdue > 0).length,
    overdueAmount: Math.round(rows.filter((r) => r!.daysOverdue > 0).reduce((s, r) => s + r!.balance, 0) * 100) / 100,
  };
  const agingMatrix = {
    current: Math.round(rows.filter((r) => r!.bucket === "current").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days1_7: Math.round(rows.filter((r) => r!.bucket === "7").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days8_14: Math.round(rows.filter((r) => r!.bucket === "14").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days15_30: Math.round(rows.filter((r) => r!.bucket === "30").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
    days30plus: Math.round(rows.filter((r) => r!.bucket === "30+").reduce((s, r) => s + r!.balance, 0) * 100) / 100,
  };
  res.json({ summary, agingMatrix, rows });
});

reportsRouter.get("/reorder-suggestions", moduleAccess("inventory", "procurement", "reports"), async (_req, res) => {
  const [parts, openOrders] = await Promise.all([
    prisma.part.findMany({ include: { compat: true } }),
    prisma.order.findMany({
      where: { status: { in: ["CONFIRMED", "PICKING", "PICKED"] } },
      include: { lines: true },
    }),
  ]);
  const demand = new Map<string, number>();
  for (const o of openOrders) {
    for (const line of o.lines) {
      demand.set(line.partId, (demand.get(line.partId) || 0) + line.qty);
    }
  }
  const rows = parts
    .map((p) => {
      const reserved = demand.get(p.id) || 0;
      const short = Math.max(0, p.reorderLevel - p.qtyOnHand);
      const coverDemand = Math.max(0, reserved - p.qtyOnHand);
      const suggested = Math.max(short, coverDemand);
      if (suggested <= 0 && p.qtyOnHand > p.reorderLevel) return null;
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        oemNumber: p.oemNumber,
        binLocation: p.binLocation,
        qtyOnHand: p.qtyOnHand,
        reorderLevel: p.reorderLevel,
        reserved,
        suggested,
        critical: p.critical,
        available: Math.max(0, p.qtyOnHand - reserved),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const score = (r: typeof a) => (r!.critical ? 0 : 1) * 1000 + (r!.available <= 0 ? 0 : 1) * 100 + (100 - r!.qtyOnHand);
      return score(a) - score(b);
    });
  res.json({
    summary: { skus: rows.length, units: rows.reduce((s, r) => s + r!.suggested, 0) },
    rows,
  });
});

reportsRouter.get("/mpesa-reconcile", moduleAccess("finance"), async (_req, res) => {
  const txns = await prisma.mpesaTxn.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const unallocated = txns.filter((t) => t.status === "SUCCESS" && !t.paymentId);
  const pendingStk = txns.filter((t) => t.kind === "STK" && t.status === "PENDING");
  const failed = txns.filter((t) => t.status === "FAILED" || t.status === "CANCELLED");
  const byReceipt = new Map<string, typeof txns>();
  for (const t of txns) {
    if (!t.receipt) continue;
    const list = byReceipt.get(t.receipt) || [];
    list.push(t);
    byReceipt.set(t.receipt, list);
  }
  const duplicates = [...byReceipt.entries()].filter(([, list]) => list.length > 1).map(([receipt, list]) => ({ receipt, count: list.length, ids: list.map((t) => t.id) }));
  res.json({
    summary: {
      unallocated: unallocated.length,
      unallocatedAmount: Math.round(unallocated.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      pendingStk: pendingStk.length,
      failed: failed.length,
      duplicates: duplicates.length,
    },
    unallocated: unallocated.slice(0, 50),
    pendingStk: pendingStk.slice(0, 30),
    failed: failed.slice(0, 30),
    duplicates,
  });
});

reportsRouter.get("/sales-daily", moduleAccess("sales", "reports"), async (req, res) => {
  const uid = req.user!.role === "SALES" ? req.user!.id : String(req.query.userId || req.user!.id);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const stale = new Date(Date.now() - 3 * 86400000);

  const [orders, invoices] = await Promise.all([
    prisma.order.findMany({
      where: { salespersonId: uid, status: { not: "CANCELLED" } },
      include: { customer: true, lines: true, payments: true, invoice: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { salespersonId: uid },
      include: { customer: true, order: { include: { lines: true, payments: true } } },
    }),
  ]);

  const quotesToFollow = orders.filter((o) => o.status === "DRAFT" && o.createdAt <= stale);
  const awaitingPayment = invoices
    .map((inv) => {
      const net = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
      const gross = Math.round((net + net * inv.vatRate) * 100) / 100;
      const paid = inv.order.payments.reduce((s, p) => s + p.amount, 0);
      const balance = Math.round((gross - paid) * 100) / 100;
      return balance > 0.01 ? { id: inv.id, orderId: inv.orderId, number: inv.number, customer: inv.customer.name, balance } : null;
    })
    .filter(Boolean);
  const deliveriesToday = orders.filter((o) => ["CONFIRMED", "PICKING", "PICKED", "DISPATCHED"].includes(o.status));
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const monthOrders = orders.filter((o) => o.createdAt >= monthStart && o.status !== "DRAFT");
  const monthRevenue = monthOrders.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
  const monthInvoices = invoices.filter((inv) => inv.issuedAt >= monthStart);
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { name: true, monthlyTarget: true, commissionRate: true } });
  const commission = monthInvoices.reduce((s, inv) => s + inv.markupCommission, 0);

  res.json({
    user: user?.name || "Sales",
    quotesToFollow,
    awaitingPayment,
    deliveriesToday: deliveriesToday.map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, status: o.status })),
    stats: {
      monthRevenue,
      target: user?.monthlyTarget || 0,
      commission,
      openQuotes: orders.filter((o) => o.status === "DRAFT").length,
    },
  });
});

reportsRouter.get("/vendors", moduleAccess("procurement", "reports", "vendors"), async (_req, res) => {
  const vendors = await prisma.vendor.findMany({
    include: {
      purchases: {
        include: { lines: true, receipts: { include: { lines: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const rows = vendors.map((v) => {
    const completed = v.purchases.filter((p) => p.status === "RECEIVED" || p.status === "PARTIAL");
    let leadDays = 0;
    let leadCount = 0;
    let shortLines = 0;
    let totalLines = 0;
    for (const po of completed) {
      const ordered = po.createdAt;
      const firstReceipt = po.receipts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (firstReceipt) {
        leadDays += Math.max(0, Math.floor((firstReceipt.createdAt.getTime() - ordered.getTime()) / 86400000));
        leadCount += 1;
      }
      for (const line of po.lines) {
        totalLines += 1;
        const received = po.receipts.flatMap((r) => r.lines || []).filter((l) => l.partId === line.partId).reduce((s, l) => s + l.qty, 0);
        if (received < line.qty) shortLines += 1;
      }
    }
    const open = v.purchases.filter((p) => ["ORDERED", "PARTIAL"].includes(p.status)).length;
    return {
      id: v.id,
      name: v.name,
      phone: v.phone,
      oem: v.oem,
      leadDays: v.leadDays,
      avgLeadDays: leadCount ? Math.round(leadDays / leadCount) : null,
      onTime: leadCount && v.leadDays ? Math.round((completed.filter((p) => {
        const r = p.receipts[0];
        if (!r) return false;
        const days = Math.floor((r.createdAt.getTime() - p.createdAt.getTime()) / 86400000);
        return days <= v.leadDays;
      }).length / leadCount) * 100) : null,
      shortRate: totalLines ? Math.round((shortLines / totalLines) * 100) : 0,
      orders: v.purchases.length,
      openPOs: open,
    };
  }).sort((a, b) => b.orders - a.orders);
  res.json({ rows });
});

reportsRouter.get("/audit", moduleAccess("audit"), async (_req, res) => {
  res.json(
    await prisma.auditLog.findMany({
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  );
});
