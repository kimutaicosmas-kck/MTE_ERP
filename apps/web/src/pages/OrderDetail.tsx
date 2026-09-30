import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, money } from "../lib/api";

const FLOW = ["DRAFT", "CONFIRMED", "PICKING", "PICKED", "DISPATCHED", "DELIVERED", "PAID"];

export function OrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
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
  const pay = useMutation({
    mutationFn: (body: { amount: number; method: string; reference?: string }) =>
      api(`/api/orders/${id}/payments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
  const upload = useMutation({
    mutationFn: (body: { name: string; mime: string; data: string }) =>
      api(`/api/orders/${id}/files`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", id] }),
  });

  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!o) return <p>Loading…</p>;
  const i = FLOW.indexOf(o.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">{o.channel}</p>
          <h1 className="font-serif text-4xl">{o.number}</h1>
          <p className="text-stone-500">{o.customer.name} · {o.dispatchMethod.replace("_", " ")} {o.tracking && `· ${o.tracking}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["quote", "invoice", "picking", "delivery"] as const).map((k) => (
            <a key={k} className="btn-ghost capitalize" href={`/orders/${o.id}/print/${k}`} target="_blank" rel="noreferrer">{k}</a>
          ))}
          <span className="badge bg-gold text-ink">{o.status}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {FLOW.map((s, idx) => (
          <button
            key={s}
            disabled={idx !== i + 1 || o.status === "CANCELLED"}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${idx <= i ? "bg-ink text-white" : "bg-stone-200"}`}
            onClick={() => status.mutate(s)}
          >
            {s}
          </button>
        ))}
        {o.status !== "DRAFT" && o.status !== "CANCELLED" && (
          <button
            className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800"
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
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Part</th><th>Qty</th><th>Price</th><th>Line</th></tr></thead>
          <tbody>
            {o.lines.map((l: any) => (
              <tr key={l.id}>
                <td>{l.part.sku} · {l.part.name}<div className="text-xs text-stone-500">Bin {l.part.binLocation}</div></td>
                <td>{l.qty}</td>
                <td>{money(l.salePrice)}</td>
                <td>{money(l.qty * l.salePrice)}</td>
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
          <h2 className="font-semibold">Record payment</h2>
          <p className="text-xs text-stone-500">Manual now. Automated M-Pesa STK when Daraja credentials are provided.</p>
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              pay.mutate({
                amount: Number(fd.get("amount")),
                method: String(fd.get("method")),
                reference: String(fd.get("reference") || ""),
              });
              e.currentTarget.reset();
            }}
          >
            <input name="amount" type="number" step="0.01" placeholder="Amount" required />
            <select name="method">
              <option value="CASH">Cash</option>
              <option value="MPESA">M-Pesa</option>
              <option value="BANK">Bank</option>
              <option value="CREDIT">Credit</option>
            </select>
            <input name="reference" placeholder="M-Pesa / bank reference" />
            <button className="btn" disabled={pay.isPending}>Post payment</button>
          </form>
          <ul className="text-sm">
            {o.payments.map((p: any) => (
              <li key={p.id} className="flex justify-between border-t py-1">
                <span>{p.method} {p.reference || ""}</span>
                <span>{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="font-semibold">Photos & attachments</h2>
        <p className="text-xs text-stone-500">Packing photos, delivery proof, or a WhatsApp screenshot. Stays on this order.</p>
        <input
          type="file"
          accept="image/*,.pdf"
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
    </div>
  );
}
