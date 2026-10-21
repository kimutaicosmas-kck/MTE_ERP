import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, CreditCard, FileDown, FileSpreadsheet, Plus, RefreshCw, Search, UserCheck, Users, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CaptureField } from "../components/CaptureField";
import { ImportButton } from "../components/ImportButton";
import { MobileFilters } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { EmptyRow, ExportButtons, Modal, MteSelect, PageHeader, Pager, Stat, StatGrid, Tabs, mapSelectOptions, useCreateOpen, useQueryState } from "../components/ui";
import { api, downloadCustomerStatement, money } from "../lib/api";
import { downloadCsv, printTable } from "../lib/export";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";

type Tab = "directory" | "balances";

type Customer = {
  id: string;
  customerNumber?: string | null;
  name: string;
  phone?: string;
  email?: string;
  kraPin?: string;
  creditLimit: number;
  paymentTerms: string;
  notes?: string;
  outstanding: number;
};

type BalanceRow = { id: string; name: string; invoiced: number; paid: number; credit: number; balance: number };
type BalanceReport = {
  asOf: string;
  salespersonId: string | null;
  salespeople: { id: string; name: string }[];
  total: number;
  rows: BalanceRow[];
};

export function Customers() {
  const [params] = useSearchParams();
  const [tabRaw, setTabRaw] = useQueryState("tab", "directory");
  const tab = (tabRaw === "balances" ? "balances" : "directory") as Tab;
  const setTab = (next: Tab) => setTabRaw(next);
  const [statementId, setStatementId] = useState<string | null>(null);
  useEffect(() => {
    if (params.get("new") === "1") setTab("directory");
  }, [params]);
  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Directory" title="Customers" />
      {tab === "directory"
        ? <CustomerDirectory tab={tab} setTab={setTab} onStatement={setStatementId} />
        : <BalanceSummary tab={tab} setTab={setTab} onStatement={setStatementId} />}
      {statementId && <CustomerStatement id={statementId} onClose={() => setStatementId(null)} />}
    </div>
  );
}

function CustomerTabs({ tab, setTab, customers, owing }: { tab: Tab; setTab: (t: Tab) => void; customers?: number; owing?: number }) {
  return (
    <Tabs
      value={tab}
      onChange={setTab}
      items={[
        { id: "directory", label: "Customers", count: customers },
        { id: "balances", label: "Balance summary", count: owing },
      ]}
    />
  );
}

function CustomerDirectory({ tab, setTab, onStatement }: { tab: Tab; setTab: (t: Tab) => void; onStatement: (id: string) => void }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["customers"], queryFn: () => api<Customer[]>("/api/customers") });
  const [open, setOpen] = useCreateOpen();
  const [edit, setEdit] = useState<Customer | null>(null);
  const [q, setQ] = useQueryState("q", "");
  const [balance, setBalance] = useQueryState("balance", "");
  const [terms, setTerms] = useQueryState("terms", "");

  const rows = useMemo(() => {
    return data.filter((c) => {
      if (!`${c.customerNumber || ""} ${c.name} ${c.phone || ""} ${c.kraPin || ""} ${c.email || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (balance === "owing" && c.outstanding <= 1) return false;
      if (balance === "clear" && c.outstanding > 1) return false;
      if (terms === "credit" && !(c.creditLimit > 0)) return false;
      else if (terms && terms !== "credit" && c.paymentTerms !== terms) return false;
      return true;
    });
  }, [data, q, balance, terms]);
  const listing = useListSort(rows, [
    { id: "name", label: "Name A–Z", get: (c) => c.name, dir: "asc" },
    { id: "balance", label: "Highest balance", get: (c) => c.outstanding, dir: "desc" },
  ], "name");
  const pager = usePager(listing.sorted, `${q}|${listing.sort}`);

  const stats = useMemo(() => {
    const outstanding = data.reduce((s, c) => s + (c.outstanding || 0), 0);
    const credit = data.filter((c) => (c.creditLimit || 0) > 0).length;
    const owing = data.filter((c) => (c.outstanding || 0) > 1).length;
    const clear = data.filter((c) => (c.outstanding || 0) <= 1).length;
    return { count: data.length, credit, owing, outstanding, clear };
  }, [data]);

  const headers = ["Customer #", "Name", "Phone", "PIN", "Terms", "Credit", "Outstanding"];
  const filtersActive = Boolean(q || balance || terms);

  return (
    <div className="space-y-4">
      <StatGrid cols={6}>
        <Stat icon={Users} label="Customers" value={stats.count} series={data.slice(0, 10).map((c) => Math.max(c.outstanding, 0))} chart="bars" to="/customers?tab=directory" />
        <Stat icon={CreditCard} label="On credit terms" value={stats.credit} chart="ring" max={stats.count || 1} to="/customers?tab=directory&terms=credit" />
        <Stat icon={UserCheck} label="With balance" value={stats.owing} chart="ring" max={stats.count || 1} to="/customers?tab=directory&balance=owing" />
        <Stat icon={Wallet} label="Outstanding" value={money(stats.outstanding)} series={data.slice().sort((a, b) => b.outstanding - a.outstanding).slice(0, 8).map((c) => c.outstanding)} chart="area" hint={`${stats.owing} accounts`} to="/customers?tab=balances" />
        <Stat icon={UserCheck} label="Clear accounts" value={stats.clear} chart="ring" max={stats.count || 1} to="/customers?tab=directory&balance=clear" />
        <Stat icon={CreditCard} label="Avg balance" value={stats.owing ? money(Math.round(stats.outstanding / stats.owing)) : money(0)} chart="spark" series={data.filter((c) => c.outstanding > 1).slice(0, 8).map((c) => c.outstanding)} to="/customers?tab=balances" />
      </StatGrid>
      <CustomerTabs tab={tab} setTab={setTab} customers={stats.count} owing={stats.owing} />
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input className="min-w-0 flex-1" placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <MobileFilters
            title="Filter customers"
            onClear={() => { setQ(""); setBalance(""); setTerms(""); }}
            fields={[
              {
                kind: "chips",
                label: "Balance",
                value: balance || "all",
                onChange: (v) => setBalance(v === "all" ? "" : v),
                options: [
                  { value: "all", label: "All" },
                  { value: "owing", label: "With balance" },
                  { value: "clear", label: "Clear" },
                ],
              },
              {
                kind: "select",
                label: "Terms",
                value: terms,
                onChange: setTerms,
                options: [
                  { value: "", label: "All terms" },
                  ...[...new Set(data.map((c) => c.paymentTerms).filter(Boolean))].sort().map((t) => ({ value: t, label: t })),
                ],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={balance} onChange={(e) => setBalance(e.target.value)} aria-label="Balance">
                  <option value="">All balances</option>
                  <option value="owing">With balance</option>
                  <option value="clear">Clear</option>
                </select>
                <select className="module-select" value={terms} onChange={(e) => setTerms(e.target.value)} aria-label="Terms">
                  <option value="">All terms</option>
                  {[...new Set(data.map((c) => c.paymentTerms).filter(Boolean))].sort().map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={() => { setQ(""); setBalance(""); setTerms(""); }}>
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
              <ImportButton kind="customers" />
              <ExportButtons
                title="Customers"
                filename="customers.csv"
                headers={headers}
                rows={rows.map((c) => [c.name, c.phone || "", c.kraPin || "", c.paymentTerms, String(c.creditLimit), String(c.outstanding)])}
              />
              <button type="button" className="btn-gold module-btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> New customer</button>
            </div>
          </div>
        </div>
      <Register
        rows={listing.sorted}
        pager={pager}
        getId={(c) => c.id}
        onOpen={(c) => onStatement(c.id)}
        empty={{ title: "No customers yet — Create one", actionLabel: "Create one", onAction: () => setOpen(true) }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (c) => c.name,
          subtitle: (c) => c.phone || c.email || "—",
          status: (c) => c.outstanding > 1 ? <span className="badge bg-amber-100 text-amber-800">Balance</span> : <span className="badge bg-emerald-100 text-emerald-800">Clear</span>,
          fields: [
            { label: "Terms", value: (c) => c.paymentTerms },
            { label: "Outstanding", value: (c) => money(c.outstanding), align: "right" },
          ],
        }}
        action={<button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New customer</button>}
      >
      <div className="table-wrap">
        <table className="invoice suite-table">
          <thead><tr><th>Customer #</th><th>Name</th><th>Phone</th><th>PIN</th><th>Terms</th><th className="num">Credit</th><th className="num">Outstanding</th><th>Statement</th><th></th></tr></thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={9} label="No customers yet — Create one" actionLabel="Create one" onAction={() => setOpen(true)} />}
            {pager.slice.map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => onStatement(c.id)}>
                <td className="font-mono text-xs text-stone-600">{c.customerNumber || "—"}</td>
                <td>
                  <button className="font-medium text-ink hover:underline" onClick={() => onStatement(c.id)}>{c.name}</button>
                  {c.email && <div className="text-xs text-stone-500">{c.email}</div>}
                </td>
                <td>{c.phone || "—"}</td>
                <td>{c.kraPin || "—"}</td>
                <td>{c.paymentTerms}</td>
                <td className="num">{money(c.creditLimit)}</td>
                <td className="num">{money(c.outstanding)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1">
                    <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => downloadCustomerStatement(c.id)}><FileDown size={14} /> PDF</button>
                    <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => exportCustomerExcel(c.id)}><FileSpreadsheet size={14} /> Excel</button>
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn-ghost text-xs" onClick={() => setEdit(c)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Register>
      </section>
      {open && <CustomerForm onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["customers"] })} />}
      {edit && <CustomerForm customer={edit} onClose={() => setEdit(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["customers"] })} />}
    </div>
  );
}

function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customer
        ? api(`/api/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/api/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      onSaved();
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
            name: fd.get("name"),
            phone: fd.get("phone"),
            email: fd.get("email"),
            kraPin: fd.get("kraPin"),
            creditLimit: Number(fd.get("creditLimit") || 0),
            paymentTerms: fd.get("paymentTerms"),
            notes: fd.get("notes"),
          });
        }}
      >
        <h2 className="text-xl font-semibold tracking-tight">{customer ? "Edit customer" : "New customer"}</h2>
        <input name="name" placeholder="Name" defaultValue={customer?.name} required />
        <input name="phone" placeholder="Phone" defaultValue={customer?.phone || ""} />
        <input name="email" placeholder="Email" defaultValue={customer?.email || ""} />
        <input name="kraPin" placeholder="KRA PIN" defaultValue={customer?.kraPin || ""} />
        <input name="creditLimit" type="number" placeholder="Credit limit" defaultValue={customer?.creditLimit || 0} />
        <input name="paymentTerms" placeholder="Terms" defaultValue={customer?.paymentTerms || "COD"} />
        <textarea name="notes" placeholder="Notes" defaultValue={customer?.notes || ""} rows={3} />
        {customer && <CaptureField kind="customer" refId={customer.id} label="Customer document" />}
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          {customer && (
            <button
              type="button"
              className="btn-danger mr-auto"
              onClick={() => {
                const reason = prompt("Reason to remove this customer") || "";
                if (!reason) return;
                api(`/api/customers/${customer.id}`, { method: "DELETE", body: JSON.stringify({ reason }) })
                  .then(() => { onSaved(); onClose(); })
                  .catch((err) => alert((err as Error).message));
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" disabled={save.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function CustomerStatement({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api<any>(`/api/customers/${id}`),
  });
  return (
    <Modal onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold">Statement</p>
            <h2 className="text-2xl font-semibold tracking-tight">{data?.name || "Customer"}</h2>
            <p className="text-sm text-stone-500">
              {data?.customerNumber ? `${data.customerNumber} · ` : ""}
              {data?.phone || "—"} · {data?.paymentTerms} · Credit {data ? money(data.creditLimit) : ""}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {data && (
              <>
                <button className="btn-ghost" onClick={() => downloadCustomerStatement(id)}><FileDown size={14} /> PDF</button>
                <button className="btn-ghost" onClick={() => exportStatementExcel(data)}><FileSpreadsheet size={14} /> Excel</button>
              </>
            )}
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
        {!data && !error && <p className="text-sm text-stone-500">Loading…</p>}
        {data && (
          <>
            <div className="flex justify-between text-sm font-semibold">
              <span>Outstanding</span>
              <span className={data.outstanding > 1 ? "text-red-700" : ""}>{money(data.outstanding)}</span>
            </div>
            <div className="table-wrap">
              <table className="invoice">
                <thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Paid</th><th>Credit</th><th>Balance</th></tr></thead>
                <tbody>
                  {(data.invoices || []).length === 0 && <EmptyRow cols={6} label="No invoices yet. Confirm a sales order first." />}
                  {(data.invoices || []).map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="font-medium">{inv.number}<div className="text-xs text-stone-400">{inv.orderNumber}</div></td>
                      <td>{fmtDate(inv.issuedAt)}</td>
                      <td>{money(inv.totals.gross)}</td>
                      <td>{money(inv.totals.paid)}</td>
                      <td>{inv.totals.credit ? money(inv.totals.credit) : "—"}</td>
                      <td className={inv.totals.balance > 0.01 ? "text-amber-700" : "text-emerald-700"}>{money(inv.totals.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Repayment schedule</h3>
              <p className="mb-2 text-xs text-stone-500">Expected collection dates from invoice due dates and open balances.</p>
              <div className="table-wrap">
                <table className="invoice">
                  <thead><tr><th>Invoice</th><th>Due date</th><th className="num">Balance due</th><th>Status</th></tr></thead>
                  <tbody>
                    {(data.invoices || []).filter((inv: { totals: { balance: number } }) => inv.totals.balance > 0.01).length === 0 && (
                      <EmptyRow cols={4} label="No open balance — nothing scheduled." />
                    )}
                    {(data.invoices || [])
                      .filter((inv: { totals: { balance: number } }) => inv.totals.balance > 0.01)
                      .map((inv: { id: string; number: string; dueAt?: string; issuedAt: string; status: string; totals: { balance: number } }) => (
                        <tr key={inv.id}>
                          <td className="font-medium">{inv.number}</td>
                          <td>{fmtDate(inv.dueAt || inv.issuedAt)}</td>
                          <td className="num text-amber-800">{money(inv.totals.balance)}</td>
                          <td>{inv.status}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function BalanceSummary({ tab, setTab, onStatement }: { tab: Tab; setTab: (t: Tab) => void; onStatement: (id: string) => void }) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const [salespersonId, setSalespersonId] = useState("");
  const [applied, setApplied] = useState({ asOf: today, salespersonId: "" });

  const report = useQuery({
    queryKey: ["customer-balances", applied.asOf, applied.salespersonId],
    queryFn: () => api<BalanceReport>(`/api/reports/customer-balances?asOf=${applied.asOf}${applied.salespersonId ? `&salespersonId=${applied.salespersonId}` : ""}`),
  });

  const rows = report.data?.rows || [];
  const pager = usePager(rows, `${applied.asOf}|${applied.salespersonId}`);
  const salespeople = report.data?.salespeople || [];
  const dateLabel = formatAsOf(applied.asOf);
  const headers = ["Customer", dateLabel];
  const exportRows = rows.map((r) => [r.name, ksh(r.balance)]);

  return (
    <div className="space-y-4">
      <StatGrid cols={6}>
        <Stat icon={Users} label="Customers" value={rows.length} series={rows.slice(0, 10).map((r) => r.balance)} chart="bars" to="/customers?tab=balances" />
        <Stat icon={Calendar} label="As of" value={dateLabel} to="/customers?tab=balances" />
        <Stat icon={Wallet} label="Total balance" value={report.data ? ksh(report.data.total) : "—"} series={rows.slice().sort((a, b) => b.balance - a.balance).slice(0, 8).map((r) => r.balance)} chart="area" to="/customers?tab=balances" />
        <Stat icon={UserCheck} label="Sales employees" value={salespeople.length} chart="ring" max={Math.max(rows.length, salespeople.length, 1)} to="/hr?tab=employees&role=SALES" />
        <Stat icon={UserCheck} label="With balance" value={rows.filter((r) => r.balance > 1).length} chart="ring" max={rows.length || 1} to="/customers?tab=balances" />
        <Stat icon={Wallet} label="Largest balance" value={rows.length ? ksh(Math.max(...rows.map((r) => r.balance))) : "—"} chart="spark" series={rows.slice().sort((a, b) => b.balance - a.balance).slice(0, 6).map((r) => r.balance)} to="/customers?tab=balances" />
      </StatGrid>
      <CustomerTabs tab={tab} setTab={setTab} customers={rows.length} owing={rows.filter((r) => r.balance > 1).length} />
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Customer balance summary</h2>
        </div>
      </div>
      <div className="toolbar px-6 py-4">
        <input type="date" className="w-auto rounded-full" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        {user?.role !== "SALES" && (
          <MteSelect
            className="w-auto min-w-[200px]"
            aria-label="Sales employee"
            value={salespersonId}
            onChange={setSalespersonId}
            placeholder="All sales employees"
            options={mapSelectOptions(salespeople, (s) => s.id, (s) => s.name)}
          />
        )}
        <button className="btn-ghost rounded-full" onClick={() => setApplied({ asOf, salespersonId })}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn-ghost rounded-full" onClick={() => printTable("Customer balance summary", headers, exportRows)}>
          <FileDown size={14} /> PDF
        </button>
        <button className="btn-ghost rounded-full" onClick={() => downloadCsv("customer-balances.csv", [headers, ...exportRows])}>
          <FileSpreadsheet size={14} /> Excel
        </button>
      </div>
      {report.error && <p className="px-6 pb-3 text-sm text-red-600">{(report.error as Error).message}</p>}
      <MobileFilters
        title="Filter balances"
        onClear={() => {
          setAsOf(today);
          setSalespersonId("");
          setApplied({ asOf: today, salespersonId: "" });
        }}
        fields={[
          { kind: "date", label: "As of", value: asOf, onChange: (v) => { setAsOf(v); setApplied((cur) => ({ ...cur, asOf: v })); } },
          ...(user?.role !== "SALES" ? [{
            kind: "select" as const,
            label: "Salesperson",
            value: salespersonId,
            onChange: (v: string) => { setSalespersonId(v); setApplied((cur) => ({ ...cur, salespersonId: v })); },
            options: [{ value: "", label: "All sales employees" }, ...salespeople.map((s) => ({ value: s.id, label: s.name }))],
          }] : []),
        ]}
      />
      <div className="table-wrap mx-2 mb-4">
        <table className="invoice compact">
          <thead>
            <tr>
              <th>Customer</th>
              <th className="text-right">{dateLabel}</th>
            </tr>
          </thead>
          <tbody>
            {report.isLoading && <EmptyRow cols={2} label="Loading balances…" />}
            {!report.isLoading && rows.length === 0 && <EmptyRow cols={2} label="No customers with a ledger balance on this date." />}
            {pager.slice.map((r) => (
              <tr key={r.id}>
                <td className="uppercase tracking-wide">
                  <button className="font-medium text-ink hover:underline" onClick={() => onStatement(r.id)}>{r.name}</button>
                </td>
                <td className="text-right font-medium">{ksh(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 pb-4"><Pager {...pager} /></div>
    </div>
    </div>
  );
}

async function exportCustomerExcel(id: string) {
  const data = await api<any>(`/api/customers/${id}`);
  exportStatementExcel(data);
}

function exportStatementExcel(data: any) {
  const headers = ["Invoice", "Order", "Date", "Total", "Paid", "Credit", "Balance"];
  const rows = (data.invoices || []).map((inv: any) => [
    inv.number,
    inv.orderNumber || "",
    fmtDate(inv.issuedAt),
    String(inv.totals.gross),
    String(inv.totals.paid),
    String(inv.totals.credit || 0),
    String(inv.totals.balance),
  ]);
  rows.push(["", "", "Outstanding", "", "", "", String(data.outstanding || 0)]);
  const slug = String(data.name || "customer").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  downloadCsv(`${slug}-statement.csv`, [headers, ...rows]);
}

function fmtDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatAsOf(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase().replace(/ /g, "");
}

function ksh(n: number) {
  return `Ksh ${Math.round(n).toLocaleString("en-KE")}`;
}
