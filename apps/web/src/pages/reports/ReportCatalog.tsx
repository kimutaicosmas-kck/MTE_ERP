import { Link } from "react-router-dom";
import { EnterpriseRoadmap } from "../../components/EnterpriseRoadmap";

const CATALOG = [
  {
    category: "Sales",
    live: [
      { label: "Sales performance", to: "/reports?hub=cross&tab=team" },
      { label: "Customer revenue", to: "/reports?hub=cross&tab=customers" },
      { label: "Sales register", to: "/sales" },
    ],
    planned: ["Branch sales", "Discount analysis", "Gross margin by product"],
  },
  {
    category: "Procurement",
    live: [
      { label: "Vendor performance", to: "/reports?tab=vendors" },
      { label: "Reorder / buy list", to: "/reports?tab=buy" },
      { label: "Open POs", to: "/procurement" },
    ],
    planned: ["Purchase register", "Lead time analysis", "3-way match"],
  },
  {
    category: "Finance",
    live: [
      { label: "AR aging", to: "/finance?section=ar&tab=collections" },
      { label: "AP aging", to: "/finance?section=ap&apView=aging" },
      { label: "Trial balance & P&L", to: "/finance?section=reports" },
      { label: "VAT return", to: "/finance?section=tax" },
      { label: "Bank reconcile", to: "/finance?section=reports&view=reconcile" },
    ],
    planned: ["Cash flow statement", "Budget vs actual", "Fixed asset schedule"],
  },
  {
    category: "Inventory",
    live: [
      { label: "Stock ageing", to: "/reports?tab=ageing" },
      { label: "Dead & slow movers", to: "/reports?tab=dead" },
      { label: "Movement register", to: "/inventory?section=movements" },
    ],
    planned: ["Warehouse utilization", "Batch expiry", "ABC / XYZ analysis"],
  },
  {
    category: "HR & audit",
    live: [
      { label: "Payroll", to: "/hr" },
      { label: "Audit trail", to: "/audit" },
      { label: "Approval history", to: "/approvals" },
    ],
    planned: ["Attendance summary", "Security audit", "Permission changes"],
  },
];

export function ReportCatalog() {
  return (
    <div className="space-y-6">
      {CATALOG.map((block) => (
        <div key={block.category} className="space-y-2">
          <h3 className="font-semibold">{block.category}</h3>
          <div className="flex flex-wrap gap-2">
            {block.live.map((r) => (
              <Link key={r.label} className="badge bg-emerald-50 text-emerald-800 hover:bg-emerald-100 px-3 py-1.5" to={r.to}>
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <EnterpriseRoadmap
        items={[
          { title: "Executive dashboard PDF", blurb: "Monthly board pack.", status: "planned" },
          { title: "Scheduled email", blurb: "VAT and aging every Monday.", status: "planned" },
          { title: "Drill-down to voucher", blurb: "From report row to journal.", status: "partial", to: "/finance?section=ledger" },
          { title: "Fraud & anomaly pack", blurb: "Duplicate payments, backdated entries.", status: "partial", to: "/finance?section=ai" },
        ]}
      />
    </div>
  );
}
