import { prisma } from "./prisma.js";

export type SalesWhen = "month" | "lastMonth" | "year" | "all" | "today" | "week";

/** Parse period from assistant chat (natural language). */
export function parseSalesWhenFromMessage(message: string): SalesWhen {
  const q = message.toLowerCase().trim();
  if (/\ball\s+time\b|\boverall\b|\bever\b|\bsince\s+start\b/.test(q)) return "all";
  if (/\b(last\s+month|previous\s+month)\b/.test(q)) return "lastMonth";
  if (/\b(this\s+)?year\b|\bytd\b|\byear\s+to\s+date\b|\bannual\b/.test(q)) return "year";
  if (/\btoday\b/.test(q)) return "today";
  if (/\b(this\s+)?week\b/.test(q)) return "week";
  return "month";
}

/** Parse period from reports API query param. */
export function parseSalesWhenParam(when: string): SalesWhen {
  const w = when.toLowerCase();
  if (w === "lastmonth" || w === "last_month") return "lastMonth";
  if (["month", "lastMonth", "year", "all", "today", "week"].includes(w)) return w as SalesWhen;
  return "month";
}

export function salesPeriodRange(when: SalesWhen): { start: Date; end: Date; label: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (when === "lastMonth") {
    start.setDate(1);
    start.setMonth(start.getMonth() - 1);
    const monthEnd = new Date(start);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    monthEnd.setHours(23, 59, 59, 999);
    return { start, end: monthEnd, label: "Last month" };
  }
  if (when === "year") {
    start.setMonth(0, 1);
    return { start, end, label: "This year" };
  }
  if (when === "all") {
    return { start: new Date(0), end, label: "All time" };
  }
  if (when === "today") {
    return { start, end, label: "Today" };
  }
  if (when === "week") {
    start.setDate(start.getDate() - start.getDay());
    return { start, end, label: "This week" };
  }
  start.setDate(1);
  return { start, end, label: "This month" };
}

export function orderLineRevenue(order: { lines: { qty: number; salePrice: number }[] }) {
  return order.lines.reduce((n, l) => n + l.qty * l.salePrice, 0);
}

export type SalesRankRow = { name: string; revenue: number; orders: number; attainment: number };

export async function fetchSalesLeaderboard(opts: {
  start: Date;
  end: Date;
  when: SalesWhen;
  restrictUserId?: string;
}): Promise<SalesRankRow[]> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["SALES", "ADMIN", "SUPER_ADMIN"] },
      active: true,
      ...(opts.restrictUserId ? { id: opts.restrictUserId } : {}),
    },
    include: { orders: { include: { lines: true } } },
  });

  const rows = users
    .map((u) => {
      const periodOrders = u.orders.filter((o) => {
        const d = new Date(o.createdAt);
        return d >= opts.start && d <= opts.end && o.status !== "DRAFT" && o.status !== "CANCELLED";
      });
      const revenue = periodOrders.reduce((s, o) => s + orderLineRevenue(o), 0);
      const target =
        opts.when === "year" || opts.when === "all"
          ? u.monthlyTarget * (opts.when === "all" ? 12 : new Date().getMonth() + 1)
          : u.monthlyTarget;
      return {
        name: u.name,
        revenue,
        orders: periodOrders.length,
        attainment: target ? revenue / target : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);

  if (rows.some((r) => r.orders > 0)) return rows;

  const groups = await prisma.order.groupBy({
    by: ["salespersonId"],
    where: {
      salespersonId: { not: null },
      status: { notIn: ["DRAFT", "CANCELLED"] },
      createdAt: { gte: opts.start, lte: opts.end },
      ...(opts.restrictUserId ? { salespersonId: opts.restrictUserId } : {}),
    },
    _count: { id: true },
  });
  if (!groups.length) return [];

  const ranked = await Promise.all(
    groups.map(async (g) => {
      const person = await prisma.user.findUnique({ where: { id: g.salespersonId! }, select: { name: true } });
      const orders = await prisma.order.findMany({
        where: {
          salespersonId: g.salespersonId,
          createdAt: { gte: opts.start, lte: opts.end },
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        include: { lines: true },
      });
      const revenue = orders.reduce((s, o) => s + orderLineRevenue(o), 0);
      return { name: person?.name || "Unknown", revenue, orders: g._count.id, attainment: 0 };
    }),
  );
  return ranked.sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);
}

export function salesPerformanceLink(when: SalesWhen): string {
  const q =
    when === "month"
      ? ""
      : when === "lastMonth"
        ? "?when=lastMonth"
        : `?when=${when}`;
  return `[Sales performance](/sales/performance${q})`;
}