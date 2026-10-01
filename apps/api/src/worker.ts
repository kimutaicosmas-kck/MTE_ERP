import { claimJob, finishJob, enqueue } from "./lib/queue.js";
import { deliverOnce } from "./lib/webhooks.js";
import { beat, workerId } from "./lib/heartbeat.js";
import { prisma } from "./lib/prisma.js";
import { connectRedis } from "./lib/redis.js";
import { emit } from "./lib/webhooks.js";

const id = workerId("worker");

async function handle(type: string, payload: Record<string, unknown>) {
  if (type === "webhook.deliver") {
    await deliverOnce(String(payload.deliveryId));
    return;
  }
  if (type === "stock.reorder-scan") {
    const parts = await prisma.part.findMany();
    for (const p of parts.filter((x) => x.qtyOnHand <= x.reorderLevel)) {
      await emit("stock.low", {
        sku: p.sku,
        name: p.name,
        qtyOnHand: p.qtyOnHand,
        reorderLevel: p.reorderLevel,
        binLocation: p.binLocation,
      });
    }
    return;
  }
}

export async function runWorkerLoop() {
  await connectRedis();
  console.log(`MTE ERP worker ${id}`);
  await beat("worker", { role: "queue" });
  setInterval(() => beat("worker", { role: "queue" }), 10_000);
  setInterval(() => enqueue("stock.reorder-scan", {}).catch(() => null), 5 * 60_000);

  while (true) {
    const job = await claimJob(id);
    if (!job) {
      await new Promise((r) => setTimeout(r, 750));
      continue;
    }
    try {
      await handle(job.type, JSON.parse(job.payload) as Record<string, unknown>);
      await finishJob(job.id, true, undefined, job);
    } catch (err) {
      await finishJob(job.id, false, err instanceof Error ? err.message : "Job failed", job);
    }
  }
}

if (process.argv[1]?.includes("worker")) {
  runWorkerLoop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
