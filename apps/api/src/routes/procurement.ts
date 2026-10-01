import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { postApReceipt } from "../lib/ledger.js";
import { nextBillNumber } from "../lib/sequence.js";
import { roles, moduleAccess } from "../middleware/auth.js";
import { buildPurchasePdf } from "../lib/pdf.js";
import { emit } from "../lib/webhooks.js";

export const procurementRouter = Router();
procurementRouter.use(moduleAccess("procurement"));

const lineBody = z.object({
  partId: z.string(),
  qtyOrdered: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const createBody = z.object({
  vendorId: z.string(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  expectedAt: z.string().optional(),
  currency: z.string().optional(),
  fxRate: z.number().positive().optional(),
  freight: z.number().nonnegative().optional(),
  duty: z.number().nonnegative().optional(),
  otherLanded: z.number().nonnegative().optional(),
  vatRate: z.number().nonnegative().optional(),
  branchId: z.string().optional(),
  lines: z.array(lineBody).min(1),
});

function poFields(data: z.infer<typeof createBody>) {
  return {
    vendorId: data.vendorId,
    reference: data.reference,
    notes: data.notes,
    expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
    currency: data.currency || "KES",
    fxRate: data.fxRate ?? 1,
    freight: data.freight ?? 0,
    duty: data.duty ?? 0,
    otherLanded: data.otherLanded ?? 0,
    vatRate: data.vatRate ?? 0.16,
    branchId: data.branchId || null,
  };
}

function totals(po: {
  vatRate: number;
  fxRate?: number;
  freight?: number;
  duty?: number;
  otherLanded?: number;
  lines: { qtyOrdered: number; qtyReceived: number; unitCost: number }[];
}) {
  const fx = po.fxRate || 1;
  const net = po.lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost * fx, 0);
  const received = po.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost * fx, 0);
  const landed = (po.freight || 0) + (po.duty || 0) + (po.otherLanded || 0);
  const vat = Math.round((net + landed) * po.vatRate * 100) / 100;
  return { net, landed, vat, gross: net + landed + vat, received };
}

async function nextPo() {
  const count = await prisma.purchaseOrder.count();
  return `PO-${String(count + 1).padStart(5, "0")}`;
}

async function nextGrn() {
  const count = await prisma.goodsReceipt.count();
  return `GRN-${String(count + 1).padStart(5, "0")}`;
}

async function loadPo(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      createdBy: { select: { id: true, name: true } },
      lines: { include: { part: true } },
      bills: true,
      receipts: { include: { receivedBy: { select: { name: true } }, lines: true, bill: true }, orderBy: { createdAt: "desc" } },
    },
  });
}

procurementRouter.get("/", async (_req, res) => {
  const rows = await prisma.purchaseOrder.findMany({
    include: {
      vendor: true,
      createdBy: { select: { id: true, name: true } },
      lines: { include: { part: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows.map((p) => ({ ...p, totals: totals(p) })));
});

procurementRouter.get("/:id/pdf", async (req, res) => {
  const po = await loadPo(req.params.id);
  if (!po) return res.status(404).json({ error: "Purchase order not found" });
  const buf = await buildPurchasePdf({
    kind: "po",
    number: po.number,
    status: po.status,
    vendor: po.vendor,
    reference: po.reference,
    notes: po.notes,
    createdAt: po.createdAt,
    expectedAt: po.expectedAt,
    createdBy: po.createdBy?.name,
    lines: po.lines.map((l) => ({
      sku: l.part.sku,
      name: l.part.name,
      qtyOrdered: l.qtyOrdered,
      qtyReceived: l.qtyReceived,
      unitCost: l.unitCost,
    })),
    totals: totals(po),
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${po.number}.pdf"`);
  res.send(buf);
});

procurementRouter.get("/:id", async (req, res) => {
  const po = await loadPo(req.params.id);
  if (!po) return res.status(404).json({ error: "Purchase order not found" });
  res.json({ ...po, totals: totals(po) });
});

procurementRouter.post("/", async (req, res) => {
  const body = createBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const vendor = await prisma.vendor.findUnique({ where: { id: body.data.vendorId } });
  if (!vendor) return res.status(400).json({ error: "Vendor not found" });
  const po = await prisma.purchaseOrder.create({
    data: {
      number: await nextPo(),
      ...poFields(body.data),
      createdById: req.user!.id,
      lines: { create: body.data.lines },
    },
    include: { vendor: true, lines: { include: { part: true } } },
  });
  await audit(req, { entity: "PurchaseOrder", entityId: po.id, action: "CREATE", newValue: { number: po.number } });
  await emit("purchase.created", { id: po.id, number: po.number });
  res.status(201).json({ ...po, totals: totals(po) });
});

procurementRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Purchase order not found" });
  if (existing.status !== "DRAFT") return res.status(400).json({ error: "Only a draft PO can be edited" });
  const body = createBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  await prisma.purchaseLine.deleteMany({ where: { purchaseId: existing.id } });
  const po = await prisma.purchaseOrder.update({
    where: { id: existing.id },
    data: {
      ...poFields(body.data),
      lines: { create: body.data.lines },
    },
    include: { vendor: true, lines: { include: { part: true } } },
  });
  await audit(req, { entity: "PurchaseOrder", entityId: po.id, action: "UPDATE" });
  res.json({ ...po, totals: totals(po) });
});

procurementRouter.post("/:id/order", async (req, res) => {
  const po = await loadPo(req.params.id);
  if (!po) return res.status(404).json({ error: "Purchase order not found" });
  if (po.status !== "DRAFT") return res.status(400).json({ error: "Only a draft can be sent to the vendor" });
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: "ORDERED" },
    include: { vendor: true, lines: { include: { part: true } } },
  });
  await audit(req, { entity: "PurchaseOrder", entityId: po.id, action: "STATUS", oldValue: { status: po.status }, newValue: { status: "ORDERED" } });
  res.json({ ...updated, totals: totals(updated) });
});

procurementRouter.post("/:id/receive", async (req, res) => {
  const po = await loadPo(req.params.id);
  if (!po) return res.status(404).json({ error: "Purchase order not found" });
  if (!["DRAFT", "ORDERED", "PARTIAL"].includes(po.status)) {
    return res.status(400).json({ error: "This purchase order cannot receive goods" });
  }
  if (po.status === "DRAFT") {
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "ORDERED" } });
  }
  const incoming = z.object({
    notes: z.string().optional(),
    serials: z.array(z.object({ partId: z.string(), codes: z.array(z.string()) })).optional(),
    lines: z.array(z.object({ lineId: z.string(), qty: z.number().positive() })).min(1),
  }).safeParse(req.body);
  if (!incoming.success) return res.status(400).json({ error: incoming.error.flatten() });

  const receiptLines: { partId: string; qty: number }[] = [];
  for (const item of incoming.data.lines) {
    const line = po.lines.find((l) => l.id === item.lineId);
    if (!line) return res.status(400).json({ error: "Line not found on this PO" });
    const open = line.qtyOrdered - line.qtyReceived;
    if (item.qty > open + 0.0001) {
      return res.status(400).json({ error: `Cannot receive more than ${open} of ${line.part.sku}` });
    }
    receiptLines.push({ partId: line.partId, qty: item.qty });
  }

  const receipt = await prisma.goodsReceipt.create({
    data: {
      number: await nextGrn(),
      purchaseId: po.id,
      receivedById: req.user!.id,
      notes: incoming.data.notes,
      lines: { create: receiptLines },
    },
  });

  const fx = po.fxRate || 1;
  const qtyThis = incoming.data.lines.reduce((s, l) => s + l.qty, 0);
  const qtyOrdered = po.lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const landedPool = (po.freight || 0) + (po.duty || 0) + (po.otherLanded || 0);
  const landedThis = qtyOrdered ? (landedPool * qtyThis) / qtyOrdered : 0;
  let inventory = 0;

  for (const item of incoming.data.lines) {
    const line = po.lines.find((l) => l.id === item.lineId)!;
    const share = qtyThis ? landedThis * (item.qty / qtyThis) : 0;
    const unitKes = line.unitCost * fx + share / item.qty;
    inventory += item.qty * unitKes;
    await prisma.purchaseLine.update({
      where: { id: line.id },
      data: { qtyReceived: { increment: item.qty } },
    });
    const part = await prisma.part.findUnique({ where: { id: line.partId } });
    const nextQty = (part?.qtyOnHand || 0) + item.qty;
    const avgCost = part && nextQty > 0 ? ((part.qtyOnHand * part.cost) + item.qty * unitKes) / nextQty : unitKes;
    await prisma.part.update({
      where: { id: line.partId },
      data: { qtyOnHand: { increment: item.qty }, cost: Math.round(avgCost * 100) / 100 },
    });
    await prisma.stockMovement.create({
      data: {
        partId: line.partId,
        type: "RECEIPT",
        qty: item.qty,
        reference: `${po.number} / ${receipt.number}`,
        reason: "Goods receipt",
        userId: req.user!.id,
      },
    });
    const codes = incoming.data.serials?.find((s) => s.partId === line.partId)?.codes || [];
    for (const code of codes.filter(Boolean).slice(0, item.qty)) {
      await prisma.serial.create({
        data: { partId: line.partId, code: code.trim(), status: "IN_STOCK", purchaseId: po.id },
      }).catch(() => null);
    }
  }

  inventory = Math.round(inventory * 100) / 100;
  const vat = Math.round(inventory * po.vatRate * 100) / 100;
  const bill = await prisma.vendorBill.create({
    data: {
      number: await nextBillNumber(),
      vendorId: po.vendorId,
      purchaseId: po.id,
      receiptId: receipt.id,
      currency: "KES",
      fxRate: fx,
      net: inventory,
      vat,
      landed: Math.round(landedThis * 100) / 100,
      gross: inventory + vat,
      notes: `${po.number} / ${receipt.number}`,
    },
  });
  await postApReceipt({ billId: bill.id, number: bill.number, inventory, vat, userId: req.user!.id });

  const fresh = await loadPo(po.id);
  const complete = fresh!.lines.every((l) => l.qtyReceived + 0.0001 >= l.qtyOrdered);
  const nextStatus = complete ? "RECEIVED" : "PARTIAL";
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: nextStatus },
    include: {
      vendor: true,
      createdBy: { select: { id: true, name: true } },
      lines: { include: { part: true } },
      receipts: { include: { receivedBy: { select: { name: true } }, lines: true }, orderBy: { createdAt: "desc" } },
    },
  });
  await audit(req, {
    entity: "GoodsReceipt",
    entityId: receipt.id,
    action: "CREATE",
    newValue: { number: receipt.number, purchase: po.number, status: nextStatus },
  });
  res.status(201).json({ receipt: { id: receipt.id, number: receipt.number }, purchase: { ...updated, totals: totals(updated) } });
});

procurementRouter.post("/:id/cancel", async (req, res) => {
  const po = await loadPo(req.params.id);
  if (!po) return res.status(404).json({ error: "Purchase order not found" });
  if (po.lines.some((l) => l.qtyReceived > 0)) {
    return res.status(400).json({ error: "Cannot cancel a PO that already has received goods" });
  }
  if (po.status === "RECEIVED" || po.status === "CANCELLED") {
    return res.status(400).json({ error: "This PO cannot be cancelled" });
  }
  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: "CANCELLED" },
    include: { vendor: true, lines: { include: { part: true } } },
  });
  await audit(req, { entity: "PurchaseOrder", entityId: po.id, action: "STATUS", oldValue: { status: po.status }, newValue: { status: "CANCELLED" }, reason: String(req.body.reason || "") });
  res.json({ ...updated, totals: totals(updated) });
});
