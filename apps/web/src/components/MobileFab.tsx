import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useExclusiveDropdown } from "../lib/exclusive-dropdown";
import { Link, useLocation } from "react-router-dom";
import { CREATE_ACTIONS } from "../lib/create-actions";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import { showMobileCreateFab } from "../lib/mobile-shell";

export function MobileFab() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { open, setOpen, toggle } = useExclusiveDropdown("mobile-fab");

  const actions = useMemo(() => {
    const create = CREATE_ACTIONS.filter((a) => canModule(user, a.module));
    const pay = canModule(user, "finance")
      ? [{ label: "Record payment", to: "/finance?section=ar&tab=collections", module: "finance" as const }]
      : [];
    return [...pay, ...create];
  }, [user]);

  if (!showMobileCreateFab(pathname) || actions.length === 0) return null;

  return (
    <>
      {open && (
        <button
          type="button"
          className="mobile-shell-chrome mobile-fab-backdrop"
          aria-label="Close actions"
          onClick={() => setOpen(false)}
        />
      )}
      <div className={`mobile-shell-chrome mobile-fab-wrap ${open ? "mobile-fab-open" : ""}`}>
        {open && (
          <ul className="mobile-fab-menu" role="menu">
            {actions.map((a) => (
              <li key={a.to + a.label} role="none">
                <Link role="menuitem" className="mobile-fab-item" to={a.to} onClick={() => setOpen(false)}>
                  {a.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="mobile-create-fab"
          aria-label={open ? "Close quick actions" : "Quick actions"}
          aria-expanded={open}
          onClick={toggle}
        >
          <Plus size={26} className={open ? "rotate-45 transition-transform" : "transition-transform"} />
        </button>
      </div>
    </>
  );
}
