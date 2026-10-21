export type DocKind = "quotation" | "sales-order" | "invoice";

/** MTE brand-led palettes per document type */
export const DOC_PALETTE: Record<
  DocKind,
  { ink: string; soft: string; dark: string; label: string; badge: string }
> = {
  quotation: { ink: "#0b1f36", soft: "#f1f5f9", dark: "#1e3a5f", label: "Quotation", badge: "QUOTATION" },
  "sales-order": { ink: "#0b1f36", soft: "#ecfdf5", dark: "#047857", label: "Sales order", badge: "SALES ORDER" },
  invoice: { ink: "#0b1f36", soft: "#f5f3ff", dark: "#6d28d9", label: "Invoice", badge: "INVOICE" },
};

export type DocLine = { sku?: string; name: string; qty: number; price: number };

export type DocModel = {
  kind: DocKind;
  number: string;
  date: string;
  status?: string;
  customerName: string;
  customerPhone?: string;
  salesperson?: string;
  companyName: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  companyTagline?: string;
  paybill?: string;
  account?: string;
  intro?: string;
  validDays?: number;
  lpo?: string;
  orderNumber?: string;
  dispatchMethod?: string;
  paid?: number;
  balance?: number;
  discountPct?: number;
  discountAmount?: number;
  lines: DocLine[];
  vatRate?: number;
};

export function shareUrl(token?: string | null) {
  if (!token) return "";
  return `${window.location.origin}/share/${token}`;
}

export function sharePdfUrl(token?: string | null) {
  if (!token) return "";
  return `${window.location.origin}/api/share/${token}/pdf`;
}

export function shareMessage(doc: { kind: string; number: string; customerName?: string }, url: string) {
  const label = doc.kind === "quotation" ? "quotation" : doc.kind === "invoice" ? "invoice" : "sales order";
  return `${doc.number} ${label}${doc.customerName ? ` for ${doc.customerName}` : ""}. View or download: ${url}`;
}

export function addDays(date: string, days: number) {
  const d = new Date(date.split("/").reverse().join("-"));
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB");
}

export function prettyStatus(status?: string) {
  if (!status) return "Draft";
  if (status === "DRAFT") return "Draft";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "PICKING") return "Picking";
  if (status === "PICKED") return "Packed";
  if (status === "DISPATCHED") return "Dispatched";
  if (status === "DELIVERED") return "Delivered";
  if (status === "PAID") return "Paid";
  return status.replace(/_/g, " ");
}

export function docMoney(n: number) {
  return Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function docKes(n: number) {
  return `KES ${docMoney(n)}`;
}
