import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, Layers, Package, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BranchFilter } from "../components/BranchFilter";
import { MobileFilters, prettyLabel } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { EmptyRow, PageHeader, Stat, StatGrid, seriesByDay, useQueryState } from "../components/ui";
import { api } from "../lib/api";
import { formatTableDate } from "../lib/format-date";
import {
  countDispatchTab,
  DISPATCH_LABEL,
  DISPATCH_TABS,
  isDispatchProblem,
  matchesDispatchTab,
} from "../lib/dispatch-status";
import { usePager } from "../lib/pager";
import { MobileModuleChips } from "../components/MobileModuleChips";

type Dash = {
  queue: Record<string, number>;
  kpis: Record<string, number>;
};

type OrderRow = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  dispatchMethod?: string;
  customer?: { name: string };
};

const DISPATCH_TAB_IDS = new Set(DISPATCH_TABS.map(([id]) => id));

export function Dispatch() {
  const nav = useNavigate();
  const [branch, setBranch] = useQueryState("branch", "");
  const dash = useQuery({
    queryKey: ["dispatch-dashboard", branch],
    queryFn: () => api<Dash>(`/api/dispatch/dashboard${branch ? `?branchId=${branch}` : ""}`),
    refetchInterval: 30000,
  });
  const { data = [] } = useQuery({
    queryKey: ["orders", branch],
    queryFn: () => api<OrderRow[]>(`/api/orders${branch ? `?branchId=${branch}` : ""}`),
  });
  const [q, setQ] = useState("");
  const [tabRaw, setTab] = useQueryState("tab", "all");
  const tab = DISPATCH_TAB_IDS.has(tabRaw as (typeof DISPATCH_TABS)[number][0])
    ? tabRaw
    : tabRaw === "ready" || tabRaw === "problems"
      ? tabRaw === "ready"
        ? "pick"
        : "all"
      : "all";
  const qd = dash.data?.queue || {};

  const queue = useMemo(() => {
    return data.filter((o) => o.status !== "DRAFT" && o.status !== "CANCELLED" && o.status !== "PAID");
  }, [data]);

  const charts = useMemo(() => {
    const byTab = (t: string) =>
      seriesByDay(
        queue.filter((o) => matchesDispatchTab(o.status, t)),
        (o) => o.createdAt,
        () => 1,
        14,
      );
    return {
      pick: byTab("pick"),
      ready: seriesByDay(
        queue.filter((o) => o.status === "PICKED"),
        (o) => o.createdAt,
        () => 1,
        14,
      ),
      shipping: byTab("shipping"),
      done: byTab("done"),
    };
  }, [queue]);

  const rows = useMemo(() => {
    return queue.filter((o) => {
      if (!matchesDispatchTab(o.status, tab)) return false;
      return `${o.number} ${o.customer?.name || ""}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [queue, q, tab]);

  const listing = useListSort(rows, [
    { id: "status", label: "Status", get: (o) => o.status, dir: "asc" },
    { id: "number", label: "Order #", get: (o) => o.number, dir: "asc" },
    { id: "customer", label: "Customer A–Z", get: (o) => o.customer?.name || "", dir: "asc" },
  ], "status");
  const pager = usePager(listing.sorted, `${tab}|${q}|${listing.sort}`);

  const toPick = queue.filter((o) => ["CONFIRMED", "PICKING", "PACKING"].includes(o.status)).length;
  const ready = queue.filter((o) => o.status === "PICKED").length;
  const shipping = countDispatchTab(queue, "shipping");
  const doneToday = qd.deliveredToday ?? countDispatchTab(queue, "done");
  const problems = queue.filter((o) => isDispatchProblem(o.status) || o.status === "DELAYED").length;
  const queueSize = Math.max(queue.length, 1);

  function clearFilters() {
    setQ("");
    setTab("all");
  }

  const filtersActive = Boolean(q || tab !== "all" || branch);

  const filterFields = [
    {
      kind: "chips" as const,
      label: "Stage",
      value: tab,
      onChange: setTab,
      options: DISPATCH_TABS.map(([id, label]) => ({ value: id, label })),
    },
  ];

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Warehouse" title="Dispatch" />
      {problems > 0 && (
        <p className="flex items-center gap-2 text-sm text-amber-900 card !py-2 !px-3.5 bg-amber-50 border-amber-200">
          <AlertTriangle size={16} aria-hidden />
          {problems} order{problems === 1 ? "" : "s"} need attention — check the list for Problem or Late status.
        </p>
      )}
      <StatGrid cols={6}>
        <Stat
          icon={Package}
          label="To pick"
          value={toPick}
          series={charts.pick}
          chart="bars"
          share={toPick / queueSize}
          hint={`${toPick} awaiting pick`}
          to="/dispatch?tab=pick"
        />
        <Stat
          icon={Package}
          label="Ready to ship"
          value={ready}
          series={charts.ready}
          chart="bars"
          share={ready / queueSize}
          hint={`${ready} packed and waiting`}
          to="/dispatch?tab=pick"
        />
        <Stat
          icon={Truck}
          label="On the way"
          value={shipping}
          series={charts.shipping}
          chart="bars"
          hint={`${shipping} in transit`}
          to="/dispatch?tab=shipping"
        />
        <Stat
          icon={CheckCircle2}
          label="Delivered today"
          value={doneToday}
          series={charts.done}
          chart="spark"
          hint={problems ? `${problems} need attention` : "On track"}
          to="/dispatch?tab=done"
        />
        <Stat
          icon={Layers}
          label="In queue"
          value={queue.length}
          series={charts.pick}
          chart="area"
          hint="Active dispatch jobs"
          to="/dispatch?tab=all"
        />
        <Stat
          icon={AlertTriangle}
          label="Need attention"
          value={problems}
          chart="ring"
          max={Math.max(queue.length, 1)}
          hint={problems ? "Review problem orders" : "None flagged"}
          to="/dispatch?tab=all"
        />
      </StatGrid>

      <MobileModuleChips
        chips={DISPATCH_TABS.map(([id, label]) => ({
          label,
          to: `/dispatch?tab=${id}`,
          count: countDispatchTab(queue, id),
        }))}
      />

      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input
              className="min-w-0 flex-1"
              placeholder="Search order or customer…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <MobileFilters title="Filter dispatch" onClear={clearFilters} fields={filterFields} />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <BranchFilter value={branch} onChange={setBranch} className="module-select" />
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={clearFilters}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        <Register
          rows={listing.sorted}
          pager={pager}
          getId={(o) => o.id}
          onOpen={(o) => nav(`/dispatch/${o.id}`)}
          empty={{
            title: tab === "all" ? "No dispatch jobs yet" : `Nothing in ${DISPATCH_TABS.find((t) => t[0] === tab)?.[1] || "this stage"}`,
          }}
          sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
          mobile={{
            title: (o) => o.number,
            subtitle: (o) => o.customer?.name || "—",
            status: (o) => <DispatchStatus status={o.status} />,
            fields: [
              { label: "Date", value: (o) => formatTableDate(o.createdAt) },
              { label: "Delivery", value: (o) => prettyLabel(String(o.dispatchMethod || "—")) },
            ],
            actions: (o) => (
              <Link className="btn-gold w-full" to={`/dispatch/${o.id}`}>Open order</Link>
            ),
          }}
        >
          <div className="table-wrap">
            <table className="invoice suite-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Delivery</th>
                  <th>Status</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {listing.sorted.length === 0 && <EmptyRow cols={6} label="No dispatch jobs match." />}
                {pager.slice.map((o) => (
                  <tr key={o.id} className="cursor-pointer" onClick={() => nav(`/dispatch/${o.id}`)}>
                    <td>
                      <Link className="font-medium text-ink" to={`/dispatch/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.number}</Link>
                    </td>
                    <td>{o.customer?.name || "—"}</td>
                    <td>{formatTableDate(o.createdAt)}</td>
                    <td>{prettyLabel(String(o.dispatchMethod || "—"))}</td>
                    <td><DispatchStatus status={o.status} /></td>
                    <td className="text-right text-stone-400">
                      <ChevronRight size={16} className="inline" />
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

function DispatchStatus({ status }: { status: string }) {
  const label = DISPATCH_LABEL[status] || status;
  if (status === "DELIVERED" || status === "PARTIAL_DELIVERED") {
    return <span className="status-pill status-pill-ok">{label}</span>;
  }
  if (status === "FAILED" || status === "RETURNED") {
    return <span className="status-pill status-pill-danger">{label}</span>;
  }
  if (status === "DELAYED") {
    return <span className="status-pill status-pill-warn">{label}</span>;
  }
  if (status === "PICKED") {
    return <span className="status-pill status-pill-info">{label}</span>;
  }
  if (["DISPATCHED", "IN_TRANSIT"].includes(status)) {
    return <span className="status-pill status-pill-info">{label}</span>;
  }
  return <span className="status-pill status-pill-warn">{label}</span>;
}
