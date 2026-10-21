import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { zEntityId, zText } from "../lib/sanitize.js";

export const capturesRouter = Router();

capturesRouter.get("/", async (req, res) => {
  const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
  const refId = typeof req.query.refId === "string" ? req.query.refId : undefined;
  res.json(
    await prisma.capture.findMany({
      where: { ...(kind ? { kind } : {}), ...(refId ? { refId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: { id: true, kind: true, refId: true, name: true, mime: true, createdAt: true, data: true },
    })
  );
});

capturesRouter.post("/", async (req, res) => {
  const body = z.object({
    kind: z.enum(["delivery", "product", "receipt", "customer"]),
    refId: zEntityId(),
    name: zText(120).optional(),
    mime: z.string().trim().max(80).optional().refine((m) => !m || m.startsWith("image/"), "Invalid mime type"),
    data: z.string().min(32).max(8_000_000),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid capture payload" });
  const { kind, refId, data } = body.data;
  const name = body.data.name || "capture.jpg";
  const mime = body.data.mime || "image/jpeg";
  const row = await prisma.capture.create({
    data: { kind, refId, name, mime, data, userId: req.user!.id },
  });
  await audit(req, { entity: "Capture", entityId: row.id, action: "CREATE", newValue: { kind, refId, name } });
  res.status(201).json({ id: row.id, kind: row.kind, refId: row.refId, name: row.name, mime: row.mime, createdAt: row.createdAt });
});
