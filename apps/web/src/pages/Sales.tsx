import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, CheckCircle2, ClipboardList, Plus, Search, TrendingUp, Wallet, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BranchFilter } from "../components/BranchFilter";
import { MobileFilters } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { ShareMenu } from "../components/ShareMenu";
import {
  ConfirmDialog,
  EmptyRow,
  ExportButtons,
  OrderDocs,
  PageHeader,
  Pager,
  Stat,
  StatGrid,
  seriesByDay,
  useQueryState,
} from "../components/ui";
import { api, money } from "../lib/api";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";
import { canCancelOrder, canConfirmOrder, salesStatusLabel } from "../lib/sales-status";
import { MobileModuleChips } from "../components/MobileModuleChips";

type Order = {
  id: string;
  number: string;
  channel: string;
  status: string;
  createdAt: string;
  dispatchMethod: string;
  shareToken?: string;
  customer: { name: string; phone?: string };
  salesperson?: { id: string; name: string };
  totals: { gross: number; paid: number; balance: number };
};

export function Sales() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const sales = user?.role === "SALES";
  const [tabRaw, setTabRaw] = useQueryState("tab", "orders");
  const tab = tabRaw === "quotes" ? "quotes" : "orders";
  const setTab = (next: "orders" | "quotes") => setTabRaw(next);
  const [q, setQ] = useState("");
  const [status, setStatus] = useQueryState("status", "");
  const [person, setPerson] = useState("");
  const [when, setWhen] = useQueryState("when", "month");
  const [branch, setBranch] = useQueryState("branch", "");
  const [accept, setAccept] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const orders = useQuery({
    queryKey: ["orders", branch],
    queryFn: () => api<Order[]>(`/api/orders${branch ? `?branchId=${branch}` : ""}`),
  });
  const convert = useMutation({
    mutationFn: (id: string) => api<{ id: string }>(`/api/orders/${id}/convert`, { method: "POST" }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setAccept(null);
      nav(`/sales/${o.id}`);
    },
  });
  const cancelOrder = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api(`/api/orders/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "CANCELLED", reason: reason || "Cancelled from Sales" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setCancelTarget(null);
    },
  });

  const stats = useMemo(() => {
    const list = (orders.data || []).filter((o) => o.status !== "DRAFT" && o.status !== "CANCELLED");
    const quotes = (orders.data || []).filter((o) => o.status === "DRAFT");
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    const month = now.getMonth();
    const year = now.getFullYear();
    const sum = (items: Order[]) => items.reduce((s, o) => s + (o.totals?.gross || 0), 0);
    const inRange = (iso: string, from: Date, to?: Date) => {
      const d = new Date(iso);
      return d >= from && (!to || d < to);
    };
    const today = list.filter((o) => inRange(o.createdAt, startToday));
    const yesterday = list.filter((o) => inRange(o.createdAt, startYesterday, startToday));
    const thisMonth = list.filter((o) => {
      const d = new Date(o.createdAt);
      return d.getMonth() === month && d.getFullYear() === year;
    });
    const lastMonthStart = new Date(year, month - 1, 1);
    const lastMonthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const lastMonth = list.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });
    const completed = list.filter((o) => o.status === "DELIVERED" || o.status === "PAID");
    const completedOnly = (items: Order[]) => items.filter((o) => o.status === "DELIVERED" || o.status === "PAID");
    const active = list.filter((o) => !["DELIVERED", "PAID", "CANCELLED"].includes(o.status)).length;
    const cancelled = (orders.data || []).filter((o) => o.status === "CANCELLED").length;
    const monthRevenue = sum(thisMonth);
    const lastMonthRevenue = sum(lastMonth);
    const outstanding = list.reduce((s, o) => s + (o.totals?.balance || 0), 0);
    return {
      today: sum(today),
      yesterday: sum(yesterday),
      completed: completed.length,
      quotes: quotes.length,
      active,
      total: list.length,
      monthRevenue,
      lastMonthRevenue,
      monthOrderCount: thisMonth.length,
      cancelled,
      outstanding,
      dayRevenue: seriesByDay(list, (o) => o.createdAt, (o) => o.totals.gross, 14),
      monthSeries: seriesByDay(thisMonth, (o) => o.createdAt, (o) => o.totals.gross, 14),
      quoteTrend: seriesByDay(quotes, (o) => o.createdAt, () => 1, 14),
      completedTrend: seriesByDay(completedOnly(list), (o) => o.createdAt, () => 1, 14),
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
      if (tab === "orders" && status) {
        const bucket =
          status === "completed" ? "done" :
          status === "dispatch" ? "warehouse" :
          status;
        if (bucket === "open" && o.status !== "CONFIRMED") return false;
        if (bucket === "warehouse" && !["PICKING", "PACKING", "PICKED", "DISPATCHED", "IN_TRANSIT"].includes(o.status)) return false;
        if (bucket === "done" && !["DELIVERED", "PAID"].includes(o.status)) return false;
        if (bucket === "CANCELLED" && o.status !== "CANCELLED") return false;
        if (bucket === "CONFIRMED" && o.status !== "CONFIRMED") return false;
      }
      if (person && o.salesperson?.name !== person) return false;
      if (!inDateRange(o.createdAt, when)) return false;
      return true;
    });
  }, [orders.data, tab, q, status, person, when]);

  const listing = useListSort(rows, [
    { id: "date-desc", label: "Newest first", get: (o) => o.createdAt, dir: "desc" },
    { id: "date-asc", label: "Oldest first", get: (o) => o.createdAt, dir: "asc" },
    { id: "total-desc", label: "Highest total", get: (o) => o.totals.gross, dir: "desc" },
    { id: "customer", label: "Customer A–Z", get: (o) => o.customer.name, dir: "asc" },
  ], "date-desc");
  const pager = usePager(listing.sorted, `${tab}|${q}|${status}|${person}|${when}|${listing.sort}`);
  const quoteCount = (orders.data || []).filter((o) => o.status === "DRAFT").length;
  const orderCount = (orders.data || []).filter((o) => o.status !== "DRAFT").length;

  function clearFilters() {
    setQ("");
    setStatus("");
    setPerson("");
    setWhen("month");
  }

  const headers = ["Number", "Customer", "Salesperson", "Date", "Total", "Status"];
  const filtersActive = Boolean(q || status || person || branch || when !== "month");

  const filterFields = [
    ...(tab === "orders" ? [{
      kind: "chips" as const,
      label: "Status",
      value: status || "all",
      onChange: (v: string) => setStatus(v === "all" ? "" : v),
      options: [
        { value: "all", label: "All" },
        { value: "open", label: "Confirmed (new)" },
        { value: "warehouse", label: "In warehouse / delivery" },
        { value: "done", label: "Completed" },
        { value: "CANCELLED", label: "Cancelled" },
      ],
    }] : []),
    ...(!sales ? [{
      kind: "select" as const,
      label: "Salesperson",
      value: person,
      onChange: setPerson,
      options: [{ value: "", label: "All salespeople" }, ...people.map((n) => ({ value: n, label: n }))],
    }] : []),
    {
      kind: "select" as const,
      label: "Period",
      value: when,
      onChange: setWhen,
      options: [
        { value: "today", label: "Today" },
        { value: "week", label: "This week" },
        { value: "month", label: "This month" },
        { value: "all", label: "All dates" },
      ],
    },
  ];

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow={sales ? "Your book" : "Company book"} title="Sales" />
      <StatGrid cols={6}>
        <Stat
          icon={Wallet}
          label="Today's sales"
          value={money(stats.today)}
          delta={pctChange(stats.today, stats.yesterday)}
          series={stats.dayRevenue}
          chart="area"
          hint="Confirmed orders today"
          to="/sales?when=today"
        />
        <Stat
          icon={TrendingUp}
          label="This month sales"
          value={money(stats.monthRevenue)}
          delta={pctChange(stats.monthRevenue, stats.lastMonthRevenue)}
          series={stats.monthSeries}
          chart="bars"
          hint={stats.monthOrderCount ? `${stats.monthOrderCount} orders this month` : "No sales yet this month"}
          to="/sales?when=month"
        />
        <Stat
          icon={CheckCircle2}
          label="Active orders"
          value={stats.active}
          series={stats.completedTrend}
          chart="bars"
          hint="In progress"
          to="/sales?tab=orders"
        />
        <Stat
          icon={CheckCircle2}
          label="Completed"
          value={stats.completed}
          series={stats.completedTrend}
          chart="spark"
          share={stats.total ? stats.completed / stats.total : 0}
          hint="Delivered or paid"
          to="/sales?status=done"
        />
        <Stat
          icon={ClipboardList}
          label="Open quotes"
          value={stats.quotes}
          series={stats.quoteTrend}
          chart="area"
          hint={stats.quotes ? `${stats.quotes} open` : "None open"}
          to="/sales?tab=quotes"
        />
        <Stat
          icon={XCircle}
          label="Cancelled"
          value={stats.cancelled}
          chart="ring"
          max={Math.max(stats.total + stats.cancelled, 1)}
          hint={stats.outstanding > 0 ? `${money(stats.outstanding)} open AR` : "No open balance"}
          to="/sales?status=CANCELLED"
        />
      </StatGrid>

      <MobileModuleChips
        chips={[
          { label: "Orders", to: "/sales?tab=orders", count: orderCount },
          { label: "Quotes", to: "/sales?tab=quotes", count: quoteCount },
        ]}
      />

      <>
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input
              className="min-w-0 flex-1"
              placeholder={tab === "quotes" ? "Search quotations…" : "Search orders or customers…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <MobileFilters title="Filter sales" onClear={clearFilters} fields={filterFields} />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <BranchFilter value={branch} onChange={setBranch} className="module-select" />
                {tab === "orders" && (
                  <select className="module-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                    <option value="">All orders</option>
                    <option value="open">Confirmed (new)</option>
                    <option value="warehouse">In warehouse / delivery</option>
                    <option value="done">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                )}
                {!sales && (
                  <select className="module-select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Salesperson">
                    <option value="">All salespeople</option>
                    {people.map((n) => <option key={n}>{n}</option>)}
                  </select>
                )}
                <select className="module-select" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Period">
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="all">All dates</option>
                </select>
                <button
                  type="button"
                  className="module-filter-reset"
                  disabled={!filtersActive}
                  onClick={clearFilters}
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
              <ExportButtons
                title={tab === "quotes" ? "Quotations" : "Sales orders"}
                filename={`${tab === "quotes" ? "quotations" : "sales-orders"}.csv`}
                headers={headers}
                rows={rows.map((o) => [
                  o.number,
                  o.customer.name,
                  o.salesperson?.name || "—",
                  saleDate(o.createdAt),
                  ksh(o.totals.gross),
                  salesStatusLabel(o.status),
                ])}
              />
              {canModule(user, "sales") && (
                <>
                  <Link to="/reports?module=sales" className="btn-ghost module-btn-sm">
                    <BarChart3 size={16} /> Reports
                  </Link>
                  <Link to="/sales/performance" className="btn-ghost module-btn-sm">
                    Performance
                  </Link>
                </>
              )}
              <Link to="/sales/new" className="btn-gold module-btn-sm">
                <Plus size={16} /> {tab === "quotes" ? "New quote" : "New order"}
              </Link>
            </div>
          </div>
        </div>

        {(convert.error || cancelOrder.error) && (
          <p className="px-4 pb-2 text-sm text-red-600">{((convert.error || cancelOrder.error) as Error).message}</p>
        )}

      <Register
        rows={listing.sorted}
        pager={pager}
        getId={(o) => o.id}
        onOpen={(o) => nav(`/sales/${o.id}`)}
        empty={{
          title: tab === "quotes" ? "No quotations yet" : "No sales orders yet",
          actionLabel: tab === "quotes" ? "Create quotation" : "Create sales order",
          to: "/sales/new",
        }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (o) => o.number,
          subtitle: (o) => o.customer.name,
          status: (o) => <SaleStatus status={o.status} />,
          fields: [
            { label: "Date", value: (o) => saleDate(o.createdAt) },
            { label: "Total", value: (o) => ksh(o.totals.gross), align: "right" },
            ...(!sales ? [{ label: "Sales", value: (o) => o.salesperson?.name || "—" }] : []),
          ],
          actions: (o) => (
            <div className="grid gap-2">
              {canConfirmOrder(o.status) && (
                <button type="button" className="btn-success w-full" onClick={() => setAccept(o)} disabled={convert.isPending}>
                  Confirm sales order
                </button>
              )}
              {canCancelOrder(o.status) && (
                <button type="button" className="btn-ghost w-full text-red-700" onClick={() => setCancelTarget(o)} disabled={cancelOrder.isPending}>
                  Cancel order
                </button>
              )}
              <OrderDocs orderId={o.id} status={o.status} compact />
              <ShareMenu
                token={o.shareToken}
                kind={o.status === "DRAFT" ? "quotation" : "sales-order"}
                number={o.number}
                customerName={o.customer.name}
                phone={o.customer.phone}
              />
            </div>
          ),
        }}
        action={<Link to="/sales/new" className="btn-gold"><Plus size={16} /> New</Link>}
      >
        <div className="table-wrap">
          <table className="invoice suite-table">
            <thead>
              <tr>
                <th>{tab === "quotes" ? "Quote #" : "Order #"}</th>
                <th>Customer</th>
                <th>Salesperson</th>
                <th>Date</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listing.sorted.length === 0 && (
                <EmptyRow
                  cols={7}
                  label={tab === "quotes" ? "No quotations match." : "No sales orders match."}
                  actionLabel="Create one"
                  to="/sales/new"
                />
              )}
              {pager.slice.map((o) => (
                <tr key={o.id} className="cursor-pointer" onClick={() => nav(`/sales/${o.id}`)}>
                  <td>
                    <Link className="font-medium text-ink" to={`/sales/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.number}</Link>
                  </td>
                  <td>{o.customer.name}</td>
                  <td>{o.salesperson?.name || "—"}</td>
                  <td>{saleDate(o.createdAt)}</td>
                  <td className="num">{ksh(o.totals.gross)}</td>
                  <td><SaleStatus status={o.status} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center gap-2">
                      {canConfirmOrder(o.status) && (
                        <button
                          type="button"
                          className="btn-success px-3 py-1 text-xs"
                          disabled={convert.isPending}
                          onClick={() => setAccept(o)}
                        >
                          Confirm
                        </button>
                      )}
                      {canCancelOrder(o.status) && (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs text-red-700"
                          disabled={cancelOrder.isPending}
                          onClick={() => setCancelTarget(o)}
                        >
                          <XCircle size={14} className="inline mr-0.5" aria-hidden />
                          Cancel
                        </button>
                      )}
                      <OrderDocs orderId={o.id} status={o.status} compact />
                      <ShareMenu
                        token={o.shareToken}
                        kind={o.status === "DRAFT" ? "quotation" : "sales-order"}
                        number={o.number}
                        customerName={o.customer.name}
                        phone={o.customer.phone}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Register>
      </section>
      </>

      {accept && (
        <ConfirmDialog
          title="Confirm sales order"
          body={`${accept.number} · ${accept.customer.name}. Stock will be reserved and an invoice created in Finance.`}
          confirmLabel="Confirm sales order"
          busy={convert.isPending}
          onConfirm={() => convert.mutate(accept.id)}
          onClose={() => setAccept(null)}
        />
      )}
      {cancelTarget && (
        <ConfirmDialog
          title="Cancel sales order"
          body={
            cancelTarget.status === "DRAFT"
              ? `${cancelTarget.number} · ${cancelTarget.customer.name}. This quotation will be cancelled.`
              : `${cancelTarget.number} · ${cancelTarget.customer.name}. Reserved stock is released. Confirmed orders may need manager approval.`
          }
          confirmLabel="Cancel order"
          danger
          busy={cancelOrder.isPending}
          onConfirm={() => cancelOrder.mutate({ id: cancelTarget.id })}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

function pctChange(now?: number, prev?: number) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return (((now || 0) - prev) / Math.abs(prev)) * 100;
}

function saleDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ksh(n?: number) {
  return `Ksh ${Math.round(n || 0).toLocaleString("en-KE")}`;
}

function SaleStatus({ status }: { status: string }) {
  const label = salesStatusLabel(status);
  const completed = status === "DELIVERED" || status === "PAID";
  if (completed) {
    return (
      <span className="status-pill status-pill-ok">
        <Check size={11} strokeWidth={3} aria-hidden /> Completed
      </span>
    );
  }
  const pill =
    status === "CANCELLED" ? "status-pill-danger" :
    status === "DRAFT" ? "status-pill-violet" :
    status === "CONFIRMED" ? "status-pill-info" :
    "status-pill-warn";
  return <span className={`status-pill ${pill}`}>{label}</span>;
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
