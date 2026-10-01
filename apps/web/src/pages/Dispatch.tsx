import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyRow, PageHeader, Pager, PdfCircle, Stat, StatGrid, Tabs } from "../components/ui";
import { api, downloadPdf } from "../lib/api";
import { usePager } from "../lib/pager";

const TABS = [
  ["all", "All"],
  ["CONFIRMED", "To pick"],
  ["PICKING", "Picking"],
  ["PICKED", "Ready"],
  ["DISPATCHED", "On courier"],
  ["DELIVERED", "Delivered"],
] as const;

const NEXT: Record<string, { status: string; label: string; success?: boolean }> = {
  CONFIRMED: { status: "PICKING", label: "Start picking" },
  PICKING: { status: "PICKED", label: "Mark ready" },
  PICKED: { status: "DISPATCHED", label: "Dispatch" },
  DISPATCHED: { status: "DELIVERED", label: "Mark delivered", success: true },
};

const LABEL: Record<string, string> = {
  CONFIRMED: "To pick",
  PICKING: "Picking",
  PICKED: "Ready",
  DISPATCHED: "On courier",
  DELIVERED: "Delivered",
};

export function Dispatch() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["orders"], queryFn: () => api<any[]>("/api/orders") });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string>("all");
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const queue = useMemo(() => {
    return data.filter((o) => o.status !== "DRAFT" && o.status !== "CANCELLED" && o.status !== "PAID");
  }, [data]);

  const rows = useMemo(() => {
    return queue.filter((o) => {
      if (tab !== "all" && o.status !== tab) return false;
      return `${o.number} ${o.customer?.name || ""}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [queue, q, tab]);

  const pager = usePager(rows, `${tab}|${q}`);
  const count = (s: string) => queue.filter((o) => o.status === s).length;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Warehouse" title="Dispatch" />
      <StatGrid>
        <Stat label="To pick" value={count("CONFIRMED")} />
        <Stat label="Ready" value={count("PICKED")} />
        <Stat label="On courier" value={count("DISPATCHED")} />
        <Stat label="Delivered" value={count("DELIVERED")} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={TABS.map(([id, label]) => ({ id, label: id === "all" ? `${label} (${queue.length})` : label }))}
      />
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search orders…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
      </div>
      {move.error && <p className="text-sm text-red-600">{(move.error as Error).message}</p>}
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Method</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={5} label="No dispatch jobs match." />}
            {pager.slice.map((o) => {
              const next = NEXT[o.status];
              return (
                <tr key={o.id}>
                  <td>
                    <Link className="font-medium text-ink" to={`/sales/${o.id}`}>{o.number}</Link>
                  </td>
                  <td className="uppercase tracking-wide">{o.customer?.name || "—"}</td>
                  <td className="capitalize">{String(o.dispatchMethod || "").replace(/_/g, " ").toLowerCase()}</td>
                  <td>
                    <span className={`text-xs font-semibold uppercase ${o.status === "DELIVERED" ? "text-emerald-600" : "text-amber-600"}`}>
                      {LABEL[o.status] || o.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      {next && (
                        <button
                          className={`${next.success ? "btn-success" : "btn-gold"} px-3 py-1 text-xs`}
                          disabled={move.isPending}
                          onClick={() => move.mutate({ id: o.id, status: next.status })}
                        >
                          {next.label}
                        </button>
                      )}
                      <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => downloadPdf(o.id, "delivery")}>
                        Delivery note
                      </button>
                      <PdfCircle orderId={o.id} kind="order" title="Download sales order" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}
