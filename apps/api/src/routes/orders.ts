import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { recordActivity } from "../lib/activity.js";
import { queueApproval } from "../lib/approval-request.js";
import { executeSalesReturn, parseReturnBody } from "../lib/sales-return.js";
import { postPayment, postSale, reverseJournal } from "../lib/ledger.js";
import { emit } from "../lib/webhooks.js";
import { canAccessOrder, hideMoneyForSales, ownOrderWhere } from "../lib/roles.js";
import { canModule } from "../lib/access.js";
import { moduleAccess } from "../middleware/auth.js";
import { buildOrderPdf, deliveryNumber, documentSlug } from "../lib/pdf.js";
import { ensureCompany, formatSaleNumber, nextOrderNumber, withUniqueNumber } from "../lib/sequence.js";
import { issueInvoiceForOrder, refreshInvoiceStatus } from "../lib/invoice.js";
import { markupTotal } from "../lib/markup-commission.js";
import { packDocStyle, shareTokenFor, unpackDocStyle } from "../lib/doc-style.js";
import { assertCreditAllowed } from "../lib/credit.js";
import { zEntityId, zOptionalText } from "../lib/sanitize.js";
import { canDispatchTransition, DISPATCH_METHODS, DISPATCH_PRIORITIES, isDispatchStep } from "../lib/dispatch-workflow.js";
import { orderMoneyTotals } from "../lib/vat-totals.js";

export const ordersRouter = Router();
ordersRouter.use(moduleAccess("sales", "dispatch", "finance"));

async function nextNumber() {
  return nextOrderNumber();
}

async function withSaleNumber<T extends { id: string; number: string; createdAt: Date }>(order: T): Promise<T> {
  const number = formatSaleNumber(order.number, order.createdAt);
  if (number === order.number) return order;
  await prisma.order.update({ where: { id: order.id }, data: { number } });
  return { ...order, number };
}

function hideCost<T extends { cost?: number }>(role: string, rows: T[]): T[] {
  if (role !== "SALES") return rows;
  return rows.map((r) => ({ ...r, cost: undefined }));
}

ordersRouter.get("/", async (req, res) => {
  const branchId = req.query.branchId ? String(req.query.branchId) : "";
  const where = {
    ...ownOrderWhere(req.user!),
    ...(branchId ? { branchId } : {}),
  };
  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: true,
      salesperson: { select: { id: true, name: true } },
      lines: { include: { part: true } },
      payments: true,
      invoice: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const numbered = await Promise.all(orders.map((o) => withSaleNumber(o)));
  res.json(numbered.map((o) => decorateOrder(req.user!.role, o)));
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      salesperson: { select: { id: true, name: true, role: true } },
      lines: { include: { part: true, vendor: true } },
      payments: true,
      files: true,
      invoice: true,
      returns: { include: { lines: true } },
      statusLogs: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      vehicle: true,
      driver: { select: { id: true, name: true, phone: true } },
      dispatcher: { select: { id: true, name: true } },
      qcBy: { select: { id: true, name: true } },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only open your own orders" });
  const numbered = await withSaleNumber(order);
  res.json(decorateOrder(req.user!.role, numbered));
});

ordersRouter.get("/:id/pdf/:kind", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      salesperson: { select: { name: true } },
      lines: { include: { part: true } },
      payments: true,
      invoice: true,
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only open your own orders" });

  const kind = normalizeDocKind(String(req.params.kind || ""));
  if (!kind) return res.status(400).json({ error: "Use order, sale, or delivery" });

  const { setting } = await ensureCompany();
  const t = totals(order);
  const style = unpackDocStyle(order.notes);
  const orderNo = formatSaleNumber(order.number, order.createdAt);
  const invoiceNo = order.invoice?.number || order.invoiceNumber || orderNo;
  const docNo = kind === "sale" ? invoiceNo : kind === "delivery" ? deliveryNumber(invoiceNo || orderNo) : orderNo;
  const filename = `${docNo}-${documentSlug(kind, order.status)}.pdf`;
  const buf = await buildOrderPdf({
    kind,
    number: docNo,
    orderNumber: orderNo,
    lpo: order.lpo,
    status: order.status,
    channel: order.channel,
    createdAt: order.createdAt,
    dispatchMethod: order.dispatchMethod,
    tracking: order.tracking,
    notes: style.intro || style.notes,
    vatRate: order.vatRate,
    theme: style.theme,
    validDays: style.validDays,
    customer: order.customer,
    salesperson: order.salesperson,
    company: {
      name: setting.companyName,
      legalName: setting.legalName,
      phone: setting.phone,
      email: setting.email,
      address: setting.address,
      mpesaPaybill: setting.mpesaPaybill,
      mpesaAccount: setting.mpesaAccount,
    },
    lines: order.lines.map((line) => ({
      sku: line.part.sku,
      name: line.part.name,
      bin: line.part.binLocation,
      qty: line.qty,
      price: line.salePrice,
    })),
    totals: t,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
});

function normalizeDocKind(kind: string) {
  if (kind === "order" || kind === "quote" || kind === "quotation") return "order" as const;
  if (kind === "sale" || kind === "invoice" || kind === "tax") return "sale" as const;
  if (kind === "delivery" || kind === "note" || kind === "delivery-note") return "delivery" as const;
  return null;
}

ordersRouter.post("/:id/files", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only attach files to your own orders" });
  const name = String(req.body.name || "photo.jpg");
  const mime = String(req.body.mime || "image/jpeg");
  const data = String(req.body.data || "");
  if (!data.startsWith("data:")) return res.status(400).json({ error: "Image data required" });
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const raw = data.split(",")[1];
  const dir = join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  const file = `${order.number}-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
  await writeFile(join(dir, file), Buffer.from(raw, "base64"));
  const row = await prisma.attachment.create({
    data: { orderId: order.id, name, mime, path: `/uploads/${file}` },
  });
  await audit(req, { entity: "Attachment", entityId: row.id, action: "CREATE", newValue: row });
  res.status(201).json(row);
});

const createBody = z.object({
  channel: z.enum(["FIELD", "SHOP", "PHONE", "EMAIL"]),
  customerId: zEntityId(),
  dispatchMethod: z.enum(["SHOP_COLLECT", "COURIER"]).optional(),
  tracking: zOptionalText(80),
  lpo: zOptionalText(80),
  notes: zOptionalText(2000),
  intro: zOptionalText(2000),
  theme: z.enum(["navy", "classic", "gold"]).optional(),
  validDays: z.coerce.number().int().min(1).max(365).optional(),
  lines: z.array(z.object({
    partId: zEntityId(),
    qty: z.number().positive().max(100000),
    vendorId: zEntityId().optional(),
    salePrice: z.number().nonnegative().max(1e9).optional(),
  })).min(1).max(200),
});

function linePrices(part: { salePrice: number; cost: number }, salePriceOverride?: number) {
  const listPrice = part.salePrice;
  const salePrice = salePriceOverride != null ? salePriceOverride : listPrice;
  return { listPrice, salePrice, cost: part.cost };
}

function packedNotes(data: z.infer<typeof createBody>) {
  return packDocStyle({
    theme: data.theme || "navy",
    validDays: data.validDays,
    intro: data.intro || data.notes || "",
    notes: data.notes || data.intro || "",
  });
}

function decorateOrder<T extends { id: string; notes?: string | null; lines: { cost?: number }[] }>(
  role: string,
  order: T
) {
  const style = unpackDocStyle(order.notes);
  return {
    ...order,
    notes: style.notes || style.intro || "",
    style,
    shareToken: shareTokenFor(order.id),
    lines: hideCost(role, order.lines),
    totals: hideMoneyForSales(role, totals(order as never)),
  };
}

ordersRouter.post("/", async (req, res) => {
  const body = createBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const customer = await prisma.customer.findUnique({ where: { id: body.data.customerId } });
  if (!customer) return res.status(400).json({ error: "Customer not found" });

  const parts = await prisma.part.findMany({
    where: { id: { in: body.data.lines.map((l) => l.partId) } },
  });
  const partMap = Object.fromEntries(parts.map((p) => [p.id, p]));

  const order = await withUniqueNumber(async () =>
    prisma.order.create({
      data: {
        number: await nextNumber(),
        channel: body.data.channel,
        customerId: body.data.customerId,
        salespersonId: req.user!.id,
        branchId: req.user!.role ? (await prisma.user.findUnique({ where: { id: req.user!.id } }))?.branchId : undefined,
        dispatchMethod: body.data.dispatchMethod || "SHOP_COLLECT",
        tracking: body.data.tracking,
        lpo: body.data.lpo,
        notes: packedNotes(body.data),
        lines: {
          create: body.data.lines.map((l) => {
            const prices = linePrices(partMap[l.partId], l.salePrice);
            return {
              partId: l.partId,
              vendorId: l.vendorId,
              qty: l.qty,
              ...prices,
            };
          }),
        },
      },
      include: { lines: true, customer: true },
    })
  );
  await audit(req, { entity: "Order", entityId: order.id, action: "CREATE", newValue: order });
  await emit("order.created", { id: order.id, number: order.number, channel: order.channel, customerId: order.customerId });
  res.status(201).json(order);
});

ordersRouter.patch("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only update your own orders" });
  if (order.status !== "DRAFT") return res.status(400).json({ error: "Only a draft quotation can be edited" });
  const body = createBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const customer = await prisma.customer.findUnique({ where: { id: body.data.customerId } });
  if (!customer) return res.status(400).json({ error: "Customer not found" });
  const parts = await prisma.part.findMany({
    where: { id: { in: body.data.lines.map((l) => l.partId) } },
  });
  const partMap = Object.fromEntries(parts.map((p) => [p.id, p]));
  for (const line of body.data.lines) {
    if (!partMap[line.partId]) return res.status(400).json({ error: "Part not found" });
  }
  await prisma.orderLine.deleteMany({ where: { orderId: order.id } });
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      channel: body.data.channel,
      customerId: body.data.customerId,
      dispatchMethod: body.data.dispatchMethod || order.dispatchMethod,
      tracking: body.data.tracking,
      lpo: body.data.lpo,
      notes: packedNotes(body.data),
      lines: {
        create: body.data.lines.map((l) => {
          const prices = linePrices(partMap[l.partId], l.salePrice);
          return {
            partId: l.partId,
            vendorId: l.vendorId,
            qty: l.qty,
            ...prices,
          };
        }),
      },
    },
    include: {
      customer: true,
      salesperson: { select: { id: true, name: true } },
      lines: { include: { part: true } },
      payments: true,
      files: true,
    },
  });
  await audit(req, { entity: "Order", entityId: order.id, action: "UPDATE", oldValue: { status: order.status }, newValue: { lines: body.data.lines.length } });
  res.json({
    ...updated,
    lines: hideCost(req.user!.role, updated.lines),
    totals: hideMoneyForSales(req.user!.role, totals(updated)),
  });
});

type SaleOrder = NonNullable<Awaited<ReturnType<typeof loadSaleOrder>>>;

async function loadSaleOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      lines: { include: { part: true } },
      payments: true,
      customer: true,
      invoice: true,
      statusLogs: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      vehicle: true,
      driver: { select: { id: true, name: true, phone: true } },
    },
  });
}

async function logOrderStatus(orderId: string, status: string, userId: string, notes?: string) {
  await prisma.orderStatusLog.create({
    data: { orderId, status, userId, notes: notes?.slice(0, 500) || null },
  });
}

function linesFullyPicked(order: SaleOrder) {
  return order.lines.every((l) => l.pickedQty >= l.qty);
}

function linesFullyPacked(order: SaleOrder) {
  return order.lines.every((l) => l.packedQty >= l.qty);
}

async function convertQuotation(order: SaleOrder, userId: string, role: string) {
  if (order.status !== "DRAFT") {
    throw Object.assign(new Error("Only a quotation can be converted to a sales order"), { status: 400 });
  }
  if (!order.lines.length) {
    throw Object.assign(new Error("Add at least one product before converting"), { status: 400 });
  }
  const gross = totals(order).gross;
  await assertCreditAllowed(order.customerId, gross, role);
  for (const line of order.lines) {
    if (line.part.qtyOnHand < line.qty) {
      throw Object.assign(new Error(`Insufficient stock for ${line.part.sku}`), { status: 400 });
    }
  }
  for (const line of order.lines) {
    await prisma.part.update({
      where: { id: line.partId },
      data: { qtyOnHand: { decrement: line.qty } },
    });
    await prisma.stockMovement.create({
      data: {
        partId: line.partId,
        type: "SALE",
        qty: -line.qty,
        reference: order.number,
        userId,
      },
    });
  }
  const invoice = await issueInvoiceForOrder(order.id, { evenIfDraft: true });
  const invoiceNumber = invoice?.number || order.number;
  await postSale(
    { id: order.id, number: invoiceNumber, vatRate: order.vatRate, lines: order.lines },
    userId
  );
  for (const line of order.lines) {
    if (!line.part.trackSerial) continue;
    const serials = await prisma.serial.findMany({
      where: { partId: line.partId, status: "IN_STOCK" },
      take: line.qty,
    });
    for (const s of serials) {
      await prisma.serial.update({ where: { id: s.id }, data: { status: "SOLD", orderId: order.id } });
    }
  }
  for (const line of order.lines) {
    const part = await prisma.part.findUnique({ where: { id: line.partId } });
    if (part && part.qtyOnHand <= part.reorderLevel) {
      await emit("stock.low", { sku: part.sku, qtyOnHand: part.qtyOnHand, reorderLevel: part.reorderLevel });
    }
  }
  return invoice;
}

function httpError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  const status = Number((err as { status?: number })?.status) || 500;
  const message = err instanceof Error ? err.message : "Could not convert quotation";
  return res.status(status).json({ error: message });
}

ordersRouter.post("/:id/convert", async (req, res) => {
  const order = await loadSaleOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Quotation not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only convert your own quotations" });
  try {
    const invoice = await convertQuotation(order, req.user!.id, req.user!.role);
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED", dispatcherId: req.user!.id },
      include: { lines: true, payments: true, customer: true, invoice: true },
    });
    await logOrderStatus(updated.id, "CONFIRMED", req.user!.id, "Sales order confirmed");
    await recordActivity(req, {
      entity: "Invoice",
      entityId: invoice?.id || order.id,
      action: "ISSUE",
      oldValue: { status: "DRAFT" },
      newValue: { status: "CONFIRMED", invoice: invoice?.number, order: order.number },
      reason: "Customer accepted quotation",
      notice: {
        title: "Invoice issued",
        body: `${invoice?.number || order.number} confirmed — revenue posted, dispatch can pick.`,
        url: invoice?.id ? `/finance?section=ar` : `/sales/${order.id}`,
      },
      notifyModules: ["finance", "sales", "dispatch"],
    });
    await emit("order.status", { id: updated.id, number: updated.number, from: "DRAFT", to: "CONFIRMED" });
    res.json({ ...updated, invoice: invoice || updated.invoice, totals: totals(updated) });
  } catch (err) {
    return httpError(res, err);
  }
});

ordersRouter.post("/:id/pick", async (req, res) => {
  const order = await loadSaleOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canModule(req.user!, "dispatch")) return res.status(403).json({ error: "Dispatch access required" });
  const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
  for (const row of lines) {
    const line = order.lines.find((l) => l.id === row.id);
    if (!line) continue;
    const pickedQty = Math.min(line.qty, Math.max(0, Number(row.pickedQty) || 0));
    await prisma.orderLine.update({ where: { id: line.id }, data: { pickedQty } });
  }
  const fresh = await loadSaleOrder(order.id);
  if (!fresh) return res.status(404).json({ error: "Order not found" });
  res.json(decorateOrder(req.user!.role, fresh));
});

ordersRouter.post("/:id/pack", async (req, res) => {
  const order = await loadSaleOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canModule(req.user!, "dispatch")) return res.status(403).json({ error: "Dispatch access required" });
  const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
  for (const row of lines) {
    const line = order.lines.find((l) => l.id === row.id);
    if (!line) continue;
    const packedQty = Math.min(line.qty, Math.max(0, Number(row.packedQty) || 0));
    await prisma.orderLine.update({
      where: { id: line.id },
      data: {
        packedQty,
        batchNo: row.batchNo ? String(row.batchNo).slice(0, 60) : line.batchNo,
        serialNo: row.serialNo ? String(row.serialNo).slice(0, 60) : line.serialNo,
      },
    });
  }
  await prisma.order.update({
    where: { id: order.id },
    data: {
      packingBoxes: Number(req.body.packingBoxes) || order.packingBoxes,
      packingWeight: req.body.packingWeight != null ? Number(req.body.packingWeight) : order.packingWeight,
      packingNotes: req.body.packingNotes ? String(req.body.packingNotes).slice(0, 500) : order.packingNotes,
    },
  });
  const fresh = await loadSaleOrder(order.id);
  if (!fresh) return res.status(404).json({ error: "Order not found" });
  res.json(decorateOrder(req.user!.role, fresh));
});

ordersRouter.post("/:id/qc", async (req, res) => {
  const order = await loadSaleOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canModule(req.user!, "dispatch")) return res.status(403).json({ error: "Dispatch access required" });
  const passed = Boolean(req.body.passed);
  await prisma.order.update({
    where: { id: order.id },
    data: {
      qcPassed: passed,
      qcNotes: req.body.notes ? String(req.body.notes).slice(0, 500) : null,
      qcAt: new Date(),
      qcById: req.user!.id,
    },
  });
  const fresh = await loadSaleOrder(order.id);
  if (!fresh) return res.status(404).json({ error: "Order not found" });
  res.json(decorateOrder(req.user!.role, fresh));
});

ordersRouter.post("/:id/pod", async (req, res) => {
  const order = await loadSaleOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canModule(req.user!, "dispatch")) return res.status(403).json({ error: "Dispatch access required" });
  await prisma.order.update({
    where: { id: order.id },
    data: {
      podReceiver: req.body.receiver ? String(req.body.receiver).slice(0, 120) : null,
      podPhone: req.body.phone ? String(req.body.phone).slice(0, 30) : null,
      podGps: req.body.gps ? String(req.body.gps).slice(0, 120) : null,
      podOtp: req.body.otp ? String(req.body.otp).slice(0, 12) : null,
      podAt: new Date(),
    },
  });
  const fresh = await loadSaleOrder(order.id);
  if (!fresh) return res.status(404).json({ error: "Order not found" });
  res.json(decorateOrder(req.user!.role, fresh));
});

ordersRouter.post("/:id/status", async (req, res) => {
  const order = await loadSaleOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only update your own orders" });
  const next = String(req.body.status);
  const reason = String(req.body.reason || "");
  if (next === "PAID") {
    return res.status(400).json({ error: "Paid is recorded on the invoice in Finance, not on the sales order" });
  }
  if (isDispatchStep(next) || isDispatchStep(order.status)) {
    const acl = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { role: true, modules: true } });
    if (!canModule(acl || req.user!, "dispatch")) {
      return res.status(403).json({ error: "Pick, pack, dispatch, and delivery are done in Dispatch" });
    }
  }
  const expressReadyToShip =
    next === "PICKED" &&
    ["CONFIRMED", "PICKING"].includes(order.status) &&
    linesFullyPicked(order) &&
    linesFullyPacked(order) &&
    order.qcPassed === true;
  if (
    order.status !== next &&
    isDispatchStep(order.status) &&
    isDispatchStep(next) &&
    !expressReadyToShip &&
    !canDispatchTransition(order.status, next)
  ) {
    return res.status(400).json({ error: `Cannot move from ${order.status} to ${next}` });
  }
  if (next === "PACKING" && !linesFullyPicked(order)) {
    return res.status(400).json({ error: "Pick all items before packing" });
  }
  if (next === "PICKED" && order.status === "PACKING" && (!linesFullyPacked(order) || order.qcPassed !== true)) {
    return res.status(400).json({ error: "Complete packing and pass quality check first" });
  }
  if (next === "PICKED" && order.status === "PICKING" && !linesFullyPicked(order)) {
    return res.status(400).json({ error: "Pick all items first" });
  }
  if (next === "PICKED" && ["CONFIRMED", "PICKING"].includes(order.status) && !expressReadyToShip) {
    return res.status(400).json({ error: "Pick all items, then use Mark ready to ship" });
  }
  if (next === "DISPATCHED") {
    for (const line of order.lines) {
      await prisma.orderLine.update({
        where: { id: line.id },
        data: { dispatchedQty: line.packedQty || line.pickedQty || line.qty },
      });
    }
  }
  if (next === "DELIVERED") {
    for (const line of order.lines) {
      await prisma.orderLine.update({
        where: { id: line.id },
        data: { deliveredQty: line.dispatchedQty || line.packedQty || line.qty },
      });
    }
  }

  if (next === "CANCELLED" && order.status !== "DRAFT") {
    if (await queueApproval(req, res, {
      type: "CANCEL_ORDER",
      entity: "Order",
      entityId: order.id,
      oldValue: { status: order.status },
      newValue: { status: "CANCELLED" },
      reason: reason || "Cancel confirmed order",
    })) return;
    await restoreStock(order);
    await reverseSource("SALE", order.id, req.user!.id);
  }

  if (next === "CONFIRMED" && order.status === "DRAFT") {
    try {
      await convertQuotation(order, req.user!.id, req.user!.role);
    } catch (err) {
      return httpError(res, err);
    }
  }

  const dispatchMethod = req.body.dispatchMethod ? String(req.body.dispatchMethod) : order.dispatchMethod;
  if (req.body.dispatchMethod && !DISPATCH_METHODS.includes(dispatchMethod as typeof DISPATCH_METHODS[number])) {
    return res.status(400).json({ error: "Invalid delivery method" });
  }
  const priority = req.body.priority ? String(req.body.priority) : order.priority;
  if (req.body.priority && !DISPATCH_PRIORITIES.includes(priority as typeof DISPATCH_PRIORITIES[number])) {
    return res.status(400).json({ error: "Invalid priority" });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: next,
      tracking: req.body.tracking ?? order.tracking,
      dispatchMethod,
      priority,
      expectedDelivery: req.body.expectedDelivery ? new Date(req.body.expectedDelivery) : order.expectedDelivery,
      dispatcherId: req.body.dispatcherId || order.dispatcherId || req.user!.id,
      driverId: req.body.driverId ?? order.driverId,
      vehicleId: req.body.vehicleId ?? order.vehicleId,
      failureReason: next === "FAILED" ? (reason || order.failureReason) : order.failureReason,
      returnReason: next === "RETURNED" ? (reason || order.returnReason) : order.returnReason,
    },
    include: { lines: { include: { part: true } }, payments: true, customer: true, statusLogs: true },
  });
  if (order.status !== next) {
    await logOrderStatus(order.id, next, req.user!.id, reason || undefined);
  }
  if (next === "DISPATCHED" || next === "DELIVERED") {
    await recordActivity(req, {
      entity: "Order",
      entityId: order.id,
      action: next === "DELIVERED" ? "DELIVERED" : "DISPATCHED",
      oldValue: { status: order.status },
      newValue: { status: next, number: updated.number, tracking: updated.tracking },
      reason,
      notice: {
        title: next === "DELIVERED" ? "Delivery complete" : "Order dispatched",
        body:
          next === "DELIVERED"
            ? `${updated.number} delivered — collect payment in Finance if still open.`
            : `${updated.number} is on the way${updated.tracking ? ` · ${updated.tracking}` : ""}`,
        url: next === "DELIVERED" ? `/finance?section=ar` : `/dispatch/${updated.id}`,
      },
      notifyModules: next === "DELIVERED" ? ["finance", "sales", "dispatch"] : ["sales", "dispatch"],
    });
  } else {
    await audit(req, {
      entity: "Order",
      entityId: order.id,
      action: "STATUS",
      oldValue: { status: order.status },
      newValue: { status: next },
      reason,
    });
  }
  await emit("order.status", { id: updated.id, number: updated.number, from: order.status, to: next });
  res.json(decorateOrder(req.user!.role, { ...updated, totals: totals(updated) }));
});

ordersRouter.post("/:id/payments", moduleAccess("finance"), async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { lines: true, payments: true, invoice: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "DRAFT" || order.status === "CANCELLED") {
    return res.status(400).json({ error: "Record payment against a confirmed invoice in Finance" });
  }
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "CASH");
  const reference = req.body.reference ? String(req.body.reference) : null;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Amount required" });
  if (method === "MPESA" && !reference) return res.status(400).json({ error: "M-Pesa reference required" });

  const pay = await prisma.payment.create({
    data: { orderId: order.id, method, amount, reference, userId: req.user!.id },
  });
  const docNo = order.invoice?.number || order.invoiceNumber || order.number;
  await postPayment({ orderId: order.id, number: docNo, method, amount, userId: req.user!.id });
  await refreshInvoiceStatus(order.id);
  await recordActivity(req, {
    entity: "Payment",
    entityId: pay.id,
    action: "CREATE",
    newValue: pay,
    notice: {
      title: "Payment received",
      body: `KES ${Math.round(amount).toLocaleString("en-KE")} on ${docNo} (${method}).`,
      url: `/sales/${order.id}`,
    },
    notifyModules: ["finance", "sales"],
  });
  await emit("payment.recorded", { orderId: order.id, number: order.number, payment: pay, automated: false });
  res.status(201).json(pay);
});

ordersRouter.post("/:id/returns", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { lines: { include: { part: true } }, payments: true, customer: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only return your own orders" });
  if (["DRAFT", "CANCELLED"].includes(order.status)) return res.status(400).json({ error: "This order cannot be returned" });
  const incoming = parseReturnBody(req.body);
  if (!incoming.success) return res.status(400).json({ error: incoming.error.flatten() });
  if (await queueApproval(req, res, {
    type: "SALES_RETURN",
    entity: "Order",
    entityId: order.id,
    oldValue: { number: order.number, status: order.status },
    newValue: incoming.data,
    reason: incoming.data.reason,
  })) return;
  try {
    const ret = await executeSalesReturn(order.id, req.user!.id, incoming.data);
    await audit(req, { entity: "SalesReturn", entityId: ret.id, action: "CREATE", newValue: { number: ret.number, order: order.number } });
    res.status(201).json(ret);
  } catch (err) {
    const status = Number((err as { status?: number }).status) || 400;
    return res.status(status).json({ error: err instanceof Error ? err.message : "Return failed" });
  }
});

function totals(order: {
  vatRate: number;
  lines: { qty: number; salePrice: number; listPrice?: number; cost: number }[];
  payments: { amount: number }[];
  invoice?: { markupTotal?: number; markupCommission?: number; commissionRate?: number } | null;
}) {
  const net = order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
  const vat = Math.round(net * order.vatRate * 100) / 100;
  const cost = order.lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const paid = order.payments.reduce((s, p) => s + p.amount, 0);
  const markup = order.invoice?.markupTotal ?? markupTotal(order.lines);
  const markupCommission = order.invoice?.markupCommission;
  return {
    net,
    vat,
    gross: net + vat,
    cost,
    profit: net - cost,
    paid,
    balance: net + vat - paid,
    markupTotal: markup,
    markupCommission,
    commissionRate: order.invoice?.commissionRate,
  };
}

async function restoreStock(order: { number: string; lines: { partId: string; qty: number }[] }) {
  for (const line of order.lines) {
    await prisma.part.update({
      where: { id: line.partId },
      data: { qtyOnHand: { increment: line.qty } },
    });
    await prisma.stockMovement.create({
      data: { partId: line.partId, type: "RETURN", qty: line.qty, reference: order.number },
    });
  }
}

async function reverseSource(source: string, sourceId: string, userId?: string) {
  const journals = await prisma.journal.findMany({ where: { source, sourceId, reversed: false } });
  for (const j of journals) await reverseJournal(j.id, userId);
}
