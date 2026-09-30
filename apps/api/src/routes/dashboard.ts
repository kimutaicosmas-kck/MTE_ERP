import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [orders, parts, approvals, payments, recent] = await Promise.all([
    prisma.order.findMany({ include: { lines: true, payments: true, salesperson: true } }),
    prisma.part.findMany({ include: { movements: true } }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.payment.findMany({ where: { createdAt: { gte: start } } }),
    prisma.order.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { customer: true, salesperson: true },
    }),
  ]);

  const today = orders.filter((o) => o.createdAt >= start && o.status !== "CANCELLED");
  const revenue = today.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
  const cost = today.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.cost, 0), 0);
  const low = parts.filter((p) => p.qtyOnHand <= p.reorderLevel).length;
  const dead = parts.filter((p) => {
    const last = p.movements.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return last ? Date.now() - last.createdAt.getTime() > 60 * 86400000 : true;
  }).length;
  const dispatch = orders.filter((o) => ["PICKED", "PICKING", "CONFIRMED"].includes(o.status)).length;

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const slice = orders.filter((o) => o.createdAt >= d && o.createdAt < next && o.status !== "CANCELLED");
    return {
      date: d.toISOString().slice(0, 10),
      revenue: slice.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0),
    };
  });

  res.json({
    tiles: {
      ordersToday: today.length,
      revenue,
      profit: revenue - cost,
      paidToday: payments.reduce((s, p) => s + p.amount, 0),
      pendingApprovals: approvals,
      dispatchQueue: dispatch,
      lowStock: low,
      deadStock: dead,
    },
    trend: days,
    recent,
  });
});
