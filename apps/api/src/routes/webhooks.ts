import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { emit, newSecret, WEBHOOK_EVENTS } from "../lib/webhooks.js";
import { enqueue } from "../lib/queue.js";
import { roles } from "../middleware/auth.js";

export const incomingWebhooksRouter = Router();
export const webhooksRouter = Router();

incomingWebhooksRouter.post("/inbox", async (req, res) => {
  const row = await prisma.webhookInbox.create({
    data: {
      source: String(req.headers["x-mte-event"] || "inbox"),
      headers: JSON.stringify({
        signature: req.headers["x-mte-signature"] || null,
        delivery: req.headers["x-mte-delivery"] || null,
      }),
      payload: JSON.stringify(req.body ?? {}),
    },
  });
  res.json({ ok: true, id: row.id });
});

incomingWebhooksRouter.post("/incoming/mpesa", async (req, res) => {
  await prisma.webhookInbox.create({
    data: { source: "mpesa", payload: JSON.stringify(req.body ?? {}) },
  });
  await enqueue("incoming.mpesa", req.body ?? {});
  const parsed = parseMpesa(req.body);
  if (parsed) {
    const order = parsed.orderNumber
      ? await prisma.order.findUnique({ where: { number: parsed.orderNumber }, include: { payments: true, lines: true } })
      : null;
    if (order && parsed.amount > 0) {
      const pay = await prisma.payment.create({
        data: { orderId: order.id, method: "MPESA", amount: parsed.amount, reference: parsed.reference },
      });
      await emit("payment.recorded", { orderId: order.id, number: order.number, payment: pay, automated: true });
    }
    await emit("incoming.mpesa", parsed);
  }
  res.json({ ok: true });
});

function parseMpesa(body: any) {
  if (!body) return null;
  if (body.orderNumber && body.amount) {
    return { orderNumber: String(body.orderNumber), amount: Number(body.amount), reference: String(body.reference || body.TransID || "") };
  }
  const cb = body.Body?.stkCallback || body.stkCallback;
  if (!cb) return null;
  const items = cb.CallbackMetadata?.Item || [];
  const get = (name: string) => items.find((i: any) => i.Name === name)?.Value;
  return {
    orderNumber: String(body.orderNumber || cb.AccountReference || ""),
    amount: Number(get("Amount") || 0),
    reference: String(get("MpesaReceiptNumber") || ""),
  };
}

webhooksRouter.get("/events", (_req, res) => res.json(WEBHOOK_EVENTS));

webhooksRouter.get("/endpoints", roles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
  res.json(await prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } }));
});

webhooksRouter.post("/endpoints", roles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const body = z.object({
    name: z.string().min(1),
    url: z.string().url(),
    events: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Name, URL and events required" });
  const row = await prisma.webhookEndpoint.create({
    data: { ...body.data, secret: newSecret(), active: true },
  });
  res.status(201).json(row);
});

webhooksRouter.patch("/endpoints/:id", roles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const row = await prisma.webhookEndpoint.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      url: req.body.url,
      events: req.body.events,
      active: req.body.active,
    },
  });
  res.json(row);
});

webhooksRouter.delete("/endpoints/:id", roles("SUPER_ADMIN"), async (req, res) => {
  await prisma.webhookEndpoint.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

webhooksRouter.get("/deliveries", roles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
  res.json(
    await prisma.webhookDelivery.findMany({
      include: { endpoint: { select: { name: true, url: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    })
  );
});

webhooksRouter.get("/inbox", roles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
  res.json(await prisma.webhookInbox.findMany({ orderBy: { createdAt: "desc" }, take: 50 }));
});

webhooksRouter.post("/test", roles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  await emit(req.body.event || "order.status", {
    test: true,
    message: "Manual webhook ping from MTE ERP",
    at: new Date().toISOString(),
  });
  res.json({ ok: true });
});
