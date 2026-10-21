import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Factory, Phone, Plus, Search, Store, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ImportButton } from "../components/ImportButton";
import { MobileFilters } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { EmptyRow, ExportButtons, Modal, PageHeader, Pager, RowPdf, Stat, StatGrid, Tabs, useCreateOpen, useQueryState } from "../components/ui";
import { api } from "../lib/api";
import { usePager } from "../lib/pager";

export function Vendors() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => api<any[]>("/api/vendors") });
  const [open, setOpen] = useCreateOpen();
  const [q, setQ] = useState("");
  const [tabRaw, setTabRaw] = useQueryState("tab", "all");
  const tab = (["all", "oem", "after"].includes(tabRaw) ? tabRaw : "all") as "all" | "oem" | "after";
  const setTab = (next: typeof tab) => setTabRaw(next);
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
  const listing = useListSort(rows, [
    { id: "name", label: "Name A–Z", get: (v) => v.name, dir: "asc" },
    { id: "lead", label: "Lead days", get: (v) => v.leadDays || 0, dir: "asc" },
  ], "name");
  const pager = usePager(listing.sorted, `${tab}|${q}|${listing.sort}`);

  const oem = data.filter((v) => v.oem).length;
  const avgLead = data.length ? Math.round(data.reduce((s, v) => s + (v.leadDays || 0), 0) / data.length) : 0;
  const withPhone = data.filter((v) => v.phone).length;
  const minLead = data.length ? Math.min(...data.map((v) => v.leadDays || 0)) : 0;

  const filtersActive = Boolean(q) || tab !== "all";

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Sourcing" title="Vendors" />
      <StatGrid cols={6}>
        <Stat icon={Store} label="Vendors" value={data.length} series={data.slice(0, 10).map((v) => v.leadDays || 0)} chart="bars" to="/vendors?tab=all" />
        <Stat icon={Factory} label="OEM suppliers" value={oem} chart="ring" max={data.length || 1} to="/vendors?tab=oem" />
        <Stat icon={Truck} label="Aftermarket" value={data.length - oem} chart="ring" max={data.length || 1} to="/vendors?tab=after" />
        <Stat icon={Clock} label="Avg lead days" value={avgLead} series={data.map((v) => v.leadDays || 0).slice(0, 12)} chart="spark" hint="Across suppliers" to="/vendors?tab=all" />
        <Stat icon={Phone} label="With contact" value={withPhone} chart="ring" max={data.length || 1} to="/vendors?tab=all" />
        <Stat icon={Clock} label="Fastest lead" value={minLead} chart="meter" share={avgLead ? minLead / Math.max(avgLead, 1) : 0} hint="Minimum lead days" to="/vendors?tab=all" />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "All vendors", count: data.length },
          { id: "oem", label: "OEM", count: oem },
          { id: "after", label: "Aftermarket", count: data.length - oem },
        ]}
      />
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input className="min-w-0 flex-1" placeholder="Search vendors…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <MobileFilters
            title="Filter vendors"
            onClear={() => { setQ(""); setTab("all"); }}
            fields={[
              {
                kind: "chips",
                label: "Type",
                value: tab,
                onChange: (v) => setTab(v as typeof tab),
                options: [
                  { value: "all", label: "All" },
                  { value: "oem", label: "OEM" },
                  { value: "after", label: "Aftermarket" },
                ],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={tab} onChange={(e) => setTab(e.target.value as typeof tab)} aria-label="Vendor type">
                  <option value="all">All vendors</option>
                  <option value="oem">OEM</option>
                  <option value="after">Aftermarket</option>
                </select>
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={() => { setQ(""); setTab("all"); }}>
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
              <ImportButton kind="vendors" />
              <ExportButtons
                title="Vendors"
                filename="vendors.csv"
                headers={["Name", "Phone", "Lead days", "Type"]}
                rows={rows.map((v) => [v.name, v.phone || "", String(v.leadDays), v.oem ? "OEM" : "Aftermarket"])}
              />
              <Link to="/procurement/new" className="btn-ghost module-btn-sm">New PO</Link>
              <button type="button" className="btn-gold module-btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> New vendor</button>
            </div>
          </div>
        </div>
      <Register
        rows={listing.sorted}
        pager={pager}
        getId={(v) => v.id}
        empty={{ title: "No vendors yet — Create one", actionLabel: "Create one", onAction: () => setOpen(true) }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (v) => v.name,
          subtitle: (v) => v.phone || "—",
          status: (v) => v.oem ? <span className="badge bg-amber-100 text-amber-800">OEM</span> : <span className="badge bg-slate-100 text-slate-600">Aftermarket</span>,
          fields: [
            { label: "Lead days", value: (v) => v.leadDays, align: "right" },
            { label: "Type", value: (v) => v.oem ? "OEM" : "Aftermarket" },
          ],
          details: (v) => [
            { label: "Phone", value: v.phone || "—" },
            { label: "Lead days", value: v.leadDays, align: "right" },
            { label: "Type", value: v.oem ? "OEM" : "Aftermarket" },
          ],
        }}
        action={<button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New vendor</button>}
      >
      <div className="table-wrap">
        <table className="invoice suite-table">
          <thead><tr><th>Name</th><th>Phone</th><th className="num">Lead days</th><th>Type</th><th>PDF</th></tr></thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={5} label="No vendors yet — Create one" actionLabel="Create one" onAction={() => setOpen(true)} />}
            {pager.slice.map((v) => (
              <tr key={v.id}>
                <td className="font-medium">{v.name}</td>
                <td>{v.phone || "—"}</td>
                <td className="num">{v.leadDays}</td>
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
      </Register>
      </section>
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
            <h2 className="text-xl font-semibold tracking-tight">New vendor</h2>
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
