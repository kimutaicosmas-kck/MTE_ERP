import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Lock, Package, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MachinePartSearch } from "../components/MachinePartSearch";
import { CaptureField } from "../components/CaptureField";
import { ImportButton } from "../components/ImportButton";
import { Register, useListSort } from "../components/register";
import { MobileFilters } from "../components/filters";
import { EmptyRow, ExportButtons, Modal, PageHeader, Pager, Stat, StatGrid, useCreateOpen, useQueryState } from "../components/ui";
import { ModuleReportsPanel } from "../components/ModuleReportsPanel";
import { InvDash, InventoryMovements, InventoryOverview, InventoryWarehouses } from "./inventory/InventoryPanels";
import { canModule } from "../lib/access";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";

const INVENTORY_SECTIONS = [
  { id: "overview", label: "Dashboard" },
  { id: "products", label: "Item master" },
  { id: "movements", label: "Movements" },
  { id: "reports", label: "Inventory reports" },
  { id: "reorder", label: "Reorder planning" },
  { id: "warehouses", label: "Warehouses" },
  { id: "dispatch", label: "Dispatch", to: "/dispatch" },
  { id: "analytics", label: "Analytics", to: "/reports?hub=executive" },
  { id: "audit", label: "Audit", to: "/audit" },
] as const;
type InventorySection = (typeof INVENTORY_SECTIONS)[number]["id"];

type InvTab = "all" | "low" | "out" | "dead";

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

function stockKind(p: Product) {
  if (p.qtyOnHand <= 0) return "out";
  if (p.lowStock || p.qtyOnHand <= p.reorderLevel) return "low";
  return "ok";
}

function shortfall(p: Product) {
  return Math.max(0, (p.reorderLevel || 0) - (p.qtyOnHand || 0));
}

function StockBadge({ product }: { product: Product }) {
  const kind = stockKind(product);
  if (kind === "out") return <span className="status-pill status-pill-danger">Out of stock</span>;
  if (kind === "low") return <span className="status-pill status-pill-warn">Low stock</span>;
  return <span className="status-pill status-pill-ok">In stock</span>;
}

export function Inventory() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [sectionRaw, setSectionRaw] = useQueryState("section", "overview");
  const section = (INVENTORY_SECTIONS.some((s) => s.id === sectionRaw) ? sectionRaw : "overview") as InventorySection;
  const setSection = (next: InventorySection) => setSectionRaw(next);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tabRaw, setTabRaw] = useQueryState("tab", "all");
  const tab = (["all", "low", "out", "dead"].includes(tabRaw) ? tabRaw : "all") as InvTab;
  const setTab = (next: InvTab) => setTabRaw(next);
  const [open, setOpen] = useCreateOpen();
  const [edit, setEdit] = useState<Product | null>(null);
  const { data = [] } = useQuery({ queryKey: ["parts"], queryFn: () => api<Product[]>("/api/parts") });
  const dash = useQuery({
    queryKey: ["inventory-dashboard"],
    queryFn: () => api<InvDash>("/api/inventory/dashboard"),
  });

  useEffect(() => {
    if (!params.has("section")) {
      const t = params.get("tab");
      if (t === "low" || t === "out" || t === "dead") setSectionRaw(t === "low" || t === "out" ? "reorder" : "products");
      else if (t && t !== "all") setSectionRaw("products");
    }
  }, []);

  useEffect(() => {
    if (section === "reorder" && tab === "all") setTabRaw("low");
  }, [section, tab, setTabRaw]);
  const showCost = user?.role !== "SALES";
  const canBuy = canModule(user, "procurement");

  const categories = useMemo(() => {
    return [...new Set(data.map((p) => p.category).filter(Boolean))].sort();
  }, [data]);

  const stats = useMemo(() => {
    const low = data.filter((p) => stockKind(p) === "low" || stockKind(p) === "out").length;
    const out = data.filter((p) => stockKind(p) === "out").length;
    const dead = data.filter((p) => p.daysIdle >= 60).length;
    const value = data.reduce((s, p) => s + p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice), 0);
    const cats = [...new Set(data.map((p) => p.category).filter(Boolean))].slice(0, 8);
    const byCat = cats.map((c) => data.filter((p) => p.category === c).length);
    const valueBars = cats.map((c) => data.filter((p) => p.category === c).reduce((s, p) => s + p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice), 0));
    const short = data.reduce((s, p) => s + shortfall(p), 0);
    return { products: data.length, low, out, dead, value, byCat, valueBars, short };
  }, [data, showCost]);

  const rows = useMemo(() => {
    return data.filter((p) => {
      const hay = `${p.sku} ${p.oemNumber} ${p.name} ${p.category} ${p.binLocation} ${p.compat.map((c) => `${c.machineBrand} ${c.machineModel}`).join(" ")}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (category && p.category !== category) return false;
      if (tab === "low") return stockKind(p) === "low" || stockKind(p) === "out";
      if (tab === "out") return stockKind(p) === "out";
      if (tab === "dead") return p.daysIdle >= 60;
      return true;
    });
  }, [data, q, category, tab]);

  const listing = useListSort(rows, [
    { id: "urgent", label: "Most urgent", get: (p) => (stockKind(p) === "out" ? 0 : stockKind(p) === "low" ? 1 : 2) * 1000 + p.qtyOnHand, dir: "asc" },
    { id: "name", label: "Name A–Z", get: (p) => p.name, dir: "asc" },
    { id: "qty", label: "Lowest on hand", get: (p) => p.qtyOnHand, dir: "asc" },
    { id: "idle", label: "Longest idle", get: (p) => p.daysIdle, dir: "desc" },
    { id: "value", label: "Highest value", get: (p) => p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice), dir: "desc" },
    { id: "price", label: "Highest price", get: (p) => p.salePrice, dir: "desc" },
  ], tab === "low" || tab === "out" ? "urgent" : tab === "dead" ? "idle" : "name");
  useEffect(() => {
    listing.setSort(tab === "low" || tab === "out" ? "urgent" : tab === "dead" ? "idle" : "name");
  }, [tab]);
  const pager = usePager(listing.sorted, `${tab}|${q}|${category}|${listing.sort}`, 12, true);

  const headers = showCost
    ? ["Product name", "Part number", "Category", "Selling price", "Unit cost", "On hand", "Value"]
    : ["Product name", "Part number", "Category", "Selling price", "On hand", "Value"];

  const showCatalog = section === "products" || section === "reorder";

  const movementSeries = useMemo(() => {
    const trend = dash.data?.movementTrend;
    if (trend?.length) return trend;
    const r = dash.data?.receivedToday ?? 0;
    const i = dash.data?.issuedToday ?? 0;
    return [1, 2, 1, 3, 2, r, i, r + i].slice(-14);
  }, [dash.data]);

  const lowOutCount = dash.data ? dash.data.low + dash.data.out : stats.low;
  const filtersActive = Boolean(q || category || tab !== "all");

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader
        eyebrow="Stock"
        title={
          section === "products" || section === "reorder"
            ? "Item master"
            : INVENTORY_SECTIONS.find((s) => s.id === section)?.label || "Inventory"
        }
      />
      <StatGrid cols={6}>
        <Stat
          label="Stock value"
          amount={dash.data?.inventoryValue ?? stats.value}
          icon={Package}
          chart="area"
          series={stats.valueBars.length ? stats.valueBars : movementSeries}
          hint={`${stats.products} SKUs`}
          to="/inventory?section=products"
        />
        <Stat
          label="Available"
          value={String(Math.round(dash.data?.available ?? data.reduce((s, p) => s + p.qtyOnHand, 0)))}
          icon={Boxes}
          chart="bars"
          series={stats.byCat.length ? stats.byCat : movementSeries}
          hint="Units on hand"
          to="/inventory?section=products"
        />
        <Stat
          label="Reserved"
          value={String(Math.round(dash.data?.reserved ?? 0))}
          icon={Lock}
          chart="meter"
          share={dash.data?.available ? (dash.data.reserved || 0) / Math.max(1, dash.data.available + (dash.data.reserved || 0)) : undefined}
          hint="Open orders"
          to="/dispatch"
        />
        <Stat
          label="Low / out"
          value={String(lowOutCount)}
          icon={AlertTriangle}
          chart="ring"
          max={stats.products || 1}
          hint={`${dash.data?.out ?? stats.out} out`}
          to="/inventory?section=reorder"
        />
        <Stat
          label="Received today"
          value={String(Math.round(dash.data?.receivedToday ?? 0))}
          icon={ArrowDownToLine}
          chart="spark"
          series={movementSeries}
          hint="Goods in"
          to="/inventory?section=movements"
        />
        <Stat
          label="Issued today"
          value={String(Math.round(dash.data?.issuedToday ?? 0))}
          icon={ArrowUpFromLine}
          chart="spark"
          series={[...movementSeries].reverse()}
          hint="Goods out"
          to="/inventory?section=movements"
        />
      </StatGrid>
      {section === "overview" && <InventoryOverview dash={dash.data} />}
      {section === "movements" && <InventoryMovements />}
      {section === "reports" && <ModuleReportsPanel moduleId="inventory" />}
      {section === "warehouses" && <InventoryWarehouses />}

      {showCatalog && (
      <>
      <MachinePartSearch onPick={(p) => user?.role !== "SALES" && setEdit(p as Product)} />
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input
              className="min-w-0 flex-1"
              placeholder="Search products…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <MobileFilters
            title="Filter products"
            onClear={() => { setQ(""); setCategory(""); setTab("all"); }}
            fields={[
              {
                kind: "select",
                label: "Stock level",
                value: tab,
                onChange: (v) => setTab(v as InvTab),
                options: [
                  { value: "all", label: "All products" },
                  { value: "low", label: "Low stock" },
                  { value: "out", label: "Out of stock" },
                  { value: "dead", label: "Dead stock" },
                ],
              },
              {
                kind: "select",
                label: "Category",
                value: category,
                onChange: setCategory,
                options: [{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={tab} onChange={(e) => setTab(e.target.value as InvTab)} aria-label="Stock level">
                  <option value="all">All products</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock</option>
                  <option value="dead">Dead stock</option>
                </select>
                <select className="module-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  className="module-filter-reset"
                  disabled={!filtersActive}
                  onClick={() => { setQ(""); setCategory(""); setTab("all"); }}
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
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
                <button type="button" className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New product</button>
              )}
            </div>
          </div>
        </div>
      <Register
        forceTable
        rows={listing.sorted}
        pager={pager}
        getId={(p) => p.id}
        onOpen={user?.role !== "SALES" ? (p) => setEdit(p) : undefined}
        empty={{
          title: data.length === 0 ? "No products yet — Create one" : tab === "low" ? "Nothing is low" : tab === "out" ? "Nothing is out of stock" : tab === "dead" ? "No idle stock" : "No products match",
          actionLabel: (tab === "low" || tab === "out") && canBuy ? "Raise a purchase" : user?.role !== "SALES" ? "Create one" : undefined,
          to: (tab === "low" || tab === "out") && canBuy ? "/procurement/new" : undefined,
          onAction: !((tab === "low" || tab === "out") && canBuy) && user?.role !== "SALES" ? () => setOpen(true) : undefined,
        }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (p) => p.name,
          subtitle: (p) => p.oemNumber || p.sku,
          status: (p) => <StockBadge product={p} />,
          fields: [
            { label: "On hand", value: (p) => `${p.qtyOnHand} / ${p.reorderLevel}`, align: "right" },
            { label: "Idle", value: (p) => `${p.daysIdle}d`, align: "right" },
            { label: "Value", value: (p) => ksh(p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice)), align: "right" },
          ],
          details: (p) => [
            { label: "Part number", value: p.oemNumber || p.sku },
            { label: "Category", value: p.category || "—" },
            { label: "On hand / min", value: `${p.qtyOnHand} / ${p.reorderLevel}`, align: "right" },
            { label: "Short by", value: shortfall(p) || "—", align: "right" },
            { label: "Days idle", value: `${p.daysIdle} days` },
            { label: "Value", value: ksh(p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice)), align: "right" },
          ],
        }}
        action={user?.role !== "SALES" ? <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New product</button> : undefined}
      >
      <div className="table-wrap table-keep">
        <table className="invoice">
          <thead>
            <tr>
              <th>Product name</th>
              <th>Part number</th>
              <th>Category</th>
              <th className="num">On hand / min</th>
              <th>Status</th>
              <th className="num">Idle</th>
              <th className="num">Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={7} label={data.length === 0 ? "No products yet — Create one" : "No products match."} actionLabel={user?.role !== "SALES" ? "Create one" : undefined} onAction={() => setOpen(true)} />}
            {pager.slice.map((p) => {
              const value = p.qtyOnHand * (showCost ? (p.cost || p.salePrice) : p.salePrice);
              return (
                <tr key={p.id} className="cursor-pointer" onClick={() => user?.role !== "SALES" && setEdit(p)}>
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
                  <td className="num">
                    <div className="font-medium">{p.qtyOnHand} / {p.reorderLevel}</div>
                    {shortfall(p) > 0 && <div className="text-xs text-amber-700">Short {shortfall(p)}</div>}
                  </td>
                  <td><StockBadge product={p} /></td>
                  <td className="num">{p.daysIdle}d</td>
                  <td className="num font-medium">{ksh(value)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <CaptureField kind="product" refId={p.id} label="Photo" />
                      {user?.role !== "SALES" && (
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEdit(p)}>Edit</button>
                      )}
                      {canBuy && stockKind(p) !== "ok" && (
                        <Link className="btn-gold px-3 py-1 text-xs" to="/procurement/new">Buy</Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Register>
      </section>
      </>
      )}
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
  const serials = useQuery({
    queryKey: ["serials", product?.id],
    queryFn: () => api<{ id: string; code: string; status: string }[]>(`/api/parts/${product!.id}/serials`),
    enabled: !!product?.id,
  });
  const [serialCode, setSerialCode] = useState("");
  const addSerial = useMutation({
    mutationFn: () => api(`/api/parts/${product!.id}/serials`, { method: "POST", body: JSON.stringify({ code: serialCode }) }),
    onSuccess: () => {
      setSerialCode("");
      qc.invalidateQueries({ queryKey: ["serials", product?.id] });
    },
  });
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
        <h2 className="text-xl font-semibold tracking-tight">{product ? "Edit product" : "New product"}</h2>
        {product && <p className="text-sm text-stone-500">{product.sku}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!product && (
            <div><label>SKU</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></div>
          )}
          <div className={product ? "sm:col-span-2" : ""}><label>Product name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label>Part number</label><input value={form.oemNumber} onChange={(e) => setForm({ ...form, oemNumber: e.target.value })} required /></div>
          <div><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></div>
          <div><label>Bin</label><input value={form.binLocation} onChange={(e) => setForm({ ...form, binLocation: e.target.value })} required /></div>
          <div><label>Low stock level</label><input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} /></div>
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
        {product && user?.role !== "SALES" && (
          <div className="space-y-2 border-t pt-3">
            <h3 className="font-semibold">Serial numbers</h3>
            <div className="flex gap-2">
              <input className="flex-1" placeholder="Serial code" value={serialCode} onChange={(e) => setSerialCode(e.target.value)} />
              <button type="button" className="btn-gold" disabled={!serialCode.trim() || addSerial.isPending} onClick={() => addSerial.mutate()}>Add</button>
            </div>
            {(serials.data || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {serials.data!.map((s) => (
                  <span key={s.id} className={`badge ${s.status === "IN_STOCK" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{s.code} · {s.status.replace(/_/g, " ").toLowerCase()}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          {product && user?.role !== "SALES" && (
            <button
              type="button"
              className="btn-danger mr-auto"
              onClick={() => {
                const reason = prompt("Reason to remove this product") || "";
                if (!reason) return;
                api(`/api/parts/${product.id}`, { method: "DELETE", body: JSON.stringify({ reason }) })
                  .then(() => { qc.invalidateQueries({ queryKey: ["parts"] }); onClose(); })
                  .catch((err) => alert((err as Error).message));
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" disabled={save.isPending}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
