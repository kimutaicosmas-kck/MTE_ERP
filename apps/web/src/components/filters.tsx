import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { MteSelect } from "./MteSelect";

export type FilterOption = { value: string; label: string };
export type FilterField =
  | { kind: "select"; label: string; value: string; onChange: (v: string) => void; options: FilterOption[] }
  | { kind: "chips"; label: string; value: string; onChange: (v: string) => void; options: FilterOption[] }
  | { kind: "date"; label: string; value: string; onChange: (v: string) => void };

export function prettyLabel(value: string) {
  if (!value) return "All";
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldActive(field: FilterField) {
  if (field.kind === "date") return false;
  const v = field.value;
  return Boolean(v) && v !== "all" && v !== "ALL";
}

export function FiltersButton({
  active,
  onClick,
}: {
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="filters-btn" onClick={onClick} aria-label="Filters">
      <SlidersHorizontal size={16} />
      <span className="tool-label">Filters</span>
      {active ? <span className="filters-dot" /> : null}
    </button>
  );
}

export function MobileFilters({
  title,
  fields,
  onClear,
}: {
  title: string;
  fields: FilterField[];
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = fields.some(fieldActive);

  return (
    <>
      <div className="mobile-filters-row">
        <FiltersButton active={active} onClick={() => setOpen(true)} />
      </div>
      {open ? <FilterSheet title={title} fields={fields} onClear={onClear} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FilterSheet({
  title,
  fields,
  onClear,
  onClose,
}: {
  title: string;
  fields: FilterField[];
  onClear?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="filter-sheet-backdrop" onClick={onClose}>
      <div className="filter-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="filter-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="filter-sheet-close" aria-label="Close filters" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {fields.map((field) => (
          <div key={field.label} className="filter-field">
            <label>{field.label}</label>
            {field.kind === "select" ? (
              <MteSelect
                aria-label={field.label}
                value={field.value}
                onChange={field.onChange}
                options={field.options.map((opt) => ({ value: opt.value, label: opt.label }))}
                placeholder={`All ${field.label.toLowerCase()}`}
                allowEmpty
                searchable={field.options.length > 7}
              />
            ) : field.kind === "date" ? (
              <input type="date" value={field.value} onChange={(e) => field.onChange(e.target.value)} />
            ) : (
              <div className="filter-status">
                {field.options.map((opt) => (
                  <button
                    key={`${field.label}-${opt.value}`}
                    type="button"
                    className={field.value === opt.value ? "on" : ""}
                    onClick={() => field.onChange(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {onClear ? (
          <button
            type="button"
            className="btn-ghost mt-1 w-full"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
