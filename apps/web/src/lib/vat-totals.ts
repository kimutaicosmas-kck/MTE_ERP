/** Matches API: sale prices are VAT-inclusive. */
export function computeVatTotals(subtotal: number, vatRate: number, inclusive = true) {
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
