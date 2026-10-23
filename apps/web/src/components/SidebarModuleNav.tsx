import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useExclusiveDropdown } from "../lib/exclusive-dropdown";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { moduleSidebarActiveId, moduleSidebarChildren } from "../lib/module-sidebar-nav";

/** Single-page modules — one click opens the page (no chevron / sub-menu). */
const FLAT_SIDEBAR_MODULES = new Set(["dashboard", "audit"]);

export function SidebarModuleNav({
  module,
  icon: Icon,
  label,
  to,
  onNavigate,
}: {
  module: string;
  icon: LucideIcon;
  label: string;
  to: string;
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const children = useMemo(() => moduleSidebarChildren(module, user), [module, user]);
  const inModule = pathname === to || (to !== "/" && pathname.startsWith(to));
  const activeId = FLAT_SIDEBAR_MODULES.has(module) ? null : moduleSidebarActiveId(module, pathname, search);
  const { open, setOpen } = useExclusiveDropdown(`sidebar-${module}`);

  useEffect(() => {
    if (inModule) setOpen(true);
  }, [inModule]);

  if (FLAT_SIDEBAR_MODULES.has(module) || children.length === 0) {
    return (
      <NavLink to={to} end={to === "/"} onClick={onNavigate} className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-on" : ""}`}>
        <Icon size={17} aria-hidden />
        {label}
      </NavLink>
    );
  }

  return (
    <div className="sidebar-group">
      <button
        type="button"
        className={`sidebar-link sidebar-link-parent ${inModule ? "sidebar-link-on" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon size={17} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown size={16} className={`sidebar-chevron shrink-0 ${open ? "is-open" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="sidebar-sub" role="group" aria-label={`${label} sections`}>
          {children.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={`sidebar-sublink ${activeId === item.id ? "sidebar-sublink-on" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
