import {
  BarChart3,
  Boxes,
  ChevronRight,
  Factory,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Trophy,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import {
  MORE_FINANCE_LINKS,
  isMobilePrimaryDestination,
  mobileRoleLabel,
  resolveMobileRole,
} from "../lib/mobile-shell";
import { useSetPageTitle } from "../lib/page-title";
import type { LucideIcon } from "lucide-react";

type Row = { label: string; to: string; hint?: string; icon: LucideIcon };

function addRow(rows: Row[], user: ReturnType<typeof useAuth>["user"], row: Row) {
  if (isMobilePrimaryDestination(user, row.to)) return;
  if (rows.some((r) => r.to === row.to)) return;
  rows.push(row);
}

export function More() {
  const { user } = useAuth();
  const role = resolveMobileRole(user);
  useSetPageTitle(mobileRoleLabel(role), "More");

  const work: Row[] = [];
  addRow(work, user, { label: "Dispatch", to: "/dispatch", icon: Truck });
  addRow(work, user, { label: "Sales & orders", to: "/sales", icon: Trophy });
  addRow(work, user, { label: "Inventory", to: "/inventory", icon: Boxes });
  addRow(work, user, { label: "Procurement", to: "/procurement", icon: ShoppingCart });
  addRow(work, user, { label: "Customers", to: "/customers", icon: UserRound });
  addRow(work, user, { label: "Vendors", to: "/vendors", icon: Factory });

  const admin: Row[] = [];
  addRow(admin, user, { label: "Reports & analytics", to: "/reports", icon: BarChart3 });
  addRow(admin, user, { label: "Approvals", to: "/approvals", icon: ShieldCheck });
  addRow(admin, user, { label: "Audit log", to: "/audit", icon: ScrollText });
  if (canModule(user, "settings")) {
    admin.push({ label: "Company settings", to: "/settings?tab=company", icon: Settings });
  }

  const finance: Row[] = [];
  if (canModule(user, "finance")) {
    for (const f of MORE_FINANCE_LINKS) {
      addRow(finance, user, { label: f.label, to: f.to, icon: Wallet });
    }
  }

  const workFiltered = work.filter((r) => {
    if (!canModule(user, "dispatch") && r.to === "/dispatch") return false;
    if (!canModule(user, "sales") && r.to === "/sales") return false;
    if (!canModule(user, "inventory") && r.to === "/inventory") return false;
    if (!canModule(user, "procurement") && r.to === "/procurement") return false;
    if (!canModule(user, "customers") && r.to === "/customers") return false;
    if (!canModule(user, "vendors") && r.to === "/vendors") return false;
    return true;
  });

  const adminFiltered = admin.filter((r) => {
    if (r.to === "/reports" && !canModule(user, "reports")) return false;
    if (r.to === "/approvals" && !canModule(user, "approvals")) return false;
    if (r.to === "/audit" && !canModule(user, "audit")) return false;
    return true;
  });

  return (
    <div className="mobile-more space-y-4 pb-4">
      <p className="px-2 text-center text-[11px] font-semibold text-slate-500">
        {mobileRoleLabel(role)} · everything else lives here
      </p>

      <section className="card mobile-more-section">
        <h2 className="mobile-more-heading">Account</h2>
        <MoreLink icon={UserRound} label="Profile & security" to="/settings?tab=profile" hint="Photo, MFA, sync" />
        <MoreLink icon={UserRound} label="HR self-service" to="/hr" hint="Leave & advances" />
      </section>

      {finance.length > 0 && role !== "finance" && (
        <section className="card mobile-more-section">
          <h2 className="mobile-more-heading">
            <Wallet size={16} className="inline text-gold" /> Finance
          </h2>
          {finance.map((f) => (
            <MoreLink key={f.to} icon={Wallet} label={f.label} to={f.to} />
          ))}
        </section>
      )}

      {role === "finance" && finance.length > 0 && (
        <section className="card mobile-more-section">
          <h2 className="mobile-more-heading">
            <Wallet size={16} className="inline text-gold" /> More finance
          </h2>
          {finance.map((f) => (
            <MoreLink key={f.to} icon={Wallet} label={f.label} to={f.to} />
          ))}
        </section>
      )}

      {workFiltered.length > 0 && (
        <section className="card mobile-more-section">
          <h2 className="mobile-more-heading">Operations</h2>
          {workFiltered.map((r) => (
            <MoreLink key={r.to} icon={r.icon} label={r.label} to={r.to} />
          ))}
        </section>
      )}

      {adminFiltered.length > 0 && (
        <section className="card mobile-more-section">
          <h2 className="mobile-more-heading">Administration</h2>
          {adminFiltered.map((r) => (
            <MoreLink key={r.to} icon={r.icon} label={r.label} to={r.to} />
          ))}
        </section>
      )}
    </div>
  );
}

function MoreLink({
  icon: Icon,
  label,
  to,
  hint,
}: {
  icon: typeof UserRound;
  label: string;
  to: string;
  hint?: string;
}) {
  return (
    <Link to={to} className="mobile-more-link">
      <span className="mobile-more-link-icon">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        {hint ? <span className="block truncate text-xs text-slate-400">{hint}</span> : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-slate-300" />
    </Link>
  );
}
