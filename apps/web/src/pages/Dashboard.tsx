import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, money } from "../lib/api";

type Dash = {
  tiles: Record<string, number>;
  trend: { date: string; revenue: number }[];
  recent: { id: string; number: string; status: string; channel: string; customer: { name: string } }[];
};

export function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dash>("/api/dashboard"),
    refetchInterval: 30000,
  });
  const t = data?.tiles;
  const cards = [
    ["Orders today", t?.ordersToday, "/orders"],
    ["Revenue today", money(t?.revenue), "/finance"],
    ["Profit today", money(t?.profit), "/finance"],
    ["Collected today", money(t?.paidToday), "/orders"],
    ["Pending approvals", t?.pendingApprovals, "/approvals"],
    ["Dispatch queue", t?.dispatchQueue, "/orders"],
    ["Low stock", t?.lowStock, "/inventory"],
    ["Dead stock", t?.deadStock, "/inventory"],
  ] as const;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Live</p>
        <h1 className="font-serif text-4xl">Today</h1>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link key={label} to={href} className="card border-t-4 border-t-gold hover:shadow-md">
            <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
            <div className="mt-2 font-serif text-3xl">{value ?? "—"}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Revenue · 14 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trend || []}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Area type="monotone" dataKey="revenue" stroke="#c4a035" fill="#f4ead0" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Latest orders</h2>
          <div className="space-y-3 text-sm">
            {data?.recent.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="block rounded-lg border border-stone-100 p-3 hover:bg-stone-50">
                <div className="flex justify-between font-medium">
                  <span>{o.number}</span>
                  <span className="badge bg-stone-100">{o.status}</span>
                </div>
                <div className="mt-1 text-stone-500">{o.customer.name} · {o.channel}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
