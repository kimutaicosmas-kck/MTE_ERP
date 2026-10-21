import { Router } from "express";
import { fetchDashboardAlerts } from "../lib/dashboardAlerts.js";
import { prisma } from "../lib/prisma.js";
import { ownOrderWhere } from "../lib/roles.js";

export const dashboardRouter = Router();

dashboardRouter.get("/alerts", async (_req, res) => {
  res.json({ alerts: await fetchDashboardAlerts() });
});

function monthStart(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + offset);
  return d;
}

dashboardRouter.get("/", async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const thisMonth = monthStart(0);
  const lastMonth = monthStart(-1);
  const todayKey = start.toISOString().slice(0, 10);

  const [orders, parts, approvals, payments, recent, inbound, expenses, invoices, bills, employees, leaves, punches, activity] = await Promise.all([
    prisma.order.findMany({ include: { lines: { include: { part: { select: { category: true } } } }, payments: true, salesperson: true, customer: true } }),
    prisma.part.findMany({ include: { movements: true } }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.payment.findMany({ where: { createdAt: { gte: start } } }),
    prisma.order.findMany({
      where: ownOrderWhere(req.user!),
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { customer: true, salesperson: true },
    }),
    prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } }),
    prisma.expense.findMany({ where: { date: { gte: lastMonth } } }),
    prisma.invoice.findMany({
      orderBy: { issuedAt: "desc" },
      include: { customer: true, order: { include: { lines: true, payments: true } } },
    }),
    prisma.vendorBill.findMany({ where: { status: { in: ["OPEN", "PARTIAL"] } } }),
    prisma.user.findMany({ select: { id: true, active: true } }),
    prisma.leaveRequest.findMany(),
    prisma.attendance.findMany({ where: { date: start } }),
    prisma.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const today = orders.filter((o) => o.createdAt >= start && o.status !== "CANCELLED");
  const revenue = today.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
  const cost = today.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.cost, 0), 0);
  const lowParts = parts.filter((p) => p.qtyOnHand <= p.reorderLevel);
  const dead = parts.filter((p) => {
    const last = p.movements.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return last ? Date.now() - last.createdAt.getTime() > 60 * 86400000 : true;
  }).length;
  const dispatch = orders.filter((o) => ["PICKED", "PICKING", "CONFIRMED"].includes(o.status)).length;
  const inventoryValue = parts.reduce((s, p) => s + p.qtyOnHand * p.cost, 0);
  const monthOrders = orders.filter((o) => o.createdAt >= thisMonth && o.status !== "CANCELLED");
  const lastMonthOrders = orders.filter((o) => o.createdAt >= lastMonth && o.createdAt < thisMonth && o.status !== "CANCELLED");
  const monthRevenue = monthOrders.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
  const lastMonthRevenue = lastMonthOrders.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
  const monthExpenses = expenses.filter((e) => e.date >= thisMonth).reduce((s, e) => s + e.amount, 0);
  const lastMonthExpenses = expenses.filter((e) => e.date < thisMonth).reduce((s, e) => s + e.amount, 0);
  const expenseSlices = Object.entries(
    expenses.filter((e) => e.date >= thisMonth).reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const salesMix = Object.entries(
    monthOrders.reduce<Record<string, number>>((acc, o) => {
      for (const line of o.lines) {
        const cat = line.part?.category || "Other";
        acc[cat] = (acc[cat] || 0) + line.qty * line.salePrice;
      }
      return acc;
    }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const receivables = invoices
    .map((inv) => {
      const total = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
      const paid = inv.order.payments.reduce((s, p) => s + p.amount, 0);
      return Math.max(0, total - paid);
    })
    .reduce((s, n) => s + n, 0);
  const payables = bills.reduce((s, b) => s + Math.max(0, b.gross - b.paid), 0);
  const onLeave = leaves.filter((l) => l.startDate <= start && l.endDate >= start).length;
  const present = punches.filter((p) => p.status === "PRESENT" || p.status === "LATE").length;
  const activeStaff = employees.filter((u) => u.active).length;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const thisYear = start.getFullYear();
  const yearTrend = monthNames.map((month, i) => {
    const from = new Date(thisYear, i, 1);
    const to = new Date(thisYear, i + 1, 1);
    const lastFrom = new Date(thisYear - 1, i, 1);
    const lastTo = new Date(thisYear - 1, i + 1, 1);
    const sum = (fromDate: Date, toDate: Date) =>
      orders
        .filter((o) => o.createdAt >= fromDate && o.createdAt < toDate && o.status !== "CANCELLED")
        .reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
    return { month, thisYear: sum(from, to), lastYear: sum(lastFrom, lastTo) };
  });

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const slice = orders.filter((o) => o.createdAt >= d && o.createdAt < next && o.status !== "CANCELLED");
    const dayExp = expenses.filter((e) => e.date >= d && e.date < next);
    return {
      date: d.toISOString().slice(5, 10),
      revenue: slice.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0),
      expenses: dayExp.reduce((s, e) => s + e.amount, 0),
    };
  });

  const invoiceRows = invoices.slice(0, 25).map((inv) => {
    const total = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
    const paid = inv.order.payments.reduce((s, p) => s + p.amount, 0);
    return {
      id: inv.id,
      number: inv.number,
      customer: inv.customer.name,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      total,
      status: paid >= total && total > 0 ? "PAID" : inv.status,
    };
  });

  const alerts = await fetchDashboardAlerts();

  const tasks = [
    ...leaves.filter((l) => l.status === "PENDING").slice(0, 3).map((l) => ({ id: l.id, label: "Leave request waiting", to: "/hr", done: false })),
    ...(approvals ? [{ id: "appr", label: `${approvals} approval${approvals === 1 ? "" : "s"} pending`, to: "/approvals", done: false }] : []),
    ...(lowParts.length ? [{ id: "low", label: `${lowParts.length} product${lowParts.length === 1 ? "" : "s"} on low stock`, to: "/inventory?tab=low", done: false }] : []),
  ].slice(0, 5);

  res.json({
    companyWide: true,
    tiles: {
      ordersToday: today.length,
      revenue,
      profit: revenue - cost,
      paidToday: payments.reduce((s, p) => s + p.amount, 0),
      pendingApprovals: approvals,
      dispatchQueue: dispatch,
      lowStock: lowParts.length,
      deadStock: dead,
      inboundPOs: inbound,
      monthRevenue,
      lastMonthRevenue,
      monthExpenses,
      lastMonthExpenses,
      inventoryValue,
      products: parts.length,
      receivables,
      payables,
      employees: employees.length,
      onLeave,
      attendanceRate: activeStaff ? Math.round((present / activeStaff) * 100) : 0,
    },
    trend: days,
    yearTrend,
    expenses: expenseSlices,
    salesMix,
    recent,
    invoices: invoiceRows,
    inventory: parts
      .slice()
      .sort((a, b) => a.qtyOnHand - a.reorderLevel - (b.qtyOnHand - b.reorderLevel))
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        qtyOnHand: p.qtyOnHand,
        reorderLevel: p.reorderLevel,
        available: p.qtyOnHand,
        status: p.qtyOnHand <= 0 ? "OUT" : p.qtyOnHand <= p.reorderLevel ? "LOW" : "IN",
      })),
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      user: a.user?.name || "System",
      at: a.createdAt,
    })),
    tasks: tasks.length ? tasks : [{ id: "ok", label: "Nothing waiting right now", to: "/", done: true }],
    alerts,
    today: todayKey,
  });
});
