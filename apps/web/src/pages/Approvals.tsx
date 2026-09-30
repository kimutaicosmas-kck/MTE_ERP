import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Approvals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["approvals"], queryFn: () => api<any[]>("/api/approvals") });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      api(`/api/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Anti-theft</p>
        <h1 className="font-serif text-4xl">Approvals</h1>
        <p className="text-stone-500">Deletes, price edits and stock adjustments wait here. Super Admin decides.</p>
      </div>
      <div className="space-y-3">
        {data.map((a) => (
          <div key={a.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{a.type.replace("_", " ")} · {a.entity}</div>
                <div className="text-sm text-stone-500">{a.requester.name} ({a.requester.role}) · {a.reason}</div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded bg-stone-50 p-2"><strong>Was</strong><pre className="whitespace-pre-wrap">{a.oldValue}</pre></div>
                  <div className="rounded bg-amber-50 p-2"><strong>Asked</strong><pre className="whitespace-pre-wrap">{a.newValue}</pre></div>
                </div>
              </div>
              <span className={`badge ${a.status === "PENDING" ? "bg-amber-100 text-amber-900" : a.status === "APPROVED" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{a.status}</span>
            </div>
            {a.status === "PENDING" && user?.role === "SUPER_ADMIN" && (
              <div className="mt-3 flex gap-2">
                <button className="btn-gold" onClick={() => decide.mutate({ id: a.id, decision: "APPROVED" })}>Approve</button>
                <button className="btn-ghost" onClick={() => decide.mutate({ id: a.id, decision: "REJECTED" })}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
