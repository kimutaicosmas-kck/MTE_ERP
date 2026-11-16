import { canModule, userModules } from "./access.js";
import { moduleDenied, type AssistantUser } from "./assistant-knowledge.js";

type ErpSnap = {
  user: { name: string; role: string; modules: string[] };
  kpis: Record<string, number>;
  alerts: { title: string }[];
};

type LiveCtx = {
  customers: { name: string; phone: string | null }[];
  parts: { sku: string; name: string; qtyOnHand: number }[];
};

type Article = {
  test: RegExp;
  modules?: string[];
  text: string;
};

const ARTICLES: Article[] = [
  {
    test: /\b(quotation|quote)\b.*\b(confirm|convert|accept)\b|\bconfirm\b.*\bquote\b/,
    modules: ["sales"],
    text: "**Confirm a quotation:** Open the quote in [Sales](/sales?tab=quotes) → **Confirm sales order**. Stock is reserved and finance gets an invoice.",
  },
  {
    test: /\bpartial\b.*\bpay|\bhalf\b.*\bpay|\bpay\b.*\bpartial\b/,
    modules: ["finance"],
    text: "**Partial payment:** [Finance](/finance) → **Record payment** → pick invoice(s) → enter **Amount received**. Invoice stays **Partial** until the rest is paid.",
  },
  {
    test: /\bvoid\b.*\bpay|\bcancel\b.*\breceipt\b/,
    modules: ["finance"],
    text: "**Void a receipt:** Finance → **Void** on the payment. Queued for approval unless Super Admin; balance returns. [Approvals](/approvals).",
  },
  {
    test: /\bmpesa\b|\bstk\b|\bdaraja\b/,
    modules: ["finance"],
    text: "**M-Pesa:** STK from invoice/order. Unallocated payments under [Finance](/finance). Paybill keys in [Settings](/settings?tab=integrations).",
  },
  {
    test: /\bimport\b.*\b(part|product|csv|catalogue)\b|\bupload\b.*\bpart\b/,
    modules: ["inventory"],
    text: "**Import parts:** [Inventory](/inventory) → import CSV. Re-import same SKU updates **cost**; qty rises on **PO receipt** only (or opening qty when zero, Super Admin).",
  },
  {
    test: /\bimport\b.*\bcost\b|\bsame\b.*\bproduct\b|\bre-?import\b/,
    modules: ["inventory"],
    text: "One **import cost** per SKU. 150 then 250 → cost is 250; qty unchanged. Set **selling price** after import. New qty: receive a [PO](/procurement).",
  },
  {
    test: /\bcustomer\b.*\b(create|add|new)\b|\bnew\b.*\bcustomer\b/,
    modules: ["customers"],
    text: "**New customer:** [Customers](/customers) → add record.",
  },
  {
    test: /\bstatement\b|\bbalance\b.*\bcustomer\b|\boutstanding\b.*\bcustomer\b/,
    modules: ["customers", "finance"],
    text: "Balances: [Customers](/customers). Ageing and collections: [Finance](/finance).",
  },
  {
    test: /\bapprov|\bpending\b.*\brequest\b/,
    modules: ["approvals"],
    text: "**Approvals:** [Approvals](/approvals) for voids, discounts, and other sensitive actions.",
  },
  {
    test: /\bleave\b|\bhr\b|\bemployee\b|\bpayroll\b/,
    modules: ["hr"],
    text: "**HR & payroll:** [HR](/hr).",
  },
  {
    test: /\btransfer\b.*\bstock\b|\bmove\b.*\bstock\b/,
    modules: ["inventory"],
    text: "**Move stock:** [Inventory](/inventory) → part → move between warehouses/bins.",
  },
  {
    test: /\breport\b|\bexport\b|\bageing\b|\baging\b/,
    modules: ["reports"],
    text: "**Reports:** [Reports](/reports) — module KPIs and exports.",
  },
  {
    test: /\binvoice\b.*\b(where|find|issue)\b|\bwhere\b.*\binvoice\b/,
    modules: ["finance", "sales"],
    text: "Invoices: [Finance](/finance), created when a sales order is **confirmed**.",
  },
  {
    test: /\brole\b|\bpermission\b|\baccess\b/,
    text: "Menus match your **role and modules**. Admin sets access in [Settings](/settings). I only show data you are allowed to see.",
  },
  {
    test: /\bwarehouse\b|\bbranch\b|\bsite\b/,
    modules: ["inventory"],
    text: "**Warehouses:** [Inventory](/inventory?section=warehouses). Sales picks a site; stock is per warehouse.",
  },
  {
    test: /\baudit\b/,
    modules: ["audit"],
    text: "**Audit:** [Audit](/audit) — change history.",
  },
  {
    test: /\bgrn\b|\bgoods receipt\b/,
    modules: ["procurement"],
    text: "**GRN:** Open PO → **Receive** → stock and vendor bill.",
  },
  {
    test: /\b(return|credit note)\b.*\b(sales|order|customer)\b|\bsales\s+return\b/,
    modules: ["sales", "finance"],
    text: "**Sales return:** Open the order → **Return** → lines and reason. Finance may issue a credit note; approvals may apply. [Approvals](/approvals).",
  },
  {
    test: /\bdiscount\b.*\b(order|quote|line)\b/,
    modules: ["sales", "approvals"],
    text: "Discounts beyond policy may need [Approvals](/approvals). Enter the discount on the order line before confirming.",
  },
  {
    test: /\bvat\b|\b16%\b|\btax invoice\b/,
    modules: ["finance"],
    text: "VAT is applied on confirmed invoices (see invoice PDF). Totals in [Finance](/finance) and [Reports](/reports).",
  },
  {
    test: /\bcommission\b|\bmarkup\b/,
    modules: ["sales", "finance"],
    text: "Commission/markup is calculated when invoices post. See [Sales performance](/sales/performance) and [Reports](/reports).",
  },
  {
    test: /\bcredit\s+limit\b|\bexceed\b.*\blimit\b/,
    modules: ["customers", "finance"],
    text: "Customer **credit limit** is on the customer record. Over-limit orders may need approval before confirming.",
  },
];

function salesOrderSteps(): string {
  return [
    "**Create a sales order**",
    "1. [New sales order](/sales/new).",
    "2. Customer, lines, warehouse.",
    "3. Quotation or confirm.",
    "4. [Finance](/finance) · [Dispatch](/dispatch).",
  ].join("\n");
}

function quoteSteps(): string {
  return [
    "**Create a quotation**",
    "1. [New sales order](/sales/new) → quote first.",
    "2. Share PDF.",
    "3. **Confirm sales order** when accepted.",
  ].join("\n");
}

function workflowish(message: string): boolean {
  const q = message.toLowerCase().trim();
  return /\b(how\s+(to|do)|step|workflow|guide)\b/.test(q);
}

export function mteCapabilitiesReply(user: AssistantUser): string {
  const mods = userModules(user);
  const lines = [
    `**MTE assistant** — answers from **live ERP data** in your modules only.`,
    "",
    "**Examples:**",
  ];
  const examples: [string, string][] = [
    ["sales", "Best salesperson this year · How to create a quote"],
    ["inventory", "Which products are out of stock · Re-import same SKU"],
    ["finance", "Record partial payment · Void receipt"],
    ["procurement", "How to create a PO"],
    ["dispatch", "How to dispatch"],
    ["approvals", "What needs attention"],
  ];
  for (const [mod, text] of examples) {
    if (mods.includes(mod)) lines.push(`• ${text}`);
  }
  lines.push("", "Tip: use a **customer name**, **order #**, or **SKU** for a direct lookup.");
  return lines.join("\n");
}

export async function replyMteKnowledge(
  user: AssistantUser,
  message: string,
  _snap: ErpSnap,
  live: LiveCtx,
): Promise<string | null> {
  const q = message.toLowerCase().trim();

  if (/\b(what can you|what do you do|help menu|capabilities)\b/.test(q)) {
    return mteCapabilitiesReply(user);
  }

  if (workflowish(message)) {
    if (/\b(quotation|quote)\b/.test(q) && !/\bimport\b/.test(q)) {
      const deny = moduleDenied(user, "sales");
      if (deny) return deny;
      return quoteSteps();
    }
    if (/\b(sales order|new order)\b/.test(q) || (/\bhow\b/.test(q) && /\border\b/.test(q) && !/\bpo\b/.test(q))) {
      const deny = moduleDenied(user, "sales");
      if (deny) return deny;
      return salesOrderSteps();
    }
  }

  for (const art of ARTICLES) {
    if (!art.test.test(q)) continue;
    if (art.modules?.length && !art.modules.some((m) => canModule(user, m))) {
      return moduleDenied(user, art.modules.find((m) => !canModule(user, m))!);
    }
    return art.text;
  }

  if (live.customers.length === 1 && /\b(customer|client|account)\b/.test(q)) {
    const c = live.customers[0];
    return `**${c.name}**${c.phone ? ` · ${c.phone}` : ""} — [Open](/customers?q=${encodeURIComponent(c.name)}).`;
  }
  if (live.parts.length === 1 && /\b(part|sku|product)\b/.test(q)) {
    const p = live.parts[0];
    return `**${p.sku}** ${p.name} — **${p.qtyOnHand}** on hand — [Inventory](/inventory).`;
  }

  return null;
}