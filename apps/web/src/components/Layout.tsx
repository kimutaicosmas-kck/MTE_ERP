import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
  Wallet,
  Trophy,
  ScrollText,
  Truck,
  BarChart3,
  Factory,
  UserCog,
} from "lucide-react";
import { useAuth } from "../lib/auth";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "ADMIN", "SALES", "WAREHOUSE", "FINANCE"] },
  { to: "/orders", label: "Orders", icon: ClipboardList, roles: ["SUPER_ADMIN", "ADMIN", "SALES", "WAREHOUSE", "FINANCE"] },
  { to: "/dispatch", label: "Dispatch", icon: Truck, roles: ["SUPER_ADMIN", "ADMIN", "WAREHOUSE"] },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["SUPER_ADMIN", "ADMIN", "SALES", "WAREHOUSE", "FINANCE"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["SUPER_ADMIN", "ADMIN", "SALES", "FINANCE"] },
  { to: "/vendors", label: "Vendors", icon: Factory, roles: ["SUPER_ADMIN", "ADMIN", "WAREHOUSE", "FINANCE"] },
  { to: "/sales", label: "Sales", icon: Trophy, roles: ["SUPER_ADMIN", "ADMIN", "SALES", "FINANCE"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["SUPER_ADMIN", "ADMIN", "FINANCE", "SALES"] },
  { to: "/finance", label: "Books", icon: Wallet, roles: ["SUPER_ADMIN", "ADMIN", "FINANCE"] },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck, roles: ["SUPER_ADMIN", "ADMIN", "SALES", "WAREHOUSE", "FINANCE"] },
  { to: "/audit", label: "Audit", icon: ScrollText, roles: ["SUPER_ADMIN", "ADMIN", "FINANCE"] },
  { to: "/staff", label: "Staff", icon: UserCog, roles: ["SUPER_ADMIN", "ADMIN"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col overflow-y-auto bg-ink text-stone-200">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="font-serif text-3xl tracking-wide text-white">ERP</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-gold">MTE operations</div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 p-3">
          {links
            .filter((l) => user && l.roles.includes(user.role))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                    isActive ? "bg-gold text-ink font-semibold" : "hover:bg-white/5"
                  }`
                }
              >
                <l.icon size={16} />
                {l.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs">
          <div className="font-semibold text-white">{user?.name}</div>
          <div className="mt-0.5 uppercase tracking-wide text-gold">{user?.role.replace("_", " ")}</div>
          <button
            className="mt-3 flex items-center gap-2 text-stone-400 hover:text-white"
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="ml-64 min-h-screen p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
