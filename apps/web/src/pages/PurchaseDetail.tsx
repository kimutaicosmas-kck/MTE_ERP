import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ActivityTimeline } from "../components/ActivityTimeline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MteSelect, PageHeader, RowPdf, mapSelectOptions } from "../components/ui";
import { api, downloadPurchasePdf, money } from "../lib/api";
import type { Purchase } from "./Procurement";

type Detail = Purchase & {
  receipts: { id: string; number: string; createdAt: string; notes?: string | null; receivedBy?: { name: string } | null; lines: { partId: string; qty: number }[] }[];
};

export function PurchaseDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: po, error } = useQuery({
    queryKey: ["purchase", id],
    queryFn: () => api<Detail>(`/api/purchases/${id}`),
  });

  const place = useMutation({
    mutationFn: () => api(`/api/purchases/${id}/order`, { method: "POST" }),
    onSuccess: () => invalidate(),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => api(`/api/purchases/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => invalidate(),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["purchase", id] });
    qc.invalidateQueries({ queryKey: ["purchases"] });
    qc.invalidateQueries({ queryKey: ["parts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const canReceive = po ? ["DRAFT", "ORDERED", "PARTIAL"].includes(po.status) : false;

  useEffect(() => {
    if (!canReceive) return;
    if (window.location.hash === "#receive-goods") {
      document.getElementById("receive-goods")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [po?.id, canReceive]);

  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!po) return <p>Loading…</p>;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Procurement" title={po.number} backTo="/procurement" />
      <p className="text-stone-500">
        {po.vendor.name}
        {po.reference ? ` · ${po.reference}` : ""}
        {po.expectedAt ? ` · due ${new Date(po.expectedAt).toLocaleDateString()}` : ""}
      </p>
      <span className="badge bg-gold text-ink">{po.status}</span>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => downloadPurchasePdf(po.id)}>PDF</button>
        {canReceive && (
          <a href="#receive-goods" className="btn-success">Receive goods</a>
        )}
        {po.status === "DRAFT" && (
          <button className="btn-gold" disabled={place.isPending} onClick={() => place.mutate()}>
            Place order
          </button>
        )}
        {po.status !== "RECEIVED" && po.status !== "CANCELLED" && po.lines.every((l) => l.qtyReceived === 0) && (
          <button
            className="btn-danger"
            onClick={() => {
              const reason = prompt("Reason to cancel") || "";
              if (reason) cancel.mutate(reason);
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {(place.error || cancel.error) && (
        <p className="text-sm text-amber-800">{((place.error || cancel.error) as Error).message}</p>
      )}
      {canReceive && <ReceiveGoods purchase={po} onDone={invalidate} />}
      {po.status === "DRAFT" && <DraftEditor purchase={po} />}
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Product name</th>
              <th>Ordered</th>
              <th>Received</th>
              <th>Open</th>
              <th>Cost</th>
              <th>Line</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.part.sku} · {l.part.name}</td>
                <td>{l.qtyOrdered}</td>
                <td>{l.qtyReceived}</td>
                <td>{Math.max(0, l.qtyOrdered - l.qtyReceived)}</td>
                <td>{money(l.unitCost)}</td>
                <td>{money(l.qtyOrdered * l.unitCost)}</td>
                <td>
                  <RowPdf
                    title={`${po.number} ${l.part.sku}`}
                    fields={[
                      ["PO", po.number],
                      ["SKU", l.part.sku],
                      ["Ordered", String(l.qtyOrdered)],
                      ["Received", String(l.qtyReceived)],
                      ["Cost", money(l.unitCost)],
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card space-y-1 text-sm">
        <div className="flex justify-between"><span>Net</span><span>{money(po.totals.net)}</span></div>
        <div className="flex justify-between"><span>VAT 16%</span><span>{money(po.totals.vat)}</span></div>
        <div className="flex justify-between font-semibold"><span>Gross</span><span>{money(po.totals.gross)}</span></div>
        <div className="flex justify-between text-stone-500"><span>Received value</span><span>{money(po.totals.received)}</span></div>
        {po.notes && <p className="pt-2 text-stone-500">{po.notes}</p>}
        <div className="flex justify-between text-stone-500"><span>Currency</span><span>{(po as any).currency || "KES"} @ {(po as any).fxRate || 1}</span></div>
        <div className="flex justify-between text-stone-500"><span>Landed cost</span><span>{money(((po as any).freight || 0) + ((po as any).duty || 0) + ((po as any).otherLanded || 0))}</span></div>
        {(po as any).bills?.length > 0 && (po as any).bills.map((b: any) => (
          <div key={b.id} className="flex justify-between"><span>{b.number}</span><span>{b.status} {money(b.gross - b.paid)}</span></div>
        ))}
        {po.status === "RECEIVED" && <p className="pt-2 text-stone-500">All lines have been received. Stock is on the catalogue.</p>}
        {po.status === "CANCELLED" && <p className="pt-2 text-stone-500">This purchase order is cancelled.</p>}
      </div>
      {po.receipts?.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Goods receipts</h2>
          <p className="text-xs text-stone-500">Each GRN increases stock (movement type RECEIPT) and posts a vendor bill to finance.</p>
          {po.receipts.map((r) => (
            <div key={r.id} className="flex flex-wrap justify-between gap-2 text-sm border-t border-stone-100 pt-2 first:border-0 first:pt-0">
              <span>{r.number} · {r.receivedBy?.name || "Warehouse"}</span>
              <span className="flex gap-2 text-stone-500">
                {new Date(r.createdAt).toLocaleString()}
                <Link className="underline" to="/inventory?section=movements">Movements</Link>
              </span>
            </div>
          ))}
        </div>
      )}
      <ActivityTimeline entity="PurchaseOrder" entityId={po.id} title="Procurement timeline" />
    </div>
  );
}

function ReceiveGoods({ purchase, onDone }: { purchase: Detail; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const defaults = useMemo(
    () => Object.fromEntries(purchase.lines.map((l) => [l.id, Math.max(0, l.qtyOrdered - l.qtyReceived)])),
    [purchase.lines]
  );
  const [qty, setQty] = useState<Record<string, number>>(defaults);
  useEffect(() => { setQty(defaults); }, [defaults]);
  const openTotal = purchase.lines.reduce((s, l) => s + Math.max(0, l.qtyOrdered - l.qtyReceived), 0);
  const [lastGrn, setLastGrn] = useState<{ number: string; finance?: { vendorBill: string; gross: number; journal: string } } | null>(null);
  const receive = useMutation({
    mutationFn: () =>
      api<{ receipt: { number: string }; integration?: { finance?: { vendorBill: string; gross: number; journal: string } } }>(`/api/purchases/${purchase.id}/receive`, {
        method: "POST",
        body: JSON.stringify({
          notes: notes || undefined,
          lines: purchase.lines
            .map((l) => ({ lineId: l.id, qty: Number(qty[l.id] || 0) }))
            .filter((l) => l.qty > 0),
        }),
      }),
    onSuccess: (data) => {
      setLastGrn({
        number: data.receipt?.number || "GRN",
        finance: data.integration?.finance,
      });
      onDone();
    },
  });

  return (
    <form
      id="receive-goods"
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        receive.mutate();
      }}
    >
      <h2 className="font-semibold">Receive goods</h2>
      {purchase.lines.map((l) => {
        const open = Math.max(0, l.qtyOrdered - l.qtyReceived);
        return (
          <div key={l.id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-3">
            <div className="col-span-2 text-sm">
              <div className="font-medium">{l.part.sku}</div>
              <div className="text-xs text-stone-500">{open} still open</div>
            </div>
            <input
              type="number"
              min={0}
              max={open}
              step="1"
              value={qty[l.id] ?? 0}
              onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })}
            />
          </div>
        );
      })}
      <div>
        <label>GRN notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Packing list, container, damage" />
      </div>
      {receive.error && <p className="text-sm text-red-600">{(receive.error as Error).message}</p>}
      {lastGrn && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1">
          <div><strong>{lastGrn.number}</strong> posted — stock updated and movement logged.</div>
          {lastGrn.finance && (
            <div>Finance: bill <strong>{lastGrn.finance.vendorBill}</strong> ({money(lastGrn.finance.gross)}) · {lastGrn.finance.journal}</div>
          )}
          <Link className="underline font-medium" to="/inventory?section=movements">View inventory movements →</Link>
        </div>
      )}
      <button className="btn-success" disabled={receive.isPending}>
        {openTotal > 0 ? "Receive goods" : "Finish receipt"}
      </button>
    </form>
  );
}

function DraftEditor({ purchase }: { purchase: Detail }) {
  const qc = useQueryClient();
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: () => api<any[]>("/api/vendors") });
  const parts = useQuery({ queryKey: ["parts"], queryFn: () => api<any[]>("/api/parts") });
  const [vendorId, setVendorId] = useState(purchase.vendorId);
  const [reference, setReference] = useState(purchase.reference || "");
  const [expectedAt, setExpectedAt] = useState(purchase.expectedAt ? purchase.expectedAt.slice(0, 10) : "");
  const [notes, setNotes] = useState(purchase.notes || "");
  const [lines, setLines] = useState(
    purchase.lines.map((l) => ({ partId: l.partId, qtyOrdered: l.qtyOrdered, unitCost: l.unitCost }))
  );
  const vendorOptions = useMemo(
    () => mapSelectOptions(vendors.data || [], (v) => v.id, (v) => v.name),
    [vendors.data],
  );
  const partOptions = useMemo(
    () => mapSelectOptions(parts.data || [], (p) => p.id, (p) => `${p.sku} · ${p.name}`),
    [parts.data],
  );

  const save = useMutation({
    mutationFn: () =>
      api(`/api/purchases/${purchase.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          vendorId,
          reference: reference || undefined,
          expectedAt: expectedAt || undefined,
          notes: notes || undefined,
          lines: lines
            .filter((l) => l.partId)
            .map((l) => ({ partId: l.partId, qtyOrdered: Number(l.qtyOrdered), unitCost: Number(l.unitCost) })),
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase", purchase.id] }),
  });

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Edit draft</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label>Vendor</label>
          <MteSelect aria-label="Vendor" value={vendorId} onChange={setVendorId} allowEmpty={false} options={vendorOptions} />
        </div>
        <div>
          <label>Supplier ref</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <label>Expected arrival</label>
          <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
        </div>
      </div>
      <div>
        <label>Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <MteSelect
            className="col-span-3"
            aria-label="Product"
            value={l.partId}
            onChange={(partId) => {
              const next = [...lines];
              next[i].partId = partId;
              setLines(next);
            }}
            options={partOptions}
            placeholder="Product…"
          />
          <input type="number" value={l.qtyOrdered} onChange={(e) => {
            const next = [...lines];
            next[i].qtyOrdered = Number(e.target.value);
            setLines(next);
          }} />
          <input type="number" value={l.unitCost} onChange={(e) => {
            const next = [...lines];
            next[i].unitCost = Number(e.target.value);
            setLines(next);
          }} />
        </div>
      ))}
      {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
      <button className="btn-gold" disabled={save.isPending} onClick={() => save.mutate()}>Save draft</button>
    </div>
  );
}
