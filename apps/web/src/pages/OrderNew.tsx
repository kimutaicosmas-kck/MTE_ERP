import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/ui";
import { api } from "../lib/api";

export function OrderNew() {
  const nav = useNavigate();
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/api/customers") });
  const parts = useQuery({ queryKey: ["parts"], queryFn: () => api<any[]>("/api/parts") });
  const [channel, setChannel] = useState("FIELD");
  const [customerId, setCustomerId] = useState("");
  const [dispatchMethod, setDispatchMethod] = useState("SHOP_COLLECT");
  const [tracking, setTracking] = useState("");
  const [lpo, setLpo] = useState("");
  const [lines, setLines] = useState([{ partId: "", qty: 1 }]);

  const save = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          channel,
          customerId,
          dispatchMethod,
          tracking,
          lpo: lpo || undefined,
          lines: lines.filter((l) => l.partId),
        }),
      }),
    onSuccess: (o: any) => nav(o?.offline ? "/sales" : `/sales/${o.id}`),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-4 pb-8">
      <PageHeader eyebrow="Sales" title="New sales order" backTo="/sales" />
      <Link to="/sales" className="btn-ghost inline-flex">
        <ArrowLeft size={16} /> Back to sales
      </Link>
      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label>Channel</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {["FIELD", "SHOP", "PHONE", "WHATSAPP", "EMAIL"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">Select…</option>
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
          <label>Tracking</label>
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label>LPO</label>
          <input value={lpo} onChange={(e) => setLpo(e.target.value)} placeholder="Customer LPO / order ref" />
        </div>
      </div>
      <div className="card space-y-3">
        <h2 className="font-semibold">Lines</h2>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select className="col-span-2" value={l.partId} onChange={(e) => {
              const next = [...lines];
              next[i].partId = e.target.value;
              setLines(next);
            }}>
              <option value="">Product…</option>
              {parts.data?.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} · {p.name} ({p.qtyOnHand} in {p.binLocation})</option>
              ))}
            </select>
            <input type="number" min={1} value={l.qty} onChange={(e) => {
              const next = [...lines];
              next[i].qty = Number(e.target.value);
              setLines(next);
            }} />
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { partId: "", qty: 1 }])}>Add line</button>
        {parts.error && <p className="text-sm text-red-600">{(parts.error as Error).message}</p>}
        {lines.some((l) => {
          const p = parts.data?.find((x) => x.id === l.partId);
          return p && l.qty > p.qtyOnHand;
        }) && (
          <p className="text-sm text-amber-800">Qty is above stock on hand. You can still save a draft; confirming the sale will need enough stock.</p>
        )}
      </div>
      {save.error && <p className="text-red-600">{(save.error as Error).message}</p>}
      <div className="flex flex-wrap gap-2">
        <Link to="/sales" className="btn-ghost"><ArrowLeft size={16} /> Back to sales</Link>
        <button className="btn-gold" disabled={save.isPending}>Create draft</button>
      </div>
    </form>
  );
}
