import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { canModule } from "../lib/access.js";
import { moduleAccess } from "../middleware/auth.js";
import { notifyUsers } from "../lib/push.js";

export const hrRouter = Router();

async function hrAdmin(req: { user?: { id: string } }) {
  if (!req.user) return false;
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, modules: true } });
  return !!user && canModule(user, "hr");
}

function dayStart(value?: string) {
  const raw = value || new Date().toISOString().slice(0, 10);
  return new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
}

function leaveDays(start: Date, end: Date) {
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

hrRouter.get("/people", moduleAccess("hr"), async (_req, res) => {
  res.json(
    await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        department: true,
        jobTitle: true,
        nationalId: true,
        hireDate: true,
        salary: true,
        active: true,
      },
      orderBy: { name: "asc" },
    })
  );
});

hrRouter.patch("/people/:id", moduleAccess("hr"), async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const next = await prisma.user.update({
    where: { id: existing.id },
    data: {
      jobTitle: req.body.jobTitle ?? undefined,
      nationalId: req.body.nationalId ?? undefined,
      hireDate: req.body.hireDate ? dayStart(req.body.hireDate) : undefined,
      phone: req.body.phone ?? undefined,
      department: req.body.department ?? undefined,
      salary: req.body.salary != null ? Number(req.body.salary) : undefined,
    },
    select: {
      id: true, name: true, email: true, phone: true, role: true, department: true,
      jobTitle: true, nationalId: true, hireDate: true, salary: true, active: true,
    },
  });
  await audit(req, { entity: "User", entityId: next.id, action: "HR_UPDATE", newValue: { jobTitle: next.jobTitle, department: next.department } });
  res.json(next);
});

hrRouter.get("/leave", async (req, res) => {
  const admin = await hrAdmin(req);
  res.json(
    await prisma.leaveRequest.findMany({
      where: admin ? undefined : { userId: req.user!.id },
      include: {
        user: { select: { id: true, name: true, department: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  );
});

hrRouter.post("/leave", async (req, res) => {
  const admin = await hrAdmin(req);
  const userId = admin && req.body.userId ? String(req.body.userId) : req.user!.id;
  const startDate = dayStart(req.body.startDate);
  const endDate = dayStart(req.body.endDate || req.body.startDate);
  if (endDate < startDate) return res.status(400).json({ error: "End date is before start date" });
  const row = await prisma.leaveRequest.create({
    data: {
      userId,
      type: String(req.body.type || "ANNUAL"),
      startDate,
      endDate,
      days: leaveDays(startDate, endDate),
      reason: req.body.reason || null,
    },
    include: { user: { select: { id: true, name: true, department: true } } },
  });
  await audit(req, { entity: "LeaveRequest", entityId: row.id, action: "CREATE", newValue: { type: row.type, days: row.days } });
  const managers = await prisma.user.findMany({
    where: { active: true, role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  await notifyUsers(managers.map((u) => u.id), {
    title: "Leave request",
    body: `${row.user.name} requested ${row.days} day(s) ${row.type.toLowerCase()} leave`,
    url: "/hr",
  });
  res.status(201).json(row);
});

hrRouter.post("/leave/:id/decide", moduleAccess("hr"), async (req, res) => {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.status !== "PENDING") return res.status(400).json({ error: "Leave is not pending" });
  const status = req.body.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  const row = await prisma.leaveRequest.update({
    where: { id: existing.id },
    data: { status, reviewerId: req.user!.id },
    include: { user: { select: { id: true, name: true, department: true } }, reviewer: { select: { id: true, name: true } } },
  });
  await audit(req, { entity: "LeaveRequest", entityId: row.id, action: status, newValue: { status } });
  await notifyUsers([row.userId], {
    title: `Leave ${status.toLowerCase()}`,
    body: `${row.type} leave · ${row.days} day(s)`,
    url: "/hr",
  });
  res.json(row);
});

hrRouter.get("/advances", async (req, res) => {
  const admin = await hrAdmin(req);
  res.json(
    await prisma.salaryAdvance.findMany({
      where: admin ? undefined : { userId: req.user!.id },
      include: {
        user: { select: { id: true, name: true, department: true, salary: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  );
});

hrRouter.post("/advances", async (req, res) => {
  const admin = await hrAdmin(req);
  const userId = admin && req.body.userId ? String(req.body.userId) : req.user!.id;
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: "Amount is required" });
  const now = new Date();
  const year = Number(req.body.year || now.getFullYear());
  const month = Number(req.body.month || now.getMonth() + 1);
  const row = await prisma.salaryAdvance.create({
    data: {
      userId,
      amount,
      reason: req.body.reason || null,
      year,
      month,
    },
    include: { user: { select: { id: true, name: true, department: true, salary: true } } },
  });
  await audit(req, { entity: "SalaryAdvance", entityId: row.id, action: "CREATE", newValue: { amount, year, month } });
  const managers = await prisma.user.findMany({
    where: { active: true, role: { in: ["SUPER_ADMIN", "ADMIN", "FINANCE"] } },
    select: { id: true },
  });
  await notifyUsers(managers.map((u) => u.id), {
    title: "Salary advance",
    body: `${row.user.name} requested KES ${Math.round(amount).toLocaleString("en-KE")}`,
    url: "/hr",
  });
  res.status(201).json(row);
});

hrRouter.post("/advances/:id/decide", moduleAccess("hr"), async (req, res) => {
  const existing = await prisma.salaryAdvance.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.status !== "PENDING") return res.status(400).json({ error: "Advance is not pending" });
  const status = req.body.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  const row = await prisma.salaryAdvance.update({
    where: { id: existing.id },
    data: { status, reviewerId: req.user!.id },
    include: { user: { select: { id: true, name: true, department: true, salary: true } }, reviewer: { select: { id: true, name: true } } },
  });
  await audit(req, { entity: "SalaryAdvance", entityId: row.id, action: status, newValue: { status } });
  await notifyUsers([row.userId], {
    title: `Salary advance ${status.toLowerCase()}`,
    body: `KES ${Math.round(row.amount).toLocaleString("en-KE")} · ${row.month}/${row.year}`,
    url: "/hr",
  });
  res.json(row);
});

hrRouter.get("/attendance", moduleAccess("hr"), async (req, res) => {
  const from = dayStart(typeof req.query.from === "string" ? req.query.from : new Date().toISOString().slice(0, 10));
  const to = dayStart(typeof req.query.to === "string" ? req.query.to : from.toISOString().slice(0, 10));
  res.json(
    await prisma.attendance.findMany({
      where: { date: { gte: from, lte: to } },
      include: { user: { select: { id: true, name: true, department: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    })
  );
});

hrRouter.post("/attendance", moduleAccess("hr"), async (req, res) => {
  const userId = String(req.body.userId || req.user!.id);
  const date = dayStart(req.body.date);
  const status = String(req.body.status || "PRESENT");
  const now = new Date();
  const row = await prisma.attendance.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      status,
      checkIn: req.body.checkIn ? new Date(req.body.checkIn) : now,
      notes: req.body.notes || null,
    },
    update: {
      status,
      checkOut: status === "PRESENT" || status === "LATE" ? now : undefined,
      notes: req.body.notes ?? undefined,
    },
    include: { user: { select: { id: true, name: true, department: true } } },
  });
  res.status(201).json(row);
});
