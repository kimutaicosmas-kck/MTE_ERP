import { prisma } from "./prisma.js";
import { claimRedisJob, enqueueRedis, failRedisJob, redisReady } from "./redis.js";

export async function enqueue(type: string, payload: unknown, delayMs = 0) {
  if (await enqueueRedis(type, payload, delayMs)) {
    return { id: "redis", type };
  }
  return prisma.job.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      runAt: new Date(Date.now() + delayMs),
    },
  });
}

export async function claimJob(workerId: string) {
  if (redisReady()) {
    const redisJob = await claimRedisJob();
    if (redisJob) {
      return {
        id: redisJob.id,
        type: redisJob.type,
        payload: JSON.stringify(redisJob.payload ?? {}),
        attempts: redisJob.attempts,
        maxAttempts: 5,
        source: "redis" as const,
      };
    }
  }
  const job = await prisma.job.findFirst({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;
  const claimed = await prisma.job.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "RUNNING", lockedBy: workerId, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  return prisma.job.findUnique({ where: { id: job.id } });
}

export async function finishJob(id: string, ok: boolean, error?: string, meta?: { type?: string; payload?: unknown; attempts?: number; source?: string }) {
  if (meta?.source === "redis") {
    if (!ok) {
      await failRedisJob({
        id,
        type: meta.type || "unknown",
        payload: meta.payload,
        attempts: meta.attempts || 0,
      }, error || "Job failed");
    }
    return;
  }
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return;
  if (ok) {
    await prisma.job.update({ where: { id }, data: { status: "DONE", lastError: null } });
    return;
  }
  const retries = job.attempts < job.maxAttempts;
  const delay = Math.min(60_000, 1000 * 2 ** job.attempts);
  await prisma.job.update({
    where: { id },
    data: {
      status: retries ? "PENDING" : "FAILED",
      lastError: error?.slice(0, 500),
      lockedBy: null,
      runAt: retries ? new Date(Date.now() + delay) : job.runAt,
    },
  });
}
