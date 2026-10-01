import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyRow, ExportButtons, PageHeader, Pager, PdfCircle, Stat, StatGrid, Tabs } from "../components/ui";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";

const FLOW = ["DRAFT", "CONFIRMED", "PICKING", "PICKED", "DISPATCHED", "DELIVERED"];
const STATUSES = ["DRAFT", "CONFIRMED", "PICKING", "PICKED", "DISPATCHED", "DELIVERED", "PAID", "CANCELLED"];

type Order = {
  id: string;
  number: string;
  channel: string;
  status: string;
  createdAt: string;
  dispatchMethod: string;
  customer: { name: string };
  salesperson?: { id: string; name: string };
  totals: { gross: number; paid: number; balance: number };
};

export function Sales() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sales = user?.role === "SALES";
  const [tab, setTab] = useState<"orders" | "quotes">("orders");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [person, setPerson] = useState("");
  const [when, setWhen] = useState("today");

  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api<Order[]>("/api/orders") });

  const complete = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      api(`/api/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status: next }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const stats = useMemo(() => {
    const list = (orders.data || []).filter((o) => o.status !== "DRAFT" && o.status !== "CANCELLED");
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const month = now.getMonth();
    const year = now.getFullYear();
    const sum = (items: Order[]) => items.reduce((s, o) => s + (o.totals?.gross || 0), 0);
    const today = list.filter((o) => new Date(o.createdAt) >= startToday);
    const thisMonth = list.filter((o) => {
      const d = new Date(o.createdAt);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    const successful = list.filter((o) => o.status === "DELIVERED" || o.status === "PAID" || o.status === "DISPATCHED");
    return {
      today: sum(today),
      month: sum(thisMonth),
      successful: successful.length,
      allTime: sum(list),
    };
  }, [orders.data]);

  const people = useMemo(() => {
    const names = new Set((orders.data || []).map((o) => o.salesperson?.name).filter(Boolean) as string[]);
    return [...names].sort();
  }, [orders.data]);

  const rows = useMemo(() => {
    return (orders.data || []).filter((o) => {
      if (tab === "quotes" ? o.status !== "DRAFT" : o.status === "DRAFT") return false;
      const hay = `${o.number} ${o.customer.name} ${o.salesperson?.name || ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (status && o.status !== status) return false;
      if (person && o.salesperson?.name !== person) return false;
      if (!inDateRange(o.createdAt, when)) return false;
      return true;
    });
  }, [orders.data, tab, q, status, person, when]);

  const pager = usePager(rows, `${tab}|${q}|${status}|${person}|${when}`);

  function clearFilters() {
    setQ("");
    setStatus("");
    setPerson("");
    setWhen("all");
  }

  function exportRows() {
    return rows.map((o) => [
      o.number,
      o.customer.name,
      o.salesperson?.name || "—",
      saleDate(o.createdAt),
      ksh(o.totals.gross),
      statusLabel(o.status),
    ]);
  }

  const headers = ["Order #", "Customer", "Salesperson", "Sale date", "Total", "Status"];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={sales ? "Your book" : "Company book"} title="Sales" />
      <StatGrid>
        <Stat label="Today's sales" value={money(stats.today)} />
        <Stat label="This month sales" value={money(stats.month)} />
        <Stat label="Successful orders" value={stats.successful} />
        <Stat label="All time sales" value={money(stats.allTime)} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "orders", label: "Sales orders" },
          { id: "quotes", label: "Quotations" },
        ]}
      />

      <div className="toolbar">
        <input
          className="min-w-[220px] flex-1"
          placeholder="Search orders…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(tab === "quotes" ? ["DRAFT"] : STATUSES.filter((s) => s !== "DRAFT")).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {!sales && (
          <select className="w-auto" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">All sales persons</option>
            {people.map((n) => <option key={n}>{n}</option>)}
          </select>
        )}
        <select className="w-auto" value={when} onChange={(e) => setWhen(e.target.value)}>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="all">All dates</option>
        </select>
        <button className="btn-ghost" onClick={clearFilters}>Clear</button>
        <ExportButtons
          title={tab === "quotes" ? "Quotations" : "Sales orders"}
          filename={`${tab === "quotes" ? "quotations" : "sales-orders"}.csv`}
          headers={headers}
          rows={exportRows()}
        />
        <Link to="/sales/new" className="btn-gold">
          <Plus size={16} /> New sales order
        </Link>
      </div>
      {complete.error && <p className="text-sm text-red-600">{(complete.error as Error).message}</p>}

      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Salesperson</th>
              <th>Sale date</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={7} label={`No ${tab === "quotes" ? "quotations" : "sales orders"} match.`} />}
            {pager.slice.map((o) => {
              const next = nextStatus(o.status);
              return (
                <tr key={o.id}>
                  <td>
                    <Link className="font-medium text-ink" to={`/sales/${o.id}`}>{o.number}</Link>
                  </td>
                  <td className="uppercase tracking-wide">{o.customer.name}</td>
                  <td>{o.salesperson?.name || "—"}</td>
                  <td>{saleDate(o.createdAt)}</td>
                  <td>{ksh(o.totals.gross)}</td>
                  <td><SaleStatus status={o.status} /></td>
                  <td>
                    <div className="flex items-center gap-2">
                      {next && (
                        <button
                          className={`${next === "DELIVERED" ? "btn-success" : "btn-gold"} px-3 py-1 text-xs`}
                          disabled={complete.isPending}
                          onClick={() => complete.mutate({ id: o.id, next })}
                        >
                          {tab === "quotes" ? "Confirm" : next === "DELIVERED" ? "Complete" : "Next"}
                        </button>
                      )}
                      {o.status !== "DRAFT" && o.status !== "CANCELLED" && (
                        <PdfCircle orderId={o.id} kind="delivery" title="Download delivery note" />
                      )}
                      <PdfCircle orderId={o.id} kind="order" title="Download sales order PDF" />
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

function statusLabel(status: string) {
  return status === "DELIVERED" || status === "PAID" ? "COMPLETED" : status;
}

function saleDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ksh(n?: number) {
  return `Ksh ${Math.round(n || 0).toLocaleString("en-KE")}`;
}

function SaleStatus({ status }: { status: string }) {
  const completed = status === "DELIVERED" || status === "PAID";
  const label = statusLabel(status);
  if (completed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
          <Check size={11} strokeWidth={3} />
        </span>
        Completed
      </span>
    );
  }
  const tone =
    status === "CANCELLED" ? "text-red-600 bg-red-50 ring-red-200" :
    status === "DRAFT" ? "text-stone-500 bg-stone-50 ring-stone-200" :
    "text-amber-600 bg-amber-50 ring-amber-200";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${tone.split(" ")[0]}`}>
      <span className={`grid h-5 w-5 place-items-center rounded-full ring-1 ${tone}`} />
      {label}
    </span>
  );
}

function nextStatus(status: string) {
  if (status === "CANCELLED" || status === "PAID" || status === "DELIVERED") return null;
  const i = FLOW.indexOf(status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

function inDateRange(iso: string, when: string) {
  if (when === "all") return true;
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (when === "today") return d >= start;
  if (when === "week") {
    const w = new Date(start);
    w.setDate(w.getDate() - w.getDay());
    return d >= w;
  }
  if (when === "month") return d.getMonth() === start.getMonth() && d.getFullYear() === start.getFullYear();
  return true;
}
