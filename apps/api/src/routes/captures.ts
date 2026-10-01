import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";

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
  const kind = String(req.body.kind || "");
  const refId = String(req.body.refId || "");
  const name = String(req.body.name || "capture.jpg");
  const mime = String(req.body.mime || "image/jpeg");
  const data = String(req.body.data || "");
  if (!kind || !refId || !data) return res.status(400).json({ error: "kind, refId and data required" });
  const allowed = new Set(["delivery", "product", "receipt", "customer"]);
  if (!allowed.has(kind)) return res.status(400).json({ error: "Unknown capture kind" });
  const row = await prisma.capture.create({
    data: { kind, refId, name, mime, data, userId: req.user!.id },
  });
  await audit(req, { entity: "Capture", entityId: row.id, action: "CREATE", newValue: { kind, refId, name } });
  res.status(201).json({ id: row.id, kind: row.kind, refId: row.refId, name: row.name, mime: row.mime, createdAt: row.createdAt });
});
