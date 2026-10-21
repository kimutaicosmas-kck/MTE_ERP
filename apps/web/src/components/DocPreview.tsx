import { X } from "lucide-react";
import type { ReactNode } from "react";
import { DocPaper } from "./DocPaper";
import type { DocModel } from "../lib/doc-style";

export function DocPreview({
  doc,
  onClose,
  actions,
}: {
  doc: DocModel;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="doc-overlay" role="dialog" aria-modal="true" aria-label={doc.kind === "quotation" ? "Quotation" : "Sales order"}>
      <div className="doc-overlay-bar">
        <button type="button" className="btn-ghost" onClick={onClose}>
          <X size={16} /> Close
        </button>
        <p className="min-w-0 truncate text-sm font-semibold">{doc.number}</p>
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
      <div className="doc-overlay-body">
        <DocPaper doc={doc} />
      </div>
    </div>
  );
}
