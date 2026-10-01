import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { EmptyRow, ExportButtons, PageHeader, Pager, RowPdf, Stat, StatGrid, Tabs } from "../components/ui";
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
  const [tab, setTab] = useState<"open" | "received" | "all">("open");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
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
    };
  }, [purchases.data]);

  const rows = useMemo(() => {
    return (purchases.data || []).filter((p) => {
      if (tab === "open" && !["DRAFT", "ORDERED", "PARTIAL"].includes(p.status)) return false;
      if (tab === "received" && p.status !== "RECEIVED") return false;
      const hay = `${p.number} ${p.vendor.name} ${p.reference || ""} ${p.createdBy?.name || ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (status && p.status !== status) return false;
      return true;
    });
  }, [purchases.data, tab, q, status]);
  const pager = usePager(rows, `${tab}|${q}|${status}`);

  const headers = ["PO #", "Vendor", "Ref", "Expected", "Total", "Status"];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Imports" title="Procurement" />
      <StatGrid>
        <Stat label="Open POs" value={stats.open} />
        <Stat label="Awaiting receipt" value={stats.inbound} />
        <Stat label="Received" value={stats.received} />
        <Stat label="PO value" value={money(stats.value)} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "open", label: "Open" },
          { id: "received", label: "Received" },
          { id: "all", label: "All POs" },
        ]}
      />
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search PO, vendor, shipment…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn-ghost" onClick={() => { setQ(""); setStatus(""); }}>Clear</button>
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
        <Link to="/procurement/new" className="btn-gold">
          <Plus size={16} /> New purchase order
        </Link>
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>PO</th>
              <th>Vendor</th>
              <th>Lines</th>
              <th>Expected</th>
              <th>Total</th>
              <th>Status</th>
              <th>PDF</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={8} label="No purchase orders match." />}
            {pager.slice.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/procurement/${p.id}`} className="font-semibold hover:underline">{p.number}</Link>
                  <div className="text-xs text-stone-500">{p.createdBy?.name || "—"}</div>
                </td>
                <td>
                  {p.vendor.name}
                  <div className="text-xs text-stone-500">{p.reference || "No supplier ref"}</div>
                </td>
                <td>{p.lines.length} · {p.lines.reduce((s, l) => s + l.qtyReceived, 0)}/{p.lines.reduce((s, l) => s + l.qtyOrdered, 0)}</td>
                <td>{p.expectedAt ? new Date(p.expectedAt).toLocaleDateString() : "—"}</td>
                <td>{money(p.totals.gross)}</td>
                <td><span className={`badge ${TONE[p.status] || "bg-stone-100"}`}>{p.status}</span></td>
                <td>
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
                <td>
                  {["DRAFT", "ORDERED", "PARTIAL"].includes(p.status) && (
                    <Link to={`/procurement/${p.id}#receive-goods`} className="btn-success text-xs">Receive goods</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}
