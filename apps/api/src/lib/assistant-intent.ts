import { wantsSalesPerformance, wantsStockDetail } from "./assistant-knowledge.js";

export function wantsRevenueTotal(q: string): boolean {
  const s = q.toLowerCase().trim();
  if (/\b(sales\s*person|salesperson|sales rep|rep|who)\b/.test(s)) return false;
  if (
    /\b(how much|what(?:'s| is) the total|total|amount)\b/.test(s) &&
    /\b(sales|sold|selling|revenue|turnover|orders)\b/.test(s)
  ) {
    return true;
  }
  if (/\b(sales|revenue|turnover|sold)\b/.test(s) && /\b(today|todays|today's|this week|week|month|year|yesterday)\b/.test(s)) {
    return true;
  }
  if (/\b(today|todays|today's|yesterday)\b/.test(s) && /\b(sales|revenue|sold|orders|business)\b/.test(s)) {
    return true;
  }
  return false;
}

export function wantsTopCustomer(q: string): boolean {
  return /\b(best|top|biggest|largest|main)\b/.test(q) && /\bcustomer(s)?\b/.test(q);
}

export function wantsReceivables(q: string): boolean {
  if (/\bvoid\b/.test(q)) return false;
  return (
    /\b(receivable|outstanding|uncollected|collections?)\b/.test(q) ||
    (/\bwho\b/.test(q) && /\b(owe|owing|debt)\b/.test(q)) ||
    /\bhow much\b.*\b(owe|owing|outstanding)\b/.test(q)
  );
}

export function wantsTopProduct(q: string): boolean {
  return (
    /\b(best|top|fastest|bestsell)/.test(q) &&
    /\b(selling|seller|product|part|sku|moving|mover)\b/.test(q)
  );
}

export function wantsOpenPurchases(q: string): boolean {
  return /\b(open\s+po|open\s+purchase|pending\s+po|supplier\s+order)\b/.test(q);
}

/** Questions that need live ERP numbers — never run customer/part keyword search for these. */
export function isBusinessDataQuestion(message: string): boolean {
  const q = message.toLowerCase().trim();
  return (
    wantsRevenueTotal(q) ||
    wantsTopCustomer(q) ||
    wantsReceivables(q) ||
    wantsTopProduct(q) ||
    wantsOpenPurchases(q) ||
    wantsSalesPerformance(message) ||
    wantsStockDetail(message)
  );
}