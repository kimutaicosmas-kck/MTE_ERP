import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/ui";
import { api } from "../lib/api";

export function PurchaseNew() {
  const nav = useNavigate();
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: () => api<any[]>("/api/vendors") });
  const parts = useQuery({ queryKey: ["parts"], queryFn: () => api<any[]>("/api/parts") });
  const [vendorId, setVendorId] = useState("");
  const [reference, setReference] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [fxRate, setFxRate] = useState(1);
  const [freight, setFreight] = useState(0);
  const [duty, setDuty] = useState(0);
  const [otherLanded, setOtherLanded] = useState(0);
  const [lines, setLines] = useState([{ partId: "", qtyOrdered: 1, unitCost: 0 }]);

  const save = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          vendorId,
          reference: reference || undefined,
          notes: notes || undefined,
          expectedAt: expectedAt || undefined,
          currency,
          fxRate: Number(fxRate),
          freight: Number(freight),
          duty: Number(duty),
          otherLanded: Number(otherLanded),
          lines: lines
            .filter((l) => l.partId)
            .map((l) => ({ partId: l.partId, qtyOrdered: Number(l.qtyOrdered), unitCost: Number(l.unitCost) })),
        }),
      }),
    onSuccess: (p) => nav(`/procurement/${p.id}`),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="Procurement" title="New purchase order" backTo="/procurement" />
      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label>Vendor</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
            <option value="">Select…</option>
            {vendors.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label>Supplier / shipment ref</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Container, invoice, BL" />
        </div>
        <div>
          <label>Expected arrival</label>
          <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
        </div>
        <div>
          <label>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["KES", "USD", "EUR", "CNY"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>FX to KES</label>
          <input type="number" min={0.0001} step="0.01" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value))} />
        </div>
        <div>
          <label>Freight (KES)</label>
          <input type="number" min={0} value={freight} onChange={(e) => setFreight(Number(e.target.value))} />
        </div>
        <div>
          <label>Duty (KES)</label>
          <input type="number" min={0} value={duty} onChange={(e) => setDuty(Number(e.target.value))} />
        </div>
        <div>
          <label>Other landed (KES)</label>
          <input type="number" min={0} value={otherLanded} onChange={(e) => setOtherLanded(Number(e.target.value))} />
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="font-semibold">Lines</h2>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <select
              className="col-span-3"
              value={l.partId}
              onChange={(e) => {
                const next = [...lines];
                const part = parts.data?.find((p) => p.id === e.target.value);
                next[i].partId = e.target.value;
                if (part) next[i].unitCost = part.cost || 0;
                setLines(next);
              }}
            >
              <option value="">Product…</option>
              {parts.data?.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
            </select>
            <input
              type="number"
              min={1}
              value={l.qtyOrdered}
              onChange={(e) => {
                const next = [...lines];
                next[i].qtyOrdered = Number(e.target.value);
                setLines(next);
              }}
            />
            <input
              type="number"
              min={0}
              value={l.unitCost}
              onChange={(e) => {
                const next = [...lines];
                next[i].unitCost = Number(e.target.value);
                setLines(next);
              }}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
              disabled={lines.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { partId: "", qtyOrdered: 1, unitCost: 0 }])}>
          Add line
        </button>
      </div>
      {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
      <div className="flex justify-end gap-2">
        <Link to="/procurement" className="btn-ghost">Cancel</Link>
        <button className="btn-gold" disabled={save.isPending}>Save draft</button>
      </div>
    </form>
  );
}
