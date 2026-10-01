import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { StkPrompt } from "../components/StkPrompt";
import { EmptyRow, ExportButtons, Modal, PageHeader, Pager, RowPdf, Stat, StatGrid, Tabs } from "../components/ui";
import { api, downloadPdf, money } from "../lib/api";
import { usePager } from "../lib/pager";

type Tab = "invoices" | "payments" | "mpesa" | "bills" | "expenses" | "journals" | "accounts" | "reconciliation";
type AccountView = "tb" | "pnl" | "bs" | "vat" | "period";

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
  totals: { net: number; vat: number; gross: number; paid: number; credit: number; balance: number };
};

export function Finance() {
  const [tab, setTab] = useState<Tab>("invoices");
  const [modal, setModal] = useState<"pay" | "credit" | "stk" | null>(null);
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api<Invoice[]>("/api/finance/invoices") });

  const list = invoices.data || [];
  const unpaid = list.filter((inv) => inv.totals.balance > 0.01);
  const outstanding = unpaid.reduce((s, inv) => s + inv.totals.balance, 0);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Accounts" title="Finance" />
      <StatGrid>
        <Stat label="Invoices" value={list.length} />
        <Stat label="Unpaid" value={unpaid.length} />
        <Stat label="Paid" value={list.length - unpaid.length} />
        <Stat label="Outstanding" value={money(outstanding)} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "invoices", label: "Invoices" },
          { id: "payments", label: "Payments" },
          { id: "mpesa", label: "M-Pesa" },
          { id: "bills", label: "Bills" },
          { id: "expenses", label: "Expenses" },
          { id: "journals", label: "Journals" },
          { id: "accounts", label: "Accounts" },
          { id: "reconciliation", label: "Reconciliation" },
        ]}
      />
      {tab === "invoices" && (
        <div className="toolbar">
          <button className="btn-success" onClick={() => setModal("pay")}>Record payment</button>
          <button className="btn-gold" onClick={() => setModal("stk")}>Send M-Pesa prompt</button>
          <button className="btn-gold" onClick={() => setModal("credit")}><Plus size={14} /> New credit note</button>
        </div>
      )}

      {tab === "invoices" && <InvoiceRegister invoices={invoices.data || []} />}
      {tab === "payments" && <PaymentsRegister invoices={invoices.data || []} />}
      {tab === "mpesa" && <MpesaTab invoices={unpaid} />}
      {tab === "bills" && <BillsTab />}
      {tab === "expenses" && <ExpensesTab />}
      {tab === "journals" && <JournalsTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "reconciliation" && <ReconciliationTab />}

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
  const [status, setStatus] = useState("");
  const [vat, setVat] = useState("");
  const [when, setWhen] = useState("all");

  const rows = useMemo(() => {
    return invoices.filter((inv) => {
      const hay = `${inv.number} ${inv.orderNumber} ${inv.customer.name} ${inv.salesperson?.name || ""} ${inv.lpo || ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (type && type !== "SALE") return false;
      const paid = inv.totals.balance <= 0.01;
      const overdue = inv.status === "OVERDUE";
      if (status === "unpaid" && paid) return false;
      if (status === "paid" && !paid) return false;
      if (status === "overdue" && !overdue) return false;
      const vatType = inv.vatRate > 0 ? "VAT" : "NON";
      if (vat && vat !== vatType) return false;
      if (!inDateRange(inv.issuedAt, when)) return false;
      return true;
    });
  }, [invoices, q, type, status, vat, when]);
  const pager = usePager(rows, `${q}|${type}|${status}|${vat}|${when}`);

  const headers = ["Document #", "Type", "Customer / supplier", "VAT", "LPO", "Sales person", "Date", "Due", "Total", "Balance", "Credit note", "Status"];
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
      ksh(inv.totals.balance),
      creditTotal(inv) ? ksh(creditTotal(inv)) : "—",
      inv.status,
    ]);

  return (
    <div className="space-y-3">
      <div className="toolbar">
        <input className="min-w-[220px] flex-1 rounded-full" placeholder="Search invoice # or party…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="w-auto rounded-full" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="SALE">Sale</option>
        </select>
        <select className="w-auto rounded-full" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <select className="w-auto rounded-full" value={vat} onChange={(e) => setVat(e.target.value)}>
          <option value="">All VAT types</option>
          <option value="VAT">VAT</option>
          <option value="NON">Non-VAT</option>
        </select>
        <select className="w-auto rounded-full" value={when} onChange={(e) => setWhen(e.target.value)}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
        <button className="btn-ghost rounded-full" onClick={() => { setQ(""); setType(""); setStatus(""); setVat(""); setWhen("all"); }}>Clear</button>
        <ExportButtons title="Invoices" filename="invoices.csv" headers={headers} rows={exportRows()} />
      </div>
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
              <th>Total</th>
              <th>Balance</th>
              <th>Credit note</th>
              <th>Status</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={13} label="No invoices match." />}
            {pager.slice.map((inv) => {
              const credit = creditTotal(inv);
              const state = inv.status;
              return (
                <tr key={inv.id}>
                  <td>
                    <span className="font-medium text-ink">{inv.number}</span>
                    <div className="text-[11px] text-stone-400">{inv.orderNumber}</div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Sale
                    </span>
                  </td>
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
                  <td>{ksh(inv.totals.gross)}</td>
                  <td className={inv.totals.balance > 0.01 ? "text-amber-600" : "text-emerald-700"}>{ksh(inv.totals.balance)}</td>
                  <td className="text-stone-400">{credit ? ksh(credit) : "—"}</td>
                  <td>
                    <span className={`text-xs font-semibold uppercase ${
                      state === "PAID" ? "text-emerald-600" : state === "OVERDUE" ? "text-red-600" : "text-amber-500"
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
      <Pager {...pager} />
    </div>
  );
}

function BillsTab() {
  const qc = useQueryClient();
  const bills = useQuery({ queryKey: ["bills"], queryFn: () => api<any[]>("/api/finance/bills") });
  const pay = useMutation({
    mutationFn: (p: { id: string; amount: number; method: string; reference?: string }) =>
      api(`/api/finance/bills/${p.id}/pay`, { method: "POST", body: JSON.stringify(p) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["journals"] });
    },
  });
  const rows = bills.data || [];
  return (
    <div className="space-y-3">
      {pay.error && <p className="text-sm text-red-600">{(pay.error as Error).message}</p>}
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Vendor</th>
              <th>PO</th>
              <th>Gross</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={8} label="No vendor bills yet. Receive a purchase order first." />}
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="font-semibold">{b.number}</td>
                <td>{b.vendor?.name}</td>
                <td>{b.purchase?.number || "—"}</td>
                <td>{money(b.gross)}</td>
                <td>{money(b.paid)}</td>
                <td className={b.balance > 0.01 ? "font-semibold text-amber-700" : "text-emerald-700"}>{money(b.balance)}</td>
                <td>{b.status}</td>
                <td>
                  {b.balance > 0.01 && (
                    <button
                      className="btn-success text-xs"
                      onClick={() => {
                        const amount = Number(prompt("Amount to pay", String(b.balance)));
                        const method = prompt("Method: CASH, BANK or MPESA", "BANK") || "BANK";
                        const reference = prompt("Reference (optional)") || "";
                        if (!amount) return;
                        pay.mutate({ id: b.id, amount, method, reference });
                      }}
                    >
                      Record payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsRegister({ invoices }: { invoices: Invoice[] }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    return invoices
      .flatMap((inv) => (inv.payments || []).map((p) => ({ ...p, invoice: inv })))
      .filter((p) => `${p.invoice.number} ${p.invoice.customer.name} ${p.method} ${p.reference || ""}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [invoices, q]);
  const headers = ["Date", "Invoice", "Customer", "Method", "Reference", "Amount"];
  return (
    <div className="space-y-3">
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search payments…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
        <ExportButtons
          title="Payments"
          filename="payments.csv"
          headers={headers}
          rows={rows.map((p) => [fmtDate(p.createdAt), p.invoice.number, p.invoice.customer.name, p.method, p.reference || "", String(p.amount)])}
        />
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Reference</th><th>Amount</th><th>PDF</th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={7} label="No payments yet." />}
            {rows.map((p) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpensesTab() {
  const exp = useQuery({ queryKey: ["exp"], queryFn: () => api<any[]>("/api/finance/expenses") });
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
          <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>VAT</th><th>PDF</th></tr></thead>
          <tbody>
            {exp.data?.map((e) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function AccountsTab() {
  const [view, setView] = useState<AccountView>("tb");
  const tb = useQuery({ queryKey: ["tb"], queryFn: () => api<any>("/api/finance/trial-balance") });
  const pnl = useQuery({ queryKey: ["pnl"], queryFn: () => api<any>("/api/finance/pnl") });
  const bs = useQuery({ queryKey: ["bs"], queryFn: () => api<any>("/api/finance/balance-sheet") });
  const vat = useQuery({ queryKey: ["vat"], queryFn: () => api<any>("/api/finance/vat") });
  const periods = useQuery({ queryKey: ["periods"], queryFn: () => api<any[]>("/api/finance/periods") });
  const qc = useQueryClient();
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Income" value={money(pnl.data?.income)} />
        <Stat label="Net profit" value={money(pnl.data?.net)} />
        <Stat label="Expenses" value={money(pnl.data?.expenses)} />
        <Stat label="VAT payable" value={money(vat.data?.payable)} />
      </StatGrid>
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { id: "tb", label: "Trial balance" },
          { id: "pnl", label: "P&L" },
          { id: "bs", label: "Balance sheet" },
          { id: "vat", label: "VAT return" },
          { id: "period", label: "Period close" },
        ]}
      />
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
        </div>
      )}
      {view === "period" && <PeriodClose rows={periods.data || []} onDone={() => qc.invalidateQueries({ queryKey: ["periods"] })} />}
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
            id: String(fd.get("id")),
            amount: Number(fd.get("amount")),
            method: kind === "credit" ? "CREDIT_NOTE" : String(fd.get("method")),
            reference: String(fd.get("reference") || ""),
          });
        }}
      >
        <h3 className="font-semibold">{kind === "credit" ? "New credit note" : "Record payment"}</h3>
        <div>
          <label>Invoice</label>
          <select name="id" required>
            <option value="">Select…</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.number} · {inv.customer.name} · {money(inv.totals.balance)} due</option>
            ))}
          </select>
        </div>
        <div>
          <label>Amount</label>
          <input name="amount" type="number" step="0.01" min="0.01" required />
        </div>
        {kind === "pay" ? (
          <>
            <div>
              <label>Method</label>
              <select name="method">
                <option value="CASH">Cash</option>
                <option value="MPESA">M-Pesa</option>
                <option value="BANK">Bank</option>
              </select>
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
          const fd = new FormData(e.currentTarget);
          setInvoiceId(String(fd.get("invoiceId")));
        }}
      >
        <h3 className="font-semibold">Send M-Pesa prompt</h3>
        <div>
          <label>Invoice</label>
          <select name="invoiceId" required defaultValue="">
            <option value="">Select…</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>{i.number} · {i.customer.name} · {money(i.totals.balance)}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-success">Continue</button>
        </div>
      </form>
    </Modal>
  );
}

function MpesaTab({ invoices }: { invoices: Invoice[] }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["mpesa-status"], queryFn: () => api<any>("/api/mpesa/status") });
  const txns = useQuery({ queryKey: ["mpesa-txns"], queryFn: () => api<any[]>("/api/mpesa/transactions") });
  const [stk, setStk] = useState<Invoice | null>(null);
  const [alloc, setAlloc] = useState<any>(null);
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

  return (
    <div className="space-y-4">
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
            payout.mutate({ phone: fd.get("phone"), amount: Number(fd.get("amount")), remarks: fd.get("remarks"), command: fd.get("command") });
          }}
        >
          <h3 className="font-semibold">Send money (B2C)</h3>
          <input name="phone" placeholder="07…" required />
          <input name="amount" type="number" placeholder="Amount" required />
          <select name="command">
            <option value="BusinessPayment">Business payment</option>
            <option value="SalaryPayment">Salary</option>
            <option value="PromotionPayment">Promotion</option>
          </select>
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
            {(txns.data || []).length === 0 && <EmptyRow cols={8} label="No M-Pesa activity yet." />}
            {(txns.data || []).map((t) => (
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
      {stk && (
        <StkPrompt
          invoiceId={stk.id}
          defaultPhone={stk.customer.phone || ""}
          defaultAmount={Math.round(stk.totals.balance)}
          onClose={() => setStk(null)}
        />
      )}
      {alloc && (
        <Modal onClose={() => setAlloc(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              allocate.mutate({ id: alloc.id, invoiceId: String(fd.get("invoiceId")) });
            }}
          >
            <h3 className="font-semibold">Allocate {alloc.receipt}</h3>
            <select name="invoiceId" required>
              <option value="">Invoice…</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>{inv.number} · {inv.customer.name} · {money(inv.totals.balance)}</option>
              ))}
            </select>
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
    <div className="grid gap-4 lg:grid-cols-2">
      {data.banks?.map((b: any) => (
        <div key={b.id} className="card space-y-3">
          <h3 className="font-semibold">{b.name}</h3>
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
