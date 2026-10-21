import { Link } from "react-router-dom";
import { MODULE_REPORTS } from "../lib/module-report-links";

export function ModuleReportsPanel({
  moduleId,
  centralHref = "/reports?hub=cross",
}: {
  moduleId: keyof typeof MODULE_REPORTS;
  centralHref?: string;
}) {
  const block = MODULE_REPORTS[moduleId];
  if (!block) return null;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {block.links.map((r) => (
          <Link key={r.label} to={r.to} className="erp-link-card block">
            <div className="font-medium text-sm">{r.label}</div>
          </Link>
        ))}
      </div>
      <Link className="text-sm font-medium text-gold hover:underline" to={centralHref}>
        Cross-module reports →
      </Link>
    </div>
  );
}
