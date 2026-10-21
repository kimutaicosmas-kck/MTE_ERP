import { prisma } from "./prisma.js";
import { computeMarkupCommission } from "./markup-commission.js";
import { ensureCompany, nextInvoiceNumber, withUniqueNumber } from "./sequence.js";
import { orderMoneyTotals } from "./vat-totals.js";

function normalizeInvoiceNumber(raw?: string | null) {
  if (!raw) return null;
  if (raw.startsWith("INV-")) return raw;
  if (/^\d{4}-\d+$/.test(raw)) return `INV-${raw}`;
  return raw;
}

function dueFrom(terms?: string | null, from = new Date()) {
  const d = new Date(from);
  const days = /30/.test(terms || "") ? 30 : /14/.test(terms || "") ? 14 : 0;
  d.setDate(d.getDate() + days);
  return d;
}

function moneyTotals(order: {
  vatRate: number;
  lines: { qty: number; salePrice: number }[];
  payments: { amount: number; method: string }[];
}) {
  return orderMoneyTotals(order);
}

export function invoiceStatus(balance: number, paid = 0, dueAt?: Date | null) {
  if (balance <= 0.01) return "PAID";
  if (dueAt && dueAt < new Date()) return "OVERDUE";
  if (paid > 0.01) return "PARTIAL";
  return "UNPAID";
}

export async function issueInvoiceForOrder(orderId: string, opts?: { evenIfDraft?: boolean }) {
  const existing = await prisma.invoice.findUnique({ where: { orderId } });
  if (existing) return existing;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      lines: { select: { qty: true, salePrice: true, listPrice: true } },
      salesperson: { select: { commissionRate: true } },
    },
  });
  if (!order || order.status === "CANCELLED") return null;
  if (order.status === "DRAFT" && !opts?.evenIfDraft) return null;
  const company = await ensureCompany();
  const reserved = normalizeInvoiceNumber(order.invoiceNumber);
  try {
    return await withUniqueNumber(async () => {
      const again = await prisma.invoice.findUnique({ where: { orderId: order.id } });
      if (again) return again;
      const number = reserved && !(await prisma.invoice.findUnique({ where: { number: reserved } }))
        ? reserved
        : await nextInvoiceNumber(company.setting.invoicePrefix || "");
      if (order.invoiceNumber !== number) {
        await prisma.order.update({ where: { id: order.id }, data: { invoiceNumber: number } });
      }
      const commission = computeMarkupCommission(
        order.lines,
        order.salesperson?.commissionRate ?? 0
      );
      return prisma.invoice.create({
        data: {
          number,
          orderId: order.id,
          customerId: order.customerId,
          salespersonId: order.salespersonId,
          lpo: order.lpo,
          vatRate: order.vatRate,
          markupTotal: commission.markupTotal,
          markupCommission: commission.markupCommission,
          commissionRate: commission.commissionRate,
          issuedAt: order.createdAt,
          dueAt: dueFrom(order.customer.paymentTerms, order.createdAt),
        },
      });
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      return prisma.invoice.findUnique({ where: { orderId: order.id } });
    }
    throw err;
  }
}

export async function refreshInvoiceStatus(orderId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { orderId },
    include: { order: { include: { lines: true, payments: true } } },
  });
  if (!invoice) return null;
  const t = moneyTotals(invoice.order);
  const status = invoiceStatus(t.balance, t.paid, invoice.dueAt);
  return prisma.invoice.update({ where: { id: invoice.id }, data: { status } });
}

function logInvoiceRepair(scope: string, id: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[invoice-repair] ${scope} ${id}: ${msg}`);
}

/** Backfill missing/legacy invoices — never throws (read endpoints must stay usable). */
export async function repairInvoiceRegistry() {
  const confirmed = await prisma.order.findMany({
    where: { status: { notIn: ["DRAFT", "CANCELLED"] }, invoice: null },
    select: { id: true },
  });
  for (const o of confirmed) {
    try {
      await issueInvoiceForOrder(o.id);
      await refreshInvoiceStatus(o.id);
    } catch (err) {
      logInvoiceRepair("order", o.id, err);
    }
  }
  const legacy = await prisma.invoice.findMany({ where: { number: { not: { startsWith: "INV-" } } } });
  for (const inv of legacy) {
    try {
      const number = normalizeInvoiceNumber(inv.number);
      if (!number || number === inv.number) continue;
      const taken = await prisma.invoice.findUnique({ where: { number } });
      if (taken && taken.id !== inv.id) continue;
      await prisma.invoice.update({ where: { id: inv.id }, data: { number } });
      await prisma.order.update({ where: { id: inv.orderId }, data: { invoiceNumber: number } });
    } catch (err) {
      logInvoiceRepair("legacy", inv.id, err);
    }
  }
}

export async function sumOutstandingInvoiceBalances() {
  const rows = await prisma.invoice.findMany({
    include: { order: { include: { lines: true, payments: true } } },
  });
  return rows
    .map((inv) => moneyTotals(inv.order).balance)
    .filter((balance) => balance > 0.01)
    .reduce((s, balance) => s + balance, 0);
}

export async function listInvoices() {
  await repairInvoiceRegistry();

  const rows = await prisma.invoice.findMany({
    include: {
      customer: true,
      salesperson: { select: { name: true } },
      order: { include: { lines: true, payments: true } },
    },
    orderBy: { issuedAt: "desc" },
  });
  return rows.map((inv) => {
    const totals = moneyTotals(inv.order);
    return {
      id: inv.id,
      number: inv.number,
      orderId: inv.orderId,
      orderNumber: inv.order.number,
      status: invoiceStatus(totals.balance, totals.paid, inv.dueAt),
      vatRate: inv.vatRate,
      lpo: inv.lpo,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      customer: inv.customer,
      salesperson: inv.salesperson,
      markupTotal: inv.markupTotal,
      markupCommission: inv.markupCommission,
      commissionRate: inv.commissionRate,
      payments: inv.order.payments,
      totals,
    };
  });
}
