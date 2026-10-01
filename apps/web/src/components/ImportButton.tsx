import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Modal } from "./ui";
import { api } from "../lib/api";
import { downloadCsv } from "../lib/export";

type Kind = "customers" | "parts" | "users" | "vendors";

const HEADERS: Record<Kind, string[]> = {
  customers: ["name", "phone", "email", "kraPin", "creditLimit", "paymentTerms", "notes"],
  parts: ["sku", "oemNumber", "name", "category", "binLocation", "cost", "salePrice", "reorderLevel", "critical", "qtyOnHand"],
  users: ["name", "email", "password", "role", "phone", "monthlyTarget", "commissionRate", "salary"],
  vendors: ["name", "phone", "leadDays", "oem"],
};

const INVALIDATE: Record<Kind, string[]> = {
  customers: ["customers", "customer-balances"],
  parts: ["parts"],
  users: ["users"],
  vendors: ["vendors"],
};

type ImportResult = { created: number; updated: number; skipped: number; errors: { row: number; error: string }[] };

export function ImportButton({ kind, label }: { kind: Kind; label?: string }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const save = useMutation({
    mutationFn: (csv: string) => api<ImportResult>(`/api/import/${kind}`, { method: "POST", body: JSON.stringify({ csv }) }),
    onSuccess: (data) => {
      setResult(data);
      for (const key of INVALIDATE[kind]) qc.invalidateQueries({ queryKey: [key] });
    },
  });

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => downloadCsv(`${kind}-template.csv`, [HEADERS[kind]])}>
        Template
      </button>
      <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>
        <Upload size={14} /> {label || "Import CSV"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => save.mutate(String(reader.result || ""));
          reader.readAsText(file);
        }}
      />
      {(save.isPending || result || save.error) && (
        <Modal onClose={() => { if (!save.isPending) setResult(null); }}>
          <div className="space-y-3">
            <h3 className="font-semibold">Import {kind === "parts" ? "products" : kind}</h3>
            {save.isPending && <p className="text-sm text-stone-500">Importing…</p>}
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            {result && (
              <>
                <p className="text-sm">Created {result.created}, updated {result.updated}{result.errors.length ? `, ${result.errors.length} row warning(s)` : ""}.</p>
                {result.errors.length > 0 && (
                  <ul className="max-h-48 overflow-auto text-sm text-amber-800">
                    {result.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.error}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <div className="flex justify-end">
              <button className="btn-ghost" disabled={save.isPending} onClick={() => setResult(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
