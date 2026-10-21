import { Link } from "react-router-dom";

export type RoadmapItem = {
  title: string;
  blurb: string;
  status: "live" | "partial" | "planned";
  to?: string;
};

export function EnterpriseRoadmap({ items }: { items: RoadmapItem[]; intro?: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="card space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm">{item.title}</span>
              <span
                className={`badge text-[10px] ${
                  item.status === "live"
                    ? "bg-emerald-100 text-emerald-800"
                    : item.status === "partial"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.status === "live" ? "Live" : item.status === "partial" ? "Partial" : "Planned"}
              </span>
            </div>
            {item.to && (
              <Link className="text-xs font-medium underline" to={item.to}>
                Open →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
