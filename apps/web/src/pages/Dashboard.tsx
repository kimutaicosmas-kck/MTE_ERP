import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Package,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DonutChart } from "../components/DonutChart";
import { PageBusy, Stat, StatGrid } from "../components/ui";
import { api, money } from "../lib/api";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import { useState } from "react";

type Dash = {
  tiles: Record<string, number>;
  yearTrend: { month: string; thisYear: number; lastYear: number }[];
  trend: { date: string; revenue: number; expenses: number }[];
  expenses: { name: string; value: number }[];
  salesMix: { name: string; value: number }[];
  invoices: { id: string; number: string; customer: string; issuedAt: string; dueAt?: string | null; total: number; status: string }[];
  inventory: { id: string; sku: string; name: string; category: string; qtyOnHand: number; available: number; reorderLevel: number; status: string }[];
  alerts?: { id: string; level: "info" | "warn" | "danger"; label: string; to: string }[];
  tasks?: { id: string; label: string; to: string; done?: boolean }[];
};

const PAGE = 5;

function pct(now?: number, prev?: number) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return (((now || 0) - prev) / Math.abs(prev)) * 100;
}

function dateShort(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Pager({ page, pages, total, setPage }: { page: number; pages: number; total: number; setPage: (n: number) => void }) {
  if (total <= PAGE) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400 dark:border-white/10">
      <span>Showing {(page - 1) * PAGE + 1} to {Math.min(page * PAGE, total)} of {total} entries</span>
      <div className="flex gap-1">
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`h-6 min-w-6 rounded ${n === page ? "bg-ink text-white" : "text-slate-500 hover:bg-slate-100"}`}
            onClick={() => setPage(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const finance = canModule(user, "finance") ? "/finance" : canModule(user, "sales") ? "/sales" : "/";
  const sales = canModule(user, "sales") ? "/sales" : finance;
  const stock = canModule(user, "inventory") ? "/inventory" : "/";
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dash>("/api/dashboard"),
    refetchInterval: 30000,
  });
  const [invPage, setInvPage] = useState(1);
  const [stkPage, setStkPage] = useState(1);
  const t = data?.tiles;
  const invoices = data?.invoices || [];
  const stockRows = data?.inventory || [];
  const invPages = Math.max(1, Math.ceil(invoices.length / PAGE));
  const stkPages = Math.max(1, Math.ceil(stockRows.length / PAGE));
  const month = new Date().getMonth() + 1;
  const revSeries = (data?.yearTrend || []).slice(0, month).map((m) => m.thisYear);
  const dayTrend = data?.trend || [];
  const expSeries = data?.expenses?.length
    ? data.expenses.map((e) => e.value)
    : dayTrend.map((d) => d.expenses);
  const profitSeries = dayTrend.map((d) => d.revenue - d.expenses);
  const openInv = invoices.filter((i) => i.status !== "PAID").map((i) => i.total).slice(0, 8);
  const products = t?.products || 0;
  const low = t?.lowStock || 0;
  const alerts = data?.alerts || [];
  const overdueAlert = alerts.find((a) => a.id === "overdue");
  const stockAlert = alerts.find((a) => a.id === "crit" || a.id === "low");
  const arHint = overdueAlert?.label || `${openInv.length} open invoices`;
  const invHint = stockAlert?.label || (low ? `${low} items low` : "Stock healthy");
  const invTo = stockAlert?.to || (stock === "/" ? "/" : `${stock}?tab=${low ? "low" : "all"}`);
  const arTo = overdueAlert?.to || (finance === "/" ? "/" : `${finance}?section=ar`);
  const tasks = data?.tasks || [];

  if (isLoading && !data) return <PageBusy label="Loading dashboard…" />;

  return (
    <div className="suite-dash">
      <StatGrid cols={6} variant="dash">
        <Stat icon={TrendingUp} label="Total revenue" value={money(t?.monthRevenue)} delta={pct(t?.monthRevenue, t?.lastMonthRevenue)} series={revSeries} chart="area" to={sales === "/" ? "/" : `${sales}?when=month`} />
        <Stat icon={TrendingDown} label="Total expenses" value={money(t?.monthExpenses)} delta={pct(t?.monthExpenses, t?.lastMonthExpenses)} series={expSeries} chart="bars" to={finance === "/" ? "/" : `${finance}?section=ap`} />
        <Stat icon={Banknote} label="Net profit" value={money((t?.monthRevenue || 0) - (t?.monthExpenses || 0))} delta={pct((t?.monthRevenue || 0) - (t?.monthExpenses || 0), (t?.lastMonthRevenue || 0) - (t?.lastMonthExpenses || 0))} series={profitSeries} chart="spark" to={finance === "/" ? "/" : `${finance}?section=reports`} />
        <Stat
          icon={Package}
          label="Inventory value"
          value={money(t?.inventoryValue)}
          hint={invHint}
          chart="meter"
          share={products ? (products - low) / products : 1}
          to={invTo}
        />
        <Stat icon={Receipt} label="Accounts receivable" value={money(t?.receivables)} series={openInv} chart="bars" hint={arHint} to={arTo} />
        <Stat
          icon={Wallet}
          label="Accounts payable"
          value={money(t?.payables)}
          chart="meter"
          share={(t?.payables || 0) + (t?.receivables || 0) ? (t?.payables || 0) / ((t?.payables || 0) + (t?.receivables || 0)) : 0}
          hint="Of open books"
          to={finance === "/" ? "/" : `${finance}?section=ap&apView=aging`}
        />
      </StatGrid>

      <section className="suite-panel">
          <header className="suite-panel-h">
            <div>
              <h2>Revenue overview</h2>
            </div>
            <span className="suite-chip">YTD</span>
          </header>
          <div className="h-56 px-2 pb-3">
            {(data?.yearTrend || []).some((r) => r.thisYear || r.lastYear) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.yearTrend || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="thisYear" name="This year" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="lastYear" name="Last year" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-sm text-slate-400">No sales this year yet.</p>
            )}
          </div>
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
              data={data?.salesMix || []}
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
          <div className="h-52 px-2 pb-3">
            {dayTrend.some((d) => d.revenue || d.expenses) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-sm text-slate-400">No trend data yet.</p>
            )}
          </div>
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

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="suite-panel suite-panel-table overflow-hidden">
          <header className="suite-panel-h">
            <div>
              <h2>Sales invoices</h2>
            </div>
            {canModule(user, "finance") && <Link to="/finance" className="suite-panel-link">View all</Link>}
          </header>
          <div className="overflow-x-auto">
            <table className="suite-table">
              <thead>
                <tr>
                  <th>Invoice #</th><th>Customer</th><th>Invoice date</th><th>Due date</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400">No invoices yet.</td></tr>}
                {invoices.slice((invPage - 1) * PAGE, invPage * PAGE).map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-medium">{inv.number}</td>
                    <td>{inv.customer}</td>
                    <td>{dateShort(inv.issuedAt)}</td>
                    <td>{dateShort(inv.dueAt)}</td>
                    <td>{money(inv.total)}</td>
                    <td><StatusPill status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={invPage} pages={invPages} total={invoices.length} setPage={setInvPage} />
        </section>

        <section className="suite-panel suite-panel-table overflow-hidden">
          <header className="suite-panel-h">
            <div>
              <h2>Inventory overview</h2>
            </div>
            {canModule(user, "inventory") && <Link to="/inventory?section=products" className="suite-panel-link">View all</Link>}
          </header>
          <div className="overflow-x-auto">
            <table className="suite-table">
              <thead>
                <tr>
                  <th>Item code</th><th>Item name</th><th>Category</th><th>On hand</th><th>Available</th><th>Low at</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No products yet.</td></tr>}
                {stockRows.slice((stkPage - 1) * PAGE, stkPage * PAGE).map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.sku}</td>
                    <td>{p.name}</td>
                    <td>{p.category}</td>
                    <td>{p.qtyOnHand}</td>
                    <td>{p.available}</td>
                    <td>{p.reorderLevel}</td>
                    <td><StockPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={stkPage} pages={stkPages} total={stockRows.length} setPage={setStkPage} />
        </section>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700",
    UNPAID: "bg-amber-50 text-amber-700",
    PENDING: "bg-amber-50 text-amber-700",
    OVERDUE: "bg-rose-50 text-rose-600",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${map[status] || "bg-slate-100 text-slate-600"}`}>{status === "UNPAID" ? "Pending" : status === "PAID" ? "Paid" : status}</span>;
}

function StockPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    IN: ["bg-emerald-50 text-emerald-700", "In stock"],
    LOW: ["bg-amber-50 text-amber-700", "Low stock"],
    OUT: ["bg-rose-50 text-rose-600", "Out of stock"],
  };
  const [cls, label] = map[status] || ["bg-slate-100 text-slate-600", status];
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}
