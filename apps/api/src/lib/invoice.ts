import { prisma } from "./prisma.js";
import { ensureCompany, nextInvoiceNumber } from "./sequence.js";

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
  const net = order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
  const vat = Math.round(net * order.vatRate * 100) / 100;
  const paid = order.payments.reduce((s, p) => s + p.amount, 0);
  const credit = order.payments.filter((p) => p.method === "CREDIT_NOTE").reduce((s, p) => s + p.amount, 0);
  return { net, vat, gross: net + vat, paid, credit, balance: net + vat - paid };
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
    include: { customer: true },
  });
  if (!order || order.status === "CANCELLED") return null;
  if (order.status === "DRAFT" && !opts?.evenIfDraft) return null;
  const company = await ensureCompany();
  const number = normalizeInvoiceNumber(order.invoiceNumber) || (await nextInvoiceNumber(company.setting.invoicePrefix || ""));
  if (order.invoiceNumber !== number) {
    await prisma.order.update({ where: { id: order.id }, data: { invoiceNumber: number } });
  }
  return prisma.invoice.create({
    data: {
      number,
      orderId: order.id,
      customerId: order.customerId,
      salespersonId: order.salespersonId,
      lpo: order.lpo,
      vatRate: order.vatRate,
      issuedAt: order.createdAt,
      dueAt: dueFrom(order.customer.paymentTerms, order.createdAt),
    },
  });
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

export async function listInvoices() {
  const confirmed = await prisma.order.findMany({
    where: { status: { notIn: ["DRAFT", "CANCELLED"] }, invoice: null },
    select: { id: true },
  });
  for (const o of confirmed) {
    await issueInvoiceForOrder(o.id);
    await refreshInvoiceStatus(o.id);
  }
  const legacy = await prisma.invoice.findMany({ where: { number: { not: { startsWith: "INV-" } } } });
  for (const inv of legacy) {
    const number = normalizeInvoiceNumber(inv.number);
    if (!number || number === inv.number) continue;
    await prisma.invoice.update({ where: { id: inv.id }, data: { number } });
    await prisma.order.update({ where: { id: inv.orderId }, data: { invoiceNumber: number } });
  }

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
      payments: inv.order.payments,
      totals,
    };
  });
}
