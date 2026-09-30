import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, money } from "../lib/api";

export function Finance() {
  const [tab, setTab] = useState<"tb" | "pnl" | "bs" | "vat" | "exp" | "jnl" | "bank" | "period">("tb");
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => api<any>("/api/finance/banks") });
  const periods = useQuery({ queryKey: ["periods"], queryFn: () => api<any[]>("/api/finance/periods") });
  const tb = useQuery({ queryKey: ["tb"], queryFn: () => api<any>("/api/finance/trial-balance") });
  const pnl = useQuery({ queryKey: ["pnl"], queryFn: () => api<any>("/api/finance/pnl") });
  const bs = useQuery({ queryKey: ["bs"], queryFn: () => api<any>("/api/finance/balance-sheet") });
  const vat = useQuery({ queryKey: ["vat"], queryFn: () => api<any>("/api/finance/vat") });
  const exp = useQuery({ queryKey: ["exp"], queryFn: () => api<any[]>("/api/finance/expenses") });
  const jnl = useQuery({ queryKey: ["jnl"], queryFn: () => api<any[]>("/api/finance/journals") });
  const qc = useQueryClient();
  const addExp = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/finance/expenses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Replaces Sage / QuickBooks</p>
        <h1 className="font-serif text-4xl">Books</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["tb", "Trial balance"],
          ["pnl", "P&L"],
          ["bs", "Balance sheet"],
          ["vat", "VAT return"],
          ["exp", "Expenses"],
          ["jnl", "Journals"],
          ["bank", "Bank rec"],
          ["period", "Period close"],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? "btn" : "btn-ghost"} onClick={() => setTab(k as any)}>{l}</button>
        ))}
      </div>

      {tab === "tb" && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
            <tbody>
              {tb.data?.rows.map((r: any) => (
                <tr key={r.code}><td>{r.code}</td><td>{r.name}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td></tr>
              ))}
              <tr className="font-semibold"><td></td><td>Total</td><td>{money(tb.data?.totalDebit)}</td><td>{money(tb.data?.totalCredit)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {tab === "pnl" && pnl.data && (
        <div className="card max-w-md space-y-2">
          <Row l="Income" v={pnl.data.income} />
          <Row l="COGS" v={pnl.data.cogs} />
          <Row l="Gross profit" v={pnl.data.gross} />
          <Row l="Expenses" v={pnl.data.expenses} />
          <Row l="Net profit" v={pnl.data.net} bold />
        </div>
      )}
      {tab === "bs" && bs.data && (
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
      {tab === "vat" && vat.data && (
        <div className="card max-w-md space-y-2">
          <Row l="Output VAT" v={vat.data.output} />
          <Row l="Input VAT" v={vat.data.input} />
          <Row l="Net payable" v={vat.data.payable} bold />
        </div>
      )}
      {tab === "exp" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <form
            className="card space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              addExp.mutate({
                category: fd.get("category"),
                amount: Number(fd.get("amount")),
                vat: Number(fd.get("vat") || 0),
                date: fd.get("date"),
                notes: fd.get("notes"),
              });
              e.currentTarget.reset();
            }}
          >
            <h3 className="font-semibold">Record expense</h3>
            <input name="category" placeholder="Category" required />
            <input name="amount" type="number" placeholder="Amount (ex VAT)" required />
            <input name="vat" type="number" placeholder="VAT" />
            <input name="date" type="date" />
            <input name="notes" placeholder="Notes" />
            <button className="btn">Post</button>
          </form>
          <div className="table-wrap lg:col-span-2">
            <table className="data">
              <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>VAT</th></tr></thead>
              <tbody>
                {exp.data?.map((e) => (
                  <tr key={e.id}><td>{e.date.slice(0, 10)}</td><td>{e.category}</td><td>{money(e.amount)}</td><td>{money(e.vat)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "bank" && <BankRec data={banks.data} onDone={() => qc.invalidateQueries({ queryKey: ["banks"] })} />}
      {tab === "period" && <PeriodClose rows={periods.data || []} onDone={() => qc.invalidateQueries({ queryKey: ["periods"] })} />}
      {tab === "jnl" && (
        <div className="space-y-3">
          {jnl.data?.map((j) => (
            <div key={j.id} className="card text-sm">
              <div className="font-semibold">{j.memo} {j.reversed && <span className="badge bg-stone-200">reversed</span>}</div>
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
      )}
    </div>
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
    <div className="grid gap-4 lg:grid-cols-2">
      {data.banks?.map((b: any) => (
        <div key={b.id} className="card space-y-3">
          <h3 className="font-semibold">{b.name}</h3>
          <form
            className="grid grid-cols-3 gap-2"
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
            <button className="btn col-span-3">Add statement line</button>
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
        <p className="text-xs text-stone-500">Add the bank or M-Pesa statement line, then match it to a payment of the same amount.</p>
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
        <p className="text-sm text-stone-500">Super Admin only. Closed months refuse silent edits.</p>
        <input name="year" type="number" defaultValue={now.getFullYear()} />
        <input name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} />
        <button className="btn">Lock period</button>
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
