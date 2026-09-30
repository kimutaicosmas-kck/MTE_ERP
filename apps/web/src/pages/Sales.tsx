import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Sales() {
  const { user } = useAuth();
  const team = useQuery({ queryKey: ["sales"], queryFn: () => api<any[]>("/api/reports/sales") });
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api<any[]>("/api/orders") });
  const mine = (orders.data || []).filter((o) => !user || user.role !== "SALES" || o.salesperson?.name === user.name);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">This month</p>
        <h1 className="font-serif text-4xl">Sales</h1>
        <p className="text-stone-500">Targets, live leaderboard and commission from confirmed sales — Super Admin sets rates under Staff.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(team.data || []).map((r, i) => (
          <div key={r.id} className="card">
            <div className="flex justify-between">
              <div>
                <div className="text-xs text-gold">#{i + 1}</div>
                <div className="font-serif text-2xl">{r.name}</div>
                <div className="text-xs uppercase text-stone-500">{r.role.replace("_", " ")}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-stone-500">Commission owed</div>
                <div className="font-semibold">{money(r.commission)}</div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full bg-gold" style={{ width: `${Math.min(100, r.attainment * 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-sm text-stone-600">
              <span>{money(r.revenue)} of {money(r.target)}</span>
              <span>{Math.round(r.attainment * 100)}% · {r.orders} orders</span>
            </div>
          </div>
        ))}
      </div>
      <h2 className="font-serif text-2xl">Pipeline</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Status</th><th>Value</th></tr></thead>
          <tbody>
            {mine.map((o) => (
              <tr key={o.id}>
                <td><Link className="font-semibold underline" to={`/orders/${o.id}`}>{o.number}</Link></td>
                <td>{o.customer.name}</td>
                <td>{o.channel}</td>
                <td><span className="badge bg-stone-100">{o.status}</span></td>
                <td>{money(o.totals.gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
