import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, Stat, StatGrid, Tabs } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Approvals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["approvals"], queryFn: () => api<any[]>("/api/approvals") });
  const [tab, setTab] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [q, setQ] = useState("");
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      api(`/api/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const pending = data.filter((a) => a.status === "PENDING").length;
  const approved = data.filter((a) => a.status === "APPROVED").length;
  const rejected = data.filter((a) => a.status === "REJECTED").length;

  const rows = useMemo(() => {
    return data.filter((a) => {
      if (tab !== "ALL" && a.status !== tab) return false;
      return `${a.type} ${a.entity} ${a.reason} ${a.requester?.name || ""}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [data, tab, q]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Anti-theft" title="Approvals" />
      <StatGrid>
        <Stat label="Pending" value={pending} />
        <Stat label="Approved" value={approved} />
        <Stat label="Rejected" value={rejected} />
        <Stat label="All time" value={data.length} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "PENDING", label: "Pending" },
          { id: "APPROVED", label: "Approved" },
          { id: "REJECTED", label: "Rejected" },
          { id: "ALL", label: "All" },
        ]}
      />
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search approvals…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <div className="card py-10 text-center text-stone-500">No approvals match.</div>}
        {rows.map((a) => (
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
              <span className={`badge ${a.status === "PENDING" ? "bg-amber-100 text-amber-900" : a.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{a.status}</span>
            </div>
            {a.status === "PENDING" && user?.role === "SUPER_ADMIN" && (
              <div className="mt-3 flex gap-2">
                <button className="btn-success" onClick={() => decide.mutate({ id: a.id, decision: "APPROVED" })}>Approve</button>
                <button className="btn-danger" onClick={() => decide.mutate({ id: a.id, decision: "REJECTED" })}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
