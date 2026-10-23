import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  getMobileBottomTabs,
  getMobileDrawerExtras,
  mobileRoleLabel,
  resolveMobileRole,
} from "../lib/mobile-shell";

export function MobileDrawerNav({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth();
  const tabs = getMobileBottomTabs(user);
  const role = resolveMobileRole(user);
  const extras = getMobileDrawerExtras(user);

  return (
    <div className="mobile-drawer space-y-4 px-3 pb-6">
      <p className="px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {mobileRoleLabel(role)} · Mobile
      </p>
      <div className="space-y-0.5">
        {tabs.map((t) => (
          <NavLink
            key={t.key}
            to={t.to}
            onClick={onNavigate}
            className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-on" : ""}`}
          >
            <t.icon size={17} />
            {t.label}
          </NavLink>
        ))}
      </div>
      {extras.length > 0 && (
        <>
          <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Shortcuts</p>
          {extras.map((f) => (
            <NavLink key={f.to + f.label} to={f.to} onClick={onNavigate} className="sidebar-link">
              {f.label}
            </NavLink>
          ))}
        </>
      )}
    </div>
  );
}
