import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { EnterpriseRoadmap } from "../../components/EnterpriseRoadmap";
import { EmptyRow, Pager } from "../../components/ui";
import { api } from "../../lib/api";
import { usePager } from "../../lib/pager";

export type InvDash = {
  products: number;
  inventoryValue: number;
  available: number;
  reserved: number;
  low: number;
  out: number;
  dead: number;
  receivedToday: number;
  issuedToday: number;
  onOrder: number;
  movementTrend?: number[];
};

type Movement = {
  id: string;
  type: string;
  qty: number;
  reference?: string | null;
  reason?: string | null;
  createdAt: string;
  part: { id: string; sku: string; name: string; binLocation?: string };
  user?: { name: string } | null;
};

const QUICK_LINKS = [
  { label: "Item master", to: "/inventory?section=products" },
  { label: "Movements", to: "/inventory?section=movements" },
  { label: "Reorder planning", to: "/inventory?section=reorder" },
  { label: "Dispatch", to: "/dispatch" },
] as const;

export function InventoryOverview({ dash }: { dash?: InvDash | null }) {
  const { data: recent = [], isLoading } = useQuery({
    queryKey: ["inventory-movements", "recent"],
    queryFn: () => api<Movement[]>("/api/inventory/movements"),
    select: (rows) => rows.slice(0, 6),
  });

  return (
    <div className="space-y-4">
      <div className="dash-insight-grid">
        {QUICK_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="dash-insight-card group">
            <span className="font-semibold text-ink">{link.label}</span>
            <ChevronRight size={16} className="mt-2 text-stone-400 group-hover:text-gold" aria-hidden />
          </Link>
        ))}
      </div>

      <section className="suite-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Recent movements</h2>
          <Link className="text-sm font-medium text-gold hover:underline" to="/inventory?section=movements">
            View all
          </Link>
        </div>
        <div className="table-wrap">
          <table className="invoice">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Product</th>
                <th className="num">Qty</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-sm text-stone-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && recent.length === 0 && <EmptyRow cols={5} label="No movements recorded yet." />}
              {recent.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>
                    <span className="status-pill status-pill-info">{m.type}</span>
                  </td>
                  <td>
                    {m.part.name}{" "}
                    <span className="font-mono text-xs text-stone-400">{m.part.sku}</span>
                  </td>
                  <td className="num font-medium">{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                  <td className="text-stone-500">{m.reference || m.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dash?.onOrder ? (
          <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-500">
            {dash.onOrder} open PO line{dash.onOrder === 1 ? "" : "s"} —{" "}
            <Link className="font-medium text-gold hover:underline" to="/procurement">
              procurement
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}

export function InventoryMovements() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["inventory-movements"],
    queryFn: () => api<Movement[]>("/api/inventory/movements"),
  });
  const pager = usePager(data, "movements");
  return (
    <div className="space-y-3">
      {isLoading && <p className="text-sm text-stone-500">Loading movements…</p>}
      <div className="suite-panel suite-panel-table overflow-hidden">
        <div className="table-wrap">
          <table className="invoice">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Product</th>
                <th>Bin</th>
                <th className="num">Qty</th>
                <th>Reference</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {pager.slice.length === 0 && !isLoading && <EmptyRow cols={7} label="No movements recorded yet." />}
              {pager.slice.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>
                    <span className="status-pill status-pill-info">{m.type}</span>
                  </td>
                  <td>
                    {m.part.name} <span className="font-mono text-xs text-stone-400">{m.part.sku}</span>
                  </td>
                  <td>{m.part.binLocation || "—"}</td>
                  <td className="num font-medium">{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                  <td className="text-stone-500">{m.reference || m.reason || "—"}</td>
                  <td>{m.user?.name || "System"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager {...pager} />
      </div>
    </div>
  );
}

type WarehouseTree = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  zones: {
    id: string;
    code: string;
    label: string;
    bins: { id: string; code: string; label?: string | null; _count: { parts: number } }[];
  }[];
};

export function InventoryWarehouses() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api<WarehouseTree[]>("/api/inventory/warehouses"),
  });
  const sync = useMutation({
    mutationFn: () => api("/api/inventory/warehouses/sync-bins", { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warehouses"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">Sites, zones, and bins. Product bin codes sync from legacy locations on load.</p>
        <button type="button" className="btn-ghost text-sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
          Sync bins from products
        </button>
      </div>
      {isLoading && <p className="text-sm text-stone-500">Loading warehouses…</p>}
      {data.map((site) => (
        <section key={site.id} className="suite-panel overflow-hidden">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="font-semibold text-ink">{site.name}</h2>
            <p className="text-xs text-stone-500">{site.code}{site.address ? ` · ${site.address}` : ""}</p>
          </div>
          <div className="divide-y divide-stone-100">
            {site.zones.map((zone) => (
              <div key={zone.id} className="px-4 py-3">
                <div className="mb-2 text-sm font-medium">Zone {zone.code} — {zone.label}</div>
                <div className="flex flex-wrap gap-2">
                  {zone.bins.length === 0 && <span className="text-xs text-stone-400">No bins yet</span>}
                  {zone.bins.map((bin) => (
                    <span key={bin.id} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-mono">
                      {site.code}-{zone.code}-{bin.code}
                      {bin._count.parts > 0 ? ` (${bin._count.parts})` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <EnterpriseRoadmap
        items={[
          { title: "Stock transfers", status: "planned", blurb: "Inter-branch moves with in-transit ledger." },
          { title: "Cycle counts", status: "planned", blurb: "Blind counts with variance posting to finance." },
        ]}
      />
    </div>
  );
}
