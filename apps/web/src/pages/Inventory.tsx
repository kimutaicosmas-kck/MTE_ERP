import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";

type Part = {
  id: string;
  sku: string;
  oemNumber: string;
  name: string;
  category: string;
  binLocation: string;
  cost: number;
  salePrice: number;
  qtyOnHand: number;
  reorderLevel: number;
  critical: boolean;
  daysIdle: number;
  lowStock: boolean;
  compat: { machineBrand: string; machineModel: string }[];
};

export function Inventory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "low" | "dead">("all");
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["parts"], queryFn: () => api<Part[]>("/api/parts") });
  const showCost = user?.role !== "SALES";

  const rows = useMemo(() => {
    return data.filter((p) => {
      const hay = `${p.sku} ${p.oemNumber} ${p.name} ${p.binLocation} ${p.compat.map((c) => `${c.machineBrand} ${c.machineModel}`).join(" ")}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (tab === "low") return p.lowStock;
      if (tab === "dead") return p.daysIdle >= 60;
      return true;
    });
  }, [data, q, tab]);

  const adjust = useMutation({
    mutationFn: (p: { id: string; qty: number; reason: string; type: string }) =>
      api(`/api/parts/${p.id}/adjust`, { method: "POST", body: JSON.stringify(p) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parts"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Catalogue</p>
          <h1 className="font-serif text-4xl">Inventory</h1>
        </div>
        {user?.role !== "SALES" && (
          <button className="btn-gold" onClick={() => setOpen(true)}>New part</button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="max-w-sm" placeholder="Search SKU, OEM, machine, bin…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(["all", "low", "dead"] as const).map((t) => (
          <button key={t} className={tab === t ? "btn" : "btn-ghost"} onClick={() => setTab(t)}>
            {t === "all" ? "All" : t === "low" ? "Reorder" : "Dead stock"}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>SKU / OEM</th>
              <th>Part</th>
              <th>Bin</th>
              <th>On hand</th>
              {showCost && <th>Cost</th>}
              <th>Sale</th>
              <th>Age</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="font-semibold">{p.sku}</div>
                  <div className="text-xs text-stone-500">{p.oemNumber}</div>
                </td>
                <td>
                  {p.name}
                  <div className="text-xs text-stone-500">
                    {p.compat.map((c) => `${c.machineBrand} ${c.machineModel}`).join(", ")}
                    {p.critical && <span className="ml-2 badge bg-red-100 text-red-800">Critical</span>}
                  </div>
                </td>
                <td>{p.binLocation}</td>
                <td className={p.lowStock ? "font-semibold text-red-700" : ""}>{p.qtyOnHand}</td>
                {showCost && <td>{money(p.cost)}</td>}
                <td>{money(p.salePrice)}</td>
                <td>{p.daysIdle}d</td>
                <td>
                  {user?.role !== "SALES" && (
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => {
                        const qty = Number(prompt("Adjust qty (+ receive / − write-off)", "1"));
                        const reason = prompt("Reason (required)") || "";
                        if (!qty || !reason) return;
                        adjust.mutate({ id: p.id, qty, reason, type: qty > 0 ? "RECEIPT" : "ADJUSTMENT" });
                      }}
                    >
                      Adjust
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <NewPart onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewPart({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    sku: "", oemNumber: "", name: "", category: "Hydraulics", binLocation: "", cost: 0, salePrice: 0, qtyOnHand: 0, reorderLevel: 2, machineBrand: "CAT", machineModel: "",
  });
  const save = useMutation({
    mutationFn: () =>
      api("/api/parts", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          cost: Number(form.cost),
          salePrice: Number(form.salePrice),
          qtyOnHand: Number(form.qtyOnHand),
          reorderLevel: Number(form.reorderLevel),
          compat: form.machineModel ? [{ machineBrand: form.machineBrand, machineModel: form.machineModel }] : [],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      onClose();
    },
  });
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4">
      <form
        className="card w-full max-w-lg space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="font-serif text-2xl">New part</h2>
        <div className="grid grid-cols-2 gap-3">
          {(["sku", "oemNumber", "name", "category", "binLocation"] as const).map((k) => (
            <div key={k}>
              <label>{k}</label>
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required />
            </div>
          ))}
          <div><label>Cost</label><input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></div>
          <div><label>Sale price</label><input type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} /></div>
          <div><label>Qty</label><input type="number" value={form.qtyOnHand} onChange={(e) => setForm({ ...form, qtyOnHand: Number(e.target.value) })} /></div>
          <div><label>Reorder</label><input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} /></div>
          <div><label>Brand</label><input value={form.machineBrand} onChange={(e) => setForm({ ...form, machineBrand: e.target.value })} /></div>
          <div><label>Model</label><input value={form.machineModel} onChange={(e) => setForm({ ...form, machineModel: e.target.value })} /></div>
        </div>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={save.isPending}>Save</button>
        </div>
      </form>
    </div>
  );
}
