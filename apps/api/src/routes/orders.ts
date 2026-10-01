import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { canBypassApproval } from "../lib/auth.js";
import { postPayment, postSale, reverseJournal } from "../lib/ledger.js";
import { emit } from "../lib/webhooks.js";
import { canAccessOrder, hideMoneyForSales, ownOrderWhere } from "../lib/roles.js";
import { moduleAccess } from "../middleware/auth.js";
import { buildOrderPdf, deliveryNumber, documentSlug } from "../lib/pdf.js";
import { ensureCompany, formatSaleNumber, nextOrderNumber, nextReturnNumber } from "../lib/sequence.js";
import { postSaleReturn } from "../lib/ledger.js";
import { issueInvoiceForOrder, refreshInvoiceStatus } from "../lib/invoice.js";

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
  const where = ownOrderWhere(req.user!);
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
  res.json(
    numbered.map((o) => ({
      ...o,
      lines: hideCost(req.user!.role, o.lines),
      totals: hideMoneyForSales(req.user!.role, totals(o)),
    }))
  );
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
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only open your own orders" });
  const numbered = await withSaleNumber(order);
  res.json({ ...numbered, lines: hideCost(req.user!.role, numbered.lines), totals: hideMoneyForSales(req.user!.role, totals(numbered)) });
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
    notes: order.notes,
    vatRate: order.vatRate,
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
  channel: z.enum(["FIELD", "SHOP", "PHONE", "WHATSAPP", "EMAIL"]),
  customerId: z.string(),
  dispatchMethod: z.enum(["SHOP_COLLECT", "COURIER"]).optional(),
  tracking: z.string().optional(),
  lpo: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(z.object({ partId: z.string(), qty: z.number().positive(), vendorId: z.string().optional() })).min(1),
});

ordersRouter.post("/", async (req, res) => {
  const body = createBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const customer = await prisma.customer.findUnique({ where: { id: body.data.customerId } });
  if (!customer) return res.status(400).json({ error: "Customer not found" });

  const parts = await prisma.part.findMany({
    where: { id: { in: body.data.lines.map((l) => l.partId) } },
  });
  const partMap = Object.fromEntries(parts.map((p) => [p.id, p]));

  const order = await prisma.order.create({
    data: {
      number: await nextNumber(),
      channel: body.data.channel,
      customerId: body.data.customerId,
      salespersonId: req.user!.id,
      branchId: req.user!.role ? (await prisma.user.findUnique({ where: { id: req.user!.id } }))?.branchId : undefined,
      dispatchMethod: body.data.dispatchMethod || "SHOP_COLLECT",
      tracking: body.data.tracking,
      lpo: body.data.lpo,
      notes: body.data.notes,
      lines: {
        create: body.data.lines.map((l) => ({
          partId: l.partId,
          vendorId: l.vendorId,
          qty: l.qty,
          salePrice: partMap[l.partId].salePrice,
          cost: partMap[l.partId].cost,
        })),
      },
    },
    include: { lines: true, customer: true },
  });
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
      notes: body.data.notes,
      lines: {
        create: body.data.lines.map((l) => ({
          partId: l.partId,
          vendorId: l.vendorId,
          qty: l.qty,
          salePrice: partMap[l.partId].salePrice,
          cost: partMap[l.partId].cost,
        })),
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

ordersRouter.post("/:id/status", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { lines: { include: { part: true } }, payments: true, customer: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!canAccessOrder(req.user!, order)) return res.status(403).json({ error: "You can only update your own orders" });
  const next = String(req.body.status);
  const reason = String(req.body.reason || "");
  if (next === "PAID") {
    return res.status(400).json({ error: "Paid is recorded on the invoice in Finance, not on the sales order" });
  }

  if (next === "CANCELLED" && order.status !== "DRAFT") {
    if (!canBypassApproval(req.user!.role)) {
      const approval = await prisma.approval.create({
        data: {
          type: "CANCEL_ORDER",
          entity: "Order",
          entityId: order.id,
          oldValue: JSON.stringify({ status: order.status }),
          newValue: JSON.stringify({ status: "CANCELLED" }),
          reason: reason || "Cancel confirmed order",
          requesterId: req.user!.id,
        },
      });
      await emit("approval.requested", approval);
      return res.status(202).json({ pending: true, approval });
    }
    await restoreStock(order);
    await reverseSource("SALE", order.id, req.user!.id);
  }

  if (next === "CONFIRMED" && order.status === "DRAFT") {
    for (const line of order.lines) {
      if (line.part.qtyOnHand < line.qty) {
        return res.status(400).json({ error: `Insufficient stock for ${line.part.sku}` });
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
          userId: req.user!.id,
        },
      });
    }
    const invoice = await issueInvoiceForOrder(order.id, { evenIfDraft: true });
    const invoiceNumber = invoice?.number || order.number;
    await postSale(
      { id: order.id, number: invoiceNumber, vatRate: order.vatRate, lines: order.lines },
      req.user!.id
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
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: next, tracking: req.body.tracking ?? order.tracking },
    include: { lines: true, payments: true, customer: true },
  });
  await audit(req, {
    entity: "Order",
    entityId: order.id,
    action: "STATUS",
    oldValue: { status: order.status },
    newValue: { status: next },
    reason,
  });
  await emit("order.status", { id: updated.id, number: updated.number, from: order.status, to: next });
  res.json({ ...updated, totals: totals(updated) });
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
  await audit(req, { entity: "Payment", entityId: pay.id, action: "CREATE", newValue: pay });
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
  const incoming = z.object({
    reason: z.string().min(1),
    lines: z.array(z.object({ lineId: z.string(), qty: z.number().positive() })).min(1),
  }).safeParse(req.body);
  if (!incoming.success) return res.status(400).json({ error: incoming.error.flatten() });

  const prior = await prisma.salesReturnLine.findMany({
    where: { ret: { orderId: order.id } },
  });
  const returned: Record<string, number> = {};
  for (const r of prior) returned[r.partId] = (returned[r.partId] || 0) + r.qty;

  const createLines: { partId: string; qty: number; salePrice: number; cost: number }[] = [];
  for (const item of incoming.data.lines) {
    const line = order.lines.find((l) => l.id === item.lineId);
    if (!line) return res.status(400).json({ error: "Line not found" });
    const already = returned[line.partId] || 0;
    if (already + item.qty > line.qty + 0.0001) {
      return res.status(400).json({ error: `Cannot return more than sold of ${line.part.sku}` });
    }
    createLines.push({ partId: line.partId, qty: item.qty, salePrice: line.salePrice, cost: line.cost });
  }

  const ret = await prisma.salesReturn.create({
    data: {
      number: await nextReturnNumber(),
      orderId: order.id,
      customerId: order.customerId,
      reason: incoming.data.reason,
      createdById: req.user!.id,
      lines: { create: createLines },
    },
    include: { lines: { include: { part: true } } },
  });
  for (const line of createLines) {
    await prisma.part.update({ where: { id: line.partId }, data: { qtyOnHand: { increment: line.qty } } });
    await prisma.stockMovement.create({
      data: { partId: line.partId, type: "RETURN", qty: line.qty, reference: ret.number, reason: incoming.data.reason, userId: req.user!.id },
    });
    const sold = await prisma.serial.findMany({ where: { partId: line.partId, orderId: order.id, status: "SOLD" }, take: line.qty });
    for (const s of sold) await prisma.serial.update({ where: { id: s.id }, data: { status: "RETURNED", orderId: null } });
  }
  await postSaleReturn({ id: ret.id, number: ret.number, vatRate: order.vatRate, lines: createLines, userId: req.user!.id });
  const credit = createLines.reduce((s, l) => s + l.qty * l.salePrice, 0) * (1 + order.vatRate);
  await prisma.payment.create({
    data: { orderId: order.id, method: "CREDIT_NOTE", amount: Math.round(credit * 100) / 100, reference: ret.number, userId: req.user!.id },
  });
  await refreshInvoiceStatus(order.id);
  await audit(req, { entity: "SalesReturn", entityId: ret.id, action: "CREATE", newValue: { number: ret.number, order: order.number } });
  res.status(201).json(ret);
});

function totals(order: {
  vatRate: number;
  lines: { qty: number; salePrice: number; cost: number }[];
  payments: { amount: number }[];
}) {
  const net = order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
  const vat = Math.round(net * order.vatRate * 100) / 100;
  const cost = order.lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const paid = order.payments.reduce((s, p) => s + p.amount, 0);
  return { net, vat, gross: net + vat, cost, profit: net - cost, paid, balance: net + vat - paid };
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
