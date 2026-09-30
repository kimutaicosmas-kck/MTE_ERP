import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { canBypassApproval } from "../lib/auth.js";

export const directoryRouter = Router();

directoryRouter.get("/customers", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    include: { orders: { include: { lines: true, payments: true } } },
    orderBy: { name: "asc" },
  });
  res.json(
    customers.map((c) => {
      const owed = c.orders.reduce((s, o) => {
        const net = o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0);
        const gross = net * (1 + o.vatRate);
        const paid = o.payments.reduce((p, x) => p + x.amount, 0);
        return s + Math.max(0, gross - paid);
      }, 0);
      return { ...c, orders: undefined, outstanding: Math.round(owed * 100) / 100 };
    })
  );
});

directoryRouter.post("/customers", async (req, res) => {
  const c = await prisma.customer.create({
    data: {
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      kraPin: req.body.kraPin,
      creditLimit: Number(req.body.creditLimit || 0),
      paymentTerms: req.body.paymentTerms || "COD",
      notes: req.body.notes,
    },
  });
  await audit(req, { entity: "Customer", entityId: c.id, action: "CREATE", newValue: c });
  res.status(201).json(c);
});

directoryRouter.patch("/customers/:id", async (req, res) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (req.body.creditLimit != null && Number(req.body.creditLimit) > existing.creditLimit) {
    if (!canBypassApproval(req.user!.role)) {
      const approval = await prisma.approval.create({
        data: {
          type: "CREDIT_OVERRIDE",
          entity: "Customer",
          entityId: existing.id,
          oldValue: JSON.stringify({ creditLimit: existing.creditLimit }),
          newValue: JSON.stringify({ creditLimit: Number(req.body.creditLimit) }),
          reason: req.body.reason || "Increase credit limit",
          requesterId: req.user!.id,
        },
      });
      return res.status(202).json({ pending: true, approval });
    }
  }
  const next = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      name: req.body.name ?? existing.name,
      phone: req.body.phone ?? existing.phone,
      email: req.body.email ?? existing.email,
      kraPin: req.body.kraPin ?? existing.kraPin,
      creditLimit: req.body.creditLimit != null ? Number(req.body.creditLimit) : existing.creditLimit,
      paymentTerms: req.body.paymentTerms ?? existing.paymentTerms,
    },
  });
  await audit(req, { entity: "Customer", entityId: next.id, action: "UPDATE", oldValue: existing, newValue: next });
  res.json(next);
});

directoryRouter.get("/vendors", async (_req, res) => {
  res.json(await prisma.vendor.findMany({ orderBy: { name: "asc" } }));
});

directoryRouter.post("/vendors", async (req, res) => {
  const v = await prisma.vendor.create({
    data: {
      name: req.body.name,
      phone: req.body.phone,
      leadDays: Number(req.body.leadDays || 7),
      oem: Boolean(req.body.oem),
    },
  });
  await audit(req, { entity: "Vendor", entityId: v.id, action: "CREATE", newValue: v });
  res.status(201).json(v);
});

directoryRouter.get("/users", async (_req, res) => {
  res.json(
    await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, phone: true, monthlyTarget: true, commissionRate: true, active: true },
      orderBy: { name: "asc" },
    })
  );
});

directoryRouter.post("/users", async (req, res) => {
  if (!["SUPER_ADMIN", "ADMIN"].includes(req.user!.role)) return res.status(403).json({ error: "Not allowed" });
  const { hashPassword } = await import("../lib/auth.js");
  const email = String(req.body.email || "").toLowerCase();
  if (!email || !req.body.name || !req.body.password) return res.status(400).json({ error: "Name, email and password required" });
  const user = await prisma.user.create({
    data: {
      name: req.body.name,
      email,
      phone: req.body.phone,
      role: req.body.role || "SALES",
      passwordHash: await hashPassword(String(req.body.password)),
      monthlyTarget: Number(req.body.monthlyTarget || 0),
      commissionRate: Number(req.body.commissionRate || 0.03),
    },
  });
  await audit(req, { entity: "User", entityId: user.id, action: "CREATE", newValue: { email, role: user.role } });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

directoryRouter.patch("/users/:id", async (req, res) => {
  if (!["SUPER_ADMIN", "ADMIN"].includes(req.user!.role)) return res.status(403).json({ error: "Not allowed" });
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const next = await prisma.user.update({
    where: { id: existing.id },
    data: {
      monthlyTarget: req.body.monthlyTarget != null ? Number(req.body.monthlyTarget) : undefined,
      commissionRate: req.body.commissionRate != null ? Number(req.body.commissionRate) : undefined,
      active: typeof req.body.active === "boolean" ? req.body.active : undefined,
      role: req.body.role || undefined,
      phone: req.body.phone ?? undefined,
    },
  });
  await audit(req, { entity: "User", entityId: next.id, action: "UPDATE", oldValue: existing, newValue: next });
  res.json({ id: next.id, name: next.name, monthlyTarget: next.monthlyTarget, commissionRate: next.commissionRate, active: next.active, role: next.role });
});
