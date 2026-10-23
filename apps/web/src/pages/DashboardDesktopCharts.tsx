import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { DonutChart } from "../components/DonutChart";
import { ChartBox } from "../components/ChartBox";
import { money } from "../lib/api";

type Props = {
  yearTrend: { month: string; thisYear: number; lastYear: number }[];
  dayTrend: { date: string; revenue: number; expenses: number }[];
  salesMix: { name: string; value: number }[];
  tasks: { id: string; label: string; to: string; done?: boolean }[];
};

export default function DashboardDesktopCharts({ yearTrend, dayTrend, salesMix, tasks }: Props) {
  return (
    <>
      <section className="suite-panel">
        <header className="suite-panel-h">
          <div>
            <h2>Revenue trend</h2>
          </div>
          <span className="suite-chip">YTD</span>
        </header>
        <ChartBox className="h-56 px-2 pb-3" minHeight={224}>
          {(w, h) =>
            yearTrend.some((r) => r.thisYear || r.lastYear) ? (
              <LineChart width={w} height={h} data={yearTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="thisYear" name="This year" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lastYear" name="Last year" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            ) : (
              <p className="grid h-full place-items-center text-sm text-slate-400">No sales this year yet.</p>
            )
          }
        </ChartBox>
      </section>

      <div className="grid gap-3 lg:grid-cols-12">
        <section className="suite-panel lg:col-span-5">
          <header className="suite-panel-h">
            <div>
              <h2>Sales mix by category</h2>
            </div>
            <span className="suite-chip">Live</span>
          </header>
          <div className="donut-panel px-2 pb-3">
            <DonutChart
              data={salesMix}
              showLegend
              colors={["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444"]}
              empty="No sales this month."
            />
          </div>
        </section>

        <section className="suite-panel lg:col-span-7">
          <header className="suite-panel-h">
            <div>
              <h2>Cash flow trend</h2>
            </div>
            <span className="suite-chip">14 days</span>
          </header>
          <ChartBox className="h-52 px-2 pb-3" minHeight={208}>
            {(w, h) =>
              dayTrend.some((d) => d.revenue || d.expenses) ? (
                <LineChart width={w} height={h} data={dayTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <p className="grid h-full place-items-center text-sm text-slate-400">No trend data yet.</p>
              )
            }
          </ChartBox>
        </section>
      </div>

      {tasks.length > 0 && (
        <section className="suite-panel">
          <header className="suite-panel-h">
            <h2>Tasks &amp; alerts</h2>
          </header>
          <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link className={`dash-task-link ${task.done ? "dash-task-done" : ""}`} to={task.to}>
                  {task.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
