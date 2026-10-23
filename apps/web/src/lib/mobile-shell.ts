import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Boxes,
  Home,
  LayoutGrid,
  Receipt,
  ShieldCheck,
  Trophy,
  Truck,
  Users,
  BarChart3,
  Wallet,
} from "lucide-react";
import type { User } from "./auth";
import { canModule, departmentFor } from "./access";
import { financeNavHref } from "../pages/finance/FinanceSidebar";

export type MobileTab = {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string, search: string) => boolean;
};

/** Fixed mobile shells — one per role (React Native parity). */
export type MobileRoleKey = "admin" | "sales" | "warehouse" | "finance" | "general";

export function resolveMobileRole(user: User | null | undefined): MobileRoleKey {
  const role = user?.role || "";
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "admin";
  if (role === "SALES") return "sales";
  if (role === "WAREHOUSE") return "warehouse";
  if (role === "FINANCE") return "finance";
  const dept = departmentFor(user);
  if (dept === "Sales") return "sales";
  if (dept === "Warehouse") return "warehouse";
  if (dept === "Finance") return "finance";
  if (dept === "Administration") return "admin";
  return "general";
}

export function mobileRoleLabel(key: MobileRoleKey): string {
  const map: Record<MobileRoleKey, string> = {
    admin: "Administration",
    sales: "Sales",
    warehouse: "Warehouse",
    finance: "Finance",
    general: "Operations",
  };
  return map[key];
}

function financeActive(section: string, extra?: Record<string, string>) {
  return (pathname: string, search: string) => {
    if (pathname !== "/finance") return false;
    const q = new URLSearchParams(search);
    const sec = q.get("section") || "overview";
    if (sec !== section) return false;
    if (!extra) return true;
    return Object.entries(extra).every(([k, v]) => q.get(k) === v);
  };
}

const homeTab = (): MobileTab => ({
  key: "home",
  to: "/",
  label: "Home",
  icon: Home,
  isActive: (p) => p === "/",
});

const moreTab = (): MobileTab => ({
  key: "more",
  to: "/more",
  label: "More",
  icon: LayoutGrid,
  isActive: (p) => p === "/more",
});

const salesOrdersTab = (): MobileTab => ({
  key: "orders",
  to: "/sales",
  label: "Orders",
  icon: Trophy,
  isActive: (p) => p === "/sales" || (p.startsWith("/sales/") && !p.includes("/print/")),
});

const customersTab = (): MobileTab => ({
  key: "customers",
  to: "/customers",
  label: "Customers",
  icon: Users,
  isActive: (p) => p === "/customers",
});

const dispatchTab = (): MobileTab => ({
  key: "dispatch",
  to: "/dispatch",
  label: "Dispatch",
  icon: Truck,
  isActive: (p) => p === "/dispatch" || p.startsWith("/dispatch/"),
});

const stockTab = (): MobileTab => ({
  key: "stock",
  to: "/inventory",
  label: "Stock",
  icon: Boxes,
  isActive: (p) => p === "/inventory" || p.startsWith("/inventory"),
});

const invoicesTab = (): MobileTab => ({
  key: "invoices",
  to: financeNavHref("invoices"),
  label: "Invoices",
  icon: Receipt,
  isActive: financeActive("overview"),
});

const collectTab = (): MobileTab => ({
  key: "collect",
  to: financeNavHref("ar"),
  label: "Collect",
  icon: Banknote,
  isActive: financeActive("ar", { tab: "collections" }),
});

const financeHubTab = (): MobileTab => ({
  key: "finance",
  to: financeNavHref("invoices"),
  label: "Finance",
  icon: Wallet,
  isActive: (p) => p.startsWith("/finance"),
});

const reportsTab = (): MobileTab => ({
  key: "reports",
  to: "/reports",
  label: "Reports",
  icon: BarChart3,
  isActive: (p) => p === "/reports",
});

const approvalsTab = (): MobileTab => ({
  key: "approvals",
  to: "/approvals",
  label: "Approvals",
  icon: ShieldCheck,
  isActive: (p) => p === "/approvals",
});

/** Bottom navigation — exactly four slots: Home · role work · role work · More */
export function getMobileBottomTabs(user: User | null): MobileTab[] {
  const role = resolveMobileRole(user);
  const home = homeTab();
  const more = moreTab();

  switch (role) {
    case "admin":
      return [home, salesOrdersTab(), financeHubTab(), more];
    case "sales":
      return [home, salesOrdersTab(), customersTab(), more];
    case "warehouse":
      return [home, dispatchTab(), stockTab(), more];
    case "finance":
      return [home, invoicesTab(), collectTab(), more];
    default:
      break;
  }

  const extras: MobileTab[] = [];
  const order: { mod: string; tab: () => MobileTab }[] = [
    { mod: "dispatch", tab: dispatchTab },
    { mod: "sales", tab: salesOrdersTab },
    { mod: "inventory", tab: stockTab },
    { mod: "customers", tab: customersTab },
    { mod: "finance", tab: financeHubTab },
    { mod: "reports", tab: reportsTab },
    { mod: "approvals", tab: approvalsTab },
  ];
  for (const { mod, tab } of order) {
    if (canModule(user, mod)) extras.push(tab());
    if (extras.length >= 2) break;
  }
  return [home, ...extras.slice(0, 2), more];
}

/** Paths primary on bottom bar — hide duplicates in More. */
export function mobilePrimaryPaths(user: User | null): string[] {
  return getMobileBottomTabs(user)
    .filter((t) => t.key !== "home" && t.key !== "more")
    .map((t) => t.to.split("?")[0]);
}

export function mobilePrimaryPrefixes(user: User | null): string[] {
  const role = resolveMobileRole(user);
  switch (role) {
    case "admin":
      return ["/sales", "/finance"];
    case "sales":
      return ["/sales", "/customers"];
    case "warehouse":
      return ["/dispatch", "/inventory"];
    case "finance":
      return ["/finance"];
    default:
      return mobilePrimaryPaths(user);
  }
}

export function isMobilePrimaryDestination(user: User | null, to: string): boolean {
  const path = to.split("?")[0];
  const prefixes = mobilePrimaryPrefixes(user);
  if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  const role = resolveMobileRole(user);
  if (role === "finance" && to.startsWith("/finance?") && (to.includes("section=overview") || to.includes("section=ar"))) {
    return true;
  }
  return false;
}

export function showMobileCreateFab(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/share/")) return false;
  if (/^\/sales\/[^/]+\/print\//.test(pathname)) return false;
  const hideOnDetail = /^\/(sales|dispatch|procurement|vendors)\/[^/]+/.test(pathname);
  if (hideOnDetail) return false;
  return true;
}

export const MORE_FINANCE_LINKS = [
  { label: "Invoices", to: financeNavHref("invoices") },
  { label: "Collect payments", to: financeNavHref("ar") },
  { label: "Accounts payable", to: financeNavHref("ap") },
  { label: "Tax & VAT", to: financeNavHref("tax") },
  { label: "Full finance hub", to: "/finance" },
] as const;

/** Drawer extras (not duplicated on bottom bar). */
export function getMobileDrawerExtras(user: User | null): { label: string; to: string }[] {
  const role = resolveMobileRole(user);
  const rows: { label: string; to: string }[] = [];
  const add = (label: string, to: string) => {
    if (!isMobilePrimaryDestination(user, to)) rows.push({ label, to });
  };

  switch (role) {
    case "admin":
      add("Reports", "/reports");
      add("Approvals", "/approvals");
      add("Dispatch", "/dispatch");
      add("Inventory", "/inventory");
      MORE_FINANCE_LINKS.forEach((f) => add(f.label, f.to));
      break;
    case "sales":
      if (canModule(user, "inventory")) add("Inventory", "/inventory");
      if (canModule(user, "reports")) add("Reports", "/reports");
      if (canModule(user, "approvals")) add("Approvals", "/approvals");
      break;
    case "warehouse":
      if (canModule(user, "procurement")) add("Procurement", "/procurement");
      if (canModule(user, "vendors")) add("Vendors", "/vendors");
      if (canModule(user, "approvals")) add("Approvals", "/approvals");
      break;
    case "finance":
      add("Accounts payable", financeNavHref("ap"));
      add("Tax & VAT", financeNavHref("tax"));
      add("Reports", financeNavHref("reports"));
      if (canModule(user, "approvals")) add("Approvals", "/approvals");
      break;
    default:
      if (canModule(user, "approvals")) add("Approvals", "/approvals");
      if (canModule(user, "reports")) add("Reports", "/reports");
      break;
  }
  return rows;
}
