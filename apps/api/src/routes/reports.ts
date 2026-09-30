import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const reportsRouter = Router();

reportsRouter.get("/inventory", async (_req, res) => {
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

reportsRouter.get("/sales", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: ["SALES", "ADMIN", "SUPER_ADMIN"] } },
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

reportsRouter.get("/customers", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    include: { orders: { include: { lines: true, payments: true } } },
  });
  res.json(
    customers
      .map((c) => {
        const live = c.orders.filter((o) => o.status !== "CANCELLED");
        const revenue = live.reduce((s, o) => s + o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0), 0);
        const paid = live.reduce((s, o) => s + o.payments.reduce((n, p) => n + p.amount, 0), 0);
        return { id: c.id, name: c.name, phone: c.phone, orders: live.length, revenue, paid, outstanding: Math.max(0, revenue * 1.16 - paid) };
      })
      .sort((a, b) => b.revenue - a.revenue)
  );
});

reportsRouter.get("/audit", async (req, res) => {
  if (req.user!.role === "SALES") return res.status(403).json({ error: "Not allowed" });
  res.json(
    await prisma.auditLog.findMany({
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  );
});
