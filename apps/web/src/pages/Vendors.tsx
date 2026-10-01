import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ImportButton } from "../components/ImportButton";
import { EmptyRow, ExportButtons, Modal, PageHeader, Pager, RowPdf, Stat, StatGrid, Tabs, useCreateOpen } from "../components/ui";
import { api } from "../lib/api";
import { usePager } from "../lib/pager";

export function Vendors() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => api<any[]>("/api/vendors") });
  const [open, setOpen] = useCreateOpen();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "oem" | "after">("all");
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/vendors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setOpen(false);
    },
  });

  const rows = useMemo(() => {
    return data.filter((v) => {
      if (tab === "oem" && !v.oem) return false;
      if (tab === "after" && v.oem) return false;
      return `${v.name} ${v.phone || ""}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [data, q, tab]);
  const pager = usePager(rows, `${tab}|${q}`);

  const oem = data.filter((v) => v.oem).length;
  const avgLead = data.length ? Math.round(data.reduce((s, v) => s + (v.leadDays || 0), 0) / data.length) : 0;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Sourcing" title="Vendors" />
      <StatGrid>
        <Stat label="Vendors" value={data.length} />
        <Stat label="OEM suppliers" value={oem} />
        <Stat label="Aftermarket" value={data.length - oem} />
        <Stat label="Avg lead days" value={avgLead} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "All vendors" },
          { id: "oem", label: "OEM" },
          { id: "after", label: "Aftermarket" },
        ]}
      />
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search vendors…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
        <ImportButton kind="vendors" />
        <ExportButtons
          title="Vendors"
          filename="vendors.csv"
          headers={["Name", "Phone", "Lead days", "Type"]}
          rows={rows.map((v) => [v.name, v.phone || "", String(v.leadDays), v.oem ? "OEM" : "Aftermarket"])}
        />
        <Link to="/procurement/new" className="btn-gold">New purchase order</Link>
        <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New vendor</button>
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Name</th><th>Phone</th><th>Lead days</th><th>Type</th><th>PDF</th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={5} label="No vendors match." />}
            {pager.slice.map((v) => (
              <tr key={v.id}>
                <td className="font-medium">{v.name}</td>
                <td>{v.phone || "—"}</td>
                <td>{v.leadDays}</td>
                <td>{v.oem ? <span className="badge bg-gold/20 text-ink">OEM</span> : <span className="badge bg-stone-100">Aftermarket</span>}</td>
                <td>
                  <RowPdf
                    title={`Vendor ${v.name}`}
                    fields={[
                      ["Name", v.name],
                      ["Phone", v.phone || "—"],
                      ["Lead days", String(v.leadDays)],
                      ["Type", v.oem ? "OEM" : "Aftermarket"],
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save.mutate({
                name: fd.get("name"),
                phone: fd.get("phone"),
                leadDays: Number(fd.get("leadDays") || 7),
                oem: fd.get("oem") === "on",
              });
            }}
          >
            <h2 className="font-serif text-2xl">New vendor</h2>
            <input name="name" placeholder="Name" required />
            <input name="phone" placeholder="Phone" />
            <input name="leadDays" type="number" placeholder="Lead days" defaultValue={7} />
            <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal">
              <input name="oem" type="checkbox" className="w-auto" /> OEM supplier
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-gold">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
