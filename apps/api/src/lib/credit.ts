import { prisma } from "./prisma.js";
import { computeVatTotals, sumSaleLines } from "./vat-totals.js";

export function invoiceGross(inv: { vatRate: number; order: { lines: { qty: number; salePrice: number }[]; payments: { amount: number; createdAt: Date }[] } }, asOf = new Date()) {
  const { net, gross } = computeVatTotals(sumSaleLines(inv.order.lines), inv.vatRate);
  const paid = inv.order.payments.filter((p) => p.createdAt <= asOf).reduce((s, p) => s + p.amount, 0);
  const balance = Math.round((gross - paid) * 100) / 100;
  return { net, gross, paid, balance };
}

export async function customerOutstanding(customerId: string, asOf = new Date()) {
  const invoices = await prisma.invoice.findMany({
    where: { customerId, issuedAt: { lte: asOf } },
    include: { order: { include: { lines: true, payments: true } } },
  });
  return Math.round(invoices.reduce((s, inv) => s + Math.max(0, invoiceGross(inv, asOf).balance), 0) * 100) / 100;
}

export async function assertCreditAllowed(customerId: string, additionalGross: number, role: string) {
  if (role === "SUPER_ADMIN") return;
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw Object.assign(new Error("Customer not found"), { status: 400 });
  if (customer.creditLimit <= 0) return;
  const outstanding = await customerOutstanding(customerId);
  const projected = Math.round((outstanding + additionalGross) * 100) / 100;
  if (projected > customer.creditLimit) {
    throw Object.assign(
      new Error(`Credit limit exceeded. Outstanding ${outstanding.toLocaleString()} + new ${additionalGross.toLocaleString()} exceeds limit ${customer.creditLimit.toLocaleString()}. Ask Super Admin to override.`),
      { status: 402 }
    );
  }
}
