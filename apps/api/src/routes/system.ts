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
