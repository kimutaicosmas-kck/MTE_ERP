import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type Row = {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId: string;
  user: string;
  reason?: string | null;
};

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB");
}

export function ActivityTimeline({
  entity,
  entityId,
  limit = 12,
  title = "Activity timeline",
}: {
  entity?: string;
  entityId?: string;
  limit?: number;
  title?: string;
}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (entity) q.set("entity", entity);
  if (entityId) q.set("entityId", entityId);
  const { data = [], isLoading } = useQuery({
    queryKey: ["activity", entity, entityId, limit],
    queryFn: () => api<Row[]>(`/api/activity?${q}`),
  });

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Link className="text-xs text-stone-500 underline" to="/audit">Audit center</Link>
      </div>
      {isLoading && <p className="text-sm text-stone-500">Loading…</p>}
      {!isLoading && data.length === 0 && <p className="text-sm text-stone-500">No activity recorded yet.</p>}
      <ul className="space-y-2">
        {data.map((a) => (
          <li key={a.id} className="border-t border-stone-100 pt-2 text-sm first:border-0 first:pt-0">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{a.user}</span>
              <span className="text-xs text-stone-400 shrink-0">{ago(a.at)}</span>
            </div>
            <div className="text-stone-600">
              {a.action.replace(/_/g, " ")} · {a.entity}
              {a.reason ? <span className="text-stone-400"> — {a.reason}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
