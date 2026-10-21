export type ReportLink = { label: string; to: string; hint?: string };

export const MODULE_REPORTS: Record<string, { title: string; links: ReportLink[]; planned?: string[] }> = {
  sales: {
    title: "Sales reports",
    links: [
      { label: "Sales team performance", to: "/reports?hub=cross&tab=team", hint: "Revenue & commission" },
      { label: "Customer revenue", to: "/reports?hub=cross&tab=customers" },
      { label: "Sales performance charts", to: "/sales/performance" },
      { label: "Order register", to: "/sales" },
      { label: "Dispatch performance", to: "/dispatch" },
    ],
    planned: ["Branch sales", "Gross margin by product", "Discount analysis"],
  },
  inventory: {
    title: "Inventory reports",
    links: [
      { label: "Stock ageing", to: "/reports?hub=cross&tab=ageing" },
      { label: "Low stock & reorder", to: "/reports?hub=cross&tab=reorder" },
      { label: "Dead stock", to: "/reports?hub=cross&tab=dead" },
      { label: "Best sellers", to: "/reports?hub=cross&tab=bestSellers" },
      { label: "Movement register", to: "/inventory?section=movements" },
      { label: "Inventory dashboard KPIs", to: "/inventory?section=overview" },
    ],
    planned: ["Warehouse utilization", "ABC analysis", "Batch expiry"],
  },
  finance: {
    title: "Financial reports",
    links: [
      { label: "Profit & loss", to: "/finance?section=reports" },
      { label: "Balance sheet", to: "/finance?section=reports" },
      { label: "Trial balance", to: "/finance?section=reports" },
      { label: "AR aging", to: "/finance?section=ar&tab=collections" },
      { label: "AP aging", to: "/finance?section=ap&apView=aging" },
      { label: "VAT return", to: "/finance?section=tax" },
      { label: "General ledger", to: "/finance?section=ledger" },
      { label: "Bank reconciliation", to: "/finance?section=reports&view=reconcile" },
    ],
    planned: ["Cash flow statement", "Budget vs actual", "Retained earnings"],
  },
  hr: {
    title: "HR reports",
    links: [
      { label: "Payroll runs", to: "/hr?tab=payroll" },
      { label: "Attendance register", to: "/hr?tab=attendance" },
      { label: "Leave balances", to: "/hr?tab=leave" },
      { label: "Staff directory", to: "/hr?tab=employees" },
    ],
    planned: ["Department cost", "Overtime summary", "Performance reviews"],
  },
};

export const ANALYTICS_HUBS = [
  { id: "executive", label: "Executive reports" },
  { id: "cross", label: "Cross-module reports" },
  { id: "kpi", label: "KPI dashboards" },
  { id: "scheduled", label: "Scheduled reports" },
  { id: "builder", label: "Report builder" },
  { id: "export", label: "Data export" },
  { id: "bi", label: "BI analytics" },
] as const;
