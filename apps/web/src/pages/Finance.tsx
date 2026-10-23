import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, FileDown, Landmark, Package, Plus, Receipt, Scale, Search, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StkPrompt } from "../components/StkPrompt";
import { MobileFilters } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { EmptyRow, ExportButtons, Modal, MteSelect, PageHeader, Pager, RowPdf, Stat, StatGrid, mapSelectOptions, useQueryState } from "../components/ui";
import { FinanceCoA, FinanceJournalForm, FinanceLedger } from "./finance/FinancePanels";
import { ModuleReportsPanel } from "../components/ModuleReportsPanel";
import { FinanceApAging, FinanceAgingMatrix, FinanceEnterpriseSection } from "./finance/FinanceEnterprise";
import { FinanceSectionHeader, FINANCE_NAV_TITLES, financeNavFromSection, type FinanceNavId } from "./finance/FinanceSidebar";
import { api, downloadPdf, downloadVatKraExport, money } from "../lib/api";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";
import { MobileFinanceNav } from "../components/MobileFinanceNav";

type FinanceSection = "overview" | "ar" | "ap" | "banking" | "books" | "reports";

const LEGACY_FINANCE_SECTION_MAP: Record<string, FinanceSection> = {
  coa: "books",
  journals: "books",
  ledger: "books",
  finreports: "reports",
  tax: "reports",
  close: "reports",
  budget: "reports",
  assets: "reports",
  currency: "reports",
};

const FINANCE_SECTION_IDS = new Set<FinanceSection>(["overview", "ar", "ap", "banking", "books", "reports"]);

function normalizeFinanceSection(raw: string): FinanceSection {
  if (FINANCE_SECTION_IDS.has(raw as FinanceSection)) return raw as FinanceSection;
  return LEGACY_FINANCE_SECTION_MAP[raw] || "overview";
}

function applyFinanceNav(
  id: FinanceNavId,
  setSectionRaw: (v: string) => void,
  setTabRaw: (v: string) => void,
  setReportView: (v: string) => void,
) {
  switch (id) {
    case "invoices":
      setSectionRaw("overview");
      setTabRaw("invoices");
      break;
    case "ap":
      setSectionRaw("ap");
      break;
    case "ar":
      setSectionRaw("ar");
      setTabRaw("collections");
      break;
    case "ledger":
      setSectionRaw("books");
      break;
    case "bank":
      setSectionRaw("banking");
      break;
    case "assets":
      setSectionRaw("reports");
      setReportView("assets");
      break;
    case "budget":
      setSectionRaw("reports");
      setReportView("budget");
      break;
    case "tax":
      setSectionRaw("reports");
      setReportView("vat");
      break;
    case "reports":
      setSectionRaw("reports");
      setReportView("statements");
      break;
  }
}

type MainTab = "invoices" | "collections" | "payments" | "bills" | "accounts";
type AccountView = "tb" | "pnl" | "bs" | "vat" | "period" | "journals" | "reconcile";

const LEGACY_FINANCE_TAB: Record<string, MainTab> = {
  mpesa: "payments",
  expenses: "bills",
  journals: "accounts",
  reconciliation: "accounts",
};

function resolveFinanceTab(raw: string): MainTab {
  if (["invoices", "collections", "payments", "bills", "accounts"].includes(raw)) return raw as MainTab;
  return LEGACY_FINANCE_TAB[raw] || "invoices";
}

type Invoice = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  status: string;
  issuedAt: string;
  dueAt?: string | null;
  vatRate: number;
  lpo?: string | null;
  customer: { name: string; phone?: string; paymentTerms?: string };
  salesperson?: { name: string } | null;
  payments: { id: string; method: string; amount: number; reference?: string; createdAt: string }[];
  markupTotal?: number;
  markupCommission?: number;
  commissionRate?: number;
  totals: { net: number; vat: number; gross: number; paid: number; credit: number; balance: number };
};

const LEGACY_FINANCE_SECTION: Record<string, FinanceSection> = {
  invoices: "overview",
  collections: "ar",
  payments: "banking",
  mpesa: "banking",
  bills: "ap",
  expenses: "ap",
  accounts: "reports",
  journals: "journals",
  reconciliation: "reports",
};

export function Finance() {
  const [params] = useSearchParams();
  const [sectionRaw, setSectionRaw] = useQueryState("section", "overview");
  const section = normalizeFinanceSection(sectionRaw);
  const setSection = (next: FinanceSection) => setSectionRaw(next);
  const [bookView, setBookView] = useQueryState("book", "coa");
  const [reportView, setReportView] = useQueryState("report", "statements");
  const [tabRaw, setTabRaw] = useQueryState("tab", "invoices");
  const tab = resolveFinanceTab(tabRaw);
  const setTab = (next: MainTab) => setTabRaw(next);
  const accountsView =
    section === "tax" ? "vat"
      : section === "close" ? "period"
        : section === "reports" ? "pnl"
          : tabRaw === "journals" ? "journals"
            : tabRaw === "reconciliation" ? "reconcile"
              : undefined;
  const [apView, setApView] = useQueryState("apView", "bills");
  const [modal, setModal] = useState<"pay" | "credit" | "stk" | null>(null);
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api<Invoice[]>("/api/finance/invoices") });
  const dash = useQuery({ queryKey: ["finance-dashboard"], queryFn: () => api<Record<string, number>>("/api/finance/dashboard") });
  const pnl = useQuery({ queryKey: ["pnl"], queryFn: () => api<any>("/api/finance/pnl") });
  const vat = useQuery({ queryKey: ["vat"], queryFn: () => api<any>("/api/finance/vat") });

  useEffect(() => {
    const normalized = normalizeFinanceSection(sectionRaw);
    if (normalized !== sectionRaw) setSectionRaw(normalized);
    if (sectionRaw === "coa") setBookView("coa");
    if (sectionRaw === "journals") setBookView("journals");
    if (sectionRaw === "ledger") setBookView("ledger");
    if (sectionRaw === "tax") setReportView("vat");
    if (sectionRaw === "close") setReportView("period");
    if (sectionRaw === "finreports") setReportView("analytics");
    if (sectionRaw === "budget") setReportView("budget");
    if (sectionRaw === "assets") setReportView("assets");
    if (sectionRaw === "currency") setReportView("currency");
  }, [sectionRaw]);

  useEffect(() => {
    if (params.has("section")) return;
    const t = params.get("tab");
    if (t && LEGACY_FINANCE_SECTION[t]) setSectionRaw(LEGACY_FINANCE_SECTION[t]);
  }, []);

  useEffect(() => {
    if (section === "overview" && tabRaw !== "invoices" && tabRaw !== "collections") setTabRaw("invoices");
    else if (section === "ar" && tabRaw !== "collections") setTabRaw("collections");
    else if (section === "ap" && tabRaw !== "bills") setTabRaw("bills");
    else if (section === "banking" && tabRaw !== "payments") setTabRaw("payments");
    else if ((section === "reports" || section === "tax" || section === "close") && tabRaw !== "accounts") setTabRaw("accounts");
  }, [section, tabRaw, setTabRaw]);

  const list = invoices.data || [];
  const unpaid = list.filter((inv) => inv.totals.balance > 0.01);
  const overdueList = list.filter(isOverdueInvoice);
  const overdueAmount = overdueList.reduce((s, inv) => s + inv.totals.balance, 0);
  const outstanding = unpaid.reduce((s, inv) => s + inv.totals.balance, 0);
  const vatDue = vat.data?.payable || 0;
  const financeNav = financeNavFromSection(section, reportView);
  const sectionTitle = FINANCE_NAV_TITLES[financeNav];
  const goNav = (id: FinanceNavId) => applyFinanceNav(id, setSectionRaw, setTabRaw, setReportView);

  const paymentActions = (
    <>
      <button type="button" className="btn-success" onClick={() => setModal("pay")}>Record payment</button>
      <button type="button" className="btn-ghost" onClick={() => setModal("stk")}>M-Pesa prompt</button>
      <button type="button" className="btn-ghost" onClick={() => setModal("credit")}><Plus size={14} /> Credit note</button>
    </>
  );

  const overdueAlert =
    overdueList.length > 0 ? (
      <div className="finance-inline-alert">
        <span>
          <strong>{overdueList.length} overdue</strong> · {money(overdueAmount)} needs collection
        </span>
        <button type="button" onClick={() => goNav("ar")}>Open receivables</button>
      </div>
    ) : null;

  const showPaymentBar = section === "overview" || section === "banking" || section === "ar";

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Finance" title={sectionTitle} />

      <StatGrid cols={6}>
        <Stat icon={Wallet} label="Cash & bank" amount={dash.data?.cashBalance ?? 0} chart="area" hint="Liquid funds" to="/finance?section=banking" />
        <Stat icon={Receipt} label="Receivable" amount={dash.data?.accountsReceivable ?? outstanding} chart="area" hint={`${unpaid.length} open · ${overdueList.length} overdue`} to="/finance?section=overview" />
        <Stat icon={Scale} label="Payable" amount={dash.data?.accountsPayable ?? 0} chart="meter" share={dash.data?.assets ? Math.min(1, (dash.data?.accountsPayable || 0) / dash.data.assets) : 0} hint={`${dash.data?.openBills ?? 0} open bills`} to="/finance?section=ap" />
        <Stat icon={Banknote} label="Net profit" value={money(dash.data?.netProfit ?? pnl.data?.net ?? 0)} chart="ring" max={Math.max(dash.data?.monthlyRevenue ?? 1, 1)} hint={`Tax due ${money(dash.data?.taxDue ?? vatDue)}`} to="/finance?section=reports&report=vat" />
        <Stat icon={TrendingUp} label="Revenue" amount={dash.data?.monthlyRevenue ?? 0} chart="area" hint="Income (ledger)" to="/finance?section=reports&report=statements" />
        <Stat icon={Package} label="Outstanding" amount={dash.data?.outstandingInvoices ?? overdueAmount} chart="bars" hint="Open invoice balance" to="/finance?section=ar" />
      </StatGrid>

      <MobileFinanceNav />

      {showPaymentBar && (
        <FinanceSectionHeader
          actions={
            section === "overview" || section === "banking"
              ? paymentActions
              : (
                <>
                  {paymentActions}
                  <button type="button" className="btn-ghost" onClick={() => goNav("invoices")}>All invoices</button>
                </>
              )
          }
          alert={section === "overview" ? overdueAlert : undefined}
        />
      )}

      {section === "overview" && <InvoiceRegister invoices={invoices.data || []} />}

      {section === "books" && (
        <>
          {bookView === "coa" && <FinanceCoA />}
          {bookView === "journals" && <FinanceJournalForm />}
          {bookView === "ledger" && <FinanceLedger />}
        </>
      )}

      {section === "reports" && (
        <>
          {(reportView === "statements" || reportView === "period" || reportView === "analytics" || reportView === "currency") && (
            <>
              {reportView === "statements" && <AccountsTab initialView={accountsView} />}
              {reportView === "period" && <AccountsTab initialView="period" />}
              {reportView === "analytics" && <ModuleReportsPanel moduleId="finance" />}
              {reportView === "currency" && <FinanceEnterpriseSection kind="currency" />}
            </>
          )}
          {reportView === "vat" && <AccountsTab initialView="vat" />}
          {reportView === "budget" && <FinanceEnterpriseSection kind="budget" />}
          {reportView === "assets" && <FinanceEnterpriseSection kind="assets" />}
        </>
      )}

      {(section === "ar" || section === "ap" || section === "banking") && (
        <>
          {section === "ar" && <CollectionsTab />}
          {section === "ap" && (
            <>
              {apView === "aging" ? <FinanceApAging /> : (
                <>
                  <BillsTab />
                  <ExpensesTab />
                </>
              )}
            </>
          )}
          {section === "banking" && (
            <>
              <PaymentsRegister invoices={invoices.data || []} />
              <MpesaTab invoices={unpaid} />
              <div className="card flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Bank reconciliation</h3>
                <Link className="btn-gold inline-flex w-fit" to="/finance?section=reports&report=statements&view=reconcile">Open bank reconcile</Link>
              </div>
            </>
          )}
        </>
      )}

      {modal === "stk" && (
        <StkInvoicePicker
          invoices={unpaid}
          onClose={() => setModal(null)}
        />
      )}
      {(modal === "pay" || modal === "credit") && (
        <MoneyModal
          kind={modal}
          invoices={unpaid}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function InvoiceRegister({ invoices }: { invoices: Invoice[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useQueryState("pay", "");
  const [vat, setVat] = useState("");
  const [when, setWhen] = useState("all");

  const rows = useMemo(() => {
    return invoices.filter((inv) => {
      const hay = `${inv.number} ${inv.orderNumber} ${inv.customer.name} ${inv.salesperson?.name || ""} ${inv.lpo || ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (type && type !== "SALE") return false;
      const paid = inv.totals.balance <= 0.01;
      if (status === "unpaid" && paid) return false;
      if (status === "paid" && !paid) return false;
      if (status === "overdue" && !isOverdueInvoice(inv)) return false;
      const vatType = inv.vatRate > 0 ? "VAT" : "NON";
      if (vat && vat !== vatType) return false;
      if (!inDateRange(inv.issuedAt, when)) return false;
      return true;
    });
  }, [invoices, q, type, status, vat, when]);
  const listing = useListSort(rows, [
    { id: "date", label: "Newest first", get: (inv) => inv.issuedAt, dir: "desc" },
    { id: "total", label: "Highest total", get: (inv) => inv.totals.gross, dir: "desc" },
    { id: "balance", label: "Highest balance", get: (inv) => inv.totals.balance, dir: "desc" },
    { id: "customer", label: "Customer A–Z", get: (inv) => inv.customer.name, dir: "asc" },
  ], "date");
  const pager = usePager(listing.sorted, `${q}|${type}|${status}|${vat}|${when}|${listing.sort}`);
  const clearFilters = () => { setQ(""); setType(""); setStatus(""); setVat(""); setWhen("all"); };
  const filtersActive = Boolean(q || type || status || vat || when !== "all");

  const headers = ["Document #", "Type", "Customer / supplier", "VAT", "LPO", "Sales person", "Date", "Due", "Total", "Commission", "Balance", "Credit note", "Status"];
  const exportRows = () =>
    rows.map((inv) => [
      inv.number,
      "SALE",
      inv.customer.name,
      inv.vatRate > 0 ? "VAT" : "Non-VAT",
      inv.lpo || "—",
      inv.salesperson?.name || "—",
      fmtDate(inv.issuedAt),
      inv.dueAt ? fmtDate(inv.dueAt) : "—",
      ksh(inv.totals.gross),
      inv.markupCommission ? ksh(inv.markupCommission) : "—",
      ksh(inv.totals.balance),
      creditTotal(inv) ? ksh(creditTotal(inv)) : "—",
      inv.status,
    ]);

  return (
    <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
      <div className="module-list-toolbar">
        <label className="module-search-field">
          <Search size={17} className="module-search-icon" aria-hidden />
          <input
            className="min-w-0 flex-1"
            placeholder="Search invoice # or party…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <MobileFilters
          title="Filter invoices"
          onClear={clearFilters}
          fields={[
            {
              kind: "select",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "", label: "All statuses" },
                { value: "unpaid", label: "Unpaid" },
                { value: "paid", label: "Paid" },
                { value: "overdue", label: "Overdue" },
              ],
            },
            {
              kind: "select",
              label: "Type",
              value: type,
              onChange: setType,
              options: [{ value: "", label: "All types" }, { value: "SALE", label: "Sale" }],
            },
            {
              kind: "select",
              label: "VAT",
              value: vat,
              onChange: setVat,
              options: [{ value: "", label: "All VAT types" }, { value: "VAT", label: "VAT" }, { value: "NON", label: "Non-VAT" }],
            },
            {
              kind: "select",
              label: "Period",
              value: when,
              onChange: setWhen,
              options: [
                { value: "all", label: "All dates" },
                { value: "today", label: "Today" },
                { value: "week", label: "This week" },
                { value: "month", label: "This month" },
              ],
            },
          ]}
        />
        <div className="module-toolbar-bottom">
          <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
            <span className="module-filter-group-label">Filters</span>
            <div className="module-filter-controls">
              <select className="module-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
                <option value="">All types</option>
                <option value="SALE">Sale</option>
              </select>
              <select className="module-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">All statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
              <select className="module-select" value={vat} onChange={(e) => setVat(e.target.value)} aria-label="VAT">
                <option value="">All VAT</option>
                <option value="VAT">VAT</option>
                <option value="NON">Non-VAT</option>
              </select>
              <select className="module-select" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Period">
                <option value="all">All dates</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
              </select>
              <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={clearFilters}>
                Reset
              </button>
            </div>
          </div>
          <div className="module-toolbar-actions">
            <ExportButtons title="Invoices" filename="invoices.csv" headers={headers} rows={exportRows()} />
          </div>
        </div>
      </div>
      <Register
        rows={listing.sorted}
        pager={pager}
        getId={(inv) => inv.id}
        empty={{ title: "No invoices yet" }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (inv) => inv.number,
          subtitle: (inv) => inv.customer.name,
          status: (inv) => <span className={`badge ${inv.status === "PAID" ? "bg-emerald-100 text-emerald-800" : inv.status === "OVERDUE" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{inv.status}</span>,
          fields: [
            { label: "Date", value: (inv) => fmtDate(inv.issuedAt) },
            { label: "Total", value: (inv) => ksh(inv.totals.gross), align: "right" },
            { label: "Balance", value: (inv) => ksh(inv.totals.balance), align: "right" },
          ],
          details: (inv) => [
            { label: "Customer", value: inv.customer.name },
            { label: "Order", value: inv.orderNumber },
            { label: "Date", value: fmtDate(inv.issuedAt) },
            { label: "Due", value: inv.dueAt ? fmtDate(inv.dueAt) : "—" },
            { label: "Total", value: ksh(inv.totals.gross), align: "right" },
            { label: "Balance", value: ksh(inv.totals.balance), align: "right" },
            { label: "Status", value: inv.status },
          ],
          actions: (inv) => (
            <button className="btn-ghost" onClick={() => downloadPdf(inv.orderId, "sale")}><FileDown size={14} /> PDF</button>
          ),
        }}
      >
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Document #</th>
              <th>Type</th>
              <th>Customer / supplier</th>
              <th>VAT</th>
              <th>LPO</th>
              <th>Sales person</th>
              <th>Date</th>
              <th>Due</th>
              <th className="num">Total</th>
              <th className="num">Commission</th>
              <th className="num">Balance</th>
              <th className="num">Credit note</th>
              <th>Status</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={14} label="No invoices match." />}
            {pager.slice.map((inv) => {
              const credit = creditTotal(inv);
              const state = inv.status;
              return (
                <tr key={inv.id}>
                  <td>
                    <span className="font-medium text-ink">{inv.number}</span>
                    <div className="text-[11px] text-stone-400">{inv.orderNumber}</div>
                  </td>
                  <td>Sale</td>
                  <td>{inv.customer.name}</td>
                  <td>
                    {inv.vatRate > 0 ? (
                      <span className="vat-pill border-sky-200 bg-sky-50 text-sky-700">VAT</span>
                    ) : (
                      <span className="vat-pill border-stone-200 bg-stone-50 text-stone-600">Non-VAT</span>
                    )}
                  </td>
                  <td className="text-stone-400">{inv.lpo || "—"}</td>
                  <td>{inv.salesperson?.name || "—"}</td>
                  <td>{fmtDate(inv.issuedAt)}</td>
                  <td>{inv.dueAt ? fmtDate(inv.dueAt) : "—"}</td>
                  <td className="num">{ksh(inv.totals.gross)}</td>
                  <td className="num text-emerald-800">{inv.markupCommission ? ksh(inv.markupCommission) : "—"}</td>
                  <td className="num">{ksh(inv.totals.balance)}</td>
                  <td className="num text-stone-400">{credit ? ksh(credit) : "—"}</td>
                  <td>
                    <span className={`badge ${
                      state === "PAID" ? "bg-emerald-100 text-emerald-800" : state === "OVERDUE" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                    }`}>{state}</span>
                  </td>
                  <td>
                    <button className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-ink" onClick={() => downloadPdf(inv.orderId, "sale")}>
                      <FileDown size={14} /> PDF
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Register>
    </section>
  );
}

function BillsTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const bills = useQuery({ queryKey: ["bills"], queryFn: () => api<any[]>("/api/finance/bills") });
  const pay = useMutation({
    mutationFn: (p: { id: string; amount: number; method: string; reference?: string }) =>
      api(`/api/finance/bills/${p.id}/pay`, { method: "POST", body: JSON.stringify(p) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      qc.invalidateQueries({ queryKey: ["journals"] });
      setPayTarget(null);
    },
  });
  const rows = useMemo(() => {
    return (bills.data || []).filter((b) =>
      `${b.number} ${b.vendor?.name || ""} ${b.purchase?.number || ""}`.toLowerCase().includes(q.toLowerCase()),
    );
  }, [bills.data, q]);
  const pager = usePager(rows, q);
  const open = rows.filter((b) => b.balance > 0.01).length;

  return (
    <div className="space-y-3">
      <section className="suite-panel suite-panel-table overflow-hidden">
        <div className="module-list-toolbar border-b border-stone-100 px-4 py-3">
          <input className="module-search-field max-w-md" placeholder="Search bill, supplier or PO…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="text-sm text-stone-500">{open} open · {rows.length} total</span>
        </div>
        {pay.error && <p className="px-4 py-2 text-sm text-red-600">{(pay.error as Error).message}</p>}
        <div className="table-wrap">
          <table className="invoice suite-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>PO</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow cols={9} label="No supplier bills yet. Receive a purchase order in Procurement first." />}
              {pager.slice.map((b) => (
                <tr key={b.id}>
                  <td className="font-semibold">{b.number}</td>
                  <td>{b.vendor?.name}</td>
                  <td>{b.createdAt ? fmtDate(b.createdAt) : "—"}</td>
                  <td>{b.purchase?.number || "—"}</td>
                  <td className="num">{money(b.gross)}</td>
                  <td className="num">{money(b.paid)}</td>
                  <td className={`num ${b.balance > 0.01 ? "font-semibold text-amber-800" : "text-emerald-700"}`}>{money(b.balance)}</td>
                  <td>
                    <span className={`status-pill ${b.balance <= 0.01 ? "status-pill-ok" : "status-pill-warn"}`}>
                      {b.balance <= 0.01 ? "Paid" : b.status}
                    </span>
                  </td>
                  <td>
                    {b.balance > 0.01 && (
                      <button type="button" className="btn-success px-3 py-1 text-xs" onClick={() => setPayTarget(b)}>
                        Pay bill
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2"><Pager {...pager} /></div>
      </section>

      {payTarget && (
        <Modal onClose={() => setPayTarget(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              pay.mutate({
                id: payTarget.id,
                amount: Number(fd.get("amount")),
                method: String(fd.get("method") || "BANK"),
                reference: String(fd.get("reference") || ""),
              });
            }}
          >
            <h2 className="text-xl font-semibold tracking-tight">Pay supplier bill</h2>
            <p className="text-sm text-stone-600">{payTarget.number} · {payTarget.vendor?.name} · Balance {money(payTarget.balance)}</p>
            <label className="grid gap-1 text-sm">
              <span>Amount (KES)</span>
              <input name="amount" type="number" step="0.01" min={0.01} max={payTarget.balance} defaultValue={payTarget.balance} required />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Method</span>
              <select name="method" defaultValue="BANK">
                <option value="BANK">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="MPESA">M-Pesa</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Reference (optional)</span>
              <input name="reference" placeholder="Cheque / transaction ID" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setPayTarget(null)}>Cancel</button>
              <button type="submit" className="btn-success" disabled={pay.isPending}>{pay.isPending ? "Posting…" : "Record payment"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PaymentsRegister({ invoices }: { invoices: Invoice[] }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const rows = useMemo(() => {
    return invoices
      .flatMap((inv) => (inv.payments || []).map((p) => ({ ...p, invoice: inv })))
      .filter((p) => {
        if (!`${p.invoice.number} ${p.invoice.customer.name} ${p.method} ${p.reference || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (method && p.method !== method) return false;
        return true;
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [invoices, q, method]);
  const pager = usePager(rows, `${q}|${method}`);
  const headers = ["Date", "Invoice", "Customer", "Method", "Reference", "Amount"];
  const payMethods = [...new Set(invoices.flatMap((inv) => (inv.payments || []).map((p) => p.method)))];
  const clearPay = () => { setQ(""); setMethod(""); };
  return (
    <div className="space-y-2">
      <div className="toolbar toolbar-compact">
        <input placeholder="Search payments…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
          <option value="">All methods</option>
          {payMethods.map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button type="button" className="btn-ghost text-xs" onClick={clearPay}>Clear</button>
        <ExportButtons
          title="Payments"
          filename="payments.csv"
          headers={headers}
          rows={rows.map((p) => [fmtDate(p.createdAt), p.invoice.number, p.invoice.customer.name, p.method, p.reference || "", String(p.amount)])}
        />
      </div>
      <MobileFilters
        title="Filter payments"
        onClear={clearPay}
        fields={[
          {
            kind: "select",
            label: "Method",
            value: method,
            onChange: setMethod,
            options: [{ value: "", label: "All methods" }, ...payMethods.map((m) => ({ value: m, label: m.replace(/_/g, " ") }))],
          },
        ]}
      />
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Reference</th><th>Amount</th><th>PDF</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={8} label="No payments yet." />}
            {pager.slice.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.createdAt)}</td>
                <td className="font-semibold">{p.invoice.number}</td>
                <td>{p.invoice.customer.name}</td>
                <td>{p.method.replace("_", " ")}</td>
                <td>{p.reference || "—"}</td>
                <td>{money(p.amount)}</td>
                <td>
                  <RowPdf
                    title={`Payment ${p.invoice.number}`}
                    fields={[
                      ["Invoice", p.invoice.number],
                      ["Customer", p.invoice.customer.name],
                      ["Date", fmtDate(p.createdAt)],
                      ["Method", p.method.replace("_", " ")],
                      ["Reference", p.reference || "—"],
                      ["Amount", money(p.amount)],
                    ]}
                  />
                </td>
                <td>
                  {p.method !== "CREDIT_NOTE" && (
                    <button
                      type="button"
                      className="btn-danger px-2 py-1 text-xs"
                      onClick={() => {
                        const reason = prompt("Reason to void this payment") || "";
                        if (!reason) return;
                        api(`/api/finance/payments/${p.id}/void`, { method: "POST", body: JSON.stringify({ reason }) })
                          .then(() => qc.invalidateQueries())
                          .catch((err) => alert((err as Error).message));
                      }}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}

function ExpensesTab() {
  const exp = useQuery({ queryKey: ["exp"], queryFn: () => api<any[]>("/api/finance/expenses") });
  const rows = exp.data || [];
  const pager = usePager(rows, rows.length);
  const qc = useQueryClient();
  const addExp = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/finance/expenses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form
        className="card space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const receipt = fd.get("receipt") as File | null;
          addExp.mutate({
            category: fd.get("category"),
            amount: Number(fd.get("amount")),
            vat: Number(fd.get("vat") || 0),
            date: fd.get("date"),
            notes: fd.get("notes"),
            receiptName: receipt?.name,
          });
          if (receipt) {
            const reader = new FileReader();
            reader.onload = () => {
              api("/api/captures", {
                method: "POST",
                body: JSON.stringify({
                  kind: "receipt",
                  refId: "expense",
                  name: receipt.name,
                  mime: receipt.type || "image/jpeg",
                  data: String(reader.result),
                }),
              }).catch(() => undefined);
            };
            reader.readAsDataURL(receipt);
          }
          e.currentTarget.reset();
        }}
      >
        <h3 className="font-semibold">Record expense</h3>
        <input name="category" placeholder="Category" required />
        <input name="amount" type="number" placeholder="Amount (ex VAT)" required />
        <input name="vat" type="number" placeholder="VAT" />
        <input name="date" type="date" />
        <input name="notes" placeholder="Notes" />
        <input name="receipt" type="file" accept="image/*" capture="environment" />
        <button className="btn-gold">Post</button>
      </form>
      <div className="table-wrap lg:col-span-2">
        <table className="invoice">
          <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>VAT</th><th>PDF</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} label="No expenses recorded yet." />}
            {pager.slice.map((e) => (
              <tr key={e.id}>
                <td>{e.date.slice(0, 10)}</td>
                <td>{e.category}</td>
                <td>{money(e.amount)}</td>
                <td>{money(e.vat)}</td>
                <td>
                  <RowPdf
                    title={`Expense ${e.category}`}
                    fields={[
                      ["Date", e.date.slice(0, 10)],
                      ["Category", e.category],
                      ["Amount", money(e.amount)],
                      ["VAT", money(e.vat)],
                      ["Notes", e.notes || "—"],
                    ]}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-danger px-2 py-1 text-xs"
                    onClick={() => {
                      const reason = prompt("Reason to delete this expense") || "";
                      if (!reason) return;
                      api(`/api/finance/expenses/${e.id}`, { method: "DELETE", body: JSON.stringify({ reason }) })
                        .then(() => qc.invalidateQueries())
                        .catch((err) => alert((err as Error).message));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:col-span-3"><Pager {...pager} /></div>
    </div>
  );
}

function JournalsTab() {
  const jnl = useQuery({ queryKey: ["jnl"], queryFn: () => api<any[]>("/api/finance/journals") });
  return (
    <div className="space-y-3">
      {jnl.data?.length === 0 && <p className="text-sm text-stone-500">No journals posted yet.</p>}
      {jnl.data?.map((j) => (
        <div key={j.id} className="card text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold">{j.memo} {j.reversed && <span className="badge bg-stone-200">reversed</span>}</div>
            <RowPdf
              title={`Journal ${j.memo}`}
              fields={[
                ["Memo", j.memo],
                ["Source", j.source],
                ["Date", new Date(j.createdAt).toLocaleString()],
                ...j.lines.map((l: any) => [`${l.account.code} ${l.account.name}`, l.debit ? `Dr ${money(l.debit)}` : `Cr ${money(l.credit)}`] as [string, string]),
              ]}
            />
          </div>
          <div className="text-xs text-stone-500">{j.source} · {new Date(j.createdAt).toLocaleString()}</div>
          {j.lines.map((l: any) => (
            <div key={l.id} className="flex justify-between">
              <span>{l.account.code} {l.account.name}</span>
              <span>{l.debit ? `Dr ${money(l.debit)}` : `Cr ${money(l.credit)}`}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AccountsTab({ initialView }: { initialView?: AccountView }) {
  const [viewParam] = useQueryState("view", "");
  const [view, setView] = useState<AccountView>(initialView || "pnl");
  useEffect(() => {
    if (viewParam === "reconcile") setView("reconcile");
    else if (initialView) setView(initialView);
  }, [viewParam, initialView]);
  const tb = useQuery({ queryKey: ["tb"], queryFn: () => api<any>("/api/finance/trial-balance") });
  const pnl = useQuery({ queryKey: ["pnl"], queryFn: () => api<any>("/api/finance/pnl") });
  const bs = useQuery({ queryKey: ["bs"], queryFn: () => api<any>("/api/finance/balance-sheet") });
  const vat = useQuery({ queryKey: ["vat"], queryFn: () => api<any>("/api/finance/vat") });
  const periods = useQuery({ queryKey: ["periods"], queryFn: () => api<any[]>("/api/finance/periods") });
  const qc = useQueryClient();
  return (
    <div className="space-y-4">
      {view === "tb" && (
        <div className="table-wrap">
          <table className="invoice">
            <thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th><th>PDF</th></tr></thead>
            <tbody>
              {tb.data?.rows.map((r: any) => (
                <tr key={r.code}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{money(r.debit)}</td>
                  <td>{money(r.credit)}</td>
                  <td>
                    <RowPdf
                      title={`Account ${r.code}`}
                      fields={[
                        ["Code", r.code],
                        ["Account", r.name],
                        ["Debit", money(r.debit)],
                        ["Credit", money(r.credit)],
                      ]}
                    />
                  </td>
                </tr>
              ))}
              <tr className="font-semibold"><td></td><td>Total</td><td>{money(tb.data?.totalDebit)}</td><td>{money(tb.data?.totalCredit)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {view === "pnl" && pnl.data && (
        <div className="card max-w-md space-y-2">
          <Row l="Income" v={pnl.data.income} />
          <Row l="COGS" v={pnl.data.cogs} />
          <Row l="Gross profit" v={pnl.data.gross} />
          <Row l="Expenses" v={pnl.data.expenses} />
          <Row l="Net profit" v={pnl.data.net} bold />
        </div>
      )}
      {view === "bs" && bs.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h3 className="mb-2 font-semibold">Assets</h3>
            {bs.data.assets.map((a: any) => <Row key={a.code} l={`${a.code} ${a.name}`} v={a.balance} />)}
            <Row l="Total" v={bs.data.totals.assets} bold />
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold">Equity & liabilities</h3>
            {bs.data.liabilities.map((a: any) => <Row key={a.code} l={`${a.code} ${a.name}`} v={a.balance} />)}
            {bs.data.equity.map((a: any) => <Row key={a.code} l={`${a.code} ${a.name}`} v={a.balance} />)}
            <Row l="Total" v={bs.data.totals.liabilities} bold />
          </div>
        </div>
      )}
      {view === "vat" && vat.data && (
        <div className="card max-w-md space-y-2">
          <Row l="Output VAT" v={vat.data.output} />
          <Row l="Input VAT" v={vat.data.input} />
          <Row l="Net payable" v={vat.data.payable} bold />
          <button type="button" className="btn-gold mt-3 text-sm" onClick={() => downloadVatKraExport().catch((e) => alert(e.message))}>
            Download KRA VAT CSV
          </button>
        </div>
      )}
      {view === "period" && <PeriodClose rows={periods.data || []} onDone={() => qc.invalidateQueries({ queryKey: ["periods"] })} />}
      {view === "journals" && <JournalsTab />}
      {view === "reconcile" && <ReconciliationTab />}
    </div>
  );
}

function ReconciliationTab() {
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => api<any>("/api/finance/banks") });
  const qc = useQueryClient();
  return <BankRec data={banks.data} onDone={() => qc.invalidateQueries({ queryKey: ["banks"] })} />;
}

function MoneyModal({
  kind,
  invoices,
  onClose,
}: {
  kind: "pay" | "credit";
  invoices: Invoice[];
  onClose: () => void;
}) {
  const [invoiceId, setInvoiceId] = useState("");
  const [method, setMethod] = useState("CASH");
  const invoiceOptions = useMemo(
    () =>
      mapSelectOptions(
        invoices,
        (inv) => inv.id,
        (inv) => inv.number,
        (inv) => `${inv.customer.name} · ${money(inv.totals.balance)} due`,
      ),
    [invoices],
  );
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (body: { id: string; amount: number; method: string; reference?: string }) =>
      api(`/api/finance/invoices/${body.id}/pay`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["journals"] });
      onClose();
    },
  });
  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          save.mutate({
            id: invoiceId,
            amount: Number(fd.get("amount")),
            method: kind === "credit" ? "CREDIT_NOTE" : method,
            reference: String(fd.get("reference") || ""),
          });
        }}
      >
        <h3 className="font-semibold">{kind === "credit" ? "New credit note" : "Record payment"}</h3>
        <div>
          <label>Invoice</label>
          <MteSelect
            aria-label="Invoice"
            value={invoiceId}
            onChange={setInvoiceId}
            options={invoiceOptions}
            placeholder="Select invoice…"
            required
          />
        </div>
        <div>
          <label>Amount</label>
          <input name="amount" type="number" step="0.01" min="0.01" required />
        </div>
        {kind === "pay" ? (
          <>
            <div>
              <label>Method</label>
              <MteSelect
                aria-label="Payment method"
                value={method}
                onChange={setMethod}
                allowEmpty={false}
                options={[
                  { value: "CASH", label: "Cash" },
                  { value: "MPESA", label: "M-Pesa" },
                  { value: "BANK", label: "Bank" },
                ]}
              />
            </div>
            <div>
              <label>Reference</label>
              <input name="reference" placeholder="M-Pesa / bank slip" />
            </div>
          </>
        ) : (
          <div>
            <label>Reason</label>
            <input name="reference" placeholder="Return, price adjustment…" required />
          </div>
        )}
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className={kind === "credit" ? "btn-gold" : "btn-success"} disabled={save.isPending}>{kind === "credit" ? "Post credit note" : "Post payment"}</button>
        </div>
      </form>
    </Modal>
  );
}

function StkInvoicePicker({ invoices, onClose }: { invoices: Invoice[]; onClose: () => void }) {
  const [invoiceId, setInvoiceId] = useState("");
  const invoiceOptions = useMemo(
    () =>
      mapSelectOptions(
        invoices,
        (i) => i.id,
        (i) => i.number,
        (i) => `${i.customer.name} · ${money(i.totals.balance)}`,
      ),
    [invoices],
  );
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!invoices.length) {
    return (
      <Modal onClose={onClose}>
        <p className="text-sm">No unpaid invoices.</p>
        <button className="btn-ghost mt-3" onClick={onClose}>Close</button>
      </Modal>
    );
  }
  if (inv) {
    return (
      <StkPrompt
        invoiceId={inv.id}
        defaultPhone={inv.customer.phone || ""}
        defaultAmount={Math.round(inv.totals.balance)}
        onClose={onClose}
      />
    );
  }
  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invoiceId) return;
        }}
      >
        <h3 className="font-semibold">Send M-Pesa prompt</h3>
        <div>
          <label>Invoice</label>
          <MteSelect
            aria-label="Invoice"
            value={invoiceId}
            onChange={setInvoiceId}
            options={invoiceOptions}
            placeholder="Select invoice…"
            required
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-success">Continue</button>
        </div>
      </form>
    </Modal>
  );
}

function CollectionsTab() {
  const [bucket, setBucket] = useState("");
  const { data } = useQuery({ queryKey: ["collections"], queryFn: () => api<any>("/api/reports/collections") });
  const rows = (data?.rows || []).filter((r: any) => !bucket || r.bucket === bucket);
  const pager = usePager(rows, bucket);
  const summary = data?.summary;

  return (
    <div className="space-y-3">
      <FinanceAgingMatrix matrix={data?.agingMatrix} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-xs uppercase text-stone-400">Outstanding</div><div className="text-xl font-semibold">{money(summary?.total)}</div></div>
        <div className="card"><div className="text-xs uppercase text-stone-400">Overdue</div><div className="text-xl font-semibold text-rose-700">{money(summary?.overdueAmount)}</div><div className="text-xs text-stone-500">{summary?.overdue || 0} invoices</div></div>
        <div className="card"><div className="text-xs uppercase text-stone-400">Not yet due</div><div className="text-xl font-semibold">{summary?.current || 0} invoices</div></div>
      </div>
      <div className="toolbar">
        <select className="w-auto rounded-full" value={bucket} onChange={(e) => setBucket(e.target.value)}>
          <option value="">All buckets</option>
          <option value="30+">30+ days</option>
          <option value="30">8–30 days</option>
          <option value="14">8–14 days</option>
          <option value="7">1–7 days</option>
          <option value="current">Not yet due</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Invoice</th><th>Customer</th><th>Sales</th><th>Date</th><th>Due</th><th className="num">Balance</th><th>Age</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={8} label="No outstanding invoices." />}
            {pager.slice.map((r: any) => (
              <tr key={r.id}>
                <td className="font-medium">{r.number}</td>
                <td>{r.customer}</td>
                <td>{r.salesperson}</td>
                <td>{r.issuedAt ? fmtDate(r.issuedAt) : "—"}</td>
                <td>{r.dueAt ? fmtDate(r.dueAt) : "—"}</td>
                <td className="num font-medium">{money(r.balance)}</td>
                <td>{r.daysOverdue > 0 ? `${r.daysOverdue}d overdue` : "Current"}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {r.mailto ? <a className="btn-ghost px-2 py-1 text-xs" href={r.mailto}>Email reminder</a> : null}
                    <a className="btn-ghost px-2 py-1 text-xs" href={`/sales/${r.orderId}`}>Open</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}

function MpesaTab({ invoices }: { invoices: Invoice[] }) {
  const qc = useQueryClient();
  const [viewReconcile] = useQueryState("view", "");
  const status = useQuery({ queryKey: ["mpesa-status"], queryFn: () => api<any>("/api/mpesa/status") });
  const txns = useQuery({ queryKey: ["mpesa-txns"], queryFn: () => api<any[]>("/api/mpesa/transactions") });
  const reconcile = useQuery({ queryKey: ["mpesa-reconcile"], queryFn: () => api<any>("/api/reports/mpesa-reconcile") });
  const [stk, setStk] = useState<Invoice | null>(null);
  const [alloc, setAlloc] = useState<any>(null);
  const [allocInvoiceId, setAllocInvoiceId] = useState("");
  const [payoutCommand, setPayoutCommand] = useState("BusinessPayment");
  const allocInvoiceOptions = useMemo(
    () =>
      mapSelectOptions(
        invoices,
        (inv) => inv.id,
        (inv) => inv.number,
        (inv) => `${inv.customer.name} · ${money(inv.totals.balance)}`,
      ),
    [invoices],
  );
  const balance = useMutation({
    mutationFn: () => api("/api/mpesa/balance", { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mpesa-txns"] }),
  });
  const reverse = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/mpesa/reverse", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mpesa-txns"] }),
  });
  const payout = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/mpesa/b2c", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mpesa-txns"] }),
  });
  const queryTx = useMutation({
    mutationFn: (transId: string) => api("/api/mpesa/status-query", { method: "POST", body: JSON.stringify({ transId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mpesa-txns"] }),
  });
  const allocate = useMutation({
    mutationFn: (body: { id: string; invoiceId: string }) => api(`/api/mpesa/transactions/${body.id}/allocate`, { method: "POST", body: JSON.stringify({ invoiceId: body.invoiceId }) }),
    onSuccess: () => {
      qc.invalidateQueries();
      setAlloc(null);
    },
  });
  const ready = status.data?.stkReady;
  const txnRows = txns.data || [];
  const txnPager = usePager(txnRows, txnRows.length);

  const rs = reconcile.data?.summary;

  return (
    <div className="space-y-4">
      {(viewReconcile === "reconcile" || rs?.unallocated || rs?.pendingStk) && reconcile.data && (
        <div className="card space-y-3">
          <h3 className="font-semibold">Daily reconciliation</h3>
          <div className="grid gap-2 sm:grid-cols-4 text-sm">
            <div><span className="text-stone-500">Unallocated</span><div className="font-semibold">{rs.unallocated} · {money(rs.unallocatedAmount)}</div></div>
            <div><span className="text-stone-500">Pending STK</span><div className="font-semibold">{rs.pendingStk}</div></div>
            <div><span className="text-stone-500">Failed</span><div className="font-semibold">{rs.failed}</div></div>
            <div><span className="text-stone-500">Duplicate receipts</span><div className="font-semibold">{rs.duplicates}</div></div>
          </div>
        </div>
      )}
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Daraja</div>
          <p className="text-sm text-stone-500">
            {ready ? `${status.data.env} · ${status.data.shortcode} · ${status.data.type}` : "Connect Safaricom in Settings → M-Pesa."}
          </p>
        </div>
        <button className="btn-success" onClick={() => setStk(invoices[0] || null)} disabled={!invoices.length}>Send prompt</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            queryTx.mutate(String(fd.get("transId")));
          }}
        >
          <h3 className="font-semibold">Query receipt</h3>
          <input name="transId" placeholder="M-Pesa receipt" required />
          {queryTx.error && <p className="text-sm text-red-600">{(queryTx.error as Error).message}</p>}
          <button className="btn-ghost" disabled={queryTx.isPending}>Query</button>
        </form>
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            reverse.mutate({ transId: fd.get("transId"), amount: Number(fd.get("amount")), remarks: fd.get("remarks") });
          }}
        >
          <h3 className="font-semibold">Reverse payment</h3>
          <input name="transId" placeholder="Receipt" required />
          <input name="amount" type="number" placeholder="Amount" required />
          <input name="remarks" placeholder="Reason" />
          {reverse.error && <p className="text-sm text-red-600">{(reverse.error as Error).message}</p>}
          <button className="btn-danger" disabled={reverse.isPending}>Reverse</button>
        </form>
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            payout.mutate({ phone: fd.get("phone"), amount: Number(fd.get("amount")), remarks: fd.get("remarks"), command: payoutCommand });
          }}
        >
          <h3 className="font-semibold">Send money (B2C)</h3>
          <input name="phone" placeholder="07…" required />
          <input name="amount" type="number" placeholder="Amount" required />
          <MteSelect
            aria-label="Payment type"
            value={payoutCommand}
            onChange={setPayoutCommand}
            allowEmpty={false}
            options={[
              { value: "BusinessPayment", label: "Business payment" },
              { value: "SalaryPayment", label: "Salary" },
              { value: "PromotionPayment", label: "Promotion" },
            ]}
          />
          <input name="remarks" placeholder="Remarks" />
          {payout.error && <p className="text-sm text-red-600">{(payout.error as Error).message}</p>}
          <button className="btn-gold" disabled={payout.isPending}>Send</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={balance.isPending} onClick={() => balance.mutate()}>Request till balance</button>
        {status.data?.env === "sandbox" && invoices[0] && (
          <SandboxSimulate invoice={invoices[0]} />
        )}
        {balance.error && <p className="text-sm text-red-600">{(balance.error as Error).message}</p>}
        {balance.data && <p className="text-sm text-emerald-700">{(balance.data as any).message}</p>}
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Phone</th>
              <th>Amount</th>
              <th>Receipt</th>
              <th>Ref</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {txnRows.length === 0 && <EmptyRow cols={8} label="No M-Pesa activity yet." />}
            {txnPager.slice.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.createdAt).toLocaleString("en-GB")}</td>
                <td>{t.kind}</td>
                <td>{t.phone || "—"}</td>
                <td>{t.amount ? money(t.amount) : "—"}</td>
                <td>{t.receipt || "—"}</td>
                <td>{t.accountRef || t.description || "—"}</td>
                <td className={t.status === "SUCCESS" ? "text-emerald-700" : t.status === "UNMATCHED" ? "text-amber-600" : t.status === "FAILED" || t.status === "CANCELLED" ? "text-red-600" : "text-amber-600"}>{t.status}</td>
                <td>
                  {t.status === "UNMATCHED" && (
                    <button className="btn-ghost text-xs" onClick={() => setAlloc(t)}>Allocate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...txnPager} />
      {stk && (
        <StkPrompt
          invoiceId={stk.id}
          defaultPhone={stk.customer.phone || ""}
          defaultAmount={Math.round(stk.totals.balance)}
          onClose={() => setStk(null)}
        />
      )}
      {alloc && (
        <Modal onClose={() => { setAlloc(null); setAllocInvoiceId(""); }}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              allocate.mutate({ id: alloc.id, invoiceId: allocInvoiceId });
            }}
          >
            <h3 className="font-semibold">Allocate {alloc.receipt}</h3>
            <MteSelect
              aria-label="Invoice"
              value={allocInvoiceId}
              onChange={setAllocInvoiceId}
              options={allocInvoiceOptions}
              placeholder="Select invoice…"
              required
            />
            {allocate.error && <p className="text-sm text-red-600">{(allocate.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setAlloc(null)}>Cancel</button>
              <button className="btn-gold">Allocate</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SandboxSimulate({ invoice }: { invoice: Invoice }) {
  const qc = useQueryClient();
  const sim = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/mpesa/simulate", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mpesa-txns"] }),
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        sim.mutate({ invoiceId: invoice.id, amount: Number(fd.get("amount")), phone: fd.get("phone"), billRef: invoice.number.replace(/^INV-/, "") });
      }}
    >
      <input name="phone" placeholder="254708374149" className="w-40" />
      <input name="amount" type="number" placeholder="1" className="w-24" defaultValue={1} />
      <button className="btn-ghost" disabled={sim.isPending}>Sandbox paybill test</button>
      {sim.error && <span className="text-sm text-red-600">{(sim.error as Error).message}</span>}
    </form>
  );
}

function BankRec({ data, onDone }: { data: any; onDone: () => void }) {
  const add = useMutation({
    mutationFn: (body: any) => api(`/api/finance/banks/${body.bankId}/lines`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onDone,
  });
  const match = useMutation({
    mutationFn: (body: any) => api("/api/finance/banks/match", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onDone,
  });
  const unmatch = useMutation({
    mutationFn: (body: any) => api("/api/finance/banks/unmatch", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onDone,
  });
  if (!data) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><div className="text-xs uppercase text-stone-400">Book cash (GL)</div><div className="text-xl font-semibold">{money(data.bookCashGL)}</div></div>
      </div>
    <div className="grid gap-4 lg:grid-cols-2">
      {data.banks?.map((b: any) => (
        <div key={b.id} className="card space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-semibold">{b.name}</h3>
            <span className="text-xs text-stone-500">GL {money(b.bookBalanceGL)} · Stmt {money(b.statementTotal)} · Var {money(b.variance)}</span>
          </div>
          <form
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              add.mutate({ bankId: b.id, date: fd.get("date"), description: fd.get("description"), amount: Number(fd.get("amount")) });
              e.currentTarget.reset();
            }}
          >
            <input name="date" type="date" required />
            <input name="description" placeholder="Statement line" required />
            <input name="amount" type="number" step="0.01" placeholder="Amount (+ in / − out)" required />
            <button className="btn-gold col-span-3">Add statement line</button>
          </form>
          {b.lines.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between border-t pt-2 text-sm">
              <span>{l.date.slice(0, 10)} · {l.description}</span>
              <span className="flex items-center gap-2">
                <span className={l.matched ? "text-green-700" : ""}>{money(l.amount)} {l.matched ? "matched" : "open"}</span>
                {l.matched && (
                  <button className="btn-ghost text-xs" onClick={() => unmatch.mutate({ lineId: l.id })}>Unmatch</button>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="card">
        <h3 className="mb-2 font-semibold">Unmatched payments</h3>
        {(data.unmatchedPayments || []).length === 0 && <p className="text-sm text-stone-500">No open bank or M-Pesa payments.</p>}
        {(data.unmatchedPayments || []).map((p: any) => {
          const same = (data.banks || []).flatMap((b: any) => b.lines).filter((l: any) => !l.matched && Math.abs(l.amount - p.amount) < 1);
          return (
            <div key={p.id} className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span>{p.order.number} · {p.method} {p.reference || ""} · {money(p.amount)}</span>
              <button
                className="btn-ghost text-xs"
                disabled={!same[0]}
                onClick={() => match.mutate({ lineId: same[0].id, paymentId: p.id })}
              >
                {same[0] ? "Match same amount" : "Add a line first"}
              </button>
            </div>
          );
        })}
        {(data.unmatchedVendorPayments || []).length > 0 && (
          <p className="text-xs text-stone-500">{data.unmatchedVendorPayments.length} supplier payments recorded — statement import will link these in a later release.</p>
        )}
      </div>
    </div>
    </div>
  );
}

function PeriodClose({ rows, onDone }: { rows: any[]; onDone: () => void }) {
  const now = new Date();
  const close = useMutation({
    mutationFn: (body: any) => api("/api/finance/periods/close", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onDone,
  });
  const unlock = useMutation({
    mutationFn: (body: any) => api("/api/finance/periods/unlock", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onDone,
  });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        className="card space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          close.mutate({ year: Number(fd.get("year")), month: Number(fd.get("month")) });
        }}
      >
        <h3 className="font-semibold">Close a month</h3>
        <input name="year" type="number" defaultValue={now.getFullYear()} />
        <input name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} />
        <button className="btn-gold">Lock period</button>
      </form>
      <div className="card space-y-2">
        <h3 className="font-semibold">Periods</h3>
        {rows.length === 0 && <p className="text-sm text-stone-500">No periods closed yet.</p>}
        {rows.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span>{p.year}-{String(p.month).padStart(2, "0")} · {p.locked ? "Locked" : "Open"}</span>
            {p.locked && (
              <button className="btn-ghost text-xs" onClick={() => unlock.mutate({ year: p.year, month: p.month, reason: "Reopen" })}>Unlock</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ l, v, bold }: { l: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span>{l}</span>
      <span>{money(v)}</span>
    </div>
  );
}

function creditTotal(inv: Invoice) {
  return (inv.payments || []).filter((p) => p.method === "CREDIT_NOTE").reduce((s, p) => s + p.amount, 0);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOverdueInvoice(inv: Invoice) {
  if (inv.totals.balance <= 0.01) return false;
  if (inv.status === "OVERDUE") return true;
  return !!(inv.dueAt && new Date(inv.dueAt) < new Date());
}

function fmtDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function ksh(n?: number) {
  return `ksh ${Math.round(n || 0).toLocaleString("en-KE")}`;
}

function inDateRange(iso: string, when: string) {
  if (when === "all") return true;
  const d = new Date(iso);
  const start = startOfToday();
  if (when === "today") return d >= start;
  if (when === "week") {
    const w = new Date(start);
    w.setDate(w.getDate() - w.getDay());
    return d >= w;
  }
  if (when === "month") return d.getMonth() === start.getMonth() && d.getFullYear() === start.getFullYear();
  return true;
}
