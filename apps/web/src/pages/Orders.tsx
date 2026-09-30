import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";

type Order = {
  id: string;
  number: string;
  channel: string;
  status: string;
  dispatchMethod: string;
  customer: { name: string };
  salesperson?: { name: string };
  totals: { gross: number; paid: number; balance: number; profit: number };
};

export function Orders() {
  const { data = [] } = useQuery({ queryKey: ["orders"], queryFn: () => api<Order[]>("/api/orders") });
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Workflow</p>
          <h1 className="font-serif text-4xl">Orders</h1>
        </div>
        <Link to="/orders/new" className="btn-gold">New order</Link>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Dispatch</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id}>
                <td><Link className="font-semibold underline" to={`/orders/${o.id}`}>{o.number}</Link></td>
                <td>{o.customer.name}<div className="text-xs text-stone-500">{o.salesperson?.name}</div></td>
                <td>{o.channel}</td>
                <td><span className="badge bg-stone-100">{o.status}</span></td>
                <td>{o.dispatchMethod.replace("_", " ")}</td>
                <td>{money(o.totals.gross)}</td>
                <td>{money(o.totals.paid)}</td>
                <td className={o.totals.balance > 1 ? "text-red-700" : ""}>{money(o.totals.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
