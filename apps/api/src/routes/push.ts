import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { vapidKeys } from "../lib/push.js";

export const pushRouter = Router();

pushRouter.get("/vapid", async (_req, res) => {
  const keys = await vapidKeys();
  res.json({ publicKey: keys.publicKey });
});

pushRouter.post("/subscribe", async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  const p256dh = String(req.body?.keys?.p256dh || "");
  const auth = String(req.body?.keys?.auth || "");
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: "Invalid subscription" });
  const sub = await prisma.pushSub.upsert({
    where: { endpoint },
    update: { userId: req.user!.id, p256dh, auth },
    create: { userId: req.user!.id, endpoint, p256dh, auth },
  });
  res.status(201).json({ id: sub.id });
});

pushRouter.delete("/subscribe", async (req, res) => {
  const endpoint = String(req.body?.endpoint || "");
  if (endpoint) await prisma.pushSub.deleteMany({ where: { endpoint, userId: req.user!.id } });
  res.json({ ok: true });
});
