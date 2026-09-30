import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const COLS = [
  ["CONFIRMED", "To pick"],
  ["PICKING", "Picking"],
  ["PICKED", "Ready"],
  ["DISPATCHED", "On courier / out"],
];

export function Dispatch() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["orders"], queryFn: () => api<any[]>("/api/orders") });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Warehouse</p>
        <h1 className="font-serif text-4xl">Dispatch board</h1>
        <p className="text-stone-500">Pick from the bin, pack, then courier or shop collect.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {COLS.map(([status, title], i) => {
          const items = data.filter((o) => o.status === status);
          const next = COLS[i + 1]?.[0];
          return (
            <div key={status} className="rounded-xl bg-stone-100 p-3">
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>{title}</span>
                <span className="text-stone-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((o) => (
                  <div key={o.id} className="card space-y-2 p-3">
                    <Link to={`/orders/${o.id}`} className="font-semibold underline">{o.number}</Link>
                    <div className="text-xs text-stone-500">{o.customer.name} · {o.dispatchMethod.replace("_", " ")}</div>
                    {next && (
                      <button className="btn w-full text-xs" onClick={() => move.mutate({ id: o.id, status: next })}>
                        Move to {COLS[i + 1][1]}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
