import { createHmac, randomBytes } from "crypto";
import { prisma } from "./prisma.js";
import { enqueue } from "./queue.js";

export const WEBHOOK_EVENTS = [
  "order.created",
  "order.status",
  "payment.recorded",
  "stock.low",
  "approval.requested",
  "approval.decided",
  "incoming.mpesa",
] as const;

export async function emit(event: string, data: unknown) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true } });
  const matches = endpoints.filter((e) => {
    const list = e.events.split(",").map((x) => x.trim());
    return list.includes("*") || list.includes(event);
  });
  for (const endpoint of matches) {
    const delivery = await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event,
        payload: JSON.stringify({ event, sentAt: new Date().toISOString(), data }),
        status: "QUEUED",
      },
    });
    await enqueue("webhook.deliver", { deliveryId: delivery.id });
  }
}

export function signBody(secret: string, body: string) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export async function deliverOnce(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || !delivery.endpoint.active) return;
  const body = delivery.payload;
  const signature = signBody(delivery.endpoint.secret, body);
  const started = Date.now();
  try {
    const res = await fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MTE-Signature": signature,
        "X-MTE-Event": delivery.event,
        "X-MTE-Delivery": delivery.id,
      },
      body,
      signal: AbortSignal.timeout(12_000),
    });
    const ok = res.ok;
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: ok ? "SUCCESS" : "FAILED",
        attempts: { increment: 1 },
        responseCode: res.status,
        lastError: ok ? null : `HTTP ${res.status}`,
        sentAt: new Date(),
      },
    });
    if (!ok) throw new Error(`HTTP ${res.status} in ${Date.now() - started}ms`);
  } catch (err) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError: err instanceof Error ? err.message : "Delivery failed",
        sentAt: new Date(),
      },
    });
    throw err;
  }
}

export function newSecret() {
  return randomBytes(24).toString("hex");
}

export async function ensureDefaultEndpoint() {
  const count = await prisma.webhookEndpoint.count();
  if (count > 0) return;
  await prisma.webhookEndpoint.create({
    data: {
      name: "Internal inbox",
      url: `http://127.0.0.1:${process.env.PORT || 4000}/api/webhooks/inbox`,
      secret: newSecret(),
      events: "*",
      active: true,
    },
  });
}
