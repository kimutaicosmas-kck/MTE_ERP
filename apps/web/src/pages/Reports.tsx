import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarClock, Download, Gauge, LayoutGrid, Search, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MobileFilters } from "../components/filters";
import { FilterChips, Register } from "../components/register";
import { EmptyRow, ExportButtons, PageHeader, Pager, RowPdf, Stat, StatGrid, Tabs, useQueryState } from "../components/ui";
import { api, money } from "../lib/api";
import { usePager } from "../lib/pager";
import { ModuleNav } from "../components/ModuleNav";
import { ANALYTICS_HUBS } from "../lib/module-report-links";
import {
  BiAnalyticsHub,
  DataExportHub,
  ExecutiveReportsHub,
  CrossModuleIndex,
  KpiDashboardsHub,
  ReportBuilderHub,
  ScheduledReportsHub,
} from "./reports/AnalyticsHubs";

type MainTab = "stock" | "buy" | "customers" | "team" | "vendors";
type AnalyticsHub = (typeof ANALYTICS_HUBS)[number]["id"];
type StockView = "ageing" | "reorder" | "dead" | "bestSellers" | "fastest" | "b0_30" | "b31_60" | "b61_90" | "b90plus";

const STOCK_VIEWS: StockView[] = ["ageing", "b0_30", "b31_60", "b61_90", "b90plus", "reorder", "dead", "bestSellers", "fastest"];
const BUCKET_KEY: Partial<Record<StockView, string>> = {
  b0_30: "0-30",
  b31_60: "31-60",
  b61_90: "61-90",
  b90plus: "90+",
};
const STOCK_LABELS: Record<StockView, string> = {
  ageing: "All stock",
  b0_30: "Age 0–30 days",
  b31_60: "Age 31–60 days",
  b61_90: "Age 61–90 days",
  b90plus: "Age 90+ days",
  reorder: "Low stock",
  dead: "Dead stock",
  bestSellers: "Best sellers",
  fastest: "Fast movers",
};

function resolveReportTab(raw: string): { tab: MainTab; stockView: StockView } {
  if (raw === "stock") return { tab: "stock", stockView: "ageing" };
  if (raw === "buy") return { tab: "buy", stockView: "ageing" };
  if (raw === "customers") return { tab: "customers", stockView: "ageing" };
  if (raw === "team") return { tab: "team", stockView: "ageing" };
  if (raw === "vendors") return { tab: "vendors", stockView: "ageing" };
  if (STOCK_VIEWS.includes(raw as StockView)) return { tab: "stock", stockView: raw as StockView };
  return { tab: "stock", stockView: "ageing" };
}

function isDataTab(raw: string) {
  return ["stock", "buy", "customers", "team", "vendors", ...STOCK_VIEWS].includes(raw);
}

export function Reports() {
  const [hubRaw, setHubRaw] = useQueryState("hub", "");
  const [tabRaw, setTabRaw] = useQueryState("tab", "ageing");
  const hub: AnalyticsHub = (ANALYTICS_HUBS.some((h) => h.id === hubRaw) ? hubRaw : isDataTab(tabRaw) ? "cross" : "executive") as AnalyticsHub;
  const setHub = (id: string) => setHubRaw(id);
  const { tab, stockView } = resolveReportTab(hub === "cross" ? tabRaw : "stock");
  const setTab = (next: MainTab) => {
    setHubRaw("cross");
    setTabRaw(next === "stock" ? stockView : next);
  };
  const setStockView = (view: StockView) => {
    setHubRaw("cross");
    setTabRaw(view);
  };
  const [q, setQ] = useState("");
  const inv = useQuery({ queryKey: ["inv-report"], queryFn: () => api<any>("/api/reports/inventory") });
  const buy = useQuery({ queryKey: ["reorder-suggestions"], queryFn: () => api<any>("/api/reports/reorder-suggestions"), enabled: tab === "buy" });
  const vendors = useQuery({ queryKey: ["vendor-report"], queryFn: () => api<any>("/api/reports/vendors"), enabled: tab === "vendors" });
  const customers = useQuery({ queryKey: ["cust-report"], queryFn: () => api<any[]>("/api/reports/customers") });
  const team = useQuery({ queryKey: ["sales-report"], queryFn: () => api<any>("/api/reports/sales") });
  const teamRows = Array.isArray(team.data) ? team.data : team.data?.rows || [];

  const stockRows = () => {
    const bucket = BUCKET_KEY[stockView];
    if (bucket && inv.data?.ageingBuckets) return inv.data.ageingBuckets[bucket] || [];
    return inv.data?.[stockView] || [];
  };
  const raw = tab === "customers"
    ? customers.data || []
    : tab === "team"
      ? teamRows
      : tab === "buy"
        ? buy.data?.rows || []
        : tab === "vendors"
          ? vendors.data?.rows || []
          : stockRows();

  const rows = useMemo(() => {
    return raw.filter((r: any) => `${r.sku || ""} ${r.name || ""} ${r.phone || ""}`.toLowerCase().includes(q.toLowerCase()));
  }, [raw, q]);
  const pager = usePager(rows, `${tab}|${stockView}|${q}`);

  const stats = {
    ageing: inv.data?.ageing?.length || 0,
    dead: inv.data?.dead?.length || 0,
    reorder: inv.data?.reorder?.length || 0,
    customers: customers.data?.length || 0,
  };

  const headers =
    tab === "customers"
      ? ["Customer", "Orders", "Revenue", "Paid", "Outstanding"]
      : tab === "team"
        ? ["Sales person", "Orders", "Revenue", "Target", "Attainment", "Commission"]
        : tab === "buy"
          ? ["Product", "SKU", "On hand", "Reserved", "Available", "Suggested buy"]
          : tab === "vendors"
            ? ["Vendor", "Orders", "Open POs", "Avg lead", "On-time %", "Short rate %"]
            : ["Product name", "Part number", "On hand", "Sold", "Revenue", "Idle"];

  const filtersActive = Boolean(q);

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Intelligence" title="Reports & Analytics" />
      <StatGrid cols={6}>
        <Stat icon={BarChart3} label="Executive" value="→" hint="Board KPIs" to="/reports?hub=executive" />
        <Stat icon={Share2} label="Cross-module" value={stats.ageing} hint="Stock & sales data" to="/reports?hub=cross&tab=ageing" />
        <Stat icon={LayoutGrid} label="Module hubs" value="4" hint="Sales · Inventory · Finance · HR" to="/reports?hub=cross" />
        <Stat icon={Download} label="Export" value="CSV" hint="From any table" to="/reports?hub=export" />
        <Stat icon={Gauge} label="KPI dashboards" value="→" hint="Live metrics" to="/reports?hub=kpi" />
        <Stat icon={CalendarClock} label="Scheduled" value="→" hint="Automated reports" to="/reports?hub=scheduled" />
      </StatGrid>
      <ModuleNav items={[...ANALYTICS_HUBS]} value={hub} onChange={setHub} />

      {hub === "executive" && <ExecutiveReportsHub />}
      {hub === "kpi" && <KpiDashboardsHub />}
      {hub === "scheduled" && <ScheduledReportsHub />}
      {hub === "builder" && <ReportBuilderHub />}
      {hub === "export" && <DataExportHub />}
      {hub === "bi" && <BiAnalyticsHub />}
      {hub === "cross" && <CrossModuleIndex />}

      {hub === "cross" && (
      <>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "stock", label: "Stock", count: inv.data?.[stockView]?.length },
          { id: "buy", label: "What to buy", count: buy.data?.summary?.skus },
          { id: "customers", label: "Customers", count: stats.customers },
          { id: "team", label: "Sales team", count: teamRows.length },
          { id: "vendors", label: "Vendors", count: vendors.data?.rows?.length },
        ]}
      />
      {tab === "stock" && (
        <FilterChips
          value={stockView}
          onChange={setStockView}
          items={STOCK_VIEWS.map((id) => ({
            id,
            label: STOCK_LABELS[id],
            count: BUCKET_KEY[id] ? inv.data?.ageingBuckets?.[BUCKET_KEY[id]!]?.length : inv.data?.[id]?.length,
          }))}
        />
      )}
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input className="min-w-0 flex-1" placeholder="Search report rows…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <MobileFilters
            title="Filter reports"
            onClear={() => setQ("")}
            fields={[
              {
                kind: "chips",
                label: "Report",
                value: tab === "stock" ? stockView : tab,
                onChange: (v) => {
                  if (STOCK_VIEWS.includes(v as StockView)) setStockView(v as StockView);
                  else setTab(v as MainTab);
                },
                options: [
                  ...STOCK_VIEWS.map((id) => ({ value: id, label: STOCK_LABELS[id] })),
                  { value: "buy", label: "What to buy" },
                  { value: "customers", label: "Customers" },
                  { value: "team", label: "Sales team" },
                  { value: "vendors", label: "Vendors" },
                ],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={() => setQ("")}>
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
              <ExportButtons
                title="Reports"
                filename={`report-${tab}.csv`}
                headers={headers}
                rows={rows.map((r: any) =>
                  tab === "customers"
                    ? [r.name, String(r.orders), String(r.revenue), String(r.paid), String(r.outstanding)]
                    : tab === "team"
                      ? [r.name, String(r.orders), String(r.revenue), String(r.target), `${Math.round((r.attainment || 0) * 100)}%`, String(r.commission)]
                      : tab === "buy"
                        ? [r.name, r.sku, String(r.qtyOnHand), String(r.reserved), String(r.available), String(r.suggested)]
                        : tab === "vendors"
                          ? [r.name, String(r.orders), String(r.openPOs), r.avgLeadDays != null ? String(r.avgLeadDays) : "—", r.onTime != null ? `${r.onTime}%` : "—", `${r.shortRate}%`]
                          : [r.name, r.sku, String(r.qtyOnHand), String(r.sold), String(r.revenue), `${r.daysIdle}d`]
                )}
              />
            </div>
          </div>
        </div>
      <Register
        rows={rows}
        pager={pager}
        getId={(r: any) => r.id || r.name || r.sku}
        empty={{ title: "No rows in this report" }}
        mobile={{
          title: (r: any) => r.name,
          subtitle: (r: any) => r.sku || r.phone || r.role?.replace("_", " ") || "",
          fields: tab === "customers"
            ? [
                { label: "Orders", value: (r: any) => r.orders, align: "right" },
                { label: "Revenue", value: (r: any) => money(r.revenue), align: "right" },
                { label: "Outstanding", value: (r: any) => money(r.outstanding), align: "right" },
              ]
            : tab === "team"
              ? [
                  { label: "Orders", value: (r: any) => r.orders, align: "right" },
                  { label: "Revenue", value: (r: any) => money(r.revenue), align: "right" },
                  { label: "Attainment", value: (r: any) => `${Math.round((r.attainment || 0) * 100)}%`, align: "right" },
                ]
              : [
                  { label: "On hand", value: (r: any) => r.qtyOnHand, align: "right" },
                  { label: "Sold", value: (r: any) => r.sold, align: "right" },
                  { label: "Revenue", value: (r: any) => money(r.revenue), align: "right" },
                ],
          details: (r: any) => Object.entries({
            Name: r.name,
            SKU: r.sku,
            Orders: r.orders,
            Revenue: r.revenue != null ? money(r.revenue) : undefined,
            Outstanding: r.outstanding != null ? money(r.outstanding) : undefined,
          }).filter(([, v]) => v != null && v !== "").map(([label, value]) => ({ label, value: String(value) })),
        }}
      >
      <div className="table-wrap">
        <table className="invoice suite-table">
          <thead>
            <tr>
              {tab === "customers" ? (
                <><th>Customer</th><th className="num">Orders</th><th className="num">Revenue</th><th className="num">Paid</th><th className="num">Outstanding</th><th>PDF</th></>
              ) : tab === "team" ? (
                <><th>Sales person</th><th className="num">Orders</th><th className="num">Revenue</th><th className="num">Target</th><th className="num">Attainment</th><th className="num">Commission</th><th>PDF</th></>
              ) : tab === "buy" ? (
                <><th>Product</th><th>SKU</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th><th className="num">Buy qty</th><th></th></>
              ) : tab === "vendors" ? (
                <><th>Vendor</th><th className="num">Orders</th><th className="num">Open POs</th><th className="num">Avg lead</th><th className="num">On-time</th><th className="num">Short rate</th><th></th></>
              ) : (
                <><th>Product name</th><th>Part number</th><th className="num">On hand</th><th className="num">Sold</th><th className="num">Revenue</th><th className="num">Idle</th><th>PDF</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={tab === "customers" ? 6 : tab === "team" ? 7 : 7} label="No rows match." />}
            {tab === "customers"
              ? pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.name}<div className="text-xs text-stone-500">{r.phone}</div></td>
                    <td className="num">{r.orders}</td>
                    <td className="num">{money(r.revenue)}</td>
                    <td className="num">{money(r.paid)}</td>
                    <td className="num">{money(r.outstanding)}</td>
                    <td>
                      <RowPdf
                        title={`Customer ${r.name}`}
                        fields={[
                          ["Customer", r.name],
                          ["Orders", String(r.orders)],
                          ["Revenue", money(r.revenue)],
                          ["Paid", money(r.paid)],
                          ["Outstanding", money(r.outstanding)],
                        ]}
                      />
                    </td>
                  </tr>
                ))
              : tab === "team"
              ? pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}<div className="text-xs text-stone-500">{r.role.replace("_", " ")}</div></td>
                    <td className="num">{r.orders}</td>
                    <td className="num">{money(r.revenue)}</td>
                    <td className="num">{money(r.target)}</td>
                    <td className="num">{Math.round((r.attainment || 0) * 100)}%</td>
                    <td className="num">{money(r.commission)}</td>
                    <td>
                      <RowPdf
                        title={`Sales ${r.name}`}
                        fields={[
                          ["Sales person", r.name],
                          ["Orders", String(r.orders)],
                          ["Revenue", money(r.revenue)],
                          ["Target", money(r.target)],
                          ["Attainment", `${Math.round((r.attainment || 0) * 100)}%`],
                          ["Commission", money(r.commission)],
                        ]}
                      />
                    </td>
                  </tr>
                ))
              : tab === "buy"
              ? pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name} {r.critical && <span className="badge bg-red-50 text-red-700">Critical</span>}</td>
                    <td>{r.sku}</td>
                    <td className="num">{r.qtyOnHand}</td>
                    <td className="num">{r.reserved}</td>
                    <td className="num">{r.available}</td>
                    <td className="num font-semibold">{r.suggested}</td>
                    <td><Link className="btn-gold px-2 py-1 text-xs" to="/procurement/new">Raise PO</Link></td>
                  </tr>
                ))
              : tab === "vendors"
              ? pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}{r.oem && <span className="ml-1 badge bg-blue-50 text-blue-700">OEM</span>}</td>
                    <td className="num">{r.orders}</td>
                    <td className="num">{r.openPOs}</td>
                    <td className="num">{r.avgLeadDays != null ? `${r.avgLeadDays}d` : "—"}</td>
                    <td className="num">{r.onTime != null ? `${r.onTime}%` : "—"}</td>
                    <td className="num">{r.shortRate}%</td>
                    <td><Link className="btn-ghost px-2 py-1 text-xs" to="/vendors">View</Link></td>
                  </tr>
                ))
              : pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name} {r.critical && <span className="badge bg-red-50 text-red-700">Critical</span>}</td>
                    <td>{r.sku}</td>
                    <td className="num">{r.qtyOnHand}</td>
                    <td className="num">{r.sold}</td>
                    <td className="num">{money(r.revenue)}</td>
                    <td className="num">{r.daysIdle}d</td>
                    <td>
                      <RowPdf
                        title={`Product ${r.name}`}
                        fields={[
                          ["Product name", r.name],
                          ["Part number", r.sku],
                          ["Bin", r.binLocation],
                          ["Qty", String(r.qtyOnHand)],
                          ["Sold", String(r.sold)],
                          ["Revenue", money(r.revenue)],
                          ["Idle", `${r.daysIdle}d`],
                        ]}
                      />
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
    </div>
  );
}
