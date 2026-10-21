export type LineForMarkup = { qty: number; salePrice: number; listPrice?: number | null };

function effectiveListPrice(line: LineForMarkup) {
  if (line.listPrice != null && line.listPrice > 0) return line.listPrice;
  return line.salePrice;
}

export function markupTotal(lines: LineForMarkup[]) {
  return lines.reduce((sum, line) => {
    const list = effectiveListPrice(line);
    const uplift = Math.max(0, line.salePrice - list);
    return sum + uplift * line.qty;
  }, 0);
}

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeMarkupCommission(lines: LineForMarkup[], commissionRate: number) {
  const total = roundMoney(markupTotal(lines));
  const rate = commissionRate > 0 ? commissionRate : 0;
  return {
    markupTotal: total,
    markupCommission: roundMoney(total * rate),
    commissionRate: rate,
  };
}
