import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyRow, ExportButtons, PageHeader, Pager, RowPdf, Stat, StatGrid } from "../components/ui";
import { api } from "../lib/api";
import { usePager } from "../lib/pager";

export function Audit() {
  const { data = [] } = useQuery({ queryKey: ["audit"], queryFn: () => api<any[]>("/api/reports/audit") });
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    return data.filter((a) => `${a.action} ${a.entity} ${a.user?.name || ""} ${a.reason || ""}`.toLowerCase().includes(q.toLowerCase()));
  }, [data, q]);
  const pager = usePager(rows, q);

  const users = new Set(data.map((a) => a.user?.name).filter(Boolean)).size;
  const today = data.filter((a) => new Date(a.createdAt).toDateString() === new Date().toDateString()).length;
  const actions = new Set(data.map((a) => a.action)).size;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Append-only" title="Audit" />
      <StatGrid>
        <Stat label="Today's events" value={today} />
        <Stat label="This log" value={data.length} />
        <Stat label="People" value={users} />
        <Stat label="Action types" value={actions} />
      </StatGrid>
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search audit…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
        <ExportButtons
          title="Audit"
          filename="audit.csv"
          headers={["Time", "User", "Action", "Entity", "Reason"]}
          rows={rows.map((a) => [new Date(a.createdAt).toLocaleString(), a.user?.name || "", a.action, a.entity, a.reason || a.ip || ""])}
        />
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Reason</th><th>PDF</th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} label="No events match." />}
            {pager.slice.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs">{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.user?.name}<div className="text-xs text-stone-500">{a.user?.role}</div></td>
                <td><span className="badge bg-stone-100">{a.action}</span></td>
                <td>{a.entity}</td>
                <td className="max-w-xs truncate">{a.reason || a.ip}</td>
                <td>
                  <RowPdf
                    title={`Audit ${a.action}`}
                    fields={[
                      ["Time", new Date(a.createdAt).toLocaleString()],
                      ["User", a.user?.name || "—"],
                      ["Action", a.action],
                      ["Entity", a.entity],
                      ["Reason", a.reason || a.ip || "—"],
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}
