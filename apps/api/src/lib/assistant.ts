import { prisma } from "./prisma.js";

import { ensureCompany } from "./sequence.js";

import { fetchDashboardAlerts } from "./dashboardAlerts.js";

import { ownOrderWhere } from "./roles.js";

import { canModule, userModules } from "./access.js";

import {
  filterAlertsForUser,
  isWorkflowQuestion,
  moduleDenied,
  replySalesPerformance,
  replyStockDetail,
  wantsSalesPerformance,
  wantsStockDetail,
  workflowAssistantReply,
} from "./assistant-knowledge.js";

import { replySystemAnalytics } from "./assistant-analytics.js";
import { mteCapabilitiesReply, replyMteKnowledge } from "./assistant-mte.js";

import {
  customerSearchTerms,
  listAllCustomers,
  matchSalespersonHint,
  searchCustomers,
  wantsCustomerList,
} from "./customer-search.js";



export type ErpSnapshot = {

  at: string;

  user: { name: string; role: string; modules: string[] };

  kpis: {

    pendingApprovals: number;

    dispatchQueue: number;

    lowStock: number;

    openPOs: number;

    unpaidInvoices: number;

    myOrdersToday: number;

    myOpenQuotes: number;

  };

  alerts: { title: string; level: string }[];

};



type LiveSearch = {

  customers: { id: string; customerNumber: string | null; name: string; phone: string | null }[];

  parts: { id: string; sku: string; name: string; qtyOnHand: number }[];

  orders: { id: string; number: string; status: string; customer: string }[];

  salespersonHint?: string | null;

  listMode?: boolean;

};



const STOP = new Set([

  "the", "and", "for", "what", "how", "where", "when", "who", "why", "can", "you", "are", "was", "were",

  "show", "find", "tell", "about", "does", "have", "with", "from", "this", "that", "mte", "erp", "please",

  "help", "any", "all", "our", "my", "me", "i", "a", "an", "to", "in", "on", "at", "is", "it", "of",

  "sales", "order", "orders", "create", "new", "quote", "quotation", "invoice", "salesperson", "make", "start",

  "open", "confirm", "convert", "workflow", "steps", "guide", "walk", "through", "do", "field", "shop",

]);



function isPersonLookup(message: string) {

  const q = message.toLowerCase();

  return (

    /\b(who\s+is|find\s+(?:staff|user|salesperson)|salesperson|sales\s+rep|sales\s+user)\b/.test(q) ||

    (/\b(customer|client|account)\b/.test(q) && (q.includes("find") || q.includes("search") || q.includes("who") || q.includes("which")))

  );

}



function salesOrderWorkflowReply(): string {

  return [

    "**Create a sales order**",

    "1. Open [New sales order](/sales/new).",

    "2. Select **customer**, how they ordered (shop / phone / field), and delivery method.",

    "3. Add products and quantities. Use **unit price** if you charge above catalog (markup commission is stored on the invoice).",

    "4. Save as **quotation** to send first, or save as a confirmed order when stock is available.",

    "5. After confirm: invoice in [Finance](/finance); picking in [Dispatch](/dispatch).",

  ].join("\n");

}



function isGreeting(message: string): boolean {

  const q = message.toLowerCase().trim();

  if (/^(hi|hello|hey|howdy|greetings)\b/.test(q)) return true;

  if (/^good\s+(morning|afternoon|evening)\b/.test(q)) return true;

  if (/^(morning|afternoon|evening)\b/.test(q)) return true;

  return false;

}



function greetingReply(snap: ErpSnapshot, user: AssistantUser): string {

  const first = snap.user.name.split(" ")[0];

  const hour = new Date().getHours();

  const lead = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const k = snap.kpis;

  const bits: string[] = [];

  if (canModule(user, "approvals") && k.pendingApprovals) bits.push(`${k.pendingApprovals} approval(s) waiting`);

  if (canModule(user, "dispatch") && k.dispatchQueue) bits.push(`${k.dispatchQueue} in dispatch`);

  if (canModule(user, "finance") && k.unpaidInvoices) bits.push(`${k.unpaidInvoices} open invoice(s)`);

  if (canModule(user, "inventory") && k.lowStock) bits.push(`${k.lowStock} low-stock SKU(s)`);

  const tail = bits.length ? ` Today: ${bits.join(" · ")}.` : " Queues look clear.";

  return `${lead}, ${first}.${tail} Ask about a customer, order, SKU, or the next step in MTE.`;

}



export async function buildErpSnapshot(user: { id: string; name: string; role: string; modules?: string | null }): Promise<ErpSnapshot> {

  const start = new Date();

  start.setHours(0, 0, 0, 0);

  const own = ownOrderWhere(user);

  const [pendingApprovals, dispatchQueue, parts, openPOs, unpaidInvoices, alertsRaw, myOrdersToday, myOpenQuotes] = await Promise.all([

    canModule(user, "approvals") ? prisma.approval.count({ where: { status: "PENDING" } }) : 0,

    canModule(user, "dispatch")
      ? prisma.order.count({ where: { status: { in: ["PICKING", "PICKED", "DISPATCHED", "CONFIRMED"] } } })
      : 0,

    canModule(user, "inventory") ? prisma.part.findMany({ select: { qtyOnHand: true, reorderLevel: true } }) : [],

    canModule(user, "procurement")
      ? prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } })
      : 0,

    canModule(user, "finance") ? prisma.invoice.count() : 0,

    fetchDashboardAlerts(),

    canModule(user, "sales")
      ? prisma.order.count({ where: { ...own, createdAt: { gte: start }, status: { not: "CANCELLED" } } })
      : 0,

    canModule(user, "sales") ? prisma.order.count({ where: { ...own, status: "DRAFT" } }) : 0,

  ]);

  const alerts = filterAlertsForUser(user, alertsRaw);

  const lowStock = parts.filter((p) => p.qtyOnHand <= p.reorderLevel).length;

  return {

    at: new Date().toISOString(),

    user: { name: user.name, role: user.role, modules: userModules(user) },

    kpis: { pendingApprovals, dispatchQueue, lowStock, openPOs, unpaidInvoices, myOrdersToday, myOpenQuotes },

    alerts: alerts.slice(0, 8).map((a) => ({ title: a.label, level: a.level })),

  };

}



function searchTerms(message: string) {

  const raw = message.toLowerCase().split(/[^a-z0-9/-]+/).filter(Boolean);

  const terms = [...new Set(raw.filter((t) => t.length >= 2 && !STOP.has(t)))];

  return terms.slice(0, 5);

}



export async function searchLiveContext(user: { id: string; role: string; modules?: string | null }, message: string): Promise<LiveSearch> {

  const empty: LiveSearch = { customers: [], parts: [], orders: [] };

  if (wantsSalesPerformance(message)) return empty;

  if (wantsStockDetail(message)) return empty;

  if (isWorkflowQuestion(message) && !wantsCustomerList(message) && !isPersonLookup(message)) return empty;



  const listMode = wantsCustomerList(message);

  const custTerms = customerSearchTerms(message);

  const terms = searchTerms(message);

  if (!listMode && !terms.length && !custTerms.length) return empty;



  const own = ownOrderWhere(user);

  const orStrings = (fields: string[]) =>

    terms.flatMap((t) => fields.map((field) => ({ [field]: { contains: t } })));



  const salesperson = await matchSalespersonHint(custTerms.length ? custTerms : terms);

  const customers =
    canModule(user, "customers") && (listMode || custTerms.length)
      ? listMode
        ? await listAllCustomers(50)
        : await searchCustomers(custTerms.length ? custTerms : terms, 8)
      : [];



  const [parts, orders] = await Promise.all([

    terms.length && canModule(user, "inventory")
      ? prisma.part.findMany({

          where: { OR: orStrings(["name", "sku", "oemNumber"]) },

          take: 6,

          select: { id: true, sku: true, name: true, qtyOnHand: true },

          orderBy: { name: "asc" },

        })
      : Promise.resolve([]),

    terms.length && canModule(user, "sales")
      ? prisma.order.findMany({

          where: {

            AND: [

              own,

              {

                OR: [

                  ...orStrings(["number"]),

                  { customer: { OR: orStrings(["name", "customerNumber"]) } },

                ],

              },

            ],

          },

          take: 6,

          select: { id: true, number: true, status: true, customer: { select: { name: true } } },

          orderBy: { createdAt: "desc" },

        })
      : Promise.resolve([]),

  ]);



  return {

    customers,

    parts,

    orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, customer: o.customer.name })),

    salespersonHint: salesperson ? `${salesperson.name} is a **sales user**, not a customer account. Filter orders by salesperson in [Sales](/sales).` : null,

    listMode,

  };

}



function formatLiveSearch(live: LiveSearch): string | null {

  const lines: string[] = [];

  if (live.salespersonHint) {

    lines.push(live.salespersonHint);

  }

  if (live.customers.length) {

    lines.push(live.listMode ? "**All customers** (first 50)" : "**Customers**");

    for (const c of live.customers) {

      const no = c.customerNumber ? `${c.customerNumber} · ` : "";

      const q = encodeURIComponent(c.name);

      lines.push(`• **${no}${c.name}**${c.phone ? ` · ${c.phone}` : ""} — [Open](/customers?q=${q})`);

    }

  }

  if (live.parts.length) {

    lines.push("**Products**");

    for (const p of live.parts) {

      lines.push(`• **${p.sku}** ${p.name} · ${p.qtyOnHand} in stock — [Inventory](/inventory)`);

    }

  }

  if (live.orders.length) {

    lines.push("**Orders**");

    for (const o of live.orders) {

      lines.push(`• **${o.number}** · ${o.customer} · ${o.status} — [Open order](/sales/${o.id})`);

    }

  }

  return lines.length ? lines.join("\n") : null;

}



type AssistantUser = { id: string; name: string; role: string; modules?: string | null };

function ruleBasedReply(message: string, snap: ErpSnapshot, live: LiveSearch, user: AssistantUser): string | null {

  const q = message.toLowerCase().trim();

  if (!q) return null;

  const gate =
    (/\b(invoice|receivable|payment|mpesa|collect|void)\b/.test(q) ? moduleDenied(user, "finance") : null) ||
    (/\b(payroll|leave|employee|salary)\b/.test(q) ? moduleDenied(user, "hr") : null) ||
    (/\b(stock|inventory|reorder|sku|part)\b/.test(q) && !/\b(partial|part payment)\b/.test(q) ? moduleDenied(user, "inventory") : null) ||
    (/\b(dispatch|ship|pick|warehouse)\b/.test(q) ? moduleDenied(user, "dispatch") : null) ||
    (/\b(approv)\b/.test(q) ? moduleDenied(user, "approvals") : null) ||
    (/\b(po|purchase|procurement|vendor bill|grn)\b/.test(q) ? moduleDenied(user, "procurement") : null);

  if (gate) return gate;



  if (isGreeting(q)) return greetingReply(snap, user);

  if (/^(thanks|thank you|cheers|asante)\b/.test(q)) {

    return `You're welcome, ${snap.user.name.split(" ")[0]}. Ask anytime.`;

  }

  if (
    q.includes("sales order") ||
    q.includes("create order") ||
    q.includes("new order") ||
    (q.includes("order") && (q.includes("create") || q.includes("make") || q.includes("how"))) ||
    (q.includes("field") && q.includes("order"))
  ) {

    return salesOrderWorkflowReply();

  }

  if ((q.includes("quotation") || q.includes("quote")) && (q.includes("create") || q.includes("how") || q.includes("new"))) {

    return [

      "**Create a quotation**",

      "1. [New sales order](/sales/new) → tick **Save as quote first**.",

      "2. Add customer and lines, then save.",

      "3. Share PDF from the order. When the customer accepts, open the quote and **Confirm sales order**.",

    ].join("\n");

  }



  const fromSearch = formatLiveSearch(live);

  if (
    fromSearch &&
    (live.listMode ||
      isPersonLookup(q) ||
      q.includes("find") ||
      q.includes("search") ||
      ((q.includes("who") || q.includes("which")) && q.includes("customer")) ||
      (live.customers.length && (q.includes("customer") || q.includes("repayment") || q.includes("balance"))) ||
      live.orders.length === 1)
  ) {

    return fromSearch;

  }

  if (q.includes("approv")) {

    return snap.kpis.pendingApprovals

      ? `**${snap.kpis.pendingApprovals}** approval(s) waiting. [Approvals](/approvals).`

      : "No pending approvals.";

  }

  if (q.includes("dispatch") || q.includes("warehouse") || q.includes("ship")) {

    return `**${snap.kpis.dispatchQueue}** order(s) in dispatch. [Dispatch](/dispatch).`;

  }

  if (!wantsStockDetail(message) && (q.includes("stock") || q.includes("inventory") || q.includes("reorder"))) {

    return snap.kpis.lowStock

      ? `**${snap.kpis.lowStock}** SKU(s) at/below reorder. Ask **which products are out of stock** for names. [Inventory](/inventory?section=reorder).`

      : "Stock levels look healthy. [Inventory](/inventory).";

  }

  if (!isWorkflowQuestion(message) && /\b(po|purchase|procurement)\b/.test(q)) {

    return `**${snap.kpis.openPOs}** open PO(s). Ask **how to create a PO** for steps. [Procurement](/procurement).`;

  }

  if ((q.includes("import") || q.includes("re-import") || q.includes("reimport")) && (q.includes("cost") || q.includes("price") || q.includes("same product") || q.includes("product"))) {

    return [

      "A product keeps **one import cost**.",

      "Import it at 150, then import the same part again at 250, and the cost changes from 150 to 250. Quantity already on the shelf does not increase.",

      "Set the selling price after the goods land, and confirm it again after the later import.",

      "Extra pieces are added when you receive a [purchase order](/procurement).",

    ].join("\n");

  }

  if (q.includes("void") && (q.includes("payment") || q.includes("receipt"))) {

    return "Void reverses that receipt and puts the balance back on the invoice. Finance queues it for approval. A Super Admin can approve it immediately in [Approvals](/approvals).";

  }

  if ((q.includes("part") || q.includes("partial") || q.includes("half")) && q.includes("pay")) {

    return "Open [Finance](/finance), choose Record payment, select the invoices, and enter the amount received. The remainder stays open on the invoice.";

  }

  if (q.includes("invoice") || q.includes("receivable") || q.includes("collect") || q.includes("payment") || q.includes("mpesa")) {

    return `Invoices and collections are in [Finance](/finance). ${snap.kpis.unpaidInvoices} invoice(s) are still open.`;

  }

  if (q.includes("payroll") || q.includes("leave") || q.includes("hr") || q.includes("employee")) {

    return "HR & payroll: [HR](/hr).";

  }

  if (q.includes("report") || q.includes("analytics") || q.includes("ageing") || q.includes("aging")) {

    return "Reports: [Reports & Analytics](/reports).";

  }

  if (q.includes("setting") || q.includes("integrat") || q.includes("openai") || q.includes("daraja") || q.includes("mpesa setup")) {

    return "Company & integrations: [Settings](/settings).";

  }

  if (/\b(attention|waiting|overview|summary|status|how are we)\b/.test(q)) {

    const k = snap.kpis;

    const lines: string[] = [];

    if (canModule(user, "approvals")) lines.push(`**${k.pendingApprovals}** approval(s) waiting — [Approvals](/approvals)`);

    if (canModule(user, "dispatch")) lines.push(`**${k.dispatchQueue}** in dispatch — [Dispatch](/dispatch)`);

    if (canModule(user, "inventory")) lines.push(`**${k.lowStock}** low-stock item(s) — [Inventory](/inventory?section=reorder)`);

    if (canModule(user, "finance")) lines.push(`**${k.unpaidInvoices}** unpaid invoice(s) — [Finance](/finance)`);

    if (canModule(user, "sales")) lines.push(`**${k.myOpenQuotes}** open quote(s) · **${k.myOrdersToday}** order(s) today — [Sales](/sales)`);

    if (snap.alerts.length) lines.push(...snap.alerts.map((a) => `• ${a.title}`));

    return lines.length ? lines.join("\n") : "Nothing urgent in the modules you can access.";

  }

  if (q.includes("alert") || q.includes("risk")) {

    if (!snap.alerts.length) return "No critical dashboard alerts right now.";

    return "**Alerts**\n" + snap.alerts.map((a) => `• ${a.title}`).join("\n");

  }



  const nav: [RegExp, string][] = [

    [/sales/, "[Sales](/sales)"],

    [/dashboard|home/, "[Dashboard](/)"],

    [/finance/, "[Finance](/finance)"],

    [/inventory|stock|part/, "[Inventory](/inventory)"],

    [/customer/, "[Customers](/customers)"],

    [/vendor|supplier/, "[Vendors](/vendors)"],

    [/dispatch/, "[Dispatch](/dispatch)"],

  ];

  for (const [re, link] of nav) {

    if (re.test(q) && (q.includes("go") || q.includes("open") || q.includes("show") || q.includes("where"))) {

      return `Open ${link}.`;

    }

  }



  if (fromSearch) return fromSearch;

  return null;

}



function offlineFallback(snap: ErpSnapshot, user: AssistantUser): string {

  const first = snap.user.name.split(" ")[0];

  return [

    `I didn’t match that yet, ${first}.`,

    mteCapabilitiesReply(user),

  ].join("\n\n");

}



export async function assistantChat(user: { id: string; name: string; role: string; modules?: string | null }, message: string) {

  const { setting } = await ensureCompany();

  if (setting.assistantEnabled === false) {

    return { reply: "The MTE assistant is disabled in company settings.", mode: "disabled" as const };

  }



  const trimmed = message.trim().slice(0, 4000);

  if (!trimmed) return { reply: "Type your question below.", mode: "local" as const };



  const [snap, live] = await Promise.all([buildErpSnapshot(user), searchLiveContext(user, trimmed)]);



  await prisma.assistantTurn.create({ data: { userId: user.id, role: "user", content: trimmed } });



  let reply: string | null = null;

  let mode: "local" = "local";



  const workflow = workflowAssistantReply(user, trimmed);

  if (workflow) {

    reply = workflow;

    mode = "local";

  }

  if (!reply) {

    const stock = await replyStockDetail(user, trimmed);

    if (stock) {

      reply = stock;

      mode = "local";

    }

  }

  if (!reply) {

    const performance = await replySalesPerformance(user, trimmed);

    if (performance) {

      reply = performance;

      mode = "local";

    }

  }

  if (!reply) {

    const analytics = await replySystemAnalytics(user, trimmed);

    if (analytics) {

      reply = analytics;

      mode = "local";

    }

  }

  if (!reply) {

    const ruled = ruleBasedReply(trimmed, snap, live, user);

    if (ruled) {

      reply = ruled;

      mode = "local";

    }

  }

  if (!reply) {

    const mte = await replyMteKnowledge(user, trimmed, snap, live);

    if (mte) {

      reply = mte;

      mode = "local";

    }

  }

  if (!reply) {

    reply = offlineFallback(snap, user);

  }



  await prisma.assistantTurn.create({ data: { userId: user.id, role: "assistant", content: reply } });

  return { reply, mode, snapshot: snap };

}



/** @deprecated UI no longer uses preset chips */

export async function assistantSuggestions(_user?: { role: string }) {

  return [];

}


