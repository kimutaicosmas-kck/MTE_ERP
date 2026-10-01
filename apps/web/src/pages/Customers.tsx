import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CaptureField } from "../components/CaptureField";
import { ImportButton } from "../components/ImportButton";
import { EmptyRow, ExportButtons, Modal, PageHeader, Pager, Stat, StatGrid, Tabs, useCreateOpen } from "../components/ui";
import { api, downloadCustomerStatement, money } from "../lib/api";
import { downloadCsv, printTable } from "../lib/export";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";

type Tab = "directory" | "balances";

type Customer = {
  id: string;
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
  const [tab, setTab] = useState<Tab>("directory");
  const [statementId, setStatementId] = useState<string | null>(null);
  useEffect(() => {
    if (params.get("new") === "1") setTab("directory");
  }, [params]);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Directory" title="Customers" />
      {tab === "directory"
        ? <CustomerDirectory tab={tab} setTab={setTab} onStatement={setStatementId} />
        : <BalanceSummary tab={tab} setTab={setTab} onStatement={setStatementId} />}
      {statementId && <CustomerStatement id={statementId} onClose={() => setStatementId(null)} />}
    </div>
  );
}

function CustomerTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <Tabs
      value={tab}
      onChange={setTab}
      items={[
        { id: "directory", label: "Customers" },
        { id: "balances", label: "Balance summary" },
      ]}
    />
  );
}

function CustomerDirectory({ tab, setTab, onStatement }: { tab: Tab; setTab: (t: Tab) => void; onStatement: (id: string) => void }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["customers"], queryFn: () => api<Customer[]>("/api/customers") });
  const [open, setOpen] = useCreateOpen();
  const [edit, setEdit] = useState<Customer | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return data.filter((c) => `${c.name} ${c.phone || ""} ${c.kraPin || ""} ${c.email || ""}`.toLowerCase().includes(q.toLowerCase()));
  }, [data, q]);
  const pager = usePager(rows, q);

  const stats = useMemo(() => {
    const outstanding = data.reduce((s, c) => s + (c.outstanding || 0), 0);
    const credit = data.filter((c) => (c.creditLimit || 0) > 0).length;
    const owing = data.filter((c) => (c.outstanding || 0) > 1).length;
    return { count: data.length, credit, owing, outstanding };
  }, [data]);

  const headers = ["Name", "Phone", "PIN", "Terms", "Credit", "Outstanding"];

  return (
    <div className="space-y-5">
      <StatGrid>
        <Stat label="Customers" value={stats.count} />
        <Stat label="On credit terms" value={stats.credit} />
        <Stat label="With balance" value={stats.owing} />
        <Stat label="Outstanding" value={money(stats.outstanding)} />
      </StatGrid>
      <CustomerTabs tab={tab} setTab={setTab} />
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
        <ImportButton kind="customers" />
        <ExportButtons
          title="Customers"
          filename="customers.csv"
          headers={headers}
          rows={rows.map((c) => [c.name, c.phone || "", c.kraPin || "", c.paymentTerms, String(c.creditLimit), String(c.outstanding)])}
        />
        <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New customer</button>
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Name</th><th>Phone</th><th>PIN</th><th>Terms</th><th>Credit</th><th>Outstanding</th><th>Statement</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={8} label="No customers match. Import a CSV or add one." />}
            {pager.slice.map((c) => (
              <tr key={c.id}>
                <td>
                  <button className="font-medium text-ink hover:underline" onClick={() => onStatement(c.id)}>{c.name}</button>
                  {c.email && <div className="text-xs text-stone-500">{c.email}</div>}
                </td>
                <td>{c.phone || "—"}</td>
                <td>{c.kraPin || "—"}</td>
                <td>{c.paymentTerms}</td>
                <td>{money(c.creditLimit)}</td>
                <td className={c.outstanding > 1 ? "text-red-700" : ""}>{money(c.outstanding)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => downloadCustomerStatement(c.id)}><FileDown size={14} /> PDF</button>
                    <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => exportCustomerExcel(c.id)}><FileSpreadsheet size={14} /> Excel</button>
                  </div>
                </td>
                <td>
                  <button className="btn-ghost text-xs" onClick={() => setEdit(c)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
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
        <h2 className="font-serif text-2xl">{customer ? "Edit customer" : "New customer"}</h2>
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
            <h2 className="font-serif text-3xl">{data?.name || "Customer"}</h2>
            <p className="text-sm text-stone-500">{data?.phone || "—"} · {data?.paymentTerms} · Credit {data ? money(data.creditLimit) : ""}</p>
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
    <div className="space-y-5">
      <StatGrid>
        <Stat label="Customers" value={rows.length} />
        <Stat label="As of" value={dateLabel} />
        <Stat label="Total balance" value={report.data ? ksh(report.data.total) : "—"} />
        <Stat label="Sales people" value={salespeople.length} />
      </StatGrid>
      <CustomerTabs tab={tab} setTab={setTab} />
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Customer balance summary</h2>
        </div>
      </div>
      <div className="toolbar px-6 py-4">
        <input type="date" className="w-auto rounded-full" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        {user?.role !== "SALES" && (
          <select className="w-auto min-w-[200px] rounded-full" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
            <option value="">All sales people</option>
            {salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
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
