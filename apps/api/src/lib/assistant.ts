import { prisma } from "./prisma.js";

import { ensureCompany } from "./sequence.js";

import { fetchDashboardAlerts } from "./dashboardAlerts.js";

import { ownOrderWhere } from "./roles.js";

import { MODULES, userModules } from "./access.js";

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



const ERP_ROUTES = [

  "Dashboard /",

  "Sales /sales · New order /sales/new · Performance /sales/performance",

  "Dispatch /dispatch",

  "Inventory /inventory · Warehouses /inventory?section=warehouses",

  "Procurement /procurement · New PO /procurement/new",

  "Customers /customers · Vendors /vendors",

  "Finance /finance · Approvals /approvals · Audit /audit",

  "HR /hr · Reports /reports · Settings /settings",

];



const STOP = new Set([

  "the", "and", "for", "what", "how", "where", "when", "who", "why", "can", "you", "are", "was", "were",

  "show", "find", "tell", "about", "does", "have", "with", "from", "this", "that", "mte", "erp", "please",

  "help", "any", "all", "our", "my", "me", "i", "a", "an", "to", "in", "on", "at", "is", "it", "of",

  "sales", "order", "orders", "create", "new", "quote", "quotation", "invoice", "salesperson", "make", "start",

  "open", "confirm", "convert", "workflow", "steps", "guide", "walk", "through", "do", "field", "shop",

]);



function isWorkflowQuestion(message: string) {

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



function shouldUseGuidedReply(message: string): boolean {

  if (isWorkflowQuestion(message)) return true;

  const q = message.toLowerCase().trim();

  if (/^(hi|hello|hey)\b/.test(q)) return true;

  if (/\b(where|which\s+screen|go\s+to)\b/.test(q)) return true;

  return false;

}



export async function buildErpSnapshot(user: { id: string; name: string; role: string; modules?: string | null }): Promise<ErpSnapshot> {

  const start = new Date();

  start.setHours(0, 0, 0, 0);

  const own = ownOrderWhere(user);

  const [pendingApprovals, dispatchQueue, parts, openPOs, unpaidInvoices, alerts, myOrdersToday, myOpenQuotes] = await Promise.all([

    prisma.approval.count({ where: { status: "PENDING" } }),

    prisma.order.count({

      where: { status: { in: ["PICKING", "PICKED", "DISPATCHED", "CONFIRMED"] } },

    }),

    prisma.part.findMany({ select: { qtyOnHand: true, reorderLevel: true } }),

    prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } }),

    prisma.invoice.count(),

    fetchDashboardAlerts(),

    prisma.order.count({ where: { ...own, createdAt: { gte: start }, status: { not: "CANCELLED" } } }),

    prisma.order.count({ where: { ...own, status: "DRAFT" } }),

  ]);

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



export async function searchLiveContext(user: { id: string; role: string }, message: string): Promise<LiveSearch> {

  const empty: LiveSearch = { customers: [], parts: [], orders: [] };

  if (isWorkflowQuestion(message) && !wantsCustomerList(message) && !isPersonLookup(message)) return empty;



  const listMode = wantsCustomerList(message);

  const custTerms = customerSearchTerms(message);

  const terms = searchTerms(message);

  if (!listMode && !terms.length && !custTerms.length) return empty;



  const own = ownOrderWhere(user);

  const orStrings = (fields: string[]) =>

    terms.flatMap((t) => fields.map((field) => ({ [field]: { contains: t } })));



  const salesperson = await matchSalespersonHint(custTerms.length ? custTerms : terms);

  const customers = listMode
    ? await listAllCustomers(50)
    : await searchCustomers(custTerms.length ? custTerms : terms, 8);



  const [parts, orders] = await Promise.all([

    terms.length
      ? prisma.part.findMany({

          where: { OR: orStrings(["name", "sku", "oemNumber"]) },

          take: 6,

          select: { id: true, sku: true, name: true, qtyOnHand: true },

          orderBy: { name: "asc" },

        })
      : Promise.resolve([]),

    terms.length
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



function ruleBasedReply(message: string, snap: ErpSnapshot, live: LiveSearch): string | null {

  const q = message.toLowerCase().trim();

  if (!q) return null;



  if (/^(hi|hello|hey)\b/.test(q)) {

    return `Hello ${snap.user.name.split(" ")[0]}. Ask me anything about MTE ERP — workflows, your numbers, or where to go in the app.`;

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

  if (q.includes("stock") || q.includes("inventory") || q.includes("reorder")) {

    return snap.kpis.lowStock

      ? `**${snap.kpis.lowStock}** SKU(s) at/below reorder. [Inventory](/inventory?section=reorder).`

      : "Stock levels look healthy. [Inventory](/inventory).";

  }

  if (q.includes("po") || q.includes("purchase") || q.includes("procurement")) {

    return `**${snap.kpis.openPOs}** open PO(s). [Procurement](/procurement).`;

  }

  if (q.includes("invoice") || q.includes("receivable") || q.includes("collect") || q.includes("payment") || q.includes("mpesa")) {

    return `Invoices & collections: [Finance](/finance).`;

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



async function openAiReply(

  apiKey: string,

  model: string,

  snap: ErpSnapshot,

  live: LiveSearch,

  message: string,

  history: { role: string; content: string }[],

) {

  const moduleLabels = MODULES.filter((m) => snap.user.modules.includes(m.id)).map((m) => m.label).join(", ");

  const system = [

    "You are the MTE ERP assistant for James Mte Kenya Ltd — earth-moving parts resale (shop, field sales, dispatch, finance, HR).",

    "Answer ANY user question: how to complete a task, where a screen is, what a metric means, process/policy, troubleshooting, or interpreting their live data.",

    "Use markdown. Link to in-app routes as [Label](/path). Never invent counts — use snapshot and searchResults JSON only.",

    "Currency: KES. Be concise but complete; use steps when explaining workflows (quote → order → pick → dispatch → invoice → payment).",

    "If the user lacks access to a module, say so and suggest their admin.",

    `User modules: ${moduleLabels || snap.user.role}`,

    `App routes:\n${ERP_ROUTES.join("\n")}`,

    `Live snapshot: ${JSON.stringify(snap)}`,

    `Search results (may be empty): ${JSON.stringify(live)}`,

    "If the user asks how to do something, explain the workflow. Ignore salespersonHint unless they asked about a person by name.",

  ].join("\n\n");



  const res = await fetch("https://api.openai.com/v1/chat/completions", {

    method: "POST",

    headers: {

      Authorization: `Bearer ${apiKey}`,

      "Content-Type": "application/json",

    },

    body: JSON.stringify({

      model,

      temperature: 0.45,

      max_tokens: 1200,

      messages: [

        { role: "system", content: system },

        ...history.slice(-14).map((h) => ({ role: h.role, content: h.content })),

        { role: "user", content: message },

      ],

    }),

  });

  if (!res.ok) {

    const err = await res.text();

    throw new Error(err.slice(0, 200) || "OpenAI request failed");

  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };

  return String(data.choices?.[0]?.message?.content || "").trim();

}



function offlineFallback(message: string, snap: ErpSnapshot, live: LiveSearch, hasOpenAi: boolean): string {

  const rule = ruleBasedReply(message, snap, live);

  if (rule) return rule;

  if (hasOpenAi) {

    return "I couldn’t reach the AI service just now. Try again in a moment, or name a customer, order number, or SKU so I can look it up.";

  }

  return "Add an **OpenAI API key** under [Settings → Integrations](/settings?tab=integrations) for full natural-language answers. You can still ask about dispatch, stock, approvals, or include a customer or SKU in your message.";

}



export async function assistantChat(user: { id: string; name: string; role: string; modules?: string | null }, message: string) {

  const { setting } = await ensureCompany();

  if (setting.assistantEnabled === false) {

    return { reply: "The AI assistant is disabled in company settings.", mode: "disabled" as const };

  }



  const trimmed = message.trim().slice(0, 4000);

  if (!trimmed) return { reply: "Type your question below.", mode: "local" as const };



  const [snap, live] = await Promise.all([buildErpSnapshot(user), searchLiveContext(user, trimmed)]);



  await prisma.assistantTurn.create({ data: { userId: user.id, role: "user", content: trimmed } });



  const apiKey = setting.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

  const model = setting.openaiModel || process.env.OPENAI_MODEL || "gpt-4o-mini";



  let reply: string | null = null;

  let mode: "local" | "openai" = "local";



  const guided = ruleBasedReply(trimmed, snap, live);

  if (guided && shouldUseGuidedReply(trimmed)) {

    reply = guided;

    mode = "local";

  }



  if (!reply && apiKey) {

    try {

      const history = await prisma.assistantTurn.findMany({

        where: { userId: user.id },

        orderBy: { createdAt: "desc" },

        take: 16,

      });

      const ai = await openAiReply(

        apiKey,

        model,

        snap,

        live,

        trimmed,

        history.reverse().map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),

      );

      if (ai) {

        reply = ai;

        mode = "openai";

      }

    } catch {

      /* fall back */

    }

  }



  if (!reply) {

    reply = offlineFallback(trimmed, snap, live, Boolean(apiKey));

  }



  await prisma.assistantTurn.create({ data: { userId: user.id, role: "assistant", content: reply } });

  return { reply, mode, snapshot: snap };

}



/** @deprecated UI no longer uses preset chips */

export async function assistantSuggestions(_user?: { role: string }) {

  return [];

}


