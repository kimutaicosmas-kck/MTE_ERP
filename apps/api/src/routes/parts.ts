import { Router } from "express";
import { z } from "zod";
import { parseQuery, zEntityId, zSearchQuery, zText } from "../lib/sanitize.js";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { canBypassApproval } from "../lib/auth.js";
import { queueApproval } from "../lib/approval-request.js";
import { postStockReceipt } from "../lib/ledger.js";
import { emit } from "../lib/webhooks.js";
import { moduleAccess } from "../middleware/auth.js";
import { resolveBinId } from "../lib/warehouse.js";

export const partsRouter = Router();
partsRouter.use(moduleAccess("inventory", "sales", "procurement", "dispatch", "finance"));

partsRouter.get("/", async (req, res) => {
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
  res.json(
    req.user!.role === "SALES"
      ? withAge.map((p) => ({ ...p, cost: undefined }))
      : withAge
  );
});

partsRouter.get("/search", async (req, res) => {
  const parsed = parseQuery(z.object({
    brand: zSearchQuery(60),
    model: zSearchQuery(60),
    oem: zSearchQuery(60),
    q: zSearchQuery(80),
  }), req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid search parameters" });
  const { brand, model, oem, q } = parsed.data;
  const parts = await prisma.part.findMany({
    include: { compat: true },
    orderBy: { name: "asc" },
  });
  const rows = parts.filter((p) => {
    if (oem && !`${p.oemNumber} ${p.sku}`.toLowerCase().includes(oem)) return false;
    if (brand || model) {
      const matchCompat = p.compat.some((c) => {
        const b = c.machineBrand.toLowerCase();
        const m = c.machineModel.toLowerCase();
        return (!brand || b.includes(brand)) && (!model || m.includes(model));
      });
      if (!matchCompat) return false;
    }
    if (q) {
      const hay = `${p.sku} ${p.oemNumber} ${p.name} ${p.category} ${p.compat.map((c) => `${c.machineBrand} ${c.machineModel}`).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  res.json(
    req.user!.role === "SALES"
      ? rows.map((p) => ({ ...p, cost: undefined }))
      : rows
  );
});

partsRouter.get("/:id/serials", async (req, res) => {
  const part = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!part) return res.status(404).json({ error: "Product not found" });
  res.json(await prisma.serial.findMany({ where: { partId: part.id }, orderBy: { code: "asc" } }));
});

partsRouter.post("/:id/serials", async (req, res) => {
  if (req.user!.role === "SALES") return res.status(403).json({ error: "Sales cannot register serials" });
  const part = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!part) return res.status(404).json({ error: "Product not found" });
  const body = z.object({
    code: zText(64).optional(),
    codes: z.array(zText(64)).max(50).optional(),
    purchaseId: zEntityId().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid serial data" });
  const codes = body.data.codes?.length ? body.data.codes : body.data.code ? [body.data.code] : [];
  if (!codes.length) return res.status(400).json({ error: "Serial code required" });
  const created = [];
  for (const code of codes) {
    const row = await prisma.serial.create({
      data: { partId: part.id, code, status: "IN_STOCK", purchaseId: body.data.purchaseId },
    });
    created.push(row);
  }
  if (part.trackSerial === false && created.length) {
    await prisma.part.update({ where: { id: part.id }, data: { trackSerial: true } });
  }
  await audit(req, { entity: "Part", entityId: part.id, action: "ADD_SERIAL", newValue: { codes: created.map((c) => c.code) } });
  res.status(201).json(created);
});

partsRouter.get("/:id", async (req, res) => {
  const part = await prisma.part.findUnique({
    where: { id: req.params.id },
    include: { compat: true, movements: { orderBy: { createdAt: "desc" }, take: 40 } },
  });
  if (!part) return res.status(404).json({ error: "Product not found" });
  res.json(req.user!.role === "SALES" ? { ...part, cost: undefined } : part);
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
  trackSerial: z.boolean().optional(),
  compat: z.array(z.object({ machineBrand: z.string(), machineModel: z.string() })).optional(),
});

partsRouter.post("/", async (req, res) => {
  if (req.user!.role === "SALES") return res.status(403).json({ error: "Sales cannot create products" });
  const body = partBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const part = await prisma.part.create({
    data: {
      ...body.data,
      qtyOnHand: 0,
      reorderLevel: body.data.reorderLevel ?? 2,
      compat: { create: body.data.compat || [] },
    },
    include: { compat: true },
  });
  await audit(req, { entity: "Part", entityId: part.id, action: "CREATE", newValue: part });
  res.status(201).json(part);
});

partsRouter.patch("/:id", async (req, res) => {
  if (req.user!.role === "SALES") return res.status(403).json({ error: "Sales cannot edit products" });
  const existing = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Part not found" });
  const data = req.body as Record<string, unknown>;
  let warehouseBinId = existing.warehouseBinId;
  let binLocation = typeof data.binLocation === "string" ? data.binLocation : existing.binLocation;
  if (data.warehouseBinId !== undefined) {
    if (data.warehouseBinId === null || data.warehouseBinId === "") {
      warehouseBinId = null;
    } else {
      const resolved = await resolveBinId(String(data.warehouseBinId));
      if (!resolved) return res.status(400).json({ error: "Invalid warehouse bin" });
      warehouseBinId = resolved.id;
      binLocation = resolved.binLocation;
    }
  }
  const proposed = {
    name: typeof data.name === "string" ? data.name : existing.name,
    oemNumber: typeof data.oemNumber === "string" ? data.oemNumber : existing.oemNumber,
    category: typeof data.category === "string" ? data.category : existing.category,
    binLocation,
    warehouseBinId,
    reorderLevel: typeof data.reorderLevel === "number" ? data.reorderLevel : existing.reorderLevel,
    critical: typeof data.critical === "boolean" ? data.critical : existing.critical,
    cost: typeof data.cost === "number" ? data.cost : existing.cost,
    salePrice: typeof data.salePrice === "number" ? data.salePrice : existing.salePrice,
  };
  const changed =
    proposed.name !== existing.name ||
    proposed.oemNumber !== existing.oemNumber ||
    proposed.category !== existing.category ||
    proposed.binLocation !== existing.binLocation ||
    proposed.warehouseBinId !== existing.warehouseBinId ||
    proposed.reorderLevel !== existing.reorderLevel ||
    proposed.critical !== existing.critical ||
    proposed.cost !== existing.cost ||
    proposed.salePrice !== existing.salePrice;
  if (!changed) return res.json(existing);

  const priceChange = proposed.cost !== existing.cost || proposed.salePrice !== existing.salePrice;
  const nonPriceFieldsChanged =
    proposed.name !== existing.name ||
    proposed.oemNumber !== existing.oemNumber ||
    proposed.category !== existing.category ||
    proposed.binLocation !== existing.binLocation ||
    proposed.warehouseBinId !== existing.warehouseBinId ||
    proposed.reorderLevel !== existing.reorderLevel ||
    proposed.critical !== existing.critical;
  if (!canBypassApproval(req.user!.role)) {
    const type = priceChange && !nonPriceFieldsChanged ? "EDIT_PRICE" : "EDIT_PART";
    if (await queueApproval(req, res, {
      type,
      entity: "Part",
      entityId: existing.id,
      oldValue: existing,
      newValue: type === "EDIT_PRICE"
        ? { cost: proposed.cost, salePrice: proposed.salePrice }
        : proposed,
      reason: String(req.body.reason || `Update product ${existing.sku}`),
    })) return;
  }

  const next = await prisma.part.update({
    where: { id: existing.id },
    data: proposed,
  });
  await audit(req, { entity: "Part", entityId: next.id, action: "UPDATE", oldValue: existing, newValue: next });
  res.json(next);
});

partsRouter.post("/:id/adjust", async (req, res) => {
  if (req.user!.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only Super Admin can add or adjust product quantity. Receive imports on a purchase order." });
  }
  const part = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!part) return res.status(404).json({ error: "Product not found" });
  const qty = Number(req.body.qty);
  const reason = String(req.body.reason || "");
  const type = qty > 0 ? "RECEIPT" : String(req.body.type || "ADJUSTMENT");
  if (!qty || !reason) return res.status(400).json({ error: "Qty and reason required" });

  const instant = canBypassApproval(req.user!.role);
  if (!instant) {
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

  const updated = await prisma.part.update({
    where: { id: part.id },
    data: { qtyOnHand: part.qtyOnHand + qty },
  });
  await prisma.stockMovement.create({
    data: { partId: part.id, type, qty, reason, reference: req.body.reference, userId: req.user!.id },
  });
  if (type === "RECEIPT") {
    await postStockReceipt({ partId: part.id, sku: part.sku, qty, cost: part.cost, userId: req.user!.id });
  }
  await audit(req, {
    entity: "Part",
    entityId: part.id,
    action: "ADJUST_STOCK",
    oldValue: { sku: part.sku, qtyOnHand: part.qtyOnHand },
    newValue: { sku: updated.sku, qtyOnHand: updated.qtyOnHand, qty, type },
    reason,
  });
  if (updated.qtyOnHand <= updated.reorderLevel) {
    await emit("stock.low", { sku: updated.sku, qtyOnHand: updated.qtyOnHand, reorderLevel: updated.reorderLevel });
  }
  res.json(updated);
});

partsRouter.delete("/:id", async (req, res) => {
  const part = await prisma.part.findUnique({ where: { id: req.params.id } });
  if (!part) return res.status(404).json({ error: "Product not found" });
  const reason = String(req.body?.reason || "Remove from catalogue");
  if (await queueApproval(req, res, {
    type: "DELETE_PART",
    entity: "Part",
    entityId: part.id,
    oldValue: part,
    newValue: { deleted: true },
    reason,
  })) return;
  await prisma.part.delete({ where: { id: part.id } });
  await audit(req, { entity: "Part", entityId: part.id, action: "DELETE", oldValue: part, reason });
  res.json({ ok: true });
});
