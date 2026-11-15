import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, MteSelect } from "./ui";
import { api, money } from "../lib/api";

export type PayableInvoice = {
  id: string;
  number: string;
  customer: { name: string };
  totals: { balance: number };
};

function localDateInputValue(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function RecordPaymentModal({ invoices, onClose }: { invoices: PayableInvoice[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [paidAt, setPaidAt] = useState(localDateInputValue());
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);

  const open = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices
      .filter((inv) => inv.totals.balance > 0.01)
      .filter((inv) => !q || `${inv.number} ${inv.customer.name}`.toLowerCase().includes(q));
  }, [invoices, search]);

  const selectedList = useMemo(
    () => invoices.filter((inv) => selected.has(inv.id) && inv.totals.balance > 0.01),
    [invoices, selected],
  );
  const total = Math.round(selectedList.reduce((s, inv) => s + inv.totals.balance, 0) * 100) / 100;
  const selectedKey = selectedList.map((inv) => inv.id).sort().join(",");
  const selectionKey = useRef("");

  useEffect(() => {
    if (selectionKey.current === selectedKey) return;
    selectionKey.current = selectedKey;
    setAmount(total > 0 ? total.toFixed(2) : "");
  }, [selectedKey, total]);

  const payAmount = Math.round(Number(amount) * 100) / 100;
  const amountOk = Number.isFinite(payAmount) && payAmount > 0 && payAmount <= total + 0.02;
  const partial = amountOk && total - payAmount > 0.02;

  const save = useMutation({
    mutationFn: () =>
      api("/api/finance/payments/record", {
        method: "POST",
        body: JSON.stringify({
          paidAt,
          method,
          amount: payAmount,
          reference: reference.trim() || undefined,
          invoiceIds: [...selected],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["finance-dashboard"] });
      qc.invalidateQueries({ queryKey: ["journals"] });
      onClose();
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllShown = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const inv of open) next.add(inv.id);
      return next;
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!selected.size || !method || !amountOk) return;
    if (method === "MPESA" && !reference.trim()) return;
    save.mutate();
  };

  const invoiceErr = touched && selected.size === 0;
  const methodErr = touched && !method;
  const amountErr = touched && selected.size > 0 && !amountOk;
  const refErr = touched && method === "MPESA" && !reference.trim();

  return (
    <Modal wide onClose={onClose} className="pay-record-modal">
      <form className="pay-record-form" onSubmit={onSubmit}>
        <header className="pay-record-head">
          <h2 className="text-xl font-semibold tracking-tight">Record Payment</h2>
          <button type="button" className="btn-ghost px-2 py-1" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="pay-record-fields">
          <label className="pay-record-field">
            <span>Payment date *</span>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
          </label>
          <label className="pay-record-field">
            <span>Payment Method</span>
            <MteSelect
              aria-label="Payment method"
              value={method}
              onChange={setMethod}
              placeholder="Select method…"
              allowEmpty
              options={[
                { value: "CASH", label: "Cash" },
                { value: "BANK", label: "Bank transfer" },
                { value: "MPESA", label: "M-Pesa" },
                { value: "CHEQUE", label: "Cheque" },
              ]}
            />
          </label>
        </div>

        <div className="pay-record-fields">
          <label className="pay-record-field">
            <span>Amount received (KES) *</span>
            <input
              type="number"
              inputMode="decimal"
              min={0.01}
              step="0.01"
              max={total || undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </label>
          <div className="pay-record-amount-actions">
            <button
              type="button"
              className="pay-record-link"
              disabled={total <= 0}
              onClick={() => setAmount(total > 0 ? total.toFixed(2) : "")}
            >
              Full balance
            </button>
            <button
              type="button"
              className="pay-record-link"
              disabled={total <= 0}
              onClick={() => setAmount(total > 0 ? (Math.round(total * 50) / 100).toFixed(2) : "")}
            >
              Half
            </button>
          </div>
        </div>
        <p className="pay-record-hint">
          {partial
            ? `Partial payment. ${money(Math.round((total - payAmount) * 100) / 100)} stays open on the invoice.`
            : "Defaults to the full balance. Enter less, or tap Half, when the client has only paid part."}
        </p>

        <label className="pay-record-field">
          <span>Reference{method === "MPESA" ? " *" : ""}</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === "MPESA" ? "M-Pesa receipt code" : "Bank ref / cheque no."}
            autoComplete="off"
            required={method === "MPESA"}
          />
        </label>

        <section className="pay-record-invoices">
          <div className="pay-record-invoices-label">
            <span>Invoices *</span>
            <button type="button" className="pay-record-link" onClick={selectAllShown}>
              Select all shown
            </button>
          </div>
          <div className="pay-record-search">
            <Search size={16} aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or customer…"
              autoComplete="off"
            />
          </div>
          <ul className="pay-record-list" role="listbox" aria-multiselectable>
            {open.length === 0 && <li className="pay-record-empty">No open invoices match.</li>}
            {open.map((inv) => {
              const on = selected.has(inv.id);
              return (
                <li key={inv.id}>
                  <label className={`pay-record-row ${on ? "on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(inv.id)} />
                    <span className="pay-record-row-main">
                      <strong>{inv.number}</strong>
                      <span>
                        {inv.customer.name} · Balance {money(inv.totals.balance)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {invoiceErr && <p className="pay-record-err">Select one or more invoices</p>}
          {methodErr && <p className="pay-record-err">Select a payment method</p>}
          {amountErr && <p className="pay-record-err">Enter an amount up to the open balance</p>}
          {refErr && <p className="pay-record-err">M-Pesa reference required</p>}
          {save.error && <p className="pay-record-err">{(save.error as Error).message}</p>}
        </section>

        <footer className="pay-record-foot">
          <span>
            {selected.size} invoice{selected.size === 1 ? "" : "s"}
            {partial ? " · partial" : ""}
          </span>
          <strong>{partial ? `Paying ${money(payAmount)}` : `Total ${money(total)}`}</strong>
        </footer>

        <div className="pay-record-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-success" disabled={save.isPending}>
            {save.isPending ? "Posting…" : "Record payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}