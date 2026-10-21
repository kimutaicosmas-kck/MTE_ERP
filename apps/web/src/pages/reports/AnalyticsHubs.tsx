import { Link } from "react-router-dom";
import { EnterpriseRoadmap } from "../../components/EnterpriseRoadmap";
import { MODULE_REPORTS } from "../../lib/module-report-links";

export function ExecutiveReportsHub() {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/" className="erp-link-card">Executive dashboard</Link>
        <Link to="/finance?section=overview" className="erp-link-card">Finance KPI dashboard</Link>
        <Link to="/finance?section=reports" className="erp-link-card">P&amp;L &amp; balance sheet</Link>
        <Link to="/reports?hub=cross&tab=customers" className="erp-link-card">Customer &amp; revenue summary</Link>
        <Link to="/finance?section=ar&tab=collections" className="erp-link-card">Receivables aging</Link>
        <Link to="/finance?section=ap&apView=aging" className="erp-link-card">Payables aging</Link>
      </div>
    </div>
  );
}

export function KpiDashboardsHub() {
  const tiles = [
    { label: "Company home", to: "/" },
    { label: "Finance", to: "/finance?section=overview" },
    { label: "Inventory", to: "/inventory?section=overview" },
    { label: "Dispatch", to: "/dispatch" },
    { label: "Sales performance", to: "/sales/performance" },
    { label: "Approvals queue", to: "/approvals" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((t) => (
        <Link key={t.label} to={t.to} className="erp-link-card font-medium">{t.label}</Link>
      ))}
    </div>
  );
}

export function DataExportHub() {
  return (
    <EnterpriseRoadmap
      items={[
        { title: "CSV from reports", blurb: "Cross-module stock, sales, customers.", status: "live", to: "/reports?hub=cross&tab=ageing" },
        { title: "Finance trial balance CSV", blurb: "From trial balance screen.", status: "partial", to: "/finance?section=reports" },
        { title: "Audit log export", blurb: "Full audit register.", status: "live", to: "/audit" },
        { title: "Scheduled export", blurb: "Email FTP/S3.", status: "planned" },
      ]}
    />
  );
}

export function ScheduledReportsHub() {
  return (
    <EnterpriseRoadmap
      items={[
        { title: "Weekly AR aging", blurb: "Finance team inbox.", status: "planned" },
        { title: "Monthly executive PDF", blurb: "Pinned KPI pack.", status: "planned" },
        { title: "Daily low-stock", blurb: "Procurement + inventory.", status: "partial", to: "/reports?hub=cross&tab=reorder" },
      ]}
    />
  );
}

export function ReportBuilderHub() {
  return (
    <EnterpriseRoadmap
      items={[
        { title: "Saved filters", blurb: "Per-user report views.", status: "planned" },
        { title: "Custom columns", blurb: "Choose metrics per module.", status: "planned" },
        { title: "Drill to voucher", blurb: "From balance to journal line.", status: "partial", to: "/finance?section=ledger" },
      ]}
    />
  );
}

export function BiAnalyticsHub() {
  return (
    <EnterpriseRoadmap
      items={[
        { title: "Sales & revenue trend", blurb: "14-day on home dashboard.", status: "live", to: "/" },
        { title: "AI finance insights", blurb: "Health score & anomalies.", status: "partial", to: "/finance?section=ai" },
        { title: "Embedded BI", blurb: "Power BI / Metabase connectors.", status: "planned" },
      ]}
    />
  );
}

export function CrossModuleIndex() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(MODULE_REPORTS) as (keyof typeof MODULE_REPORTS)[]).map((id) => (
          <div key={id} className="card">
            <div className="font-semibold capitalize">{MODULE_REPORTS[id].title}</div>
            <ul className="mt-2 space-y-1 text-sm">
              {MODULE_REPORTS[id].links.slice(0, 4).map((l) => (
                <li key={l.label}><Link className="underline" to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
            <Link className="mt-2 inline-block text-xs underline" to={
              id === "sales" ? "/sales?tab=reports"
                : id === "inventory" ? "/inventory?section=reports"
                  : id === "finance" ? "/finance?section=finreports"
                    : "/hr?tab=reports"
            }>All {id} reports →</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
