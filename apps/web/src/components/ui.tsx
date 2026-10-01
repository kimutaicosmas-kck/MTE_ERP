import { FileDown, FileSpreadsheet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
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
}: {
  eyebrow: string;
  title: string;
  backTo?: string;
  action?: ReactNode;
}) {
  useSetPageTitle(eyebrow, title, backTo);
  return null;
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{label}</div>
      <div className="mt-2 break-words font-serif text-xl sm:text-2xl lg:text-3xl">{value}</div>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string }[];
}) {
  return (
    <div className="tabs">
      {items.map((item) => (
        <button
          key={item.id}
          className={`tabs-item ${value === item.id ? "tabs-item-on" : "tabs-item-off"}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
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
        {available.map((d) => (
          <button
            key={d.kind}
            type="button"
            className={`${compact ? "btn-ghost px-2 py-1 text-xs" : "btn-gold text-xs"}`}
            disabled={busy === d.kind}
            title={`Download ${d.label} PDF`}
            onClick={() => pull(d.kind)}
          >
            <FileDown size={14} />
            {d.label}
          </button>
        ))}
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

export function EmptyRow({ cols, label }: { cols: number; label: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-stone-500">{label}</td>
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
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  setPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const windowed = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const items: (number | "…")[] = [];
  windowed.forEach((n, i) => {
    if (i && n - windowed[i - 1] > 1) items.push("…");
    items.push(n);
  });
  return (
    <div className="pager">
      <span className="text-xs text-stone-500">{from}–{to} of {total}</span>
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
