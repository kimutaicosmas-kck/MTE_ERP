import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, CheckCircle2, ClipboardList, Plus, Search, TrendingUp, Truck, Wallet } from "lucide-react";
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
  Tabs,
  seriesByDay,
  seriesByMonth,
  useQueryState,
} from "../components/ui";
import { api, money } from "../lib/api";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";
import { salesStatusLabel } from "../lib/sales-status";
import { ModuleReportsPanel } from "../components/ModuleReportsPanel";

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
  const tab = tabRaw === "quotes" ? "quotes" : tabRaw === "reports" ? "reports" : "orders";
  const setTab = (next: "orders" | "quotes" | "reports") => setTabRaw(next);
  const [q, setQ] = useState("");
  const [status, setStatus] = useQueryState("status", "");
  const [person, setPerson] = useState("");
  const [when, setWhen] = useQueryState("when", "month");
  const [branch, setBranch] = useQueryState("branch", "");
  const [accept, setAccept] = useState<Order | null>(null);

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
    const inDispatch = list.filter((o) => ["PICKING", "PICKED", "DISPATCHED"].includes(o.status)).length;
    return {
      today: sum(today),
      yesterday: sum(yesterday),
      month: sum(thisMonth),
      lastMonth: sum(lastMonth),
      completed: completed.length,
      quotes: quotes.length,
      allTime: sum(list),
      total: list.length,
      inDispatch,
      dayRevenue: seriesByDay(list, (o) => o.createdAt, (o) => o.totals.gross, 14),
      monthRevenue: seriesByMonth(list, (o) => o.createdAt, (o) => o.totals.gross, 6),
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
      if (tab === "orders") {
        if (status === "completed" && !["DELIVERED", "PAID"].includes(o.status)) return false;
        else if (status === "dispatch" && !["PICKING", "PICKED", "DISPATCHED"].includes(o.status)) return false;
        else if (status && !["completed", "dispatch"].includes(status) && o.status !== status) return false;
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
        { value: "CONFIRMED", label: "Confirmed" },
        { value: "dispatch", label: "In dispatch" },
        { value: "completed", label: "Completed" },
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
          label="This month"
          value={money(stats.month)}
          delta={pctChange(stats.month, stats.lastMonth)}
          series={stats.monthRevenue}
          chart="area"
          hint="vs last month"
          to="/sales?when=month"
        />
        <Stat
          icon={ClipboardList}
          label="Open quotes"
          value={stats.quotes}
          series={stats.quoteTrend}
          chart="bars"
          hint={stats.quotes ? `${stats.quotes} awaiting confirmation` : "No open quotes"}
          to="/sales?tab=quotes"
        />
        <Stat
          icon={CheckCircle2}
          label="Completed"
          value={stats.completed}
          series={stats.completedTrend}
          chart="spark"
          share={stats.total ? stats.completed / stats.total : 0}
          hint={`${stats.total ? Math.round((stats.completed / stats.total) * 100) : 0}% of active orders`}
          to="/sales?status=completed"
        />
        <Stat
          icon={Truck}
          label="In dispatch"
          value={stats.inDispatch}
          series={stats.completedTrend}
          chart="bars"
          hint="Warehouse pipeline"
          to="/sales?status=dispatch"
        />
        <Stat
          icon={BarChart3}
          label="All-time revenue"
          value={money(stats.allTime)}
          series={stats.monthRevenue}
          chart="area"
          hint={`${stats.total} active orders`}
          to="/sales?when=all"
        />
      </StatGrid>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "orders", label: "Sales orders", count: orderCount },
          { id: "quotes", label: "Quotations", count: quoteCount },
          { id: "reports", label: "Sales reports" },
        ]}
      />

      {tab === "reports" && <ModuleReportsPanel moduleId="sales" />}

      {tab !== "reports" && (
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
                    <option value="">All statuses</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="dispatch">In dispatch</option>
                    <option value="completed">Completed</option>
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
                <Link to="/sales/performance" className="btn-ghost module-btn-sm">
                  <BarChart3 size={16} /> Performance
                </Link>
              )}
              <Link to="/sales/new" className="btn-gold module-btn-sm">
                <Plus size={16} /> {tab === "quotes" ? "New quote" : "New order"}
              </Link>
            </div>
          </div>
        </div>

        {convert.error && <p className="px-4 pb-2 text-sm text-red-600">{(convert.error as Error).message}</p>}

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
              {tab === "quotes" && (
                <button type="button" className="btn-success w-full" onClick={() => setAccept(o)}>Confirm sales order</button>
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
                <th>{tab === "quotes" ? "Actions" : "Documents"}</th>
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
                      {tab === "quotes" && (
                        <button
                          type="button"
                          className="btn-success px-3 py-1 text-xs"
                          disabled={convert.isPending}
                          onClick={() => setAccept(o)}
                        >
                          Confirm sales order
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
      )}

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
