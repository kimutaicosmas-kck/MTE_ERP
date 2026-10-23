import type { ReactNode } from "react";

export type FinanceNavId =
  | "invoices"
  | "ap"
  | "ar"
  | "ledger"
  | "bank"
  | "assets"
  | "budget"
  | "tax"
  | "reports";

export function financeNavHref(id: FinanceNavId): string {
  const q = new URLSearchParams();
  switch (id) {
    case "invoices":
      q.set("section", "overview");
      break;
    case "ap":
      q.set("section", "ap");
      break;
    case "ar":
      q.set("section", "ar");
      q.set("tab", "collections");
      break;
    case "ledger":
      q.set("section", "books");
      break;
    case "bank":
      q.set("section", "banking");
      break;
    case "assets":
      q.set("section", "reports");
      q.set("report", "assets");
      break;
    case "budget":
      q.set("section", "reports");
      q.set("report", "budget");
      break;
    case "tax":
      q.set("section", "reports");
      q.set("report", "vat");
      break;
    case "reports":
      q.set("section", "reports");
      q.set("report", "statements");
      break;
  }
  return `/finance?${q.toString()}`;
}

/** Shown under Finance in the main app sidebar (dropdown). */
export const FINANCE_SIDEBAR_LINKS: { id: FinanceNavId; label: string; to: string }[] = [
  { id: "invoices", label: "Invoices", to: financeNavHref("invoices") },
  { id: "ap", label: "Accounts payable", to: financeNavHref("ap") },
  { id: "ar", label: "Accounts receivable", to: financeNavHref("ar") },
  { id: "ledger", label: "General ledger", to: financeNavHref("ledger") },
  { id: "bank", label: "Bank & cash", to: financeNavHref("bank") },
  { id: "assets", label: "Fixed assets", to: financeNavHref("assets") },
  { id: "budget", label: "Budgeting & forecasting", to: financeNavHref("budget") },
  { id: "tax", label: "Tax management", to: financeNavHref("tax") },
  { id: "reports", label: "Reports", to: financeNavHref("reports") },
];

export const FINANCE_NAV_TITLES: Record<FinanceNavId, string> = {
  invoices: "Invoices",
  ap: "Accounts payable",
  ar: "Accounts receivable",
  ledger: "General ledger",
  bank: "Bank & cash",
  assets: "Fixed assets",
  budget: "Budgeting & forecasting",
  tax: "Tax management",
  reports: "Reports",
};

export function FinanceSectionHeader({
  actions,
  alert,
}: {
  actions?: ReactNode;
  alert?: ReactNode;
}) {
  if (!actions && !alert) return null;
  return (
    <header className="finance-section-head">
      {alert ? <div className="finance-section-alert">{alert}</div> : null}
      {actions ? <div className="finance-section-actions">{actions}</div> : null}
    </header>
  );
}

export function financeNavFromSection(
  section: string,
  reportView: string,
): FinanceNavId {
  if (section === "overview") return "invoices";
  if (section === "ap") return "ap";
  if (section === "ar") return "ar";
  if (section === "books") return "ledger";
  if (section === "banking") return "bank";
  if (section === "reports") {
    if (reportView === "assets") return "assets";
    if (reportView === "budget") return "budget";
    if (reportView === "vat") return "tax";
    return "reports";
  }
  return "invoices";
}

export function financeNavFromLocation(pathname: string, search: string): FinanceNavId | null {
  if (!pathname.startsWith("/finance")) return null;
  const p = new URLSearchParams(search);
  return financeNavFromSection(p.get("section") || "overview", p.get("report") || "statements");
}
