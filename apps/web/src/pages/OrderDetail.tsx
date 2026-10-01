import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CaptureField } from "../components/CaptureField";
import { StkPrompt } from "../components/StkPrompt";
import { PdfButtons, RowPdf } from "../components/ui";
import { api, money } from "../lib/api";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import { useSetPageTitle } from "../lib/page-title";

const FLOW = ["DRAFT", "CONFIRMED", "PICKING", "PICKED", "DISPATCHED", "DELIVERED"];

export function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const back = canModule(user, "sales") ? "/sales" : "/dispatch";
  const qc = useQueryClient();
  const [stk, setStk] = useState(false);
  const { data: o, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<any>(`/api/orders/${id}`),
  });
  const status = useMutation({
    mutationFn: (next: string) => api(`/api/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status: next }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const upload = useMutation({
    mutationFn: (body: { name: string; mime: string; data: string }) =>
      api(`/api/orders/${id}/files`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", id] }),
  });
  useSetPageTitle(canModule(user, "sales") ? "Sales" : "Dispatch", o?.number || "Order", back);

  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!o) return <p>Loading…</p>;
  const i = FLOW.indexOf(o.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={back} className="btn-ghost mb-2 inline-flex">
            <ArrowLeft size={16} /> Back to {canModule(user, "sales") ? "sales" : "dispatch"}
          </Link>
          {(o.invoice?.number || o.invoiceNumber) && (
            <p className="text-xs text-stone-500">Invoice {o.invoice?.number || o.invoiceNumber}</p>
          )}
          <p className="text-xs uppercase tracking-wide text-stone-400">{o.channel}</p>
          <p className="text-stone-500">{o.customer.name} · {o.dispatchMethod.replace("_", " ")} {o.tracking && `· ${o.tracking}`}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PdfButtons orderId={o.id} status={o.status} />
          <span className="badge bg-gold text-ink">{o.status}</span>
        </div>
      </div>
      <div className="toolbar">
        {FLOW.map((s, idx) => {
          const next = idx === i + 1 && o.status !== "CANCELLED";
          const done = idx <= i;
          const success = s === "DELIVERED";
          return (
            <button
              key={s}
              disabled={!next}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                done
                  ? success && idx === i
                    ? "bg-emerald-600 text-white"
                    : "bg-ink text-white"
                  : next
                    ? success
                      ? "bg-emerald-600 text-white"
                      : "bg-gold text-ink"
                    : "bg-stone-200 text-stone-500"
              }`}
              onClick={() => status.mutate(s)}
            >
              {s}
            </button>
          );
        })}
        {o.status === "DISPATCHED" && (
          <button className="btn-success text-xs" onClick={() => status.mutate("DELIVERED")}>
            Mark delivered
          </button>
        )}
        {o.status !== "DRAFT" && o.status !== "CANCELLED" && (
          <button
            className="btn-danger text-xs"
            onClick={() => {
              const reason = prompt("Reason to cancel") || "";
              if (reason) status.mutate("CANCELLED");
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {status.error && <p className="text-sm text-amber-800">{(status.error as Error).message}</p>}
      {o.status === "DRAFT" && <DraftEditor order={o} />}
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Product name</th><th>Qty</th><th>Selling price</th><th>Value</th><th>PDF</th></tr></thead>
          <tbody>
            {o.lines.map((l: any) => (
              <tr key={l.id}>
                <td>{l.part.sku} · {l.part.name}<div className="text-xs text-stone-500">Bin {l.part.binLocation}</div></td>
                <td>{l.qty}</td>
                <td>{money(l.salePrice)}</td>
                <td>{money(l.qty * l.salePrice)}</td>
                <td>
                  <RowPdf
                    title={`${o.number} ${l.part.sku}`}
                    fields={[
                      ["Order", o.number],
                      ["SKU", l.part.sku],
                      ["Product", l.part.name],
                      ["Bin", l.part.binLocation],
                      ["Qty", String(l.qty)],
                      ["Price", money(l.salePrice)],
                      ["Line", money(l.qty * l.salePrice)],
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span>Net</span><span>{money(o.totals.net)}</span></div>
          <div className="flex justify-between"><span>VAT 16%</span><span>{money(o.totals.vat)}</span></div>
          <div className="flex justify-between font-semibold"><span>Gross</span><span>{money(o.totals.gross)}</span></div>
          {o.totals.cost != null && <div className="flex justify-between text-stone-500"><span>Profit</span><span>{money(o.totals.profit)}</span></div>}
          <div className="flex justify-between"><span>Paid</span><span>{money(o.totals.paid)}</span></div>
          <div className="flex justify-between text-red-700"><span>Balance</span><span>{money(o.totals.balance)}</span></div>
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold">Invoice & payments</h2>
          {o.invoice?.number || o.invoiceNumber ? (
            <p className="text-sm">Invoice <span className="font-semibold">{o.invoice?.number || o.invoiceNumber}</span> is in Finance.</p>
          ) : (
            <p className="text-sm text-stone-500">Confirm this order to create its invoice in Finance.</p>
          )}
          {o.invoice && o.totals.balance > 0.01 && (
            <button type="button" className="btn-success" onClick={() => setStk(true)}>Send M-Pesa prompt</button>
          )}
          <ul className="text-sm">
            {(o.payments || []).length === 0 && <li className="text-stone-500">No payments recorded yet.</li>}
            {(o.payments || []).map((p: any) => (
              <li key={p.id} className="flex justify-between border-t py-1">
                <span>{p.method} {p.reference || ""}</span>
                <span>{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {o.status !== "DRAFT" && o.status !== "CANCELLED" && <ReturnGoods order={o} />}
      <div className="card space-y-3">
        <h2 className="font-semibold">Photos & attachments</h2>
        <div className="flex flex-wrap gap-2">
          <CaptureField kind="delivery" refId={o.id} label="Delivery proof" />
        </div>
        <input
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              upload.mutate({ name: file.name, mime: file.type || "application/octet-stream", data: String(reader.result) });
              e.target.value = "";
            };
            reader.readAsDataURL(file);
          }}
        />
        {upload.error && <p className="text-sm text-red-600">{(upload.error as Error).message}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          {(o.files || []).map((f: any) => (
            <a key={f.id} href={f.path} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border bg-stone-50">
              {String(f.mime).startsWith("image/") ? (
                <img src={f.path} alt={f.name} className="h-36 w-full object-cover" />
              ) : (
                <div className="grid h-36 place-items-center text-sm text-stone-500">{f.name}</div>
              )}
              <div className="truncate px-2 py-1 text-xs">{f.name}</div>
            </a>
          ))}
        </div>
      </div>
      {stk && o.invoice && (
        <StkPrompt
          invoiceId={o.invoice.id}
          orderId={o.id}
          defaultPhone={o.customer?.phone || ""}
          defaultAmount={Math.round(o.totals.balance)}
          onClose={() => setStk(false)}
        />
      )}
    </div>
  );
}

function ReturnGoods({ order }: { order: any }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const ret = useMutation({
    mutationFn: () =>
      api(`/api/orders/${order.id}/returns`, {
        method: "POST",
        body: JSON.stringify({
          reason,
          lines: order.lines
            .map((l: any) => ({ lineId: l.id, qty: Number(qty[l.id] || 0) }))
            .filter((l: { qty: number }) => l.qty > 0),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["parts"] });
    },
  });
  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        ret.mutate();
      }}
    >
      <h2 className="font-semibold">Sales return</h2>
      {order.lines.map((l: any) => (
        <div key={l.id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-3">
          <div className="col-span-2 text-sm">{l.part.sku} · sold {l.qty}</div>
          <input type="number" min={0} max={l.qty} value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })} />
        </div>
      ))}
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" required />
      {ret.error && <p className="text-sm text-red-600">{(ret.error as Error).message}</p>}
      <button className="btn-danger" disabled={ret.isPending}>Post return</button>
    </form>
  );
}

function DraftEditor({ order }: { order: any }) {
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/api/customers") });
  const parts = useQuery({ queryKey: ["parts"], queryFn: () => api<any[]>("/api/parts") });
  const [channel, setChannel] = useState(order.channel);
  const [customerId, setCustomerId] = useState(order.customerId);
  const [dispatchMethod, setDispatchMethod] = useState(order.dispatchMethod);
  const [tracking, setTracking] = useState(order.tracking || "");
  const [lpo, setLpo] = useState(order.lpo || "");
  const [lines, setLines] = useState(order.lines.map((l: any) => ({ partId: l.partId, qty: l.qty })));
  const save = useMutation({
    mutationFn: () =>
      api(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          channel,
          customerId,
          dispatchMethod,
          tracking,
          lpo: lpo || undefined,
          lines: lines.filter((l: { partId: string }) => l.partId),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="font-semibold">Edit quotation</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label>Channel</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {["FIELD", "SHOP", "PHONE", "WHATSAPP", "EMAIL"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label>Dispatch</label>
          <select value={dispatchMethod} onChange={(e) => setDispatchMethod(e.target.value)}>
            <option value="SHOP_COLLECT">Shop collect</option>
            <option value="COURIER">Courier</option>
          </select>
        </div>
        <div>
          <label>LPO</label>
          <input value={lpo} onChange={(e) => setLpo(e.target.value)} placeholder="Customer LPO" />
        </div>
        <div className="sm:col-span-2">
          <label>Tracking</label>
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
      </div>
      {lines.map((l: { partId: string; qty: number }, i: number) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select className="col-span-2" value={l.partId} onChange={(e) => {
            const next = [...lines];
            next[i] = { ...next[i], partId: e.target.value };
            setLines(next);
          }}>
            <option value="">Product…</option>
            {parts.data?.map((p: any) => (
              <option key={p.id} value={p.id}>{p.sku} · {p.name} ({p.qtyOnHand} in {p.binLocation})</option>
            ))}
          </select>
          <input type="number" min={1} value={l.qty} onChange={(e) => {
            const next = [...lines];
            next[i] = { ...next[i], qty: Number(e.target.value) };
            setLines(next);
          }} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { partId: "", qty: 1 }])}>Add line</button>
        <button className="btn-gold" disabled={save.isPending}>Save draft</button>
      </div>
      {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
    </form>
  );
}
