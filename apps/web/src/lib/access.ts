export const MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sales", label: "Sales" },
  { id: "dispatch", label: "Dispatch" },
  { id: "inventory", label: "Inventory" },
  { id: "procurement", label: "Procurement" },
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
  { id: "reports", label: "Reports" },
  { id: "finance", label: "Finance" },
  { id: "approvals", label: "Approvals" },
  { id: "audit", label: "Audit" },
  { id: "hr", label: "HR" },
  { id: "settings", label: "Settings" },
] as const;

export const DEPARTMENTS = ["Sales", "Warehouse", "Finance", "Administration", "Procurement", "Operations"];

export const ROLE_MODULES: Record<string, string[]> = {
  SUPER_ADMIN: MODULES.map((m) => m.id),
  ADMIN: MODULES.map((m) => m.id),
  SALES: ["dashboard", "sales", "inventory", "customers", "reports", "approvals"],
  WAREHOUSE: ["dashboard", "dispatch", "inventory", "procurement", "vendors", "approvals"],
  FINANCE: ["dashboard", "sales", "inventory", "procurement", "customers", "vendors", "reports", "finance", "approvals", "audit", "hr"],
};

export function canModule(user: { role?: string; modules?: string[] } | null | undefined, moduleId: string) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  const list = user.modules?.length ? user.modules : ROLE_MODULES[user.role || ""] || ["dashboard"];
  if (moduleId === "hr" || moduleId === "payroll" || moduleId === "staff") {
    return list.includes("hr") || list.includes("payroll") || list.includes("staff");
  }
  return list.includes(moduleId);
}
