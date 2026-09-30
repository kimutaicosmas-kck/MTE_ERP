import os from "os";
import { prisma } from "./prisma.js";

export function workerId(kind: string) {
  return `${kind}-${os.hostname()}-${process.pid}`;
}

export async function beat(kind: string, meta?: unknown) {
  const id = workerId(kind);
  await prisma.workerHeartbeat.upsert({
    where: { workerId: id },
    create: {
      workerId: id,
      kind,
      pid: process.pid,
      seenAt: new Date(),
      meta: meta ? JSON.stringify(meta) : null,
    },
    update: {
      seenAt: new Date(),
      pid: process.pid,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}
