import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { roles } from "../middleware/auth.js";

export const systemRouter = Router();

systemRouter.get("/workers", roles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
  const cutoff = new Date(Date.now() - 25_000);
  const rows = await prisma.workerHeartbeat.findMany({ orderBy: { seenAt: "desc" } });
  const jobs = await prisma.job.groupBy({ by: ["status"], _count: true });
  res.json({
    pid: process.pid,
    clusterWorkers: Number(process.env.CLUSTER_WORKERS || 1),
    nodes: rows.map((r) => ({
      ...r,
      alive: r.seenAt >= cutoff,
    })),
    queue: Object.fromEntries(jobs.map((j) => [j.status, j._count])),
  });
});
