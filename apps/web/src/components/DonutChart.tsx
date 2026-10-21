import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { money } from "../lib/api";

export const DONUT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4", "#ef4444", "#64748b", "#eab308"];

type Slice = { name: string; value: number };

function DonutTip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: Slice; fill: string }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="donut-tip">
      <span style={{ color: row.fill }}>{row.name} : {money(row.value)}</span>
    </div>
  );
}

function DonutLegend({ items }: { items: { name: string; color: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="donut-legend">
      {items.map((entry) => (
        <li key={entry.name} title={entry.name}>
          <span className="donut-legend-swatch" style={{ background: entry.color }} />
          <span className="donut-legend-label">{entry.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function DonutChart({
  data,
  colors = DONUT_COLORS,
  showLegend = false,
  empty = "No data yet.",
}: {
  data: Slice[];
  colors?: string[];
  showLegend?: boolean;
  empty?: string;
}) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) {
    return <p className="grid h-full min-h-[14rem] place-items-center text-sm text-slate-400">{empty}</p>;
  }

  const legendItems = rows.map((row, i) => ({
    name: row.name,
    color: colors[i % colors.length],
  }));

  return (
    <div className={`donut-chart ${showLegend ? "has-legend" : ""}`}>
      <div className="donut-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="56%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {rows.map((row, i) => (
                <Cell key={row.name} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<DonutTip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {showLegend && <DonutLegend items={legendItems} />}
    </div>
  );
}
