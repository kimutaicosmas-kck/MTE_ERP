import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api, money } from "../lib/api";

type Part = {
  id: string;
  sku: string;
  oemNumber: string;
  name: string;
  qtyOnHand: number;
  salePrice: number;
  binLocation: string;
  compat: { machineBrand: string; machineModel: string }[];
};

export function MachinePartSearch({
  onPick,
  compact,
}: {
  onPick?: (part: Part) => void;
  compact?: boolean;
}) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [oem, setOem] = useState("");
  const [q, setQ] = useState("");
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (brand.trim()) p.set("brand", brand.trim());
    if (model.trim()) p.set("model", model.trim());
    if (oem.trim()) p.set("oem", oem.trim());
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [brand, model, oem, q]);
  const active = Boolean(brand.trim() || model.trim() || oem.trim() || q.trim());
  const { data = [], isFetching } = useQuery({
    queryKey: ["parts-search", query],
    queryFn: () => api<Part[]>(`/api/parts/search?${query}`),
    enabled: active,
  });

  return (
    <div className={`card space-y-3 ${compact ? "!p-3" : ""}`}>
      <div className="flex items-center gap-2">
        <Search size={16} className="text-stone-400" />
        <h3 className="font-semibold">{compact ? "Find by machine" : "Find parts by machine or OEM"}</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input placeholder="Machine brand (e.g. CAT)" value={brand} onChange={(e) => setBrand(e.target.value)} />
        <input placeholder="Machine model (e.g. 320D)" value={model} onChange={(e) => setModel(e.target.value)} />
        <input placeholder="OEM / part number" value={oem} onChange={(e) => setOem(e.target.value)} />
        <input placeholder="Keyword" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {active && isFetching && <p className="text-sm text-stone-500">Searching…</p>}
      {active && !isFetching && data.length === 0 && <p className="text-sm text-stone-500">No matching products.</p>}
      {data.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200/80 dark:border-white/10">
          <table className="invoice text-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>OEM</th>
                <th>Bin</th>
                <th className="num">Stock</th>
                <th className="num">Price</th>
                {onPick && <th />}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 20).map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.compat.map((c) => `${c.machineBrand} ${c.machineModel}`).join(", ") || p.sku}</div>
                  </td>
                  <td>{p.oemNumber}</td>
                  <td>{p.binLocation}</td>
                  <td className="num">{p.qtyOnHand}</td>
                  <td className="num">{money(p.salePrice)}</td>
                  {onPick && (
                    <td>
                      <button type="button" className="btn-gold px-2 py-1 text-xs" onClick={() => onPick(p)}>Add</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
