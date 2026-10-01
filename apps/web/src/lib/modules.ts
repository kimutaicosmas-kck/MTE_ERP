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

export const ALL_MODULES = MODULES.map((m) => m.id);

export const DEPARTMENTS = [
  { id: "Sales", role: "SALES", modules: ["dashboard", "sales", "inventory", "customers", "reports", "approvals"] },
  { id: "Warehouse", role: "WAREHOUSE", modules: ["dashboard", "dispatch", "inventory", "procurement", "vendors", "approvals"] },
  { id: "Finance", role: "FINANCE", modules: ["dashboard", "finance", "customers", "sales", "reports", "hr", "procurement", "approvals"] },
  { id: "Administration", role: "ADMIN", modules: ALL_MODULES.filter((m) => m !== "settings") },
  { id: "Management", role: "SUPER_ADMIN", modules: [...ALL_MODULES] },
];

export function hasModule(user: { role?: string; modules?: string[] } | null | undefined, moduleId: string) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return (user.modules || []).includes(moduleId);
}
