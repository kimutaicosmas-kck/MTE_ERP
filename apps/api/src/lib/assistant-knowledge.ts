import { prisma } from "./prisma.js";
import { canModule, MODULES, userModules } from "./access.js";

type AssistantUser = { id: string; name: string; role: string; modules?: string | null };

export function moduleDenied(user: AssistantUser, moduleId: string, label?: string): string | null {
  if (canModule(user, moduleId)) return null;
  const name = label || MODULES.find((m) => m.id === moduleId)?.label || moduleId;
  return `**${name}** is not on your access. Ask an administrator to enable it in [Settings](/settings) if you need it.`;
}

export function wantsSalesPerformance(message: string): boolean {
  const q = message.toLowerCase().trim();
  if (/\b(my performance|my sales|my target|my commission|how am i doing)\b/.test(q)) return true;
  if (/\b(best|top|leading|highest|perform)/.test(q) && /\b(sales|seller|rep|person|team|month|week|year)\b/.test(q)) return true;
  if (/\b(sales\s*person|salesperson|sales rep)\b/.test(q) && /\b(best|top|who|month|week|year|perform)/.test(q)) return true;
  if (/\bwho\b/.test(q) && /\b(best|top)\b/.test(q) && /\b(sales|seller|rep|perform)/.test(q)) return true;
  return false;
}

function salesPeriod(when: string) {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (when === "week") {
    start.setDate(start.getDate() - start.getDay());
    return { start, end };
  }
  if (when === "today") return { start, end };
  start.setDate(1);
  return { start, end };
}

function detectSalesWhen(message: string): string {
  const q = message.toLowerCase();
  if (/\btoday\b/.test(q)) return "today";
  if (/\b(this\s+)?week\b/.test(q)) return "week";
  return "month";
}

function orderRevenue(order: { lines: { qty: number; salePrice: number }[] }) {
  return order.lines.reduce((n, l) => n + l.qty * l.salePrice, 0);
}

export async function replySalesPerformance(user: AssistantUser, message: string): Promise<string | null> {
  if (!wantsSalesPerformance(message)) return null;
  if (user.role !== "SALES" && !canModule(user, "reports") && !canModule(user, "sales")) {
    return moduleDenied(user, "reports", "Sales performance");
  }
  const when = detectSalesWhen(message);
  const { start, end } = salesPeriod(when);
  const periodLabel = when === "today" ? "today" : when === "week" ? "this week" : "this month";

  const users = await prisma.user.findMany({
    where: {
      role: { in: ["SALES", "ADMIN", "SUPER_ADMIN"] },
      active: true,
      ...(user.role === "SALES" ? { id: user.id } : {}),
    },
    include: { orders: { include: { lines: true } } },
  });

  const rows = users
    .map((u) => {
      const periodOrders = u.orders.filter((o) => {
        const d = new Date(o.createdAt);
        return d >= start && d <= end && o.status !== "DRAFT" && o.status !== "CANCELLED";
      });
      const revenue = periodOrders.reduce((s, o) => s + orderRevenue(o), 0);
      return { name: u.name, revenue, orders: periodOrders.length, attainment: u.monthlyTarget ? revenue / u.monthlyTarget : 0 };
    })
    .filter((r) => r.orders > 0 || r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  if (user.role === "SALES") {
    const me = rows[0];
    if (!me) {
      return `No confirmed sales ${periodLabel} yet. Track progress in [Sales performance](/sales/performance).`;
    }
    const pct = Math.round(me.attainment * 100);
    return `**Your sales ${periodLabel}:** KES ${Math.round(me.revenue).toLocaleString("en-KE")} · ${me.orders} order(s)${pct ? ` · ${pct}% of target` : ""}. [Details](/sales/performance).`;
  }

  if (!rows.length) {
    return `No sales revenue recorded ${periodLabel}. [Sales performance](/sales/performance).`;
  }

  const top = rows[0];
  const lines = [
    `**Best ${periodLabel}:** **${top.name}** — KES ${Math.round(top.revenue).toLocaleString("en-KE")} (${top.orders} orders).`,
  ];
  for (const r of rows.slice(1, 4)) {
    lines.push(`• ${r.name} — KES ${Math.round(r.revenue).toLocaleString("en-KE")}`);
  }
  lines.push("[Full leaderboard](/sales/performance)");
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