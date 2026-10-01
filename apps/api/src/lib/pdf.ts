import PDFDocument from "pdfkit";

const BLACK = "#111111";
const GRAY = "#555555";
const RULE = "#222222";
const NAVY = "#0B3A4A";
const RED = "#C0392B";
const LEFT = 40;
const RIGHT = 555;
const WIDTH = RIGHT - LEFT;

export type OrderPdfKind = "order" | "sale" | "delivery";

export type OrderPdfInput = {
  kind: OrderPdfKind;
  number: string;
  orderNumber?: string | null;
  lpo?: string | null;
  status: string;
  channel: string;
  createdAt: Date | string;
  dispatchMethod: string;
  tracking?: string | null;
  notes?: string | null;
  vatRate?: number;
  customer: { name: string; phone?: string | null; kraPin?: string | null };
  salesperson?: { name: string } | null;
  company?: {
    name?: string | null;
    legalName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    mpesaPaybill?: string | null;
    mpesaAccount?: string | null;
  };
  lines: { sku: string; name: string; bin: string; qty: number; price: number }[];
  totals: { net: number; vat: number; gross: number; paid: number; balance: number };
};

export function documentTitle(kind: OrderPdfKind, status: string) {
  if (kind === "order") return status === "DRAFT" ? "Quotation" : "Sales order";
  if (kind === "sale") return "Tax invoice";
  return "Delivery note";
}

export function documentSlug(kind: OrderPdfKind, status: string) {
  if (kind === "order") return status === "DRAFT" ? "quotation" : "sales-order";
  if (kind === "sale") return "invoice";
  return "delivery-note";
}

export function moneyKes(n: number) {
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}

export function moneyPlain(n: number) {
  return Math.round(n).toLocaleString("en-KE");
}

export function deliveryNumber(source?: string | null) {
  if (!source) return "";
  const m = source.match(/(\d{4})-(\d+)$/);
  if (m) return `DN-${m[1]}-${m[2]}`;
  return source.replace(/^(SO|INV|ORD)-/i, "DN-");
}

export function buildOrderPdf(data: OrderPdfInput): Promise<Buffer> {
  const title = documentTitle(data.kind, data.status);
  const priced = data.kind !== "delivery";
  const company = data.company || {};
  const companyName = (company.legalName || company.name || "MTE ERP").toUpperCase();
  const vatPct = Math.round((data.vatRate ?? 0.16) * 100);
  const date = formatDocDate(data.createdAt);
  const badge = data.kind === "sale" ? ["INVOICE"] : data.kind === "delivery" ? ["DELIVERY"] : data.status === "DRAFT" ? ["QUOTATION"] : ["SALES", "ORDER"];
  const intro =
    data.kind === "order"
      ? data.status === "DRAFT"
        ? "Please quote / confirm the following goods"
        : "Please supply / confirm the following goods"
      : "Please receive the following goods in good order and condition";
  const closing =
    data.kind === "order"
      ? "Order confirmed subject to stock and company terms."
      : "Please receive the following goods in good order and condition.";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 36, left: 40, right: 40 },
      bufferPages: false,
      autoFirstPage: true,
      info: { Title: `${title} ${data.number}`, Author: companyName },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 40;
    doc.circle(LEFT + 16, y + 16, 16).fill(NAVY);
    put(doc, initials(companyName), LEFT, y + 10, { size: 8, bold: true, color: "#FFFFFF", width: 32, align: "center" });
    put(doc, companyName, LEFT + 42, y + 4, { size: 13, bold: true, color: NAVY, width: 320 });
    const contact = [
      company.phone ? `Tel: ${company.phone}` : null,
      company.email ? `Email: ${company.email}` : null,
    ].filter(Boolean).join("  |  ");
    if (contact) put(doc, contact, LEFT + 42, y + 22, { size: 8, color: GRAY, width: 320 });

    doc.roundedRect(RIGHT - 132, y, 132, 34, 2).fill(NAVY);
    if (badge.length === 1) {
      put(doc, badge[0], RIGHT - 132, y + 11, { size: 11, bold: true, color: "#FFFFFF", width: 132, align: "center" });
    } else {
      put(doc, badge[0], RIGHT - 132, y + 5, { size: 10, bold: true, color: "#FFFFFF", width: 132, align: "center" });
      put(doc, badge[1], RIGHT - 132, y + 18, { size: 10, bold: true, color: "#FFFFFF", width: 132, align: "center" });
    }
    y += 52;

    put(doc, "LIPA NA MPESA", LEFT, y, { size: 9, bold: true, color: NAVY });
    y += 13;
    put(doc, `PAYBILL NUMBER: ${company.mpesaPaybill || "—"}`, LEFT, y, { size: 9 });
    y += 12;
    put(doc, `ACC. NO: ${company.mpesaAccount || "—"}`, LEFT, y, { size: 9 });
    y += 12;
    put(doc, `B/S NAME: ${companyName}`, LEFT, y, { size: 9 });
    y += 22;

    put(doc, "M/s", LEFT, y, { size: 10 });
    put(doc, data.customer.name || "—", LEFT + 28, y, { size: 10, bold: true, width: 250 });
    underline(doc, LEFT + 28, y + 12, 250);

    const meta = data.kind === "sale"
      ? [
          ["Date", date],
          ["Invoice No.", data.number],
          ["Order / LPO", data.lpo || data.orderNumber || "—"],
        ]
      : data.kind === "delivery"
        ? [
            ["Date", date],
            ["Delivery No.", data.number],
            ["Order No.", data.orderNumber || "—"],
          ]
        : [
            ["Date", date],
            ["Order No.", data.number],
            ["LPO", data.lpo || "—"],
          ];
    let my = y;
    meta.forEach(([label, value]) => {
      put(doc, label, 340, my, { size: 9, width: 80 });
      put(doc, value, 430, my, { size: 9, width: 125 });
      underline(doc, 430, my + 11, 125);
      my += 16;
    });
    y += 16;
    underline(doc, LEFT + 28, y + 12, 250);
    y = Math.max(y + 28, my + 8);

    put(doc, intro, LEFT, y, { size: 9, color: GRAY, width: WIDTH });
    y += 18;

    const qtyW = 54;
    const priceW = priced ? 88 : 0;
    const amountW = priced ? 88 : 0;
    const descW = WIDTH - qtyW - priceW - amountW;
    const cols = priced
      ? [
          { key: "qty", label: "Qty", x: LEFT, w: qtyW, align: "center" as const },
          { key: "name", label: "Description", x: LEFT + qtyW, w: descW, align: "left" as const },
          { key: "price", label: "Unit Price", x: LEFT + qtyW + descW, w: priceW, align: "right" as const },
          { key: "line", label: "Amount", x: LEFT + qtyW + descW + priceW, w: amountW, align: "right" as const },
        ]
      : [
          { key: "qty", label: "Qty", x: LEFT, w: qtyW, align: "center" as const },
          { key: "name", label: "Description", x: LEFT + qtyW, w: descW, align: "left" as const },
        ];

    const rowH = 18;
    const minRows = data.kind === "delivery" ? 10 : 4;
    const rows = [...data.lines];
    while (rows.length < minRows && y + (rows.length + 2) * rowH < 620) rows.push({ sku: "", name: "", bin: "", qty: 0, price: 0 } as OrderPdfInput["lines"][number]);

    headerRow(doc, y, cols, rowH);
    y += rowH;
    rows.forEach((line) => {
      const blank = !line.sku && !line.name && !line.qty;
      const values: Record<string, string> = {
        qty: blank ? "" : String(line.qty || ""),
        name: blank ? "" : [line.sku, line.name].filter(Boolean).join("  "),
        price: blank ? "" : moneyPlain(line.price),
        line: blank ? "" : moneyPlain(line.qty * line.price),
      };
      bodyRow(doc, y, cols, rowH, values);
      y += rowH;
    });

    const eoe = [
      { key: "qty", label: "E. & O.E", x: LEFT, w: qtyW, align: "center" as const },
      { key: "name", label: `No. ${data.number}`, x: LEFT + qtyW, w: descW, align: "center" as const },
      ...(priced
        ? [
            { key: "price", label: "", x: LEFT + qtyW + descW, w: priceW, align: "right" as const },
            { key: "line", label: "", x: LEFT + qtyW + descW + priceW, w: amountW, align: "right" as const },
          ]
        : []),
    ];
    bodyRow(doc, y, eoe, rowH, {
      qty: "E. & O.E",
      name: `No. ${data.number}`,
      price: "",
      line: "",
    }, { nameColor: RED });
    y += rowH + 14;

    if (priced) {
      const vatLabel = `VAT (${vatPct}%)`;
      const rowsTot =
        data.kind === "sale"
          ? [
              ["Subtotal", moneyKes(data.totals.net)],
              [vatLabel, moneyKes(data.totals.vat)],
              ["Total", moneyKes(data.totals.gross)],
              ["Paid", moneyKes(data.totals.paid)],
              ["Balance due", moneyKes(data.totals.balance)],
            ]
          : [
              ["Subtotal", moneyKes(data.totals.net)],
              [vatLabel, moneyKes(data.totals.vat)],
              ["Total", moneyKes(data.totals.gross)],
            ];
      rowsTot.forEach(([label, value], i) => {
        const last = label === "Total";
        put(doc, label, 340, y, { size: last ? 11 : 9, bold: last, width: 100, align: "right" });
        put(doc, value, 445, y, { size: last ? 11 : 9, bold: last, width: 110, align: "right" });
        y += last ? 16 : 13;
      });
      y += 6;
    }

    put(doc, closing, LEFT, y, { size: 9, color: GRAY, width: WIDTH, align: "center" });
    y += 28;

    if (data.kind === "order") {
      signLine(doc, LEFT, y, "Prepared by", "");
      signLine(doc, 320, y, "Sign", "");
      y += 28;
      signLine(doc, LEFT, y, "Accepted by", "");
      signLine(doc, 320, y, "Sign", "");
    } else if (data.kind === "delivery") {
      signLine(doc, LEFT, y, "Dispatched by", data.salesperson?.name || "");
      signLine(doc, 320, y, "Sign", "");
      y += 28;
      signLine(doc, LEFT, y, "Received by", "");
      signLine(doc, 320, y, "Sign", "");
    } else {
      signLine(doc, LEFT, y, "Confirmed by", "");
      signLine(doc, 320, y, "Sign", "");
      y += 28;
      signLine(doc, LEFT, y, "Received by", "");
      signLine(doc, 320, y, "Sign", "");
    }

    doc.end();
  });
}

export type StatementLine = {
  date: Date | string;
  document: string;
  debit: number;
  credit: number;
  balance: number;
};

export function buildCustomerStatementPdf(data: {
  customer: { name: string; phone?: string | null; email?: string | null; kraPin?: string | null; paymentTerms?: string | null };
  asOf: Date | string;
  outstanding: number;
  invoiced: number;
  paid: number;
  lines: StatementLine[];
  company?: OrderPdfInput["company"];
}): Promise<Buffer> {
  const company = data.company || {};
  const companyName = (company.legalName || company.name || "MTE ERP").toUpperCase();
  const asOf = formatDocDate(data.asOf);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 36, left: 40, right: 40 },
      bufferPages: false,
      autoFirstPage: true,
      info: { Title: `Statement ${data.customer.name}`, Author: companyName },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 40;
    doc.circle(LEFT + 16, y + 16, 16).fill(NAVY);
    put(doc, initials(companyName), LEFT, y + 10, { size: 8, bold: true, color: "#FFFFFF", width: 32, align: "center" });
    put(doc, companyName, LEFT + 42, y + 4, { size: 13, bold: true, color: NAVY, width: 320 });
    const contact = [company.phone ? `Tel: ${company.phone}` : null, company.email ? `Email: ${company.email}` : null].filter(Boolean).join("  |  ");
    if (contact) put(doc, contact, LEFT + 42, y + 22, { size: 8, color: GRAY, width: 320 });
    doc.roundedRect(RIGHT - 132, y, 132, 34, 2).fill(NAVY);
    put(doc, "STATEMENT", RIGHT - 132, y + 11, { size: 11, bold: true, color: "#FFFFFF", width: 132, align: "center" });
    y += 52;

    put(doc, "M/s", LEFT, y, { size: 10 });
    put(doc, data.customer.name || "—", LEFT + 28, y, { size: 10, bold: true, width: 250 });
    underline(doc, LEFT + 28, y + 12, 250);
    put(doc, "Date", 340, y, { size: 9, width: 80 });
    put(doc, asOf, 430, y, { size: 9, width: 125 });
    underline(doc, 430, y + 11, 125);
    y += 16;
    put(doc, data.customer.phone || data.customer.email || "—", LEFT + 28, y, { size: 9, width: 250, color: GRAY });
    put(doc, "Terms", 340, y, { size: 9, width: 80 });
    put(doc, data.customer.paymentTerms || "—", 430, y, { size: 9, width: 125 });
    underline(doc, 430, y + 11, 125);
    y += 16;
    put(doc, data.customer.kraPin ? `PIN ${data.customer.kraPin}` : "", LEFT + 28, y, { size: 9, width: 250, color: GRAY });
    y += 24;

    const cols = [
      { key: "date", label: "Date", x: LEFT, w: 70, align: "left" as const },
      { key: "document", label: "Document", x: LEFT + 70, w: 175, align: "left" as const },
      { key: "debit", label: "Debit", x: LEFT + 245, w: 90, align: "right" as const },
      { key: "credit", label: "Credit", x: LEFT + 335, w: 90, align: "right" as const },
      { key: "balance", label: "Balance", x: LEFT + 425, w: 90, align: "right" as const },
    ];
    const rowH = 18;
    headerRow(doc, y, cols, rowH);
    y += rowH;
    for (const line of data.lines) {
      if (y > 720) {
        doc.addPage();
        y = 40;
        headerRow(doc, y, cols, rowH);
        y += rowH;
      }
      bodyRow(doc, y, cols, rowH, {
        date: formatDocDate(line.date),
        document: line.document,
        debit: line.debit ? moneyPlain(line.debit) : "",
        credit: line.credit ? moneyPlain(line.credit) : "",
        balance: moneyPlain(line.balance),
      });
      y += rowH;
    }
    y += 16;
    [
      ["Invoiced", moneyKes(data.invoiced)],
      ["Paid", moneyKes(data.paid)],
      ["Balance due", moneyKes(data.outstanding)],
    ].forEach(([label, value], i, arr) => {
      const last = i === arr.length - 1;
      put(doc, label, 340, y, { size: last ? 11 : 9, bold: last, width: 100, align: "right" });
      put(doc, value, 445, y, { size: last ? 11 : 9, bold: last, width: 110, align: "right", color: last && data.outstanding > 0.01 ? RED : BLACK });
      y += last ? 16 : 13;
    });
    y += 10;
    put(doc, "This statement shows invoices and payments as at the date above.", LEFT, y, { size: 8, color: GRAY, width: WIDTH, align: "center" });
    doc.end();
  });
}

export type PurchasePdfInput = {
  kind: "po";
  number: string;
  status: string;
  vendor: { name: string; phone?: string | null };
  reference?: string | null;
  notes?: string | null;
  createdAt: Date | string;
  expectedAt?: Date | string | null;
  createdBy?: string | null;
  lines: { sku: string; name: string; qtyOrdered: number; qtyReceived: number; unitCost: number }[];
  totals: { net: number; vat: number; gross: number; received: number };
};

export function buildPurchasePdf(data: PurchasePdfInput): Promise<Buffer> {
  const date = new Date(data.createdAt).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const expected = data.expectedAt
    ? new Date(data.expectedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
    : "-";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 48, left: 50, right: 50 },
      bufferPages: false,
      autoFirstPage: true,
      info: { Title: `Purchase order ${data.number}`, Author: "MTE ERP" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 52;
    put(doc, "MTE ERP", LEFT, y, { size: 11, bold: true });
    put(doc, "PURCHASE ORDER", LEFT, y, { size: 14, bold: true, width: WIDTH, align: "right" });
    y += 16;
    put(doc, "Earth-moving parts", LEFT, y, { size: 9, color: GRAY });
    put(doc, data.number, LEFT, y, { size: 11, bold: true, width: WIDTH, align: "right" });
    y += 13;
    put(doc, "Nairobi, Kenya", LEFT, y, { size: 9, color: GRAY });
    put(doc, date, LEFT, y, { size: 9, color: GRAY, width: WIDTH, align: "right" });
    y += 18;
    rule(doc, y);
    y += 16;

    put(doc, "VENDOR", LEFT, y, { size: 8, color: GRAY });
    put(doc, "DETAILS", 320, y, { size: 8, color: GRAY });
    y += 13;
    put(doc, data.vendor.name || "-", LEFT, y, { size: 10, bold: true, width: 250 });
    put(doc, `Status: ${data.status.replace(/_/g, " ")}`, 320, y, { size: 9, width: 225 });
    y += 13;
    put(doc, data.vendor.phone || "-", LEFT, y, { size: 9, width: 250, color: GRAY });
    put(doc, `Buyer: ${data.createdBy || "-"}`, 320, y, { size: 9, width: 225 });
    y += 13;
    put(doc, data.reference ? `Supplier ref ${data.reference}` : "Supplier ref -", LEFT, y, { size: 9, width: 250, color: GRAY });
    put(doc, `Expected: ${expected}`, 320, y, { size: 9, width: 225 });
    if (data.notes) {
      y += 14;
      put(doc, `Notes: ${data.notes}`, LEFT, y, { size: 9, width: WIDTH, color: GRAY });
    }
    y += 18;
    rule(doc, y);
    y += 10;

    const cols = [
      { key: "sku", label: "SKU", x: LEFT, w: 80, align: "left" as const },
      { key: "name", label: "Description", x: 130, w: 170, align: "left" as const },
      { key: "qty", label: "Ordered", x: 300, w: 50, align: "right" as const },
      { key: "recv", label: "Received", x: 355, w: 50, align: "right" as const },
      { key: "cost", label: "Cost", x: 410, w: 55, align: "right" as const },
      { key: "line", label: "Amount", x: 470, w: 75, align: "right" as const },
    ];
    cols.forEach((c) => put(doc, c.label, c.x, y, { size: 8, bold: true, width: c.w, align: c.align, color: GRAY }));
    y += 12;
    rule(doc, y);
    y += 8;

    for (const line of data.lines) {
      if (y > 700) break;
      const values: Record<string, string> = {
        sku: line.sku,
        name: line.name,
        qty: String(line.qtyOrdered),
        recv: String(line.qtyReceived),
        cost: moneyKes(line.unitCost),
        line: moneyKes(line.qtyOrdered * line.unitCost),
      };
      cols.forEach((c) =>
        put(doc, values[c.key], c.x, y, { size: 9, width: c.w, align: c.align, bold: c.key === "sku" })
      );
      y += 16;
    }

    y += 6;
    rule(doc, y);
    y += 14;
    [
      ["Net", moneyKes(data.totals.net)],
      ["VAT 16%", moneyKes(data.totals.vat)],
      ["Total", moneyKes(data.totals.gross)],
    ].forEach(([label, value], i, arr) => {
      const last = i === arr.length - 1;
      put(doc, label, 360, y, { size: 9, bold: last, width: 80, color: last ? BLACK : GRAY });
      put(doc, value, 445, y, { size: 9, bold: last, width: 100, align: "right" });
      y += 14;
    });

    put(doc, `MTE ERP  |  Purchase order  |  ${data.number}`, LEFT, 780, {
      size: 8,
      color: GRAY,
      width: WIDTH,
      align: "center",
    });
    doc.end();
  });
}

function formatDocDate(value: Date | string) {
  const d = new Date(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function initials(name: string) {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "MTE";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 3).map((p) => p[0]).join("").toUpperCase();
}

function underline(doc: PDFKit.PDFDocument, x: number, y: number, w: number) {
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(BLACK).lineWidth(0.6).stroke();
}

function headerRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: { x: number; w: number; label: string; align: "left" | "right" | "center" }[],
  h: number
) {
  doc.rect(LEFT, y, WIDTH, h).fill(NAVY);
  cols.forEach((c) => {
    doc.rect(c.x, y, c.w, h).strokeColor("#08303C").lineWidth(0.4).stroke();
    put(doc, c.label, c.x + 4, y + 5, { size: 8, bold: true, color: "#FFFFFF", width: c.w - 8, align: c.align });
  });
}

function bodyRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: { key: string; x: number; w: number; align: "left" | "right" | "center" }[],
  h: number,
  values: Record<string, string>,
  tone: { nameColor?: string } = {}
) {
  cols.forEach((c) => {
    doc.rect(c.x, y, c.w, h).strokeColor("#222222").lineWidth(0.5).stroke();
    put(doc, values[c.key] || "", c.x + 4, y + 5, {
      size: 8,
      width: c.w - 8,
      align: c.align,
      color: c.key === "name" && tone.nameColor ? tone.nameColor : BLACK,
    });
  });
}

function signLine(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string) {
  put(doc, `${label}:`, x, y, { size: 9, width: 80 });
  put(doc, value, x + 78, y, { size: 9, width: 140 });
  underline(doc, x + 78, y + 11, 140);
}

function put(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: string; width?: number; align?: "left" | "right" | "center" } = {}
) {
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.size || 9)
    .fillColor(opts.color || BLACK)
    .text(String(text ?? ""), x, y, {
      width: opts.width,
      align: opts.align || "left",
      lineBreak: false,
      ellipsis: true,
    });
}

function rule(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(RULE).lineWidth(0.8).stroke();
}
