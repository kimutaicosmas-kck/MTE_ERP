import { Link, useLocation } from "react-router-dom";

export type MobileChip = { label: string; to: string; count?: number };

function chipActive(to: string, pathname: string, search: string) {
  const url = new URL(to, window.location.origin);
  if (pathname !== url.pathname) return false;
  const want = url.searchParams;
  if (![...want.keys()].length) return true;
  const have = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of want) {
    if (have.get(k) !== v) return false;
  }
  return true;
}

export function MobileModuleChips({ chips }: { chips: MobileChip[] }) {
  const { pathname, search } = useLocation();
  if (chips.length < 2) return null;
  return (
    <nav className="mobile-module-chips mobile-shell-only" aria-label="Section">
      {chips.map((c) => {
        const isActive = chipActive(c.to, pathname, search);
        return (
          <Link key={c.to} to={c.to} className={isActive ? "mobile-chip-on" : ""}>
            {c.label}
            {c.count != null && c.count > 0 ? <span className="mobile-chip-count">{c.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
