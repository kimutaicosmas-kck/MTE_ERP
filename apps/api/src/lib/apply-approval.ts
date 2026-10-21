import { prisma } from "./prisma.js";
import { postJournal, postStockReceipt, reverseJournal } from "./ledger.js";
import { refreshInvoiceStatus } from "./invoice.js";
import { executeSalesReturn } from "./sales-return.js";
import { destroyUserSessions } from "./redis.js";

export async function applyApproval(
  approval: { type: string; entity: string; entityId: string; newValue: string },
  userId: string
) {
  const next = JSON.parse(approval.newValue || "{}");
  if (approval.type === "ADJUST_STOCK") {
    const part = await prisma.part.findUnique({ where: { id: approval.entityId } });
    if (!part) return;
    const qty = Number(next.qty);
    const type = String(next.type || "ADJUSTMENT");
    await prisma.part.update({ where: { id: part.id }, data: { qtyOnHand: part.qtyOnHand + qty } });
    await prisma.stockMovement.create({
      data: { partId: part.id, type, qty, reason: next.reason, userId },
    });
    if (type === "RECEIPT") {
      await postStockReceipt({ partId: part.id, sku: part.sku, qty, cost: part.cost, userId });
    }
  }
  if (approval.type === "DELETE_PART") {
    await prisma.part.delete({ where: { id: approval.entityId } }).catch(() => null);
  }
  if (approval.type === "CANCEL_ORDER") {
    const order = await prisma.order.findUnique({
      where: { id: approval.entityId },
      include: { lines: true },
    });
    if (!order || order.status === "CANCELLED") return;
    for (const line of order.lines) {
      await prisma.part.update({
        where: { id: line.partId },
        data: { qtyOnHand: { increment: line.qty } },
      });
    }
    const journals = await prisma.journal.findMany({
      where: { source: "SALE", sourceId: order.id, reversed: false },
    });
    for (const j of journals) await reverseJournal(j.id, userId);
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  }
  if (approval.type === "CREDIT_OVERRIDE") {
    await prisma.customer.update({
      where: { id: approval.entityId },
      data: { creditLimit: Number(next.creditLimit) },
    });
  }
  if (approval.type === "EDIT_PART") {
    const part = await prisma.part.findUnique({ where: { id: approval.entityId } });
    if (!part) return;
    await prisma.part.update({
      where: { id: part.id },
      data: {
        ...(typeof next.name === "string" ? { name: next.name } : {}),
        ...(typeof next.oemNumber === "string" ? { oemNumber: next.oemNumber } : {}),
        ...(typeof next.category === "string" ? { category: next.category } : {}),
        ...(typeof next.binLocation === "string" ? { binLocation: next.binLocation } : {}),
        ...(next.warehouseBinId === null ? { warehouseBinId: null } : next.warehouseBinId ? { warehouseBinId: String(next.warehouseBinId) } : {}),
        ...(typeof next.reorderLevel === "number" ? { reorderLevel: next.reorderLevel } : {}),
        ...(typeof next.critical === "boolean" ? { critical: next.critical } : {}),
        ...(typeof next.cost === "number" ? { cost: next.cost } : {}),
        ...(typeof next.salePrice === "number" ? { salePrice: next.salePrice } : {}),
      },
    });
  }
  if (approval.type === "EDIT_CUSTOMER") {
    await prisma.customer.update({
      where: { id: approval.entityId },
      data: {
        ...(typeof next.name === "string" ? { name: next.name } : {}),
        ...(next.phone !== undefined ? { phone: next.phone ? String(next.phone) : null } : {}),
        ...(next.email !== undefined ? { email: next.email ? String(next.email) : null } : {}),
        ...(typeof next.kraPin === "string" ? { kraPin: next.kraPin } : {}),
        ...(typeof next.creditLimit === "number" ? { creditLimit: next.creditLimit } : {}),
        ...(typeof next.paymentTerms === "string" ? { paymentTerms: next.paymentTerms } : {}),
        ...(next.notes !== undefined ? { notes: next.notes ? String(next.notes) : null } : {}),
      },
    });
  }
  if (approval.type === "EDIT_PRICE") {
    if (approval.entity === "Part") {
      await prisma.part.update({
        where: { id: approval.entityId },
        data: {
          ...(next.salePrice != null ? { salePrice: Number(next.salePrice) } : {}),
          ...(next.cost != null ? { cost: Number(next.cost) } : {}),
        },
      });
    } else {
      await prisma.orderLine.update({
        where: { id: approval.entityId },
        data: { salePrice: Number(next.salePrice) },
      });
    }
  }
  if (approval.type === "POST_JOURNAL") {
    await postJournal({
      memo: String(next.memo || "Manual journal"),
      source: "MANUAL",
      userId,
      lines: next.lines || [],
    });
  }
  if (approval.type === "DELETE_EXPENSE") {
    const journals = await prisma.journal.findMany({
      where: { source: "EXPENSE", sourceId: approval.entityId, reversed: false },
    });
    for (const j of journals) await reverseJournal(j.id, userId);
    await prisma.expense.delete({ where: { id: approval.entityId } }).catch(() => null);
  }
  if (approval.type === "VOID_PAYMENT") {
    const pay = await prisma.payment.findUnique({ where: { id: approval.entityId } });
    if (!pay) return;
    const order = await prisma.order.findUnique({ where: { id: pay.orderId }, include: { invoice: true } });
    const cashCode = pay.method === "MPESA" ? "1010" : pay.method === "BANK" ? "1020" : "1000";
    await postJournal({
      memo: `Void payment ${order?.invoice?.number || order?.number || pay.id}`,
      source: "REVERSAL",
      sourceId: pay.id,
      userId,
      lines: [
        { code: "1100", debit: pay.amount },
        { code: cashCode, credit: pay.amount },
      ],
    });
    await prisma.payment.delete({ where: { id: pay.id } });
    await refreshInvoiceStatus(pay.orderId);
  }
  if (approval.type === "DELETE_CUSTOMER") {
    const used = await prisma.order.count({ where: { customerId: approval.entityId } });
    if (used) return;
    await prisma.customer.delete({ where: { id: approval.entityId } }).catch(() => null);
  }
  if (approval.type === "SALES_RETURN") {
    await executeSalesReturn(approval.entityId, userId, next);
  }
  if (approval.type === "USER_SENSITIVE") {
    await prisma.user.update({
      where: { id: approval.entityId },
      data: {
        ...(next.salary != null ? { salary: Number(next.salary) } : {}),
        ...(next.commissionRate != null ? { commissionRate: Number(next.commissionRate) } : {}),
        ...(typeof next.active === "boolean" ? { active: next.active } : {}),
      },
    });
    if (next.active === false) await destroyUserSessions(approval.entityId);
  }
}
