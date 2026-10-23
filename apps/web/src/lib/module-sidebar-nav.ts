import type { User } from "./auth";
import { canModule } from "./access";
import { ANALYTICS_HUBS } from "./module-report-links";
import { DISPATCH_TABS } from "./dispatch-status";
import {
  FINANCE_SIDEBAR_LINKS,
  financeNavFromLocation,
  type FinanceNavId,
} from "../pages/finance/FinanceSidebar";

export type SidebarChild = { id: string; label: string; to: string };

type SidebarModuleConfig = {
  basePath: string;
  children: (user: User | null) => SidebarChild[];
  activeChildId: (pathname: string, search: string) => string | null;
  isInModule: (pathname: string) => boolean;
};

function qTab(search: string, fallback: string) {
  return new URLSearchParams(search).get("tab") || fallback;
}

function qSection(search: string, fallback: string) {
  return new URLSearchParams(search).get("section") || fallback;
}

function qHub(search: string, fallback: string) {
  return new URLSearchParams(search).get("hub") || fallback;
}

const CONFIG: Record<string, SidebarModuleConfig> = {
  sales: {
    basePath: "/sales",
    isInModule: (p) => p === "/sales" || p.startsWith("/sales/"),
    children: () => [
      { id: "orders", label: "Sales orders", to: "/sales?tab=orders" },
      { id: "quotes", label: "Quotations", to: "/sales?tab=quotes" },
      { id: "performance", label: "Performance", to: "/sales/performance" },
    ],
    activeChildId: (p, s) => {
      if (!p.startsWith("/sales")) return null;
      if (p.startsWith("/sales/performance")) return "performance";
      if (p !== "/sales") return "orders";
      return qTab(s, "orders") === "quotes" ? "quotes" : "orders";
    },
  },
  dispatch: {
    basePath: "/dispatch",
    isInModule: (p) => p === "/dispatch" || p.startsWith("/dispatch/"),
    children: () =>
      DISPATCH_TABS.map(([id, label]) => ({
        id,
        label,
        to: id === "all" ? "/dispatch?tab=all" : `/dispatch?tab=${id}`,
      })),
    activeChildId: (p, s) => {
      if (!p.startsWith("/dispatch")) return null;
      const tab = qTab(s, "all");
      return DISPATCH_TABS.some(([id]) => id === tab) ? tab : "all";
    },
  },
  inventory: {
    basePath: "/inventory",
    isInModule: (p) => p === "/inventory" || p.startsWith("/inventory/"),
    children: () => [
      { id: "dashboard", label: "Stock dashboard", to: "/inventory?section=overview" },
      { id: "products", label: "Item master", to: "/inventory?section=products" },
      { id: "movements", label: "Movements", to: "/inventory?section=movements" },
      { id: "reports", label: "Inventory reports", to: "/inventory?section=reports" },
      { id: "reorder", label: "Reorder planning", to: "/inventory?section=reorder" },
      { id: "warehouses", label: "Warehouses", to: "/inventory?section=warehouses" },
    ],
    activeChildId: (p, s) => {
      if (!p.startsWith("/inventory")) return null;
      const section = qSection(s, "overview");
      const ids = ["overview", "products", "movements", "reports", "reorder", "warehouses"];
      if (section === "overview") return "dashboard";
      return ids.includes(section) ? section : "dashboard";
    },
  },
  procurement: {
    basePath: "/procurement",
    isInModule: (p) => p === "/procurement" || p.startsWith("/procurement/"),
    children: () => [
      { id: "open", label: "Open POs", to: "/procurement?tab=open" },
      { id: "received", label: "Received", to: "/procurement?tab=received" },
      { id: "all", label: "All POs", to: "/procurement?tab=all" },
    ],
    activeChildId: (p, s) => {
      if (!p.startsWith("/procurement")) return null;
      const tab = qTab(s, "open");
      return ["open", "received", "all"].includes(tab) ? tab : "open";
    },
  },
  customers: {
    basePath: "/customers",
    isInModule: (p) => p === "/customers" || p.startsWith("/customers/"),
    children: () => [
      { id: "directory", label: "Customer directory", to: "/customers?tab=directory" },
      { id: "balances", label: "Balance summary", to: "/customers?tab=balances" },
    ],
    activeChildId: (p, s) => {
      if (!p.startsWith("/customers")) return null;
      return qTab(s, "directory") === "balances" ? "balances" : "directory";
    },
  },
  vendors: {
    basePath: "/vendors",
    isInModule: (p) => p === "/vendors" || p.startsWith("/vendors/"),
    children: () => [
      { id: "all", label: "All suppliers", to: "/vendors?tab=all" },
      { id: "oem", label: "OEM", to: "/vendors?tab=oem" },
      { id: "after", label: "Aftermarket", to: "/vendors?tab=after" },
      { id: "owing", label: "Balance due", to: "/vendors?tab=owing" },
    ],
    activeChildId: (p, s) => {
      if (!p.startsWith("/vendors")) return null;
      const tab = qTab(s, "all");
      return ["all", "oem", "after", "owing"].includes(tab) ? tab : "all";
    },
  },
  reports: {
    basePath: "/reports",
    isInModule: (p) => p === "/reports" || p.startsWith("/reports/"),
    children: () => [
      ...ANALYTICS_HUBS.map((h) => ({
        id: h.id,
        label: h.label,
        to: h.id === "cross" ? "/reports?hub=cross&tab=ageing" : `/reports?hub=${h.id}`,
      })),
      { id: "cross-stock", label: "Stock reports", to: "/reports?hub=cross&tab=stock" },
      { id: "cross-buy", label: "What to buy", to: "/reports?hub=cross&tab=buy" },
      { id: "cross-customers", label: "Customer revenue", to: "/reports?hub=cross&tab=customers" },
      { id: "cross-team", label: "Sales team", to: "/reports?hub=cross&tab=team" },
      { id: "cross-vendors", label: "Vendor performance", to: "/reports?hub=cross&tab=vendors" },
    ],
    activeChildId: (p, s) => {
      if (!p.startsWith("/reports")) return null;
      const hub = qHub(s, "executive");
      if (hub === "cross") {
        const t = qTab(s, "ageing");
        if (t === "buy") return "cross-buy";
        if (t === "customers") return "cross-customers";
        if (t === "team") return "cross-team";
        if (t === "vendors") return "cross-vendors";
        return "cross-stock";
      }
      return ANALYTICS_HUBS.some((h) => h.id === hub) ? hub : "executive";
    },
  },
  finance: {
    basePath: "/finance",
    isInModule: (p) => p.startsWith("/finance"),
    children: () =>
      FINANCE_SIDEBAR_LINKS.map((l) => ({ id: l.id, label: l.label, to: l.to })),
    activeChildId: (p, s) => financeNavFromLocation(p, s) as FinanceNavId | null,
  },
  approvals: {
    basePath: "/approvals",
    isInModule: (p) => p.startsWith("/approvals"),
    children: () => [
      { id: "PENDING", label: "Pending", to: "/approvals?tab=PENDING" },
      { id: "APPROVED", label: "Approved", to: "/approvals?tab=APPROVED" },
      { id: "REJECTED", label: "Rejected", to: "/approvals?tab=REJECTED" },
      { id: "ALL", label: "All requests", to: "/approvals?tab=ALL" },
    ],
    activeChildId: (p, s) => {
      if (!p.startsWith("/approvals")) return null;
      const tab = qTab(s, "PENDING");
      return ["PENDING", "APPROVED", "REJECTED", "ALL"].includes(tab) ? tab : "PENDING";
    },
  },
  hr: {
    basePath: "/hr",
    isInModule: (p) => p.startsWith("/hr"),
    children: (user) => {
      const admin = canModule(user, "hr");
      const items: SidebarChild[] = [];
      if (admin) items.push({ id: "employees", label: "Employees", to: "/hr?tab=employees" });
      items.push(
        { id: "leave", label: "Leave requests", to: "/hr?tab=leave" },
        { id: "onleave", label: "Who is away", to: "/hr?tab=onleave" },
        { id: "advance", label: "Salary advance", to: "/hr?tab=advance" },
      );
      if (admin) {
        items.push(
          { id: "attendance", label: "Attendance", to: "/hr?tab=attendance" },
          { id: "payroll", label: "Payroll", to: "/hr?tab=payroll" },
        );
      }
      items.push({ id: "reports", label: "HR reports", to: "/hr?tab=reports" });
      return items;
    },
    activeChildId: (p, s) => {
      if (!p.startsWith("/hr")) return null;
      const tab = qTab(s, "leave");
      const allowed = ["employees", "leave", "onleave", "advance", "attendance", "payroll", "reports"];
      return allowed.includes(tab) ? tab : "leave";
    },
  },
  settings: {
    basePath: "/settings",
    isInModule: (p) => p.startsWith("/settings") || p.startsWith("/profile"),
    children: (user) => {
      const admin = canModule(user, "settings");
      if (!admin) return [{ id: "profile", label: "My profile", to: "/settings?tab=profile" }];
      return [
        { id: "company", label: "Company", to: "/settings?tab=company" },
        { id: "integrations", label: "Integrations", to: "/settings?tab=integrations" },
        { id: "profile", label: "My profile", to: "/settings?tab=profile" },
      ];
    },
    activeChildId: (p, s) => {
      if (!p.startsWith("/settings") && !p.startsWith("/profile")) return null;
      const tab = qTab(s, "profile");
      return ["company", "integrations", "profile"].includes(tab) ? tab : "profile";
    },
  },
};

export function getModuleSidebarConfig(module: string): SidebarModuleConfig | undefined {
  return CONFIG[module];
}

export function moduleSidebarChildren(module: string, user: User | null): SidebarChild[] {
  const cfg = CONFIG[module];
  if (!cfg) return [];
  return cfg.children(user);
}

export function moduleSidebarActiveId(module: string, pathname: string, search: string): string | null {
  const cfg = CONFIG[module];
  if (!cfg || !cfg.isInModule(pathname)) return null;
  return cfg.activeChildId(pathname, search);
}

export function moduleIsActive(module: string, pathname: string): boolean {
  const cfg = CONFIG[module];
  return cfg ? cfg.isInModule(pathname) : false;
}
