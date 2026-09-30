import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { canBypassApproval } from "../lib/auth.js";
import { postStockReceipt } from "../lib/ledger.js";
import { emit } from "../lib/webhooks.js";

export const partsRouter = Router();

partsRouter.get("/", async (_req, res) => {
  const parts = await prisma.part.findMany({
    include: { compat: true },
    orderBy: { sku: "asc" },
  });
  const withAge = await Promise.all(
    parts.map(async (p) => {
      const last = await prisma.stockMovement.findFirst({
        where: { partId: p.id },
        orderBy: { createdAt: "desc" },
      });
      const days = last
        ? Math.floor((Date.now() - last.createdAt.getTime()) / 86400000)
        : 999;
      return { ...p, daysIdle: days, lowStock: p.qtyOnHand <= p.reorderLevel };
    })
  );
  res.json(withAge);
});

partsRouter.get("/:id", async (req, res) => {
  const part = await prisma.part.findUnique({
    where: { id: req.params.id },
    include: { compat: true, movements: { orderBy: { createdAt: "desc" }, take: 40 } },
  });
  if (!part) return res.status(404).json({ error: "Part not found" });
  res.json(part);
});

const partBody = z.object({
  sku: z.string().min(1),
  oemNumber: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  binLocation: z.string().min(1),
  cost: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  qtyOnHand: z.number().optional(),
  reorderLevel: z.number().optional(),
  critical: z.boolean().optional(),
  compat: z.array(z.object({ machineBrand: z.string(), machineModel: z.string() })).optional(),
});

partsRouter.post("/", async (req, res) => {
  if (req.user!.role === "SALES") return res.status(403).json({ error: "Sales cannot create parts" });
  const body = partBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const part = await prisma.part.create({
    data: {
      ...body.data,
      qtyOnHand: body.data.qtyOnHand ?? 0,
      reorderLevel: body.data.reorderLevel ?? 2,
      compat: { create: body.data.compat || [] },
    },
    include: { compat: true },
  });
  await audit(req, { entity: "Part", entityId: part.id, action: "CREATE", newValue: part });
  res.status(201).json(part);
});

partsRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Part not found" });
  const data = req.body as Record<string, unknown>;
  const next = await prisma.part.update({
    where: { id: existing.id },
    data: {
      name: typeof data.name === "string" ? data.name : undefined,
      category: typeof data.category === "string" ? data.category : undefined,
      binLocation: typeof data.binLocation === "string" ? data.binLocation : undefined,
      cost: typeof data.cost === "number" ? data.cost : undefined,
      salePrice: typeof data.salePrice === "number" ? data.salePrice : undefined,
      reorderLevel: typeof data.reorderLevel === "number" ? data.reorderLevel : undefined,
      critical: typeof data.critical === "boolean" ? data.critical : undefined,
    },
  });
  await audit(req, { entity: "Part", entityId: next.id, action: "UPDATE", oldValue: existing, newValue: next });
  res.json(next);
});

partsRouter.post("/:id/adjust", async (req, res) => {
  const part = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!part) return res.status(404).json({ error: "Part not found" });
  const qty = Number(req.body.qty);
  const reason = String(req.body.reason || "");
  const type = String(req.body.type || "ADJUSTMENT");
  if (!qty || !reason) return res.status(400).json({ error: "Qty and reason required" });

  if (!canBypassApproval(req.user!.role)) {
    const approval = await prisma.approval.create({
      data: {
        type: "ADJUST_STOCK",
        entity: "Part",
        entityId: part.id,
        oldValue: JSON.stringify({ qtyOnHand: part.qtyOnHand }),
        newValue: JSON.stringify({ qty, type, reason }),
        reason,
        requesterId: req.user!.id,
      },
    });
    await audit(req, { entity: "Approval", entityId: approval.id, action: "REQUEST", newValue: approval, reason });
    await emit("approval.requested", approval);
    return res.status(202).json({ pending: true, approval });
  }

  const nextQty = type === "RECEIPT" ? part.qtyOnHand + qty : part.qtyOnHand + qty;
  const updated = await prisma.part.update({
    where: { id: part.id },
    data: { qtyOnHand: nextQty },
  });
  await prisma.stockMovement.create({
    data: { partId: part.id, type, qty, reason, reference: req.body.reference, userId: req.user!.id },
  });
  if (type === "RECEIPT") {
    await postStockReceipt({ partId: part.id, sku: part.sku, qty, cost: part.cost, userId: req.user!.id });
  }
  await audit(req, { entity: "Part", entityId: part.id, action: "ADJUST_STOCK", oldValue: part, newValue: updated, reason });
  if (updated.qtyOnHand <= updated.reorderLevel) {
    await emit("stock.low", { sku: updated.sku, qtyOnHand: updated.qtyOnHand, reorderLevel: updated.reorderLevel });
  }
  res.json(updated);
});

partsRouter.delete("/:id", async (req, res) => {
  const part = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!part) return res.status(404).json({ error: "Part not found" });
  const reason = String(req.body?.reason || "Remove from catalogue");
  if (!canBypassApproval(req.user!.role)) {
    const approval = await prisma.approval.create({
      data: {
        type: "DELETE_PART",
        entity: "Part",
        entityId: part.id,
        oldValue: JSON.stringify(part),
        newValue: JSON.stringify({ deleted: true }),
        reason,
        requesterId: req.user!.id,
      },
    });
    return res.status(202).json({ pending: true, approval });
  }
  await prisma.part.delete({ where: { id: part.id } });
  await audit(req, { entity: "Part", entityId: part.id, action: "DELETE", oldValue: part, reason });
  res.json({ ok: true });
});
