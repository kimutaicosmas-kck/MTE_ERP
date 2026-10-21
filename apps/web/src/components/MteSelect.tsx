import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type MteSelectOption = { value: string; label: string; hint?: string };

export function mapSelectOptions<T>(
  items: T[],
  value: (item: T) => string,
  label: (item: T) => string,
  hint?: (item: T) => string | undefined,
): MteSelectOption[] {
  return items.map((item) => ({
    value: value(item),
    label: label(item),
    hint: hint?.(item),
  }));
}

export function MteSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  required,
  disabled,
  className = "",
  name,
  id: idProp,
  "aria-label": ariaLabel,
  searchable,
  allowEmpty = !required,
}: {
  value: string;
  onChange: (value: string) => void;
  options: MteSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
  "aria-label"?: string;
  searchable?: boolean;
  /** When true, list includes a row to clear selection (default: !required). */
  allowEmpty?: boolean;
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const canSearch = searchable ?? options.length > 7;
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    if (!canSearch || !q.trim()) return options;
    const needle = q.trim().toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || o.hint?.toLowerCase().includes(needle),
    );
  }, [options, q, canSearch]);

  useEffect(() => {
    if (!open || !mobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mobile]);

  useEffect(() => {
    if (!open || mobile) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, mobile]);

  function close() {
    setOpen(false);
    setQ("");
  }

  function pick(v: string) {
    onChange(v);
    close();
  }

  const panelTitle = ariaLabel || placeholder;

  const list = (
    <>
      {canSearch && (
        <div className="mte-select-search">
          <Search size={16} aria-hidden />
          <input
            autoFocus={mobile}
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Search ${panelTitle}`}
          />
        </div>
      )}
      <ul className="mte-select-list" role="listbox" aria-label={panelTitle}>
        {allowEmpty && (
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={`mte-select-opt ${!value ? "is-on" : ""}`}
              onClick={() => pick("")}
            >
              <span className="truncate text-slate-500">{placeholder}</span>
              {!value ? <Check size={16} className="shrink-0 text-gold" /> : null}
            </button>
          </li>
        )}
        {filtered.map((o) => (
          <li key={o.value || "__empty"}>
            <button
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`mte-select-opt ${o.value === value ? "is-on" : ""}`}
              onClick={() => pick(o.value)}
            >
              <span className="min-w-0 text-left">
                <span className="block truncate font-medium">{o.label}</span>
                {o.hint ? <span className="block truncate text-xs text-slate-400">{o.hint}</span> : null}
              </span>
              {o.value === value ? <Check size={16} className="shrink-0 text-gold" /> : null}
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">No matches</li>}
      </ul>
    </>
  );

  return (
    <div className={`mte-select ${className}`} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      {required && !name ? (
        <input
          tabIndex={-1}
          className="mte-select-validator"
          value={value}
          required
          readOnly
          aria-hidden
          onChange={() => {}}
        />
      ) : null}
      <button
        type="button"
        id={id}
        className="mte-select-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className={`min-w-0 truncate text-left ${selected ? "" : "text-slate-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 opacity-60 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && mobile && (
        <>
          <button type="button" className="mte-select-backdrop" aria-label="Close" onClick={close} />
          <div className="mte-select-sheet" role="dialog" aria-modal="true" aria-label={panelTitle}>
            <div className="mte-select-sheet-head">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{panelTitle}</span>
              <button type="button" className="rounded-lg p-1 text-slate-500" onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {list}
          </div>
        </>
      )}
      {open && !mobile && <div className="mte-select-popover">{list}</div>}
    </div>
  );
}
