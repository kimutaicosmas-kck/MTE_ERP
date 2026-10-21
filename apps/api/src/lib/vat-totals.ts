/** Sale line prices in MTE are quoted VAT-inclusive (customer pays the line total). */
export const SALES_VAT_INCLUSIVE = true;

export function sumSaleLines(lines: { qty: number; salePrice: number }[]) {
  return lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
}

export function computeVatTotals(subtotal: number, vatRate: number, inclusive = SALES_VAT_INCLUSIVE) {
  const raw = Math.round(subtotal * 100) / 100;
  if (vatRate <= 0) return { net: raw, vat: 0, gross: raw };
  if (inclusive) {
    const gross = raw;
    const net = Math.round((gross / (1 + vatRate)) * 100) / 100;
    const vat = Math.round((gross - net) * 100) / 100;
    return { net, vat, gross };
  }
  const net = raw;
  const vat = Math.round(net * vatRate * 100) / 100;
  const gross = Math.round((net + vat) * 100) / 100;
  return { net, vat, gross };
}

export function orderMoneyTotals(order: {
  vatRate: number;
  lines: { qty: number; salePrice: number }[];
  payments: { amount: number; method?: string }[];
}) {
  const { net, vat, gross } = computeVatTotals(sumSaleLines(order.lines), order.vatRate);
  const paid = order.payments.reduce((s, p) => s + p.amount, 0);
  const credit = order.payments
    .filter((p) => p.method === "CREDIT_NOTE")
    .reduce((s, p) => s + p.amount, 0);
  return { net, vat, gross, paid, credit, balance: Math.round((gross - paid) * 100) / 100 };
}
