import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { canBypassApproval } from "../lib/auth.js";
import { roles, moduleAccess } from "../middleware/auth.js";
import { ROLE_MODULES, publicUser } from "../lib/access.js";
import { ensureCompany } from "../lib/sequence.js";
import { buildCustomerStatementPdf } from "../lib/pdf.js";
import { cacheDel, destroyUserSessions } from "../lib/redis.js";

export const directoryRouter = Router();

directoryRouter.get("/customers", moduleAccess("customers", "sales"), async (_req, res) => {
  const customers = await prisma.customer.findMany({
    include: { orders: { include: { lines: true, payments: true } } },
    orderBy: { name: "asc" },
  });
  res.json(
    customers.map((c) => {
      const owed = c.orders
        .filter((o) => o.status !== "DRAFT" && o.status !== "CANCELLED")
        .reduce((s, o) => {
          const net = o.lines.reduce((n, l) => n + l.qty * l.salePrice, 0);
          const gross = net * (1 + o.vatRate);
          const paid = o.payments.reduce((p, x) => p + x.amount, 0);
          return s + Math.max(0, gross - paid);
        }, 0);
      return { ...c, orders: undefined, outstanding: Math.round(owed * 100) / 100 };
    })
  );
});

directoryRouter.get("/customers/:id", moduleAccess("customers", "sales"), async (req, res) => {
  const c = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      invoices: {
        include: {
          salesperson: { select: { id: true, name: true } },
          order: { include: { lines: true, payments: true } },
        },
        orderBy: { issuedAt: "desc" },
      },
      orders: {
        include: { lines: true, payments: true, salesperson: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!c) return res.status(404).json({ error: "Customer not found" });
  const invoices = c.invoices.map((inv) => {
    const net = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
    const vat = Math.round(net * inv.vatRate * 100) / 100;
    const paid = inv.order.payments.reduce((s, p) => s + p.amount, 0);
    const credit = inv.order.payments.filter((p) => p.method === "CREDIT_NOTE").reduce((s, p) => s + p.amount, 0);
    return {
      id: inv.id,
      number: inv.number,
      orderId: inv.orderId,
      orderNumber: inv.order.number,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      status: inv.status,
      salesperson: inv.salesperson,
      totals: { net, vat, gross: net + vat, paid, credit, balance: net + vat - paid },
      payments: inv.order.payments,
    };
  });
  const outstanding = Math.round(invoices.reduce((s, inv) => s + Math.max(0, inv.totals.balance), 0) * 100) / 100;
  res.json({
    ...c,
    invoices,
    orders: c.orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      createdAt: o.createdAt,
      salesperson: o.salesperson,
    })),
    outstanding,
  });
});

directoryRouter.get("/customers/:id/statement.pdf", moduleAccess("customers", "sales"), async (req, res) => {
  const c = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      invoices: {
        include: { order: { include: { lines: true, payments: true } } },
        orderBy: { issuedAt: "asc" },
      },
    },
  });
  if (!c) return res.status(404).json({ error: "Customer not found" });
  const { setting } = await ensureCompany();
  let running = 0;
  let invoiced = 0;
  let paid = 0;
  const lines: { date: Date; document: string; debit: number; credit: number; balance: number }[] = [];
  for (const inv of c.invoices) {
    const net = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
    const gross = net + Math.round(net * inv.vatRate * 100) / 100;
    invoiced += gross;
    running += gross;
    lines.push({ date: inv.issuedAt, document: inv.number, debit: gross, credit: 0, balance: running });
    for (const pay of inv.order.payments) {
      paid += pay.amount;
      running -= pay.amount;
      lines.push({
        date: pay.createdAt,
        document: pay.reference || pay.method,
        debit: 0,
        credit: pay.amount,
        balance: running,
      });
    }
  }
  const buf = await buildCustomerStatementPdf({
    customer: c,
    asOf: new Date(),
    outstanding: Math.round(Math.max(0, running) * 100) / 100,
    invoiced: Math.round(invoiced * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    lines,
    company: {
      name: setting.companyName,
      legalName: setting.legalName,
      phone: setting.phone,
      email: setting.email,
      address: setting.address,
      mpesaPaybill: setting.mpesaPaybill,
      mpesaAccount: setting.mpesaAccount,
    },
  });
  const slug = c.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "customer";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}-statement.pdf"`);
  res.send(buf);
});

directoryRouter.post("/customers", moduleAccess("customers", "sales"), async (req, res) => {
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

directoryRouter.patch("/customers/:id", moduleAccess("customers", "sales"), async (req, res) => {
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
      notes: req.body.notes ?? existing.notes,
    },
  });
  await audit(req, { entity: "Customer", entityId: next.id, action: "UPDATE", oldValue: existing, newValue: next });
  res.json(next);
});

directoryRouter.get("/vendors", moduleAccess("vendors", "procurement"), async (_req, res) => {
  res.json(await prisma.vendor.findMany({ orderBy: { name: "asc" } }));
});

directoryRouter.post("/vendors", moduleAccess("vendors", "procurement"), async (req, res) => {
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

directoryRouter.get("/users", moduleAccess("hr", "staff"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, department: true, modules: true, phone: true, monthlyTarget: true, commissionRate: true, active: true, salary: true, jobTitle: true, nationalId: true, hireDate: true, branchId: true, branch: { select: { name: true, code: true } } },
    orderBy: { name: "asc" },
  });
  res.json(users.map((u) => ({ ...publicUser(u), ...u, modules: publicUser(u).modules })));
});

directoryRouter.post("/users", moduleAccess("hr", "staff"), async (req, res) => {
  const { hashPassword } = await import("../lib/auth.js");
  const email = String(req.body.email || "").toLowerCase();
  if (!email || !req.body.name || !req.body.password) return res.status(400).json({ error: "Name, email and password required" });
  const role = String(req.body.role || "SALES");
  if (role === "SUPER_ADMIN" && req.user!.role !== "SUPER_ADMIN") return res.status(403).json({ error: "Only Super Admin can create that role" });
  const modules = Array.from(new Set(["dashboard", ...(Array.isArray(req.body.modules) ? req.body.modules : ROLE_MODULES[role] || [])]));
  const user = await prisma.user.create({
    data: {
      name: req.body.name,
      email,
      phone: req.body.phone,
      role,
      department: String(req.body.department || "Operations"),
      modules: JSON.stringify(modules),
      passwordHash: await hashPassword(String(req.body.password)),
      monthlyTarget: Number(req.body.monthlyTarget || 0),
      commissionRate: Number(req.body.commissionRate || 0.03),
      salary: Number(req.body.salary || 0),
      jobTitle: req.body.jobTitle || undefined,
      hireDate: req.body.hireDate ? new Date(req.body.hireDate) : undefined,
      branchId: req.body.branchId || undefined,
    },
  });
  await audit(req, { entity: "User", entityId: user.id, action: "CREATE", newValue: { email, role, department: user.department, modules } });
  res.status(201).json(publicUser(user));
});

directoryRouter.patch("/users/:id", moduleAccess("hr", "staff"), async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.role === "SUPER_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "You cannot edit Super Admin" });
  }
  const next = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: req.body.name ?? undefined,
      monthlyTarget: req.body.monthlyTarget != null ? Number(req.body.monthlyTarget) : undefined,
      commissionRate: req.body.commissionRate != null ? Number(req.body.commissionRate) : undefined,
      active: typeof req.body.active === "boolean" ? req.body.active : undefined,
      role: req.body.role || undefined,
      department: req.body.department ?? undefined,
      modules: Array.isArray(req.body.modules) ? JSON.stringify(Array.from(new Set(["dashboard", ...req.body.modules]))) : undefined,
      phone: req.body.phone ?? undefined,
      salary: req.body.salary != null ? Number(req.body.salary) : undefined,
      jobTitle: req.body.jobTitle ?? undefined,
      nationalId: req.body.nationalId ?? undefined,
      hireDate: req.body.hireDate === "" || req.body.hireDate === null ? null : req.body.hireDate ? new Date(req.body.hireDate) : undefined,
      branchId: req.body.branchId === "" ? null : req.body.branchId ?? undefined,
    },
  });
  await cacheDel(`user:acl:${next.id}`);
  if (req.body.role || req.body.modules || req.body.active === false) await destroyUserSessions(next.id);
  await audit(req, { entity: "User", entityId: next.id, action: "UPDATE", oldValue: { role: existing.role, modules: existing.modules }, newValue: { role: next.role, modules: next.modules } });
  res.json({ ...publicUser(next), active: next.active, salary: next.salary, monthlyTarget: next.monthlyTarget, commissionRate: next.commissionRate, branchId: next.branchId });
});
