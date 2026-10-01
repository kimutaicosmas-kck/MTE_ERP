import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { postPayroll } from "../lib/ledger.js";
import { nextPayrollNumber } from "../lib/sequence.js";
import { moduleAccess } from "../middleware/auth.js";

export const payrollRouter = Router();
payrollRouter.use(moduleAccess("hr"));

payrollRouter.get("/", async (_req, res) => {
  res.json(
    await prisma.payrollRun.findMany({
      include: { lines: { include: { user: { select: { name: true, role: true } } } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    })
  );
});

payrollRouter.post("/", async (req, res) => {
  const year = Number(req.body.year || new Date().getFullYear());
  const month = Number(req.body.month || new Date().getMonth() + 1);
  const number = await nextPayrollNumber(year, month);
  const exists = await prisma.payrollRun.findUnique({ where: { number } });
  if (exists) return res.status(400).json({ error: `${number} already exists` });

  const staff = await prisma.user.findMany({ where: { active: true } });
  const advances = await prisma.salaryAdvance.findMany({
    where: { status: "APPROVED", year, month },
  });
  const advanceByUser = new Map<string, number>();
  for (const row of advances) {
    advanceByUser.set(row.userId, (advanceByUser.get(row.userId) || 0) + row.amount);
  }
  const incoming: { userId: string; basic?: number; allowances?: number; deductions?: number; paye?: number }[] =
    Array.isArray(req.body.lines) && req.body.lines.length ? req.body.lines : staff.map((u) => ({ userId: u.id, basic: u.salary }));

  const run = await prisma.payrollRun.create({
    data: {
      number,
      year,
      month,
      notes: req.body.notes,
      lines: {
        create: incoming.map((l) => {
          const basic = Number(l.basic || 0);
          const allowances = Number(l.allowances || 0);
          const deductions = Number(l.deductions || 0) + (advanceByUser.get(l.userId) || 0);
          const paye = Number(l.paye || 0);
          return { userId: l.userId, basic, allowances, deductions, paye, net: basic + allowances - deductions - paye };
        }),
      },
    },
    include: { lines: { include: { user: { select: { name: true } } } } },
  });
  if (advances.length) {
    await prisma.salaryAdvance.updateMany({
      where: { id: { in: advances.map((a) => a.id) } },
      data: { status: "DEDUCTED" },
    });
  }
  await audit(req, { entity: "PayrollRun", entityId: run.id, action: "CREATE", newValue: { number } });
  res.status(201).json(run);
});

payrollRouter.post("/:id/post", async (req, res) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id }, include: { lines: true } });
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  if (run.status === "POSTED") return res.status(400).json({ error: "Already posted" });
  const basic = run.lines.reduce((s, l) => s + l.basic, 0);
  const allowances = run.lines.reduce((s, l) => s + l.allowances, 0);
  const deductions = run.lines.reduce((s, l) => s + l.deductions, 0);
  const paye = run.lines.reduce((s, l) => s + l.paye, 0);
  const net = run.lines.reduce((s, l) => s + l.net, 0);
  await postPayroll({ id: run.id, number: run.number, basic, allowances, deductions, paye, net, userId: req.user!.id });
  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: { status: "POSTED" },
    include: { lines: { include: { user: { select: { name: true } } } } },
  });
  await audit(req, { entity: "PayrollRun", entityId: run.id, action: "POST", newValue: { number: run.number } });
  res.json(updated);
});
