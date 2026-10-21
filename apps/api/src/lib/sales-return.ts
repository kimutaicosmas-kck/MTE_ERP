import { z } from "zod";
import { prisma } from "./prisma.js";
import { postSaleReturn } from "./ledger.js";
import { nextReturnNumber } from "./sequence.js";
import { refreshInvoiceStatus } from "./invoice.js";
import { computeVatTotals } from "./vat-totals.js";

const body = z.object({
  reason: z.string().min(1),
  lines: z.array(z.object({ lineId: z.string(), qty: z.number().positive() })).min(1),
});

export function parseReturnBody(raw: unknown) {
  return body.safeParse(raw);
}

export async function executeSalesReturn(orderId: string, userId: string, input: z.infer<typeof body>) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lines: { include: { part: true } }, payments: true, customer: true },
  });
  if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });
  if (["DRAFT", "CANCELLED"].includes(order.status)) {
    throw Object.assign(new Error("This order cannot be returned"), { status: 400 });
  }

  const prior = await prisma.salesReturnLine.findMany({ where: { ret: { orderId: order.id } } });
  const returned: Record<string, number> = {};
  for (const r of prior) returned[r.partId] = (returned[r.partId] || 0) + r.qty;

  const createLines: { partId: string; qty: number; salePrice: number; cost: number }[] = [];
  for (const item of input.lines) {
    const line = order.lines.find((l) => l.id === item.lineId);
    if (!line) throw Object.assign(new Error("Line not found"), { status: 400 });
    const already = returned[line.partId] || 0;
    if (already + item.qty > line.qty + 0.0001) {
      throw Object.assign(new Error(`Cannot return more than sold of ${line.part.sku}`), { status: 400 });
    }
    createLines.push({ partId: line.partId, qty: item.qty, salePrice: line.salePrice, cost: line.cost });
  }

  const ret = await prisma.salesReturn.create({
    data: {
      number: await nextReturnNumber(),
      orderId: order.id,
      customerId: order.customerId,
      reason: input.reason,
      createdById: userId,
      lines: { create: createLines },
    },
    include: { lines: { include: { part: true } } },
  });
  for (const line of createLines) {
    await prisma.part.update({ where: { id: line.partId }, data: { qtyOnHand: { increment: line.qty } } });
    await prisma.stockMovement.create({
      data: { partId: line.partId, type: "RETURN", qty: line.qty, reference: ret.number, reason: input.reason, userId },
    });
    const sold = await prisma.serial.findMany({ where: { partId: line.partId, orderId: order.id, status: "SOLD" }, take: line.qty });
    for (const s of sold) await prisma.serial.update({ where: { id: s.id }, data: { status: "RETURNED", orderId: null } });
  }
  await postSaleReturn({ id: ret.id, number: ret.number, vatRate: order.vatRate, lines: createLines, userId });
  const { gross: credit } = computeVatTotals(
    createLines.reduce((s, l) => s + l.qty * l.salePrice, 0),
    order.vatRate
  );
  await prisma.payment.create({
    data: { orderId: order.id, method: "CREDIT_NOTE", amount: Math.round(credit * 100) / 100, reference: ret.number, userId },
  });
  await refreshInvoiceStatus(order.id);
  return ret;
}
