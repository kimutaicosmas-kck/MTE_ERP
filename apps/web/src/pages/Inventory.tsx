import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { BarcodeScan } from "../components/BarcodeScan";
import { CaptureField } from "../components/CaptureField";
import { ImportButton } from "../components/ImportButton";
import { EmptyRow, ExportButtons, Modal, PageHeader, Pager, Stat, StatGrid, Tabs, useCreateOpen } from "../components/ui";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";

type Product = {
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
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tab, setTab] = useState<"all" | "low" | "dead">("all");
  const [open, setOpen] = useCreateOpen();
  const [edit, setEdit] = useState<Product | null>(null);
  const { data = [] } = useQuery({ queryKey: ["parts"], queryFn: () => api<Product[]>("/api/parts") });
  const showCost = user?.role !== "SALES";

  const categories = useMemo(() => {
    return [...new Set(data.map((p) => p.category).filter(Boolean))].sort();
  }, [data]);

  const stats = useMemo(() => {
    const low = data.filter((p) => p.lowStock).length;
    const dead = data.filter((p) => p.daysIdle >= 60).length;
    const value = data.reduce((s, p) => s + p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice), 0);
    return { products: data.length, low, dead, value };
  }, [data, showCost]);

  const rows = useMemo(() => {
    return data.filter((p) => {
      const hay = `${p.sku} ${p.oemNumber} ${p.name} ${p.category} ${p.binLocation} ${p.compat.map((c) => `${c.machineBrand} ${c.machineModel}`).join(" ")}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (category && p.category !== category) return false;
      if (tab === "low") return p.lowStock;
      if (tab === "dead") return p.daysIdle >= 60;
      return true;
    });
  }, [data, q, category, tab]);

  const pager = usePager(rows, `${tab}|${q}|${category}`);

  const headers = showCost
    ? ["Product name", "Part number", "Category", "Selling price", "Unit cost", "On hand", "Value"]
    : ["Product name", "Part number", "Category", "Selling price", "On hand", "Value"];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Catalogue" title="Inventory" />
      <StatGrid>
        <Stat label="Products" value={stats.products} />
        <Stat label="Reorder now" value={stats.low} />
        <Stat label="Dead stock" value={stats.dead} />
        <Stat label="Stock value" value={money(stats.value)} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: `All products (${stats.products})` },
          { id: "low", label: "Reorder" },
          { id: "dead", label: "Dead stock" },
        ]}
      />
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search products, part number, category…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn-ghost" onClick={() => { setQ(""); setCategory(""); }}>Clear</button>
        <BarcodeScan onDetect={(code) => setQ(code)} />
        {user?.role !== "SALES" && <ImportButton kind="parts" label="Import products" />}
        <ExportButtons
          title="Products"
          filename="products.csv"
          headers={headers}
          rows={rows.map((p) => {
            const unit = showCost ? (p.cost || 0) : p.salePrice;
            const value = p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice);
            return showCost
              ? [p.name, p.oemNumber || p.sku, p.category, String(p.salePrice), String(unit), String(p.qtyOnHand), String(value)]
              : [p.name, p.oemNumber || p.sku, p.category, String(p.salePrice), String(p.qtyOnHand), String(value)];
          })}
        />
        {user?.role !== "SALES" && (
          <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New product</button>
        )}
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Product name</th>
              <th>Part number</th>
              <th>Category</th>
              <th>Selling price / Unit cost</th>
              <th>On hand</th>
              <th>Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={7} label={data.length === 0 ? "No products in the catalogue yet." : "No products match."} />}
            {pager.slice.map((p) => {
              const value = p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice);
              return (
                <tr key={p.id}>
                  <td className="cell-wrap">
                    <div className="font-medium text-ink">{p.name}</div>
                    {p.compat.length > 0 && (
                      <div className="text-xs text-stone-400">{p.compat.map((c) => `${c.machineBrand} ${c.machineModel}`).join(", ")}</div>
                    )}
                    {p.critical && <span className="mt-1 inline-block badge bg-red-50 text-red-700">Critical</span>}
                  </td>
                  <td>
                    <div className="font-medium">{p.oemNumber || p.sku}</div>
                    {p.sku && p.sku !== p.oemNumber && <div className="text-xs text-stone-400">SKU {p.sku}</div>}
                  </td>
                  <td className="uppercase tracking-wide">{p.category || "—"}</td>
                  <td>
                    <div>{ksh(p.salePrice)}</div>
                    {showCost && <div className="text-xs text-stone-400">Cost {ksh(p.cost)}</div>}
                  </td>
                  <td className={p.lowStock ? "font-semibold text-red-600" : ""}>{p.qtyOnHand}</td>
                  <td className="font-medium">{ksh(value)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <CaptureField kind="product" refId={p.id} label="Photo" />
                      {user?.role !== "SALES" && (
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEdit(p)}>Edit</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
      {open && <ProductForm onClose={() => setOpen(false)} />}
      {edit && <ProductForm product={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ksh(n?: number) {
  return `Ksh ${Math.round(n || 0).toLocaleString("en-KE")}`;
}

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canQty = user?.role === "SUPER_ADMIN";
  const [form, setForm] = useState({
    sku: product?.sku || "",
    name: product?.name || "",
    oemNumber: product?.oemNumber || "",
    category: product?.category || "Hydraulics",
    binLocation: product?.binLocation || "",
    cost: product?.cost || 0,
    salePrice: product?.salePrice || 0,
    qtyOnHand: product?.qtyOnHand || 0,
    reorderLevel: product?.reorderLevel || 2,
    machineBrand: product?.compat?.[0]?.machineBrand || "CAT",
    machineModel: product?.compat?.[0]?.machineModel || "",
    reason: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!product) {
        return api("/api/parts", {
          method: "POST",
          body: JSON.stringify({
            sku: form.sku,
            oemNumber: form.oemNumber,
            name: form.name,
            category: form.category,
            binLocation: form.binLocation,
            cost: Number(form.cost),
            salePrice: Number(form.salePrice),
            qtyOnHand: 0,
            reorderLevel: Number(form.reorderLevel),
            compat: form.machineModel ? [{ machineBrand: form.machineBrand, machineModel: form.machineModel }] : [],
          }),
        });
      }
      await api(`/api/parts/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          oemNumber: form.oemNumber,
          category: form.category,
          binLocation: form.binLocation,
          cost: Number(form.cost),
          salePrice: Number(form.salePrice),
          reorderLevel: Number(form.reorderLevel),
        }),
      });
      const delta = Number(form.qtyOnHand) - product.qtyOnHand;
      if (canQty && delta !== 0) {
        if (!form.reason.trim()) throw new Error("Reason is required when changing quantity");
        await api(`/api/parts/${product.id}/adjust`, {
          method: "POST",
          body: JSON.stringify({
            qty: delta,
            reason: form.reason.trim(),
            type: delta > 0 ? "RECEIPT" : "ADJUSTMENT",
          }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parts"] });
      onClose();
    },
  });

  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="font-serif text-2xl">{product ? "Edit product" : "New product"}</h2>
        {product && <p className="text-sm text-stone-500">{product.sku}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!product && (
            <div><label>SKU</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></div>
          )}
          <div className={product ? "sm:col-span-2" : ""}><label>Product name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label>Part number</label><input value={form.oemNumber} onChange={(e) => setForm({ ...form, oemNumber: e.target.value })} required /></div>
          <div><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></div>
          <div><label>Bin</label><input value={form.binLocation} onChange={(e) => setForm({ ...form, binLocation: e.target.value })} required /></div>
          <div><label>Reorder level</label><input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} /></div>
          {user?.role !== "SALES" && (
            <div><label>Unit cost</label><input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></div>
          )}
          <div><label>Selling price</label><input type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} /></div>
          {product && (
            <div>
              <label>On hand</label>
              <input
                type="number"
                value={form.qtyOnHand}
                disabled={!canQty}
                onChange={(e) => setForm({ ...form, qtyOnHand: Number(e.target.value) })}
              />
            </div>
          )}
          {!product && (
            <>
              <div><label>Machine brand</label><input value={form.machineBrand} onChange={(e) => setForm({ ...form, machineBrand: e.target.value })} /></div>
              <div><label>Machine model</label><input value={form.machineModel} onChange={(e) => setForm({ ...form, machineModel: e.target.value })} /></div>
            </>
          )}
          {product && canQty && Number(form.qtyOnHand) !== product.qtyOnHand && (
            <div className="sm:col-span-2">
              <label>Qty change reason</label>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="Why is the quantity changing?" />
            </div>
          )}
        </div>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" disabled={save.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
