import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Stat, StatGrid } from "../components/ui";
import { api, money } from "../lib/api";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";

type Dash = {
  tiles: Record<string, number>;
  trend: { date: string; revenue: number }[];
  recent: { id: string; number: string; status: string; channel: string; customer: { name: string } }[];
};

const TONE: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-700",
  CONFIRMED: "bg-sky-100 text-sky-800",
  PICKING: "bg-amber-100 text-amber-800",
  PICKED: "bg-amber-100 text-amber-900",
  DISPATCHED: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  PAID: "bg-emerald-100 text-emerald-900",
};

export function Dashboard() {
  const { user } = useAuth();
  const sales = user?.role === "SALES";
  const books = canModule(user, "finance") ? "/finance" : canModule(user, "sales") ? "/sales" : "/";
  const salesHome = canModule(user, "sales") ? "/sales" : canModule(user, "dispatch") ? "/dispatch" : "/";
  const dispatchTo = canModule(user, "dispatch") ? "/dispatch" : salesHome;
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dash>("/api/dashboard"),
    refetchInterval: 30000,
  });
  const t = data?.tiles;
  const cards = [
    ["Today's sales", money(t?.revenue), salesHome],
    ["Collected today", money(t?.paidToday), salesHome],
    ["Successful orders", t?.ordersToday ?? "—", salesHome],
    ["All time queue", t?.dispatchQueue ?? "—", dispatchTo],
  ] as const;

  return (
    <div className="space-y-5">
      <StatGrid>
        {cards.map(([label, value, href]) => (
          <Link key={label} to={href} className="block">
            <Stat label={label} value={value} />
          </Link>
        ))}
      </StatGrid>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canModule(user, "approvals") && <Link to="/approvals"><Stat label="Pending approvals" value={t?.pendingApprovals ?? "—"} /></Link>}
        <Link to={books}><Stat label="Profit today" value={money(t?.profit)} /></Link>
        {canModule(user, "inventory") && <Link to="/inventory"><Stat label="Low stock" value={t?.lowStock ?? "—"} /></Link>}
        {canModule(user, "procurement") && (
          <Link to="/procurement"><Stat label="Open purchase orders" value={t?.inboundPOs ?? "—"} /></Link>
        )}
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
          <h2 className="mb-3 font-semibold">{sales ? "Your latest orders" : "Latest orders"}</h2>
          <div className="space-y-3 text-sm">
            {data?.recent.map((o) => (
              <Link key={o.id} to={canModule(user, "sales") ? `/sales/${o.id}` : "/dispatch"} className="block rounded-lg border border-stone-100 p-3 hover:bg-stone-50 dark:border-white/10 dark:hover:bg-white/5">
                <div className="flex justify-between font-medium">
                  <span>{o.number}</span>
                  <span className={`badge ${TONE[o.status] || "bg-stone-100"}`}>{o.status}</span>
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
