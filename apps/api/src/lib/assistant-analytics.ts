import { prisma } from "./prisma.js";
import { canModule } from "./access.js";
import { moduleDenied, type AssistantUser } from "./assistant-knowledge.js";
import {
  wantsOpenPurchases,
  wantsReceivables,
  wantsRevenueTotal,
  wantsTopCustomer,
  wantsTopProduct,
} from "./assistant-intent.js";
import { orderLineRevenue, parseSalesWhenFromMessage, salesPeriodRange, salesPerformanceLink } from "./sales-report.js";
import { ownOrderWhere } from "./roles.js";

async function replyRevenueTotal(user: AssistantUser, message: string): Promise<string | null> {
  const allowed = user.role === "SALES" || canModule(user, "reports") || canModule(user, "sales");
  if (!allowed) return moduleDenied(user, "reports", "Sales totals");

  const when = parseSalesWhenFromMessage(message);
  const { start, end, label } = salesPeriodRange(when);
  const own = ownOrderWhere(user);

  const orders = await prisma.order.findMany({
    where: {
      ...own,
      status: { notIn: ["DRAFT", "CANCELLED"] },
      createdAt: { gte: start, lte: end },
    },
    include: { lines: true },
  });
  const revenue = orders.reduce((s, o) => s + orderLineRevenue(o), 0);
  const link = salesPerformanceLink(when);
  if (!orders.length) {
    return `No confirmed sales **${label}** yet. ${link}.`;
  }
  return `**Total sales ${label}:** KES ${Math.round(revenue).toLocaleString("en-KE")} across **${orders.length}** order(s). ${link}.`;
}

async function replyTopCustomer(user: AssistantUser, message: string): Promise<string | null> {
  const deny = moduleDenied(user, "customers") || moduleDenied(user, "reports");
  if (deny) return deny;

  const when = parseSalesWhenFromMessage(message);
  const { start, end, label } = salesPeriodRange(when);
  const own = user.role === "SALES" ? { salespersonId: user.id } : {};

  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      orders: {
        where: {
          ...own,
          status: { notIn: ["DRAFT", "CANCELLED"] },
          createdAt: { gte: start, lte: end },
        },
        include: { lines: true },
      },
    },
  });

  const ranked = customers
    .map((c) => ({
      name: c.name,
      orders: c.orders.length,
      revenue: c.orders.reduce((s, o) => s + orderLineRevenue(o), 0),
    }))
    .filter((c) => c.orders > 0)
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);

  if (!ranked.length) {
    return `No customer sales **${label}** yet. [Customers](/customers) · [Reports](/reports).`;
  }

  const top = ranked[0];
  const lines = [
    `**Top customer ${label}:** **${top.name}** — KES ${Math.round(top.revenue).toLocaleString("en-KE")} (${top.orders} orders).`,
  ];
  for (const r of ranked.slice(1, 4)) {
    lines.push(`• ${r.name} — KES ${Math.round(r.revenue).toLocaleString("en-KE")} (${r.orders})`);
  }
  lines.push("[Customer report](/reports)");
  return lines.join("\n");
}

async function replyReceivables(user: AssistantUser): Promise<string | null> {
  const deny = moduleDenied(user, "finance");
  if (deny) return deny;

  const invoices = await prisma.invoice.findMany({
    include: {
      customer: true,
      order: { include: { lines: true, payments: true } },
    },
  });

  const byCustomer = new Map<string, { name: string; balance: number }>();
  let total = 0;

  for (const inv of invoices) {
    const net = inv.order.lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
    const gross = Math.round((net + net * inv.vatRate) * 100) / 100;
    const paid = inv.order.payments.reduce((s, p) => s + p.amount, 0);
    const balance = Math.round((gross - paid) * 100) / 100;
    if (balance <= 0.01) continue;
    total += balance;
    const cur = byCustomer.get(inv.customerId) || { name: inv.customer.name, balance: 0 };
    cur.balance += balance;
    byCustomer.set(inv.customerId, cur);
  }

  const debtors = [...byCustomer.values()].sort((a, b) => b.balance - a.balance);
  if (!debtors.length) {
    return "No open customer balances right now. [Finance](/finance).";
  }

  const top = debtors[0];
  const lines = [
    `**Outstanding receivables:** KES ${Math.round(total).toLocaleString("en-KE")} across **${debtors.length}** customer(s).`,
    `**Largest balance:** **${top.name}** — KES ${Math.round(top.balance).toLocaleString("en-KE")}.`,
  ];
  for (const d of debtors.slice(1, 4)) {
    lines.push(`• ${d.name} — KES ${Math.round(d.balance).toLocaleString("en-KE")}`);
  }
  lines.push("[Finance](/finance) · [Collections report](/reports)");
  return lines.join("\n");
}

async function replyTopProducts(user: AssistantUser): Promise<string | null> {
  const deny = moduleDenied(user, "inventory") || moduleDenied(user, "reports");
  if (deny) return deny;

  const parts = await prisma.part.findMany({ include: { lines: true } });
  const ranked = parts
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      sold: p.lines.reduce((s, l) => s + l.qty, 0),
      revenue: p.lines.reduce((s, l) => s + l.qty * l.salePrice, 0),
    }))
    .filter((p) => p.sold > 0)
    .sort((a, b) => b.revenue - a.revenue || b.sold - a.sold);

  if (!ranked.length) {
    return "No sales line history yet. [Inventory](/inventory) · [Reports](/reports).";
  }

  const top = ranked[0];
  const lines = [
    `**Best seller (all time):** **${top.sku}** ${top.name} — KES ${Math.round(top.revenue).toLocaleString("en-KE")} (${top.sold} units).`,
  ];
  for (const p of ranked.slice(1, 5)) {
    lines.push(`• **${p.sku}** ${p.name} — ${p.sold} units`);
  }
  lines.push("[Inventory analytics](/reports)");
  return lines.join("\n");
}

async function replyOpenPOs(user: AssistantUser): Promise<string | null> {
  const deny = moduleDenied(user, "procurement");
  if (deny) return deny;

  const open = await prisma.purchaseOrder.count({
    where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } },
  });
  if (!open) return "No open purchase orders. [Procurement](/procurement).";
  return `**${open}** open purchase order(s). [Procurement](/procurement) · [Reports](/reports).`;
}

export async function replySystemAnalytics(user: AssistantUser, message: string): Promise<string | null> {
  const q = message.toLowerCase().trim();

  if (wantsRevenueTotal(q) && (canModule(user, "reports") || canModule(user, "sales") || user.role === "SALES")) {
    return replyRevenueTotal(user, message);
  }
  if (wantsTopCustomer(q)) return replyTopCustomer(user, message);
  if (wantsReceivables(q)) return replyReceivables(user);
  if (wantsTopProduct(q)) return replyTopProducts(user);
  if (wantsOpenPurchases(q)) return replyOpenPOs(user);

  return null;
}