import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { ExportButtons, PageHeader, Stat, StatGrid, useQueryState } from "../components/ui";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";

type Row = {
  id: string;
  name: string;
  role: string;
  orders: number;
  completed: number;
  revenue: number;
  paid: number;
  target: number;
  attainment: number;
  commission: number;
  avgOrder: number;
  trend: number[];
};

type Report = {
  period: string;
  label: string;
  summary: {
    revenue: number;
    paid: number;
    orders: number;
    completed: number;
    target: number;
    attainment: number;
    commission: number;
  };
  rows: Row[];
};

export function SalesPerformance() {
  const { user } = useAuth();
  const salesOnly = user?.role === "SALES";
  const [when, setWhen] = useQueryState("when", "month");
  const { data, isLoading } = useQuery({
    queryKey: ["sales-performance", when],
    queryFn: () => api<Report>(`/api/reports/sales?when=${when}`),
  });
  const myDay = useQuery({
    queryKey: ["sales-daily"],
    queryFn: () => api<any>("/api/reports/sales-daily"),
    enabled: salesOnly,
  });
  const day = myDay.data;

  const rows = data?.rows || [];
  const summary = data?.summary;
  const top = rows[0];
  const teamTrend = rows.flatMap((r) => r.trend);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Sales"
        title={salesOnly ? "My performance" : "Sales performance"}
        backTo="/sales"
      />

      {isLoading && !data ? (
        <p className="text-sm text-stone-500">Loading performance…</p>
      ) : (
        <>
          <StatGrid cols={6}>
            <Stat
              label={salesOnly ? "My revenue" : "Team revenue"}
              amount={summary?.revenue}
              series={teamTrend}
              chart="area"
              hint={data?.label}
            />
            <Stat
              label="Orders"
              value={summary?.orders || 0}
              hint={`${summary?.completed || 0} completed`}
              series={rows.map((r) => r.orders)}
              chart="bars"
            />
            <Stat
              label={salesOnly ? "My target" : "Team target"}
              amount={summary?.target}
              chart="meter"
              share={summary?.attainment}
              hint={`${Math.round((summary?.attainment || 0) * 100)}% attained`}
            />
            <Stat
              label="Markup commission"
              amount={summary?.commission}
              hint="On invoiced price uplift"
              chart="spark"
              series={rows.map((r) => r.commission)}
            />
            <Stat
              label="Collected"
              amount={summary?.paid}
              chart="area"
              hint="Cash received"
              series={rows.map((r) => r.paid || 0)}
            />
            <Stat
              label="Completed"
              value={summary?.completed || 0}
              chart="ring"
              max={summary?.orders || 1}
              hint={`${Math.round((summary?.attainment || 0) * 100)}% attainment`}
              share={summary?.orders ? (summary?.completed || 0) / summary.orders : 0}
            />
          </StatGrid>

          <div className="flex flex-wrap gap-2">
            {[
              ["month", "This month"],
              ["lastMonth", "Last month"],
              ["year", "This year"],
              ["all", "All time"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={when === id ? "btn-gold px-4 py-1.5 text-sm" : "btn-ghost px-4 py-1.5 text-sm"}
                onClick={() => setWhen(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {salesOnly && day && (day.quotesToFollow?.length > 0 || day.awaitingPayment?.length > 0 || day.deliveriesToday?.length > 0) && (
            <section className="card grid gap-4 text-sm sm:grid-cols-3">
              {day.quotesToFollow?.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Quotes to follow up</div>
                  <ul className="mt-1 space-y-1 text-stone-600">
                    {day.quotesToFollow.slice(0, 5).map((q: { id: string; number: string; customer?: { name: string } }) => (
                      <li key={q.id}><Link className="underline" to={`/sales/${q.id}`}>{q.number} · {q.customer?.name}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
              {day.awaitingPayment?.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Awaiting payment</div>
                  <ul className="mt-1 space-y-1 text-stone-600">
                    {day.awaitingPayment.slice(0, 5).map((inv: { id: string; number: string; customer: string; balance: number }) => (
                      <li key={inv.id}>{inv.number} · {inv.customer} · {money(inv.balance)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {day.deliveriesToday?.length > 0 && (
                <div>
                  <div className="font-medium">Active fulfilment</div>
                  <ul className="mt-1 space-y-1 text-stone-600">
                    {day.deliveriesToday.slice(0, 5).map((d: { id: string; number: string; customer: string }) => (
                      <li key={d.id}><Link className="underline" to={`/sales/${d.id}`}>{d.number} · {d.customer}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {!salesOnly && top && top.revenue > 0 && (
            <div className="card flex flex-wrap items-center gap-3 bg-amber-50/80">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold text-ink">
                <Trophy size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Top performer · {data?.label}</p>
                <p className="text-sm text-stone-600">
                  {top.name} — {money(top.revenue)} · {top.orders} orders · {Math.round(top.attainment * 100)}% of target
                </p>
              </div>
            </div>
          )}

          <div className="suite-panel overflow-hidden">
            <header className="suite-panel-h">
              <h2>{salesOnly ? "My results" : "Sales team"}</h2>
              <ExportButtons
                title="Sales performance"
                filename={`sales-performance-${when}.csv`}
                headers={["Salesperson", "Orders", "Completed", "Revenue", "Collected", "Target", "Attainment", "Commission", "Avg order"]}
                rows={rows.map((r) => [
                  r.name,
                  String(r.orders),
                  String(r.completed),
                  String(Math.round(r.revenue)),
                  String(Math.round(r.paid)),
                  String(Math.round(r.target)),
                  `${Math.round(r.attainment * 100)}%`,
                  String(Math.round(r.commission)),
                  String(Math.round(r.avgOrder)),
                ])}
              />
            </header>
            <div className="table-wrap">
              <table className="invoice">
                <thead>
                  <tr>
                    <th>Salesperson</th>
                    <th className="num">Orders</th>
                    <th className="num">Revenue</th>
                    <th className="num">Collected</th>
                    <th className="num">Target</th>
                    <th>Attainment</th>
                    <th className="num">Commission</th>
                    <th className="num">Avg order</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-stone-400">No sales in this period.</td>
                    </tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-stone-500">{r.role.replace(/_/g, " ")}</div>
                        {!salesOnly && i === 0 && r.revenue > 0 && (
                          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Top</span>
                        )}
                      </td>
                      <td className="num">
                        {r.orders}
                        <div className="text-xs text-stone-400">{r.completed} done</div>
                      </td>
                      <td className="num font-medium">{money(r.revenue)}</td>
                      <td className="num">{money(r.paid)}</td>
                      <td className="num">{money(r.target)}</td>
                      <td>
                        <div className="min-w-[7rem]">
                          <div className="mb-1 text-xs font-semibold">{Math.round(r.attainment * 100)}%</div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${r.attainment >= 1 ? "bg-emerald-500" : r.attainment >= 0.7 ? "bg-gold" : "bg-amber-400"}`}
                              style={{ width: `${Math.min(100, Math.max(4, r.attainment * 100))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="num">{money(r.commission)}</td>
                      <td className="num">{money(r.avgOrder)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
