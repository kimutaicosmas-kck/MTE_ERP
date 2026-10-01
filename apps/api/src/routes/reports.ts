import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { moduleAccess } from "../middleware/auth.js";

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
  res.json({
    ageing: [...rows].sort((a, b) => b.daysIdle - a.daysIdle),
    fastest: [...rows].sort((a, b) => b.sold - a.sold).slice(0, 10),
    bestSellers: [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    dead: rows.filter((r) => r.dead),
    reorder: rows.filter((r) => r.low),
  });
});

reportsRouter.get("/sales", moduleAccess("reports"), async (req, res) => {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["SALES", "ADMIN", "SUPER_ADMIN"] },
      ...(req.user!.role === "SALES" ? { id: req.user!.id } : {}),
    },
    include: {
      orders: { include: { lines: true, payments: true } },
    },
  });
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const rows = users.map((u) => {
    const monthOrders = u.orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d.getMonth() === month && d.getFullYear() === year && o.status !== "DRAFT" && o.status !== "CANCELLED";
    });
    const revenue = monthOrders.reduce(
      (s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0),
      0
    );
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      target: u.monthlyTarget,
      revenue,
      attainment: u.monthlyTarget ? revenue / u.monthlyTarget : 0,
      commission: revenue * u.commissionRate,
      orders: monthOrders.length,
    };
  });
  res.json(rows.sort((a, b) => b.revenue - a.revenue));
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

reportsRouter.get("/audit", moduleAccess("audit"), async (_req, res) => {
  res.json(
    await prisma.auditLog.findMany({
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  );
});
