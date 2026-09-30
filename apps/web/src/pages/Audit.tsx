import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Audit() {
  const { data = [] } = useQuery({ queryKey: ["audit"], queryFn: () => api<any[]>("/api/reports/audit") });
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Append-only</p>
        <h1 className="font-serif text-4xl">Audit log</h1>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs">{new Date(a.createdAt).toLocaleString()}</td>
                <td>{a.user?.name}<div className="text-xs text-stone-500">{a.user?.role}</div></td>
                <td>{a.action}</td>
                <td>{a.entity}</td>
                <td className="max-w-xs truncate">{a.reason || a.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
