import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList, FileStack, Package, Plus, Search, ShoppingCart, XCircle } from "lucide-react";
import { Register, useListSort } from "../components/register";
import { MobileFilters, prettyLabel } from "../components/filters";
import { EmptyRow, ExportButtons, PageHeader, Pager, RowPdf, Stat, StatGrid, Tabs, seriesByMonth, useQueryState } from "../components/ui";
import { api, downloadPurchasePdf, money } from "../lib/api";
import { usePager } from "../lib/pager";
import { useQuery } from "@tanstack/react-query";

const TONE: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-700",
  ORDERED: "bg-sky-100 text-sky-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export type Purchase = {
  id: string;
  number: string;
  status: string;
  vendorId: string;
  reference?: string | null;
  notes?: string | null;
  expectedAt?: string | null;
  createdAt: string;
  vendor: { name: string; phone?: string | null };
  createdBy?: { name: string } | null;
  lines: {
    id: string;
    partId: string;
    qtyOrdered: number;
    qtyReceived: number;
    unitCost: number;
    part: { sku: string; name: string };
  }[];
  totals: { net: number; vat: number; gross: number; received: number };
};

export function Procurement() {
  const nav = useNavigate();
  const [tabRaw, setTabRaw] = useQueryState("tab", "open");
  const tab = (["open", "received", "all"].includes(tabRaw) ? tabRaw : "open") as "open" | "received" | "all";
  const setTab = (next: "open" | "received" | "all") => setTabRaw(next);
  const [q, setQ] = useState("");
  const [status, setStatus] = useQueryState("status", "");
  const purchases = useQuery({ queryKey: ["purchases"], queryFn: () => api<Purchase[]>("/api/purchases") });

  const stats = useMemo(() => {
    const list = purchases.data || [];
    const open = list.filter((p) => ["DRAFT", "ORDERED", "PARTIAL"].includes(p.status));
    const inbound = list.filter((p) => p.status === "ORDERED" || p.status === "PARTIAL");
    const received = list.filter((p) => p.status === "RECEIVED");
    return {
      open: open.length,
      inbound: inbound.length,
      received: received.length,
      value: list.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + (p.totals?.gross || 0), 0),
      monthly: seriesByMonth(list.filter((p) => p.status !== "CANCELLED"), (p) => p.createdAt, (p) => p.totals?.gross || 0, 8),
      all: list.length,
      draft: list.filter((p) => p.status === "DRAFT").length,
      cancelled: list.filter((p) => p.status === "CANCELLED").length,
    };
  }, [purchases.data]);

  const rows = useMemo(() => {
    return (purchases.data || []).filter((p) => {
      if (tab === "open" && !["DRAFT", "ORDERED", "PARTIAL"].includes(p.status)) return false;
      if (tab === "received" && p.status !== "RECEIVED") return false;
      const hay = `${p.number} ${p.vendor.name} ${p.reference || ""} ${p.createdBy?.name || ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (status === "inbound" && p.status !== "ORDERED" && p.status !== "PARTIAL") return false;
      else if (status && status !== "inbound" && p.status !== status) return false;
      return true;
    });
  }, [purchases.data, tab, q, status]);
  const listing = useListSort(rows, [
    { id: "date", label: "Newest first", get: (p) => p.createdAt, dir: "desc" },
    { id: "total", label: "Highest total", get: (p) => p.totals.gross, dir: "desc" },
    { id: "vendor", label: "Vendor A–Z", get: (p) => p.vendor.name, dir: "asc" },
  ], "date");
  const pager = usePager(listing.sorted, `${tab}|${q}|${status}|${listing.sort}`);
  const all = purchases.data || [];

  const headers = ["PO #", "Vendor", "Ref", "Expected", "Total", "Status"];
  const filtersActive = Boolean(q || status);

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Imports" title="Procurement" />
      <StatGrid cols={6}>
        <Stat icon={ShoppingCart} label="Open POs" value={stats.open} chart="ring" max={stats.all || 1} to="/procurement?tab=open" />
        <Stat icon={Package} label="Awaiting receipt" value={stats.inbound} chart="ring" max={stats.all || 1} to="/procurement?tab=open&status=inbound" />
        <Stat icon={CheckCircle2} label="Received" value={stats.received} chart="ring" max={stats.all || 1} to="/procurement?tab=received" />
        <Stat icon={ClipboardList} label="PO value" value={money(stats.value)} series={stats.monthly} chart="area" to="/procurement?tab=all" />
        <Stat icon={FileStack} label="All POs" value={stats.all} series={stats.monthly.map(() => 1)} chart="bars" to="/procurement?tab=all" />
        <Stat icon={XCircle} label="Cancelled" value={stats.cancelled} chart="ring" max={stats.all || 1} hint={stats.draft ? `${stats.draft} drafts` : undefined} to="/procurement?tab=all" />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "open", label: "Open", count: stats.open },
          { id: "received", label: "Received", count: stats.received },
          { id: "all", label: "All POs", count: all.length },
        ]}
      />
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input
              className="min-w-0 flex-1"
              placeholder="Search PO, vendor, shipment…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <MobileFilters
            title="Filter purchases"
            onClear={() => { setQ(""); setStatus(""); }}
            fields={[
              {
                kind: "chips",
                label: "Status",
                value: status || "all",
                onChange: (v) => setStatus(v === "all" ? "" : v),
                options: [
                  { value: "all", label: "All" },
                  ...["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"].map((s) => ({ value: s, label: prettyLabel(s) })),
                ],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                  <option value="">All statuses</option>
                  {["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={() => { setQ(""); setStatus(""); }}>
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
              <ExportButtons
                title="Purchase orders"
                filename="procurement.csv"
                headers={headers}
                rows={rows.map((p) => [
                  p.number,
                  p.vendor.name,
                  p.reference || "—",
                  p.expectedAt ? new Date(p.expectedAt).toLocaleDateString() : "—",
                  String(p.totals.gross),
                  p.status,
                ])}
              />
              <Link to="/procurement/new" className="btn-gold module-btn-sm">
                <Plus size={16} /> New purchase order
              </Link>
            </div>
          </div>
        </div>
      <Register
        rows={listing.sorted}
        pager={pager}
        getId={(p) => p.id}
        onOpen={(p) => nav(`/procurement/${p.id}`)}
        empty={{ title: "No purchase orders yet — Create one", actionLabel: "Create one", to: "/procurement/new" }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (p) => p.number,
          subtitle: (p) => p.vendor.name,
          status: (p) => <span className={`badge ${TONE[p.status] || "bg-stone-100"}`}>{p.status}</span>,
          fields: [
            { label: "Expected", value: (p) => p.expectedAt ? new Date(p.expectedAt).toLocaleDateString() : "—" },
            { label: "Total", value: (p) => money(p.totals.gross), align: "right" },
            { label: "Lines", value: (p) => String(p.lines.length), align: "right" },
          ],
        }}
        action={<Link to="/procurement/new" className="btn-gold"><Plus size={16} /> New purchase order</Link>}
      >
      <div className="table-wrap">
        <table className="invoice suite-table">
          <thead>
            <tr>
              <th>PO</th>
              <th>Vendor</th>
              <th className="num">Lines</th>
              <th>Expected</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th>PDF</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={8} label="No purchase orders yet — Create one" actionLabel="Create one" to="/procurement/new" />}
            {pager.slice.map((p) => (
              <tr key={p.id} className="cursor-pointer" onClick={() => nav(`/procurement/${p.id}`)}>
                <td>
                  <Link to={`/procurement/${p.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>{p.number}</Link>
                  <div className="text-xs text-stone-500">{p.createdBy?.name || "—"}</div>
                </td>
                <td>
                  {p.vendor.name}
                  <div className="text-xs text-stone-500">{p.reference || "No supplier ref"}</div>
                </td>
                <td className="num">{p.lines.length} · {p.lines.reduce((s, l) => s + l.qtyReceived, 0)}/{p.lines.reduce((s, l) => s + l.qtyOrdered, 0)}</td>
                <td>{p.expectedAt ? new Date(p.expectedAt).toLocaleDateString() : "—"}</td>
                <td className="num">{money(p.totals.gross)}</td>
                <td><span className={`badge ${TONE[p.status] || "bg-stone-100"}`}>{p.status}</span></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost text-xs" onClick={() => downloadPurchasePdf(p.id)}>PO</button>
                    <RowPdf
                      title={p.number}
                      fields={[
                        ["PO", p.number],
                        ["Vendor", p.vendor.name],
                        ["Status", p.status],
                        ["Total", money(p.totals.gross)],
                      ]}
                    />
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {["DRAFT", "ORDERED", "PARTIAL"].includes(p.status) && (
                    <Link to={`/procurement/${p.id}#receive-goods`} className="btn-success text-xs">Receive goods</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Register>
      </section>
    </div>
  );
}
