import { prisma } from "./prisma.js";
import { canModule, MODULES, userModules } from "./access.js";
import {
  fetchSalesLeaderboard,
  parseSalesWhenFromMessage,
  salesPeriodRange,
  salesPerformanceLink,
} from "./sales-report.js";

export type AssistantUser = { id: string; name: string; role: string; modules?: string | null };

export function moduleDenied(user: AssistantUser, moduleId: string, label?: string): string | null {
  if (canModule(user, moduleId)) return null;
  const name = label || MODULES.find((m) => m.id === moduleId)?.label || moduleId;
  return `**${name}** is not on your access. Ask an administrator to enable it in [Settings](/settings) if you need it.`;
}

export function isWorkflowQuestion(message: string): boolean {
  const q = message.toLowerCase().trim();
  if (/\b(how\s+(to|do|can|should)|step(?:s)?|workflow|guide|walk\s+me\s+through|help\s+me)\b/.test(q)) return true;
  if (
    /\b(create|make|start|issue|record|convert|confirm|add|enter)\b/.test(q) &&
    /\b(order|quote|quotation|invoice|payment|po|purchase|dispatch|grn|receipt|customer|return)\b/.test(q)
  ) {
    return true;
  }
  return false;
}

function purchaseOrderWorkflowReply(): string {
  return [
    "**Create & receive a purchase order**",
    "1. Open [New purchase order](/procurement/new).",
    "2. Pick the **vendor**, add lines (part, qty, unit cost), and save.",
    "3. When stock arrives, open the PO → **Receive** (GRN). Quantity increases and finance records the supplier bill.",
    "4. Pay the bill from [Finance](/finance) → Payables.",
  ].join("\n");
}

function recordPaymentWorkflowReply(): string {
  return [
    "**Record a customer payment**",
    "1. Open [Finance](/finance) → **Record payment**.",
    "2. Select the customer and the invoice(s).",
    "3. Enter **amount received** (full or partial). M-Pesa needs a reference.",
    "4. Save. The invoice shows **Paid** or **Partial**.",
  ].join("\n");
}

function dispatchWorkflowReply(): string {
  return [
    "**Dispatch an order**",
    "1. Orders appear in [Dispatch](/dispatch) after confirmation.",
    "2. **Pick** items, mark **Picked**, then **Dispatch** with driver details.",
    "3. Mark **Delivered** when the customer receives goods.",
  ].join("\n");
}

export function workflowAssistantReply(user: AssistantUser, message: string): string | null {
  if (!isWorkflowQuestion(message)) return null;
  const q = message.toLowerCase();

  if (/\b(po|purchase|procurement|grn|vendor)\b/.test(q)) {
    const deny = moduleDenied(user, "procurement");
    if (deny) return deny;
    return purchaseOrderWorkflowReply();
  }

  if (/\b(payment|receipt|mpesa|collect)\b/.test(q) && !/\b(void|supplier|vendor)\b/.test(q)) {
    const deny = moduleDenied(user, "finance");
    if (deny) return deny;
    return recordPaymentWorkflowReply();
  }

  if (/\b(dispatch|pick|ship|deliver)\b/.test(q)) {
    const deny = moduleDenied(user, "dispatch");
    if (deny) return deny;
    return dispatchWorkflowReply();
  }

  return null;
}

export function wantsStockDetail(message: string): boolean {
  const q = message.toLowerCase().trim();
  if (/\b(which|what|list|name|show|tell me)\b/.test(q) && /\b(product|part|sku|stock|reorder)\b/.test(q)) return true;
  if (/\bout of stock|out-of-stock|zero stock|no stock\b/.test(q)) return true;
  if (/\blow\b/.test(q) && /\b(stock|inventory)\b/.test(q)) return true;
  return false;
}

export async function replyStockDetail(user: AssistantUser, message: string): Promise<string | null> {
  if (!wantsStockDetail(message)) return null;
  const deny = moduleDenied(user, "inventory");
  if (deny) return deny;

  const q = message.toLowerCase();
  const outOnly = /\bout of stock|zero stock|no stock\b/.test(q);

  const parts = await prisma.part.findMany({
    select: { sku: true, name: true, qtyOnHand: true, reorderLevel: true, critical: true },
    orderBy: [{ qtyOnHand: "asc" }, { name: "asc" }],
    take: 250,
  });

  const out = parts.filter((p) => p.qtyOnHand <= 0);
  const low = parts.filter((p) => p.qtyOnHand > 0 && p.qtyOnHand <= p.reorderLevel);

  const show = outOnly ? out : [...out, ...low];
  const slice = show.slice(0, 12);

  if (!slice.length) {
    return outOnly
      ? "No products are at **zero** stock right now. [Inventory](/inventory)."
      : "No products are below reorder level. [Inventory](/inventory).";
  }

  const title = outOnly ? "**Out of stock**" : "**Low or out of stock**";
  const lines = [title, ...slice.map((p) => {
    const tag = p.qtyOnHand <= 0 ? "OUT" : `${p.qtyOnHand} left`;
    const crit = p.critical ? " · critical" : "";
    return `• **${p.sku}** ${p.name} — ${tag}${crit}`;
  })];
  if (show.length > slice.length) lines.push(`…and ${show.length - slice.length} more. [Full list](/inventory?section=reorder)`);
  else lines.push("[Inventory](/inventory?section=reorder)");
  return lines.join("\n");
}

export function wantsSalesPerformance(message: string): boolean {
  const q = message.toLowerCase().trim();
  if (/\b(my performance|my sales|my target|my commission|how am i doing)\b/.test(q)) return true;
  if (/\b(leaderboard|rankings?)\b/.test(q) && /\b(sales|seller|team)\b/.test(q)) return true;
  if (/\b(best|top|leading|highest|worst|lowest)\b/.test(q) && /\b(sales|seller|rep|person|people|staff|team|perform)/.test(q))
    return true;
  if (/\b(sales\s*person|salesperson|sales rep|sales team)\b/.test(q) && /\b(best|top|who|rank|perform|year|month|week)\b/.test(q))
    return true;
  if (/\bwho\b/.test(q) && /\b(best|top|leading)\b/.test(q) && /\b(sales|seller|rep|perform|person)\b/.test(q)) return true;
  if (/\b(which|what)\b/.test(q) && /\b(sales\s*person|salesperson)\b/.test(q)) return true;
  return false;
}

export async function replySalesPerformance(user: AssistantUser, message: string): Promise<string | null> {
  if (!wantsSalesPerformance(message)) return null;
  if (user.role !== "SALES" && !canModule(user, "reports") && !canModule(user, "sales")) {
    return moduleDenied(user, "reports", "Sales performance");
  }

  const when = parseSalesWhenFromMessage(message);
  const { start, end, label: periodLabel } = salesPeriodRange(when);
  const perfLink = salesPerformanceLink(when);

  const ranked = await fetchSalesLeaderboard({
    start,
    end,
    when,
    restrictUserId: user.role === "SALES" ? user.id : undefined,
  });

  if (user.role === "SALES") {
    const me = ranked[0];
    if (!me?.orders) {
      return `No confirmed sales **${periodLabel}** yet. Track progress in ${perfLink}.`;
    }
    const pct = Math.round(me.attainment * 100);
    return `**Your sales ${periodLabel}:** KES ${Math.round(me.revenue).toLocaleString("en-KE")} · ${me.orders} order(s)${pct ? ` · ${pct}% of target` : ""}. ${perfLink}.`;
  }

  if (!ranked.length || !ranked.some((r) => r.orders > 0)) {
    return `No confirmed sales **${periodLabel}** yet. ${perfLink}.`;
  }

  const top = ranked[0];
  if (!top.orders) {
    return `No confirmed sales **${periodLabel}** yet. ${perfLink}.`;
  }
  if (top.revenue <= 0) {
    return `**Best ${periodLabel} by volume:** **${top.name}** — ${top.orders} order(s). Revenue shows KES 0 on lines (check unit prices). ${perfLink}.`;
  }

  const lines = [
    `**Best salesperson ${periodLabel}:** **${top.name}** — KES ${Math.round(top.revenue).toLocaleString("en-KE")} (${top.orders} orders).`,
  ];
  for (const r of ranked.slice(1, 4).filter((r) => r.revenue > 0 || r.orders > 0)) {
    lines.push(`• ${r.name} — KES ${Math.round(r.revenue).toLocaleString("en-KE")} (${r.orders} orders)`);
  }
  lines.push(`[Full leaderboard](/sales/performance${when === "month" ? "" : `?when=${when}`})`);
  return lines.join("\n");
}

const ALERT_MODULE: Record<string, string> = {
  overdue: "finance",
  crit: "inventory",
  low: "inventory",
  dispatch: "dispatch",
  "mpesa-u": "finance",
  inbound: "procurement",
};

export function filterAlertsForUser<T extends { id: string }>(user: AssistantUser, alerts: T[]): T[] {
  return alerts.filter((a) => {
    const mod = ALERT_MODULE[a.id];
    return !mod || canModule(user, mod);
  });
}

export function kpiKeysForUser(user: AssistantUser): (keyof {
  pendingApprovals: number;
  dispatchQueue: number;
  lowStock: number;
  openPOs: number;
  unpaidInvoices: number;
  myOrdersToday: number;
  myOpenQuotes: number;
})[] {
  const keys: ReturnType<typeof kpiKeysForUser> = [];
  if (canModule(user, "approvals")) keys.push("pendingApprovals");
  if (canModule(user, "dispatch")) keys.push("dispatchQueue");
  if (canModule(user, "inventory")) keys.push("lowStock");
  if (canModule(user, "procurement")) keys.push("openPOs");
  if (canModule(user, "finance")) keys.push("unpaidInvoices");
  if (canModule(user, "sales")) {
    keys.push("myOrdersToday", "myOpenQuotes");
  }
  return keys;
}

export function moduleListForPrompt(user: AssistantUser): string {
  return userModules(user).map((id) => MODULES.find((m) => m.id === id)?.label || id).join(", ");
}