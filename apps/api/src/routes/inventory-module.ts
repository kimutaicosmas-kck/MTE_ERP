import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { transferBetweenSites } from "../lib/site-stock.js";
import { ensureDefaultWarehouse, loadWarehousesTree, resolveBinId, syncLegacyPartBins } from "../lib/warehouse.js";
import { moduleAccess, roles } from "../middleware/auth.js";

export const inventoryModuleRouter = Router();
inventoryModuleRouter.use(moduleAccess("inventory", "warehouse", "procurement", "dispatch", "finance"));

inventoryModuleRouter.get("/dashboard", async (_req, res) => {
  const parts = await prisma.part.findMany();
  const movements = await prisma.stockMovement.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { part: { select: { sku: true, name: true } }, user: { select: { name: true } } },
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const openOrders = await prisma.order.findMany({
    where: { status: { in: ["CONFIRMED", "PICKING", "PACKING", "PICKED", "DISPATCHED", "IN_TRANSIT"] } },
    include: { lines: true },
  });
  let reserved = 0;
  for (const o of openOrders) {
    for (const l of o.lines) reserved += Math.max(0, l.qty - (l.deliveredQty || 0));
  }
  const value = parts.reduce((s, p) => s + p.qtyOnHand * (p.cost || p.salePrice), 0);
  const low = parts.filter((p) => p.qtyOnHand > 0 && p.qtyOnHand <= p.reorderLevel).length;
  const out = parts.filter((p) => p.qtyOnHand <= 0).length;
  const dead = parts.filter((p) => {
    const last = movements.find((m) => m.partId === p.id);
    if (!last) return p.qtyOnHand > 0;
    const days = (Date.now() - new Date(last.createdAt).getTime()) / 86400000;
    return days >= 60 && p.qtyOnHand > 0;
  }).length;
  const receivedToday = movements.filter((m) => m.type === "RECEIPT" && new Date(m.createdAt) >= today).reduce((s, m) => s + m.qty, 0);
  const issuedToday = movements.filter((m) => m.type === "SALE" && new Date(m.createdAt) >= today).reduce((s, m) => s + Math.abs(m.qty), 0);
  const trend = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (11 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return movements.filter((m) => {
      const t = new Date(m.createdAt);
      return t >= d && t < next && (m.type === "RECEIPT" || m.type === "SALE");
    }).length;
  });
  res.json({
    products: parts.length,
    inventoryValue: value,
    available: parts.reduce((s, p) => s + p.qtyOnHand, 0),
    reserved,
    low,
    out,
    dead,
    receivedToday,
    issuedToday,
    movementTrend: trend,
    onOrder: await prisma.purchaseOrder.count({ where: { status: { in: ["ORDERED", "PARTIAL"] } } }),
  });
});

inventoryModuleRouter.get("/movements", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
  const partId = req.query.partId ? String(req.query.partId) : undefined;
  const rows = await prisma.stockMovement.findMany({
    where: partId ? { partId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      part: { select: { id: true, sku: true, name: true, binLocation: true } },
      user: { select: { name: true } },
    },
  });
  res.json(rows);
});

inventoryModuleRouter.get("/warehouses", async (_req, res) => {
  res.json(await loadWarehousesTree());
});

inventoryModuleRouter.post("/warehouses", roles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  await ensureDefaultWarehouse();
  const code = String(req.body.code || "").toUpperCase().trim();
  const name = String(req.body.name || "").trim();
  if (!code || !name) return res.status(400).json({ error: "Code and name required" });
  const site = await prisma.warehouseSite.create({
    data: { code, name, address: req.body.address ? String(req.body.address) : null },
  });
  await audit(req, { entity: "WarehouseSite", entityId: site.id, action: "CREATE", newValue: site });
  res.status(201).json(site);
});

inventoryModuleRouter.post("/warehouses/:siteId/zones", roles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const code = String(req.body.code || "").toUpperCase().trim();
  const label = String(req.body.label || req.body.name || code).trim();
  if (!code) return res.status(400).json({ error: "Zone code required" });
  const zone = await prisma.warehouseZone.create({
    data: { warehouseId: req.params.siteId, code, label },
  });
  await audit(req, { entity: "WarehouseZone", entityId: zone.id, action: "CREATE", newValue: zone });
  res.status(201).json(zone);
});

inventoryModuleRouter.post("/zones/:zoneId/bins", roles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const code = String(req.body.code || "").trim();
  if (!code) return res.status(400).json({ error: "Bin code required" });
  const bin = await prisma.warehouseBin.create({
    data: { zoneId: req.params.zoneId, code, label: req.body.label ? String(req.body.label) : null },
  });
  await audit(req, { entity: "WarehouseBin", entityId: bin.id, action: "CREATE", newValue: bin });
  res.status(201).json(bin);
});

inventoryModuleRouter.post("/warehouses/sync-bins", roles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
  await syncLegacyPartBins();
  res.json({ ok: true });
});

inventoryModuleRouter.post("/transfer", roles("SUPER_ADMIN", "ADMIN", "WAREHOUSE"), async (req, res) => {
  const partId = String(req.body.partId || "");
  const fromWarehouseSiteId = String(req.body.fromWarehouseSiteId || "");
  const toWarehouseSiteId = String(req.body.toWarehouseSiteId || "");
  const qty = Number(req.body.qty);
  if (!partId || !fromWarehouseSiteId || !toWarehouseSiteId) {
    return res.status(400).json({ error: "partId, fromWarehouseSiteId, and toWarehouseSiteId required" });
  }
  let toBinLocation = typeof req.body.toBinLocation === "string" ? req.body.toBinLocation.trim() : "";
  let toWarehouseBinId: string | null =
    typeof req.body.toWarehouseBinId === "string" && req.body.toWarehouseBinId ? req.body.toWarehouseBinId : null;
  if (toWarehouseBinId) {
    const resolved = await resolveBinId(toWarehouseBinId);
    if (!resolved) return res.status(400).json({ error: "Invalid destination bin" });
    toBinLocation = resolved.binLocation;
    toWarehouseBinId = resolved.id;
  }
  const part = await prisma.part.findUnique({ where: { id: partId } });
  if (!part) return res.status(404).json({ error: "Product not found" });
  try {
    const total = await transferBetweenSites({
      partId,
      fromWarehouseSiteId,
      toWarehouseSiteId,
      qty,
      toBinLocation: toBinLocation || undefined,
      toWarehouseBinId,
      userId: req.user!.id,
    });
    await audit(req, {
      entity: "Part",
      entityId: partId,
      action: "TRANSFER_STOCK",
      newValue: { fromWarehouseSiteId, toWarehouseSiteId, qty, total },
    });
    res.json({ ok: true, qtyOnHand: total });
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? Number((err as { status: number }).status) : 400;
    res.status(status).json({ error: err instanceof Error ? err.message : "Transfer failed" });
  }
});
