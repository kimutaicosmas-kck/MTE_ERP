import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyRow, MteSelect, Pager, RowPdf, mapSelectOptions } from "../../components/ui";
import { api, money } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { usePager } from "../../lib/pager";

type Account = {
  code: string;
  name: string;
  type: string;
  parentCode?: string | null;
  detailType?: string | null;
  normalBalance?: string;
  isControl?: boolean;
  allowManualPosting?: boolean;
  isActive?: boolean;
};

const FINANCE_QUICK = [
  { label: "Collect receivables", hint: "Invoices & aging", to: "/finance?section=overview" },
  { label: "Pay suppliers", hint: "Bills & expenses", to: "/finance?section=ap" },
  { label: "Bank & M-Pesa", hint: "Payments in/out", to: "/finance?section=banking" },
  { label: "Ledger & reports", hint: "P&L, VAT, close", to: "/finance?section=reports" },
] as const;

export function FinanceOverview({
  dash,
  unpaid = 0,
  overdue = 0,
  overdueAmount = 0,
  onRecordPayment,
  onStk,
}: {
  dash?: Record<string, number | null>;
  unpaid?: number;
  overdue?: number;
  overdueAmount?: number;
  onRecordPayment?: () => void;
  onStk?: () => void;
}) {
  if (!dash) return <p className="text-sm text-stone-500">Loading finance dashboard…</p>;
  return (
    <div className="space-y-4">
      {(overdue > 0 || (dash.openBills ?? 0) > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {overdue > 0 && (
            <Link to="/finance?section=ar&tab=collections" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:border-amber-300">
              <strong>{overdue} overdue invoice{overdue === 1 ? "" : "s"}</strong>
              <div className="mt-0.5 text-amber-900/80">{money(overdueAmount)} outstanding — review aging</div>
            </Link>
          )}
          {(dash.openBills ?? 0) > 0 && (
            <Link to="/finance?section=ap" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 hover:border-sky-300">
              <strong>{dash.openBills} supplier bill{(dash.openBills ?? 0) === 1 ? "" : "s"} open</strong>
              <div className="mt-0.5 text-sky-900/80">{money(dash.accountsPayable ?? 0)} payable</div>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Cash & bank" value={money(dash.cashBalance ?? 0)} />
        <MetricCard label="Receivable" value={money(dash.accountsReceivable ?? 0)} sub={`${unpaid} open invoices`} />
        <MetricCard label="Payable" value={money(dash.accountsPayable ?? 0)} sub={`Working capital ${money(dash.workingCapital ?? 0)}`} />
        <MetricCard label="Net profit (YTD)" value={money(dash.netProfit ?? 0)} sub={`Revenue ${money(dash.monthlyRevenue ?? 0)}`} />
      </div>

      <div className="flex flex-wrap gap-2">
        {onRecordPayment && (
          <button type="button" className="btn-success module-btn-sm" onClick={onRecordPayment}>Record customer payment</button>
        )}
        {onStk && (
          <button type="button" className="btn-gold module-btn-sm" onClick={onStk}>Send M-Pesa STK</button>
        )}
        <Link to="/finance?section=ap" className="btn-ghost module-btn-sm">Pay a supplier bill</Link>
        <Link to="/finance?section=books&book=journals" className="btn-ghost module-btn-sm">Post journal entry</Link>
      </div>

      <div className="dash-insight-grid">
        {FINANCE_QUICK.map((link) => (
          <Link key={link.to} to={link.to} className="dash-insight-card group">
            <span className="font-semibold text-ink">{link.label}</span>
            <span className="mt-1 block text-xs text-stone-500">{link.hint}</span>
            <ChevronRight size={16} className="mt-2 text-stone-400 group-hover:text-gold" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-lg font-bold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

export function FinanceCoA() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ["finance-accounts"],
    queryFn: () => api<Account[]>("/api/finance/accounts"),
  });
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    return data.filter((a) => `${a.code} ${a.name} ${a.type}`.toLowerCase().includes(q.toLowerCase()));
  }, [data, q]);
  const pager = usePager(rows, q);
  const byParent = useMemo(() => {
    const map = new Map<string | null, Account[]>();
    for (const a of data) {
      const p = a.parentCode || null;
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(a);
    }
    for (const list of map.values()) list.sort((x, y) => x.code.localeCompare(y.code));
    return map;
  }, [data]);

  function CoARows({ parent, depth }: { parent: string | null; depth: number }) {
    const kids = byParent.get(parent) || [];
    return (
      <>
        {kids.map((a) => (
          <Fragment key={a.code}>
            <tr>
              <td className="font-mono text-xs" style={{ paddingLeft: `${depth * 1.25}rem` }}>{a.code}</td>
              <td>{a.name}</td>
              <td>{a.type}</td>
              <td>{a.isActive === false ? "Inactive" : "Active"}</td>
            </tr>
            <CoARows parent={a.code} depth={depth + 1} />
          </Fragment>
        ))}
      </>
    );
  }

  const sync = useMutation({
    mutationFn: () => api("/api/finance/accounts/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-accounts"] }),
  });

  return (
    <div className="space-y-3">
      <div className="suite-panel overflow-hidden">
        <div className="module-list-toolbar border-b border-stone-100 px-4 py-3 flex flex-wrap items-center gap-2">
          <label className="module-search-field flex-1 min-w-[200px]">
            <input className="min-w-0 flex-1" placeholder="Search accounts…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {user?.role === "SUPER_ADMIN" && (
            <button type="button" className="btn-ghost module-btn-sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
              Sync catalog
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="invoice suite-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!q && data.length === 0 && <EmptyRow cols={4} label="No accounts yet." />}
              {!q && <CoARows parent={null} depth={0} />}
              {q && pager.slice.length === 0 && <EmptyRow cols={4} label="No accounts match." />}
              {q && pager.slice.map((a) => (
                <tr key={a.code}>
                  <td className="font-mono text-xs">{a.code}</td>
                  <td>{a.name}</td>
                  <td>{a.type}</td>
                  <td>{a.isActive === false ? "Inactive" : "Active"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q ? <Pager {...pager} /> : null}
      </div>
    </div>
  );
}

type JournalLine = { accountCode: string; debit?: number; credit?: number };

export function FinanceJournalForm() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["finance-accounts"], queryFn: () => api<Account[]>("/api/finance/accounts") });
  const { data: journals = [] } = useQuery({ queryKey: ["jnl"], queryFn: () => api<any[]>("/api/finance/journals") });
  const [memo, setMemo] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: "", debit: 0, credit: 0 },
    { accountCode: "", debit: 0, credit: 0 },
  ]);
  const accountOptions = useMemo(
    () =>
      mapSelectOptions(
        accounts.filter((a) => a.allowManualPosting !== false),
        (a) => a.code,
        (a) => `${a.code} ${a.name}`,
      ),
    [accounts],
  );
  const post = useMutation({
    mutationFn: () =>
      api("/api/finance/journals", {
        method: "POST",
        body: JSON.stringify({
          memo,
          reason,
          lines: lines.filter((l) => l.accountCode).map((l) => ({
            accountCode: l.accountCode,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jnl"] });
      setMemo("");
      setReason("");
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="suite-panel space-y-3 p-4">
        <h2 className="text-sm font-semibold text-ink">New journal entry</h2>
        <input placeholder="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <input placeholder="Reason (for approval)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <MteSelect
              aria-label="GL account"
              value={line.accountCode}
              onChange={(accountCode) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, accountCode } : l)))}
              options={accountOptions}
              placeholder="Account"
            />
            <input type="number" placeholder="Debit" value={line.debit || ""} onChange={(e) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, debit: Number(e.target.value) } : l)))} />
            <input type="number" placeholder="Credit" value={line.credit || ""} onChange={(e) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, credit: Number(e.target.value) } : l)))} />
          </div>
        ))}
        <button type="button" className="btn-ghost text-sm" onClick={() => setLines((prev) => [...prev, { accountCode: "", debit: 0, credit: 0 }])}>
          <Plus size={14} /> Add line
        </button>
        <button type="button" className="btn-gold" disabled={post.isPending || !memo} onClick={() => post.mutate()}>
          {post.isPending ? "Submitting…" : "Post journal"}
        </button>
        {post.error && <p className="text-sm text-red-600">{(post.error as Error).message}</p>}
      </div>
      <div className="space-y-3">
        {journals.length === 0 && <p className="text-sm text-stone-500">No journals posted yet.</p>}
        {journals.map((j) => (
          <div key={j.id} className="suite-panel p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{j.memo}</div>
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
    </div>
  );
}

export function FinanceLedger() {
  const { data: accounts = [] } = useQuery({ queryKey: ["finance-accounts"], queryFn: () => api<Account[]>("/api/finance/accounts") });
  const accountOptions = useMemo(
    () => mapSelectOptions(accounts, (a) => a.code, (a) => a.name, (a) => a.code),
    [accounts],
  );
  const [code, setCode] = useState("");
  const ledger = useQuery({
    queryKey: ["finance-ledger", code],
    queryFn: () => api<{ account: Account; rows: any[]; balance: number }>(`/api/finance/ledger?account=${encodeURIComponent(code)}`),
    enabled: Boolean(code),
  });

  return (
    <div className="suite-panel module-list-suite overflow-hidden">
      <div className="module-list-toolbar">
        <div className="module-toolbar-bottom px-4 py-3">
          <div className="module-filter-group module-filter-group-active">
            <span className="module-filter-group-label">Account</span>
            <div className="module-filter-controls">
              <MteSelect
                className="module-select min-w-[240px]"
                aria-label="GL account"
                value={code}
                onChange={setCode}
                options={accountOptions}
                placeholder="Select account…"
              />
            </div>
          </div>
        </div>
      </div>
      {!code && <p className="px-4 pb-4 text-sm text-stone-500">Choose an account to view running balance.</p>}
      {code && ledger.isLoading && <p className="px-4 pb-4 text-sm text-stone-500">Loading ledger…</p>}
      {ledger.data && (
        <div className="table-wrap">
          <table className="invoice suite-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Memo</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.data.rows.length === 0 && <EmptyRow cols={5} label="No postings on this account." />}
              {ledger.data.rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.date).toLocaleDateString()}</td>
                  <td>{r.memo}</td>
                  <td className="num">{r.debit ? money(r.debit) : "—"}</td>
                  <td className="num">{r.credit ? money(r.credit) : "—"}</td>
                  <td className="num font-medium">{money(r.balance)}</td>
                </tr>
              ))}
              {ledger.data.rows.length > 0 && (
                <tr className="font-semibold">
                  <td colSpan={4}>Closing balance</td>
                  <td className="num">{money(ledger.data.balance)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
