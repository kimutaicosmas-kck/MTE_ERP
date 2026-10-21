import { ArrowUpDown, Check, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { MOBILE_BP, PWA_LAYOUT_BP, useIsMobile } from "../lib/mobile";
import { Pager } from "./ui";

export type RegisterPager<T> = {
  slice: T[];
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  setPage: (page: number) => void;
  infinite?: boolean;
  hasMore?: boolean;
  loadMore?: () => void;
};

export type SortOption<T> = { id: string; label: string; get: (row: T) => string | number; dir?: "asc" | "desc" };
export type MobileField<T> = { label: string; value: (row: T) => ReactNode; align?: "left" | "right" };
export type DetailField = { label: string; value: ReactNode; align?: "left" | "right" };
export type BulkAction<T> = { label: string; onClick: (rows: T[]) => void; danger?: boolean };

export function useListSort<T>(rows: T[], options: SortOption<T>[], defaultId?: string) {
  const [id, setId] = useState(defaultId || options[0]?.id || "");
  const opt = options.find((o) => o.id === id) || options[0];
  const sorted = useMemo(() => {
    if (!opt) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = opt.get(a);
      const bv = opt.get(b);
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return (opt.dir || "desc") === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, id, opt]);
  return {
    sorted,
    sort: id,
    setSort: setId,
    options: options.map((o) => ({ id: o.id, label: o.label })),
  };
}

export function EmptyState({
  title,
  actionLabel,
  onAction,
  to,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
}) {
  return (
    <div className="empty-state">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/10">
        <Plus size={20} />
      </div>
      <div className="empty-state-title">{title}</div>
      <p className="empty-state-copy">Switch filters or add a record to get started.</p>
      {to && actionLabel ? (
        <Link to={to} className="btn-gold mt-4"><Plus size={16} /> {actionLabel}</Link>
      ) : actionLabel && onAction ? (
        <button type="button" className="btn-gold mt-4" onClick={onAction}><Plus size={16} /> {actionLabel}</button>
      ) : null}
    </div>
  );
}

export function FilterChips<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="filter-chips" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={`filter-chip ${value === item.id ? "filter-chip-on" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}{item.count != null ? ` (${item.count})` : ""}
        </button>
      ))}
    </div>
  );
}

export function SortSheet({
  value,
  options,
  onChange,
  onClose,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="mb-3 text-sm font-semibold">Sort by</div>
        <div className="space-y-1">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`sheet-option ${value === opt.id ? "sheet-option-on" : ""}`}
              onClick={() => { onChange(opt.id); onClose(); }}
            >
              <span>{opt.label}</span>
              {value === opt.id && <Check size={16} />}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost mt-4 w-full" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function DetailSheet({
  title,
  fields,
  actions,
  onClose,
}: {
  title: ReactNode;
  fields: DetailField[];
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 text-base font-semibold">{title}</div>
          <button type="button" className="rounded-full p-2 text-slate-400" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <dl className="detail-list">
          {fields.map((f) => (
            <div key={f.label} className="detail-row">
              <dt>{f.label}</dt>
              <dd className={f.align === "right" ? "text-right" : "text-left"}>{f.value}</dd>
            </div>
          ))}
        </dl>
        {actions ? <div className="thumb-sheet-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

function InfiniteSentinel({ onVisible, disabled }: { onVisible: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onVisible();
    }, { rootMargin: "160px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible, disabled]);
  return <div ref={ref} className="h-8" />;
}

export function Register<T>({
  rows,
  getId,
  onOpen,
  empty,
  sort,
  bulk,
  mobile,
  action,
  forceTable,
  pager,
  children,
}: {
  rows: T[];
  getId: (row: T) => string;
  onOpen?: (row: T) => void;
  empty?: { title: string; actionLabel?: string; onAction?: () => void; to?: string };
  sort?: { value: string; onChange: (id: string) => void; options: { id: string; label: string }[] };
  bulk?: BulkAction<T>[];
  forceTable?: boolean;
  pager?: RegisterPager<T>;
  mobile: {
    title: (row: T) => ReactNode;
    subtitle?: (row: T) => ReactNode;
    status?: (row: T) => ReactNode;
    fields: MobileField<T>[];
    details?: (row: T) => DetailField[];
    actions?: (row: T) => ReactNode;
  };
  action?: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useIsMobile(MOBILE_BP);
  const pwa = useIsMobile(PWA_LAYOUT_BP);
  const [sortOpen, setSortOpen] = useState(false);
  const [visible, setVisible] = useState(12);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<T | null>(null);
  const timer = useRef<number>(0);

  const loadMore = useCallback(() => setVisible((v) => v + 12), []);
  useEffect(() => { setVisible(12); setSelecting(false); setPicked([]); }, [rows, pager?.page]);

  const mobileRows = pager ? pager.slice : (isMobile ? rows.slice(0, visible) : rows);
  const selectedRows = rows.filter((r) => picked.includes(getId(r)));

  function toggle(id: string) {
    setPicked((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  function startSelect(id: string) {
    setSelecting(true);
    setPicked((cur) => cur.includes(id) ? cur : [...cur, id]);
  }

  function openRow(row: T) {
    if (onOpen) onOpen(row);
    else if (mobile.details) setDetail(row);
  }

  function onPointerDown(row: T) {
    const id = getId(row);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => startSelect(id), 420);
  }

  function onPointerUp(row: T, e: { preventDefault: () => void }) {
    window.clearTimeout(timer.current);
    if (selecting) {
      e.preventDefault();
      toggle(getId(row));
      return;
    }
    openRow(row);
  }

  if (rows.length === 0) {
    return (
      <div className="register-root">
        <EmptyState
          title={empty?.title || "Nothing here yet"}
          actionLabel={empty?.actionLabel}
          onAction={empty?.onAction}
          to={empty?.to}
        />
        {action && !pwa ? <div className="thumb-actions">{action}</div> : null}
      </div>
    );
  }

  if (forceTable) {
    return (
      <div className="register-table">
        {children}
        {pager ? <Pager {...pager} /> : null}
        {action && !pwa ? <div className="thumb-actions">{action}</div> : null}
      </div>
    );
  }

  return (
    <>
      {sort && (
        <div className="register-tools">
          <button type="button" className="sort-trigger" onClick={() => setSortOpen(true)} aria-label="Sort">
            <ArrowUpDown size={16} />
            <span className="tool-label">Sort</span>
          </button>
        </div>
      )}
      <div className="register-root">
      <div className="register-desktop">
        {children}
        {pager ? <Pager {...pager} /> : null}
      </div>
      <div className="register-mobile">
        {mobileRows.map((row) => {
          const id = getId(row);
          const on = picked.includes(id);
          return (
            <article
              key={id}
              className={`m-card ${on ? "m-card-on" : ""}`}
              onPointerDown={() => onPointerDown(row)}
              onPointerUp={(e) => onPointerUp(row, e)}
              onPointerCancel={() => window.clearTimeout(timer.current)}
              onContextMenu={(e) => { e.preventDefault(); startSelect(id); }}
            >
              <div className="m-card-top">
                <div className="min-w-0">
                  <div className="m-card-title">{mobile.title(row)}</div>
                  {mobile.subtitle ? <div className="m-card-sub">{mobile.subtitle(row)}</div> : null}
                </div>
                <div className="m-card-status">
                  {selecting ? (
                    <span className={`m-check ${on ? "m-check-on" : ""}`}>{on ? <Check size={12} /> : null}</span>
                  ) : mobile.status?.(row)}
                </div>
              </div>
              <div className="m-card-grid">
                {mobile.fields.slice(0, 4).map((f) => (
                  <div key={f.label} className={`m-field ${f.align === "right" ? "m-field-num" : ""}`}>
                    <span>{f.label}</span>
                    <strong>{f.value(row)}</strong>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        {pager ? (
          <Pager {...pager} />
        ) : (
          <>
            <InfiniteSentinel disabled={visible >= rows.length} onVisible={loadMore} />
            {visible >= rows.length && rows.length > 12 && (
              <div className="list-end">End of list · {rows.length}</div>
            )}
          </>
        )}
      </div>
      </div>
      {sortOpen && sort && (
        <SortSheet value={sort.value} options={sort.options} onChange={sort.onChange} onClose={() => setSortOpen(false)} />
      )}
      {detail && (
        <DetailSheet
          title={mobile.title(detail)}
          fields={mobile.details?.(detail) || []}
          actions={mobile.actions?.(detail)}
          onClose={() => setDetail(null)}
        />
      )}
      {selecting && (
        <div className="select-bar">
          <span className="text-sm font-semibold">{picked.length} selected</span>
          <div className="flex flex-wrap gap-2">
            {bulk?.map((b) => (
              <button
                key={b.label}
                type="button"
                className={b.danger ? "btn-danger text-xs" : "btn-gold text-xs"}
                disabled={!picked.length}
                onClick={() => b.onClick(selectedRows)}
              >
                {b.label}
              </button>
            ))}
            {picked.length === 1 && (
              <button type="button" className="btn-ghost text-xs" onClick={() => openRow(selectedRows[0])}>Open</button>
            )}
            <button type="button" className="btn-ghost text-xs" onClick={() => { setSelecting(false); setPicked([]); }}>
              Clear
            </button>
          </div>
        </div>
      )}
      {action && !pwa ? <div className="thumb-actions">{action}</div> : null}
    </>
  );
}
