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

export function parseModules(raw?: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

export function userModules(user: { role: string; modules?: string | null }) {
  if (user.role === "SUPER_ADMIN") return ROLE_MODULES.SUPER_ADMIN;
  const custom = parseModules(user.modules);
  if (custom.length) return custom;
  return ROLE_MODULES[user.role] || ["dashboard"];
}

export function canModule(user: { role: string; modules?: string | null } | undefined, moduleId: string) {
  if (!user) return false;
  const list = userModules(user);
  if (moduleId === "hr" || moduleId === "payroll" || moduleId === "staff") {
    return list.includes("hr") || list.includes("payroll") || list.includes("staff");
  }
  return list.includes(moduleId);
}

export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  modules?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  monthlyTarget?: number | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department || "Operations",
    modules: userModules(user),
    phone: user.phone || null,
    avatarUrl: user.avatarUrl || null,
    jobTitle: user.jobTitle || null,
    monthlyTarget: user.monthlyTarget ?? 0,
  };
}
