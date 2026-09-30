import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { canBypassApproval } from "../lib/auth.js";
import { postPayment, postSale, reverseJournal } from "../lib/ledger.js";
import { emit } from "../lib/webhooks.js";

export const ordersRouter = Router();

async function nextNumber() {
  const count = await prisma.order.count();
  return `ORD-${String(count + 1).padStart(5, "0")}`;
}

function hideCost<T extends { cost?: number }>(role: string, rows: T[]): T[] {
  if (role !== "SALES") return rows;
  return rows.map((r) => ({ ...r, cost: undefined }));
}

ordersRouter.get("/", async (req, res) => {
  const where = req.user!.role === "SALES" ? { salespersonId: req.user!.id } : {};
  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: true,
      salesperson: { select: { id: true, name: true } },
      lines: { include: { part: true } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    orders.map((o) => ({
      ...o,
      lines: hideCost(req.user!.role, o.lines),
      totals: totals(o),
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
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ ...order, lines: hideCost(req.user!.role, order.lines), totals: totals(order) });
});

ordersRouter.post("/:id/files", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
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
      dispatchMethod: body.data.dispatchMethod || "SHOP_COLLECT",
      tracking: body.data.tracking,
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

ordersRouter.post("/:id/status", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { lines: { include: { part: true } }, payments: true, customer: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  const next = String(req.body.status);
  const reason = String(req.body.reason || "");

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
    await postSale(
      { id: order.id, number: order.number, vatRate: order.vatRate, lines: order.lines },
      req.user!.id
    );
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

ordersRouter.post("/:id/payments", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { lines: true, payments: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "CASH");
  const reference = req.body.reference ? String(req.body.reference) : null;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Amount required" });
  if (method === "MPESA" && !reference) return res.status(400).json({ error: "M-Pesa reference required" });

  const pay = await prisma.payment.create({
    data: { orderId: order.id, method, amount, reference, userId: req.user!.id },
  });
  await postPayment({ orderId: order.id, number: order.number, method, amount, userId: req.user!.id });

  const paid = order.payments.reduce((s, p) => s + p.amount, 0) + amount;
  const due = invoiceTotal(order);
  if (paid + 0.01 >= due && ["DELIVERED", "DISPATCHED", "PICKED", "CONFIRMED"].includes(order.status)) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
  }
  await audit(req, { entity: "Payment", entityId: pay.id, action: "CREATE", newValue: pay });
  await emit("payment.recorded", { orderId: order.id, number: order.number, payment: pay, automated: false });
  res.status(201).json(pay);
});

function invoiceTotal(order: { vatRate: number; lines: { qty: number; salePrice: number }[] }) {
  const net = order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
  return Math.round((net + net * order.vatRate) * 100) / 100;
}

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
