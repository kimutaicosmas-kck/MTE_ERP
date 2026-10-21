import { Link } from "react-router-dom";

export type ModuleNavItem = {
  id: string;
  label: string;
  to?: string;
  hint?: string;
};

export function ModuleNav({
  items,
  value,
  onChange,
  basePath,
}: {
  items: ModuleNavItem[];
  value: string;
  onChange: (id: string) => void;
  basePath?: string;
}) {
  return (
    <nav className="module-nav" aria-label="Module sections">
      {items.map((item) => {
        const active = value === item.id;
        if (item.to) {
          return (
            <Link key={item.id} to={item.to} className={`module-nav-item ${active ? "module-nav-on" : ""}`}>
              {item.label}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={`module-nav-item ${active ? "module-nav-on" : ""}`}
            onClick={() => onChange(item.id)}
            title={item.hint}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
