import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { roles } from "../middleware/auth.js";
import { audit } from "../lib/audit.js";
import { redisPing, redisQueueStats } from "../lib/redis.js";

export const systemRouter = Router();

systemRouter.get("/workers", roles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
  const cutoff = new Date(Date.now() - 25_000);
  const rows = await prisma.workerHeartbeat.findMany({ orderBy: { seenAt: "desc" } });
  const jobs = await prisma.job.groupBy({ by: ["status"], _count: true });
  const redis = await redisPing();
  res.json({
    pid: process.pid,
    clusterWorkers: Number(process.env.CLUSTER_WORKERS || 1),
    redis,
    nodes: rows.map((r) => ({
      ...r,
      alive: r.seenAt >= cutoff,
    })),
    queue: Object.fromEntries(jobs.map((j) => [j.status, j._count])),
    redisQueue: await redisQueueStats(),
  });
});

systemRouter.get("/backup", roles("SUPER_ADMIN"), async (req, res) => {
  const dump = {
    exportedAt: new Date().toISOString(),
    settings: await prisma.setting.findMany(),
    branches: await prisma.branch.findMany(),
    users: await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, phone: true, monthlyTarget: true, commissionRate: true, active: true, salary: true, branchId: true } }),
    customers: await prisma.customer.findMany(),
    vendors: await prisma.vendor.findMany(),
    parts: await prisma.part.findMany(),
    orders: await prisma.order.findMany({ include: { lines: true, payments: true } }),
    purchases: await prisma.purchaseOrder.findMany({ include: { lines: true, receipts: true, bills: true } }),
    bills: await prisma.vendorBill.findMany({ include: { payments: true } }),
    journals: await prisma.journal.findMany({ include: { lines: true } }),
    accounts: await prisma.account.findMany(),
    payroll: await prisma.payrollRun.findMany({ include: { lines: true } }),
    returns: await prisma.salesReturn.findMany({ include: { lines: true } }),
  };
  await audit(req, { entity: "System", entityId: "backup", action: "EXPORT" });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="mte-erp-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(dump, null, 2));
});

systemRouter.post("/restore", roles("SUPER_ADMIN"), async (req, res) => {
  const dump = req.body || {};
  if (!dump.settings && !dump.customers && !dump.parts && !dump.vendors) {
    return res.status(400).json({ error: "This file is not an MTE ERP backup." });
  }
  let restored = 0;
  if (Array.isArray(dump.settings)) {
    for (const row of dump.settings) {
      const { id, ...data } = row;
      await prisma.setting.upsert({ where: { id: id || "default" }, create: { id: id || "default", ...data }, update: data });
      restored += 1;
    }
  }
  if (Array.isArray(dump.customers)) {
    for (const row of dump.customers) {
      const { orders, invoices, returns, ...data } = row;
      await prisma.customer.upsert({ where: { id: data.id }, create: data, update: data });
      restored += 1;
    }
  }
  if (Array.isArray(dump.vendors)) {
    for (const row of dump.vendors) {
      const { lines, purchases, bills, ...data } = row;
      await prisma.vendor.upsert({ where: { id: data.id }, create: data, update: data });
      restored += 1;
    }
  }
  if (Array.isArray(dump.parts)) {
    for (const row of dump.parts) {
      const { compat, movements, lines, purchaseLines, serials, returnLines, ...data } = row;
      await prisma.part.upsert({ where: { id: data.id }, create: data, update: data });
      restored += 1;
    }
  }
  await audit(req, { entity: "System", entityId: "backup", action: "RESTORE", newValue: { restored } });
  res.json({ ok: true, restored });
});
