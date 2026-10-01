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

export type ModuleId = (typeof MODULES)[number]["id"];

export const ALL_MODULES = MODULES.map((m) => m.id);

export const DEPARTMENTS: { id: string; label: string; role: string; modules: string[] }[] = [
  { id: "Sales", label: "Sales", role: "SALES", modules: ["dashboard", "sales", "inventory", "customers", "reports", "approvals"] },
  { id: "Warehouse", label: "Warehouse", role: "WAREHOUSE", modules: ["dashboard", "dispatch", "inventory", "procurement", "vendors", "approvals"] },
  { id: "Finance", label: "Finance", role: "FINANCE", modules: ["dashboard", "finance", "customers", "sales", "reports", "hr", "procurement", "approvals"] },
  { id: "Administration", label: "Administration", role: "ADMIN", modules: ALL_MODULES.filter((m) => m !== "settings") },
  { id: "Management", label: "Management", role: "SUPER_ADMIN", modules: [...ALL_MODULES] },
];

export function parseModules(raw?: string | null, role?: string) {
  if (role === "SUPER_ADMIN") return [...ALL_MODULES];
  const listed = String(raw || "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => ALL_MODULES.includes(m as ModuleId));
  if (listed.length) return listed;
  return DEPARTMENTS.find((d) => d.role === role)?.modules.slice() || ["dashboard"];
}

export function serializeModules(mods: string[]) {
  return [...new Set(mods.filter((m) => ALL_MODULES.includes(m as ModuleId)))].join(",");
}

export function hasModule(user: { role?: string; modules?: string[] | string }, moduleId: string) {
  if (user.role === "SUPER_ADMIN") return true;
  const list = Array.isArray(user.modules) ? user.modules : parseModules(user.modules, user.role);
  return list.includes(moduleId);
}

export function publicUser(user: { id: string; name: string; email: string; role: string; department?: string | null; modules?: string | null }) {
  const modules = parseModules(user.modules, user.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department || DEPARTMENTS.find((d) => d.role === user.role)?.id || "",
    modules,
  };
}
