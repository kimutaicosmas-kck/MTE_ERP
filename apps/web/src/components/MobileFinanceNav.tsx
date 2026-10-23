import { Link, useLocation } from "react-router-dom";
import { financeNavHref } from "../pages/finance/FinanceSidebar";

const MOBILE_FINANCE = [
  { label: "Invoices", to: financeNavHref("invoices") },
  { label: "Collect", to: financeNavHref("ar") },
  { label: "Payable", to: financeNavHref("ap") },
  { label: "More", to: "/more" },
] as const;

export function MobileFinanceNav() {
  const { pathname, search } = useLocation();
  return (
    <nav className="mobile-module-chips mobile-shell-only" aria-label="Finance">
      {MOBILE_FINANCE.map((c) => {
        const url = new URL(c.to, window.location.origin);
        const isActive =
          c.label === "More"
            ? pathname === "/more"
            : pathname === "/finance" &&
              (search === url.search ||
                (c.label === "Invoices" && (!search || search === "?section=overview" || search.startsWith("?section=overview&"))));
        return (
          <Link key={c.to} to={c.to} className={isActive ? "mobile-chip-on" : ""}>
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}
