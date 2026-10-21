import PDFDocument from "pdfkit";

const BLACK = "#111111";
const GRAY = "#555555";
const RULE = "#222222";
const NAVY = "#0B1F36";
const NAVY_DARK = "#1E3A5F";
const GOLD = "#F59A1A";
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
  theme?: string;
  validDays?: number;
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

function moneyPlain2(n: number) {
  return Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function deliveryNumber(source?: string | null) {
  if (!source) return "";
  const m = source.match(/(\d{4})-(\d+)$/);
  if (m) return `DN-${m[1]}-${m[2]}`;
  return source.replace(/^(SO|INV|ORD)-/i, "DN-");
}

function paletteFor(kind: OrderPdfKind, status: string) {
  if (kind === "delivery") return { ink: NAVY, dark: NAVY_DARK, label: "DELIVERY NOTE" };
  if (kind === "sale") return { ink: NAVY, dark: NAVY_DARK, label: "INVOICE" };
  if (status === "DRAFT") return { ink: NAVY, dark: NAVY_DARK, label: "QUOTATION" };
  return { ink: NAVY, dark: NAVY_DARK, label: "SALES ORDER" };
}

function statusLabel(status: string) {
  if (status === "DRAFT") return "Draft";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "PICKED") return "Packed";
  if (status === "DISPATCHED") return "Dispatched";
  if (status === "DELIVERED") return "Delivered";
  return status.replace(/_/g, " ");
}

export function buildOrderPdf(data: OrderPdfInput): Promise<Buffer> {
  const title = documentTitle(data.kind, data.status);
  const priced = data.kind !== "delivery";
  const company = data.company || {};
  const companyName = company.legalName || company.name || "MTE ERP";
  const pal = paletteFor(data.kind, data.status);
  const vatPct = Math.round((data.vatRate ?? 0.16) * 100);
  const date = formatDocDate(data.createdAt);
  const valid = data.validDays ? formatDocDate(new Date(new Date(data.createdAt).getTime() + data.validDays * 86400000)) : "—";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 40, left: 40, right: 40 },
      bufferPages: false,
      autoFirstPage: true,
      info: { Title: `${title} ${data.number}`, Author: companyName },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 36;
    doc.circle(LEFT + 14, y + 14, 14).fill(NAVY);
    doc.circle(LEFT + 14, y + 14, 14).lineWidth(1.2).strokeColor(GOLD).stroke();
    put(doc, initials(companyName), LEFT, y + 8, { size: 7, bold: true, color: "#FFFFFF", width: 28, align: "center" });
    put(doc, companyName.toUpperCase(), LEFT + 34, y + 2, { size: 12, bold: true, color: NAVY, width: 300 });
    const contact = [company.phone ? `Tel: ${company.phone}` : null, company.email ? `Email: ${company.email}` : null].filter(Boolean).join(" | ");
    if (contact) put(doc, contact, LEFT + 34, y + 18, { size: 7.5, color: NAVY_DARK, width: 300 });
    doc.rect(RIGHT - 128, y, 128, 28).fill(NAVY);
    put(doc, pal.label, RIGHT - 128, y + 9, { size: 10, bold: true, color: "#FFFFFF", width: 128, align: "center" });
    y += 38;

    if (company.mpesaPaybill || company.mpesaAccount) {
      put(doc, "LIPA NA MPESA", LEFT, y, { size: 8, bold: true, color: NAVY_DARK, width: WIDTH });
      y += 11;
      put(doc, `PAYBILL NUMBER: ${company.mpesaPaybill || "—"}`, LEFT, y, { size: 8, bold: true, color: NAVY_DARK, width: WIDTH });
      y += 10;
      put(doc, `ACC. NO: ${company.mpesaAccount || "—"}`, LEFT, y, { size: 8, bold: true, color: NAVY_DARK, width: WIDTH });
      y += 10;
      put(doc, `B/S NAME: ${companyName}`, LEFT, y, { size: 8, bold: true, color: NAVY_DARK, width: WIDTH });
      y += 14;
    }

    const meta =
      data.kind === "sale"
        ? [
            ["Date", date],
            ["Invoice No.", data.number],
            ["Order / LPO", data.lpo || data.orderNumber || "—"],
          ]
        : data.kind === "delivery"
          ? [
              ["Date", date],
              ["Order No.", data.orderNumber || data.number],
              ["Dispatch", (data.dispatchMethod || "SHOP_COLLECT").replace("_", " ")],
            ]
          : data.status === "DRAFT"
            ? [
                ["Date", date],
                ["Quote No.", data.number],
                ["Valid until", valid],
              ]
            : [
                ["Date", date],
                ["Order No.", data.number],
                ["L.P.O.", data.lpo || "—"],
              ];

    put(doc, "From", LEFT, y, { size: 8, bold: true, color: NAVY_DARK, width: 60 });
    put(doc, companyName, LEFT, y + 12, { size: 9, bold: true, width: 280 });
    put(doc, "Dealers in heavy machinery, earth-moving equipment, lubricants, filters & genuine spare parts.", LEFT, y + 24, {
      size: 7,
      color: GRAY,
      width: 280,
    });
    put(doc, "To", LEFT, y + 44, { size: 8, bold: true, color: NAVY_DARK, width: 60 });
    put(doc, data.customer.name || "—", LEFT, y + 56, { size: 9, bold: true, width: 280 });
    if (data.customer.phone) put(doc, data.customer.phone, LEFT, y + 68, { size: 8, color: GRAY, width: 280 });

    let my = y;
    meta.forEach(([label, value]) => {
      put(doc, label, 350, my, { size: 8, bold: true, color: NAVY_DARK, width: 90 });
      put(doc, value, 445, my, { size: 8, bold: true, width: 110, align: "right" });
      underline(doc, 350, my + 11, 205);
      my += 16;
    });
    y = Math.max(y + 82, my) + 8;

    const itemsTitle =
      data.kind === "sale" ? "Invoice Items" : data.kind === "delivery" ? "Delivery Items" : data.status === "DRAFT" ? "Quotation Items" : "Sales Order Items";
    put(doc, itemsTitle, LEFT, y, { size: 9, bold: true, color: NAVY_DARK, width: WIDTH });
    doc.moveTo(LEFT, y + 12).lineTo(LEFT + 120, y + 12).strokeColor(NAVY_DARK).lineWidth(0.6).stroke();
    y += 18;

    const cols = priced
      ? [
          { key: "n", label: "No", x: LEFT, w: 28, align: "left" as const },
          { key: "name", label: "Item", x: LEFT + 28, w: 243, align: "left" as const },
          { key: "qty", label: "Qty", x: LEFT + 271, w: 48, align: "right" as const },
          { key: "price", label: "Rate", x: LEFT + 319, w: 96, align: "right" as const },
          { key: "line", label: "Amount", x: LEFT + 415, w: 100, align: "right" as const },
        ]
      : [
          { key: "n", label: "No", x: LEFT, w: 28, align: "left" as const },
          { key: "name", label: "Item", x: LEFT + 28, w: 387, align: "left" as const },
          { key: "qty", label: "Qty", x: LEFT + 415, w: 100, align: "right" as const },
        ];
    headerRow(doc, y, cols, 18, NAVY);
    y += 18;
    data.lines.forEach((line, i) => {
      const values: Record<string, string> = {
        n: String(i + 1),
        name: [line.sku, line.name].filter(Boolean).join(" "),
        qty: moneyPlain2(line.qty),
        price: priced ? moneyPlain2(line.price) : "",
        line: priced ? moneyPlain2(line.qty * line.price) : "",
      };
      bodyRow(doc, y, cols, 20, values);
      y += 20;
    });
    put(doc, "E.& O.E", LEFT + 4, y + 4, { size: 8, bold: true, color: NAVY_DARK, width: 80 });
    put(doc, `No. ${data.number}`, LEFT, y + 4, { size: 9, bold: true, color: RED, width: WIDTH, align: "center" });
    y += 22;

    const prepared = data.salesperson?.name || companyName;
    put(doc, "Prepared By:", LEFT, y, { size: 8, bold: true, color: NAVY_DARK, width: 80 });
    put(doc, prepared, LEFT + 72, y, { size: 8, bold: true, width: 180 });
    put(doc, "Authorized By:", LEFT, y + 14, { size: 8, bold: true, color: NAVY_DARK, width: 80 });
    put(doc, prepared, LEFT + 72, y + 14, { size: 8, bold: true, width: 180 });

    if (priced) {
      const net = data.totals.net;
      const vat = data.totals.vat;
      const gross = data.totals.gross;
      let ty = y;
      const totRows: [string, string][] = [
        ["Total Amount:", moneyKes(net)],
        ["Less Discount:", "0.00 % | KES 0.00"],
        ["After Discount:", moneyKes(net)],
        ["VAT Inclusive:", moneyKes(vat)],
        ["Amount Payable:", moneyKes(gross)],
      ];
      if (data.kind === "sale") {
        totRows.push(["Paid:", moneyKes(data.totals.paid)], ["Balance Due:", moneyKes(data.totals.balance)]);
      }
      totRows.forEach(([label, value]) => {
        const payable = label.startsWith("Amount Payable") || label.startsWith("Balance Due");
        put(doc, label, 330, ty, { size: 8, bold: true, color: payable ? NAVY : NAVY_DARK, width: 110, align: "right" });
        put(doc, value, 445, ty, { size: payable ? 9 : 8, bold: true, width: 110, align: "right" });
        ty += payable ? 16 : 13;
      });
      y = Math.max(y + 30, ty);
    } else {
      y += 34;
    }

    put(doc, "Terms and Conditions", LEFT, y, { size: 9, bold: true, color: NAVY_DARK, width: WIDTH });
    y += 12;
    const terms =
      data.kind === "sale"
        ? "Payment due on receipt unless credit terms apply. Use invoice number as payment reference."
        : data.status === "DRAFT"
          ? data.notes?.trim() || `Prices valid until ${valid} unless withdrawn earlier.`
          : "Goods remain company property until paid in full. Report shortages on the day of receipt.";
    put(doc, terms, LEFT, y, { size: 8, color: GRAY, width: WIDTH });
    y += 20;
    rule(doc, y);

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
  h: number,
  fill = NAVY
) {
  doc.rect(LEFT, y, WIDTH, h).fill(fill);
  cols.forEach((c) => {
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
    doc.moveTo(LEFT, y + h).lineTo(RIGHT, y + h).strokeColor("#F3F4F6").lineWidth(0.6).stroke();
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
