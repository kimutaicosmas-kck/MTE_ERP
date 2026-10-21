import { FileDown, FileSpreadsheet, type LucideIcon } from "lucide-react";
export { MteSelect, mapSelectOptions, type MteSelectOption } from "./MteSelect";
import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { downloadPdf } from "../lib/api";
import { downloadCsv, printRecord, printTable } from "../lib/export";
import { useSetPageTitle } from "../lib/page-title";

export function useCreateOpen() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setOpen(true);
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }, [params, setParams]);
  return [open, setOpen] as const;
}

export function useQueryState(key: string, fallback = "") {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  function setValue(next: string) {
    const copy = new URLSearchParams(params);
    if (!next || next === fallback) copy.delete(key);
    else copy.set(key, next);
    setParams(copy, { replace: true });
  }
  return [value, setValue] as const;
}

export function Modal({
  children,
  onClose,
  wide,
  className = "",
}: {
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  className?: string;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`card modal-panel ${wide ? "max-w-3xl" : "max-w-lg"} ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  backTo,
  action,
}: {
  eyebrow: string;
  title: string;
  backTo?: string;
  action?: ReactNode;
}) {
  useSetPageTitle(eyebrow, title, backTo);
  /* Title lives in Layout navbar only — no duplicate in-page hero. */
  void action;
  return null;
}

export type KpiChart = "area" | "spark" | "bars" | "ring" | "meter";

/** One distinct accent per KPI on module pages (index order). */
export const KPI_MODULE_ACCENTS = ["brand", "ok", "violet", "warn", "cyan", "hot"] as const;
export type KpiAccent = (typeof KPI_MODULE_ACCENTS)[number];

type KpiTone = { name: string; stroke: string; fill: string };

function kpiAccentStyle(accent: KpiAccent): KpiTone {
  const map: Record<KpiAccent, { stroke: string; fill: string }> = {
    ok: { stroke: "#22c55e", fill: "rgba(34,197,94,0.22)" },
    warn: { stroke: "#f59e1a", fill: "rgba(245,158,26,0.22)" },
    hot: { stroke: "#ef4444", fill: "rgba(239,68,68,0.22)" },
    brand: { stroke: "#3b82f6", fill: "rgba(59,130,246,0.18)" },
    violet: { stroke: "#8b5cf6", fill: "rgba(139,92,246,0.2)" },
    cyan: { stroke: "#06b6d4", fill: "rgba(6,182,212,0.22)" },
  };
  return { name: accent, ...map[accent] };
}

export function seriesByDay<T>(
  items: T[],
  getDate: (item: T) => string | Date,
  getVal: (item: T) => number = () => 1,
  days = 12,
): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (const item of items) {
    const d = new Date(getDate(item));
    d.setHours(0, 0, 0, 0);
    const i = Math.round((d.getTime() - start.getTime()) / 86400000);
    if (i >= 0 && i < days) buckets[i] += getVal(item);
  }
  return buckets;
}

export function seriesByMonth<T>(
  items: T[],
  getDate: (item: T) => string | Date,
  getVal: (item: T) => number = () => 1,
  months = 8,
): number[] {
  const buckets = Array.from({ length: months }, () => 0);
  const now = new Date();
  for (const item of items) {
    const d = new Date(getDate(item));
    const i = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const slot = months - 1 - i;
    if (slot >= 0 && slot < months) buckets[slot] += getVal(item);
  }
  return buckets;
}

function kpiTone(label: string, hint?: string) {
  const l = `${label} ${hint || ""}`.toLowerCase();
  if (/reject|inactive|absent|expense|cancel|problem|failed|out of/.test(l)) {
    return { name: "hot" as const, stroke: "#ef4444", fill: "rgba(239,68,68,0.22)" };
  }
  if (/pending|unpaid|outstanding|reorder|low|dead|late|overdue|payable|await|pick|short|critical/.test(l)) {
    return { name: "warn" as const, stroke: "#f59e1a", fill: "rgba(245,158,26,0.22)" };
  }
  if (/quote|dispatch|ship|ready|way|received|issued|movement|reserved|available|month|today|completed|deliver/.test(l)) {
    return { name: "violet" as const, stroke: "#8b5cf6", fill: "rgba(139,92,246,0.2)" };
  }
  if (/inventor|stock|revenue|sale|profit|success|paid|approv|present|active|income|value/.test(l)) {
    return { name: "ok" as const, stroke: "#22c55e", fill: "rgba(34,197,94,0.22)" };
  }
  return { name: "brand" as const, stroke: "#3b82f6", fill: "rgba(59,130,246,0.18)" };
}

function pickChart(label: string, series?: number[], max?: number, share?: number, chart?: KpiChart): KpiChart | null {
  if (chart) return chart;
  const l = label.toLowerCase();
  if (max != null && max > 0 && /unpaid|paid|pending|approved|present|late|absent|active|inactive|low|dead|success|received|credit|owing|oem|aftermarket/.test(l)) return "ring";
  if (series && series.length >= 3) {
    if (/expense|payable|reorder|dead|event|attendance|request/.test(l)) return "bars";
    if (/revenue|sales|profit|income|outstanding|value|today|month/.test(l)) return "area";
    return "spark";
  }
  if (share != null || (max != null && max > 0)) return "meter";
  if (series && series.length) return "bars";
  return null;
}

function Sparkline({ data, color, fill, area }: { data: number[]; color: string; fill: string; area?: boolean }) {
  const w = 112;
  const h = 40;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - 3 - ((v - min) / span) * (h - 8);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="kpi-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      {area ? <path d={`${line} L${w},${h} L0,${h} Z`} fill={fill} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last ? <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} /> : null}
    </svg>
  );
}

function BarStrip({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="kpi-cols" aria-hidden>
      {data.map((v, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(10, (v / max) * 100)}%`,
            background: i === data.length - 1 ? color : `${color}66`,
          }}
        />
      ))}
    </div>
  );
}

function RingMark({ value, max, color }: { value: number; max: number; color: string }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <svg className="kpi-ring" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="kpi-ring-track" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
}

function splitMoney(value: string | number) {
  const text = String(value).trim();
  const match = text.match(/^(Ksh|KES|KSh|\$|€)\s*(.+)$/i);
  if (!match) return { cur: null as string | null, amt: text };
  return { cur: match[1].toUpperCase() === "KES" ? "Ksh" : match[1], amt: match[2] };
}

function formatKsh(amount: number) {
  return `Ksh ${Math.round(amount).toLocaleString("en-KE")}`;
}

export function Stat({
  label, value, amount, delta, hint, to, series, max, share, chart, icon: Icon, accent,
}: {
  label: string;
  value?: string | number;
  amount?: number;
  delta?: number | null;
  hint?: string;
  icon?: LucideIcon;
  accent?: KpiAccent;
  to?: string;
  series?: number[];
  max?: number;
  share?: number;
  chart?: KpiChart;
}) {
  const tone = accent ? kpiAccentStyle(accent) : kpiTone(label, hint);
  const kind = pickChart(label, series, max, share, chart);
  const numeric = amount != null
    ? amount
    : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  const money = splitMoney(amount != null ? formatKsh(amount) : (value ?? ""));
  const foot = hint || (delta != null && Number.isFinite(delta) ? "vs last month" : "");
  const warn = /low|dead|overdue|unpaid|pending|late|reject|absent/.test(`${label} ${hint || ""}`.toLowerCase())
    || (delta != null && delta < 0);
  const meterFill = share != null
    ? Math.min(100, Math.max(6, share * 100))
    : max && max > 0 && Number.isFinite(numeric)
      ? Math.min(100, Math.max(6, (numeric / max) * 100))
      : null;
  const viz = kind === "area" && series?.length
    ? <Sparkline data={series} color={tone.stroke} fill={tone.fill} area />
    : kind === "spark" && series?.length
      ? <Sparkline data={series} color={tone.stroke} fill={tone.fill} />
      : kind === "bars" && series?.length
        ? <BarStrip data={series} color={tone.stroke} />
        : kind === "ring" && max != null
          ? <RingMark value={Number.isFinite(numeric) ? numeric : 0} max={max} color={tone.stroke} />
          : kind === "meter" && meterFill != null
            ? (
              <div className={`kpi-bar kpi-bar-${tone.name}`} aria-hidden>
                <i style={{ width: `${meterFill}%` }} />
              </div>
            )
            : <div className="kpi-bar kpi-bar-brand" aria-hidden><i style={{ width: "0%" }} /></div>;

  const body = (
    <>
      {Icon ? (
        <span className={`kpi-icon kpi-icon-${tone.name}`} aria-hidden>
          <Icon size={16} strokeWidth={2.25} />
        </span>
      ) : null}
      <div className="kpi-label-row">
        <div className="kpi-label">{label}</div>
        {delta != null && Number.isFinite(delta) ? (
          <span className={delta >= 0 ? "kpi-delta kpi-delta-up" : "kpi-delta kpi-delta-down"}>
            {delta >= 0 ? "+" : "−"}{Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
      </div>
      <div className="kpi-value">
        {money.cur ? <span className="kpi-cur">{money.cur}</span> : null}
        <span className="kpi-amt">{money.amt}</span>
      </div>
      <div className={`kpi-slot kpi-slot-${kind || "empty"}`}>{viz}</div>
      <div className={`kpi-foot ${warn ? "kpi-foot-warn" : ""} ${foot ? "" : "kpi-foot-empty"}`}>
        <span className="kpi-dot" />
        <span className="kpi-foot-text">{foot || "\u00a0"}</span>
      </div>
    </>
  );
  const cardClass = `suite-kpi kpi-tone-${tone.name}`;
  if (to) return <Link to={to} className={cardClass}>{body}</Link>;
  return <div className={cardClass}>{body}</div>;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className={danger ? "btn-danger" : "btn-gold"} disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function PageBusy({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="suite-panel grid place-items-center py-16 text-sm text-slate-500">
      <span className="mb-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      {label}
    </div>
  );
}

export function StatGrid({
  children,
  cols,
  variant = "module",
}: {
  children: ReactNode;
  cols?: number;
  /** Dashboard keeps legacy layout and semantic KPI colors. */
  variant?: "module" | "dash";
}) {
  const items = Children.toArray(children).filter(Boolean);
  const n = cols ?? (variant === "module" ? 6 : items.length);
  const xl = Math.min(Math.max(n, 1), 6);
  const kids = variant === "module"
    ? items.map((child, i) => {
        if (!isValidElement(child) || child.type !== Stat) return child;
        if (child.props.accent) return child;
        return cloneElement(child, { accent: KPI_MODULE_ACCENTS[i % KPI_MODULE_ACCENTS.length] });
      })
    : items;
  return (
    <div className={`stat-grid ${variant === "dash" ? "stat-grid-dash" : "stat-grid-module"}`} data-cols={xl}>
      {kids}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number }[];
}) {
  useEffect(() => {
    document.querySelector<HTMLElement>(".tabs-item-on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [value]);
  return (
    <div className="tabs">
      {items.map((item) => (
        <button
          key={item.id}
          className={`tabs-item ${value === item.id ? "tabs-item-on" : "tabs-item-off"}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}{item.count != null ? ` (${item.count})` : ""}
        </button>
      ))}
    </div>
  );
}

export function ExportButtons({ title, filename, headers, rows }: { title: string; filename: string; headers: string[]; rows: string[][] }) {
  return (
    <>
      <button className="btn-ghost" onClick={() => printTable(title, headers, rows)}>
        <FileDown size={14} /> PDF
      </button>
      <button className="btn-ghost" onClick={() => downloadCsv(filename, [headers, ...rows])}>
        <FileSpreadsheet size={14} /> Excel
      </button>
    </>
  );
}

const DOCS: { kind: "order" | "sale" | "delivery"; label: string }[] = [
  { kind: "delivery", label: "Delivery note" },
  { kind: "order", label: "Order" },
  { kind: "sale", label: "Invoice" },
];

export function OrderDocs({
  orderId,
  status,
  compact,
}: {
  orderId: string;
  status?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const isQuote = status === "DRAFT";
  const canDelivery = status && !["DRAFT", "CANCELLED"].includes(status);
  const items: { kind: "order" | "delivery"; label: string }[] = isQuote
    ? [{ kind: "order", label: "Quotation" }]
    : [
        { kind: "order", label: "Sales order" },
        ...(canDelivery ? [{ kind: "delivery" as const, label: "Delivery note" }] : []),
      ];

  async function pull(kind: "order" | "delivery") {
    setBusy(kind);
    try {
      await downloadPdf(orderId, kind);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-1.5" : "flex flex-wrap items-center gap-2"}>
      {items.map((d) => (
        <button
          key={d.kind}
          type="button"
          className={compact ? "btn-ghost px-2 py-1 text-xs" : "btn-ghost"}
          disabled={busy === d.kind}
          onClick={() => pull(d.kind)}
        >
          {busy === d.kind ? "Opening…" : d.label}
        </button>
      ))}
    </div>
  );
}

export function PdfCircle({
  orderId,
  kind = "order",
  title,
}: {
  orderId: string;
  status?: string;
  kind?: "order" | "sale" | "delivery";
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  const label = title || (kind === "delivery" ? "Download delivery note" : kind === "sale" ? "Download invoice" : "Download sales order PDF");
  return (
    <button
      type="button"
      title={label}
      disabled={busy}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-ink disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
      onClick={async () => {
        setBusy(true);
        try {
          await downloadPdf(orderId, kind);
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileDown size={16} />
    </button>
  );
}

export function PdfButtons({
  orderId,
  status,
  compact,
}: {
  orderId: string;
  status?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const available = DOCS.filter((d) => {
    if (d.kind === "sale") return status !== "DRAFT";
    if (d.kind === "delivery") return status && !["DRAFT", "CANCELLED"].includes(status);
    return true;
  });

  async function pull(kind: "order" | "sale" | "delivery") {
    setErr("");
    setBusy(kind);
    try {
      await downloadPdf(orderId, kind);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-1" : "space-y-1"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {available.map((d) => {
          const label = d.kind === "order" && status === "DRAFT" ? "Quotation" : d.label;
          return (
          <button
            key={d.kind}
            type="button"
            className={`${compact ? "btn-ghost px-2 py-1 text-xs" : "btn-gold text-xs"}`}
            disabled={busy === d.kind}
            title={`Download ${label} PDF`}
            onClick={() => pull(d.kind)}
          >
            <FileDown size={14} />
            {label}
          </button>
          );
        })}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export function RowPdf({ title, fields }: { title: string; fields: [string, string][] }) {
  return (
    <button type="button" className="btn-ghost px-2 py-1 text-xs" title={`Download ${title} PDF`} onClick={() => printRecord(title, fields)}>
      <FileDown size={14} /> PDF
    </button>
  );
}

export function EmptyRow({ cols, label, actionLabel, onAction, to }: {
  cols: number;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
}) {
  return (
    <tr>
      <td colSpan={cols} className="empty-cell">
        <div className="empty-state-title">{label}</div>
        {to && actionLabel ? (
          <Link to={to} className="btn-gold mt-3 inline-flex">{actionLabel}</Link>
        ) : actionLabel && onAction ? (
          <button type="button" className="btn-gold mt-3" onClick={onAction}>{actionLabel}</button>
        ) : null}
      </td>
    </tr>
  );
}

export function Pager({
  page,
  pages,
  total,
  from,
  to,
  setPage,
  infinite,
  hasMore,
  loadMore,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  setPage: (page: number) => void;
  infinite?: boolean;
  hasMore?: boolean;
  loadMore?: () => void;
}) {
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!infinite || !hasMore || !loadMore) return;
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "160px" });
    io.observe(el);
    return () => io.disconnect();
  }, [infinite, hasMore, loadMore]);
  if (total === 0) return null;
  if (infinite) {
    return (
      <div className="pager pager-infinite">
        <span>{hasMore ? `Showing ${to} of ${total}` : `${total} in this list`}</span>
        <div ref={moreRef} />
      </div>
    );
  }
  const windowed = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const items: (number | "…")[] = [];
  windowed.forEach((n, i) => {
    if (i && n - windowed[i - 1] > 1) items.push("…");
    items.push(n);
  });
  return (
    <div className="pager">
      <span>Showing {from}–{to} of {total}</span>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        {items.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1 text-xs text-stone-400">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className={`min-w-8 rounded-full px-2 py-1 text-xs font-semibold ${n === page ? "bg-ink text-white" : "text-stone-500 hover:bg-stone-100 dark:hover:bg-white/10"}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          )
        )}
        <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
