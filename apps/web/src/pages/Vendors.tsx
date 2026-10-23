import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Factory, Plus, Search, Store, Truck, Wallet, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImportButton } from "../components/ImportButton";
import { MobileFilters } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { EmptyRow, ExportButtons, Modal, PageHeader, Pager, RowPdf, Stat, StatGrid, useCreateOpen, useQueryState } from "../components/ui";
import { api, money } from "../lib/api";
import { usePager } from "../lib/pager";

type Vendor = {
  id: string;
  name: string;
  phone?: string;
  leadDays: number;
  oem: boolean;
  openPOs?: number;
  apBalance?: number;
};

type VendorDash = {
  total: number;
  oem: number;
  aftermarket: number;
  avgLead: number;
  openPOs: number;
  apOpen: number;
  openBills: number;
};

export function Vendors() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["vendors-dashboard"], queryFn: () => api<VendorDash>("/api/vendors/dashboard") });
  const { data = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => api<Vendor[]>(`/api/vendors`) });
  const perf = useQuery({
    queryKey: ["vendors-performance"],
    queryFn: () => api<{ rows: { id: string; onTime: number | null; orders: number }[] }>("/api/reports/vendors"),
  });
  const perfMap = useMemo(() => {
    const m = new Map<string, { onTime: number | null; orders: number }>();
    for (const r of perf.data?.rows || []) m.set(r.id, { onTime: r.onTime, orders: r.orders });
    return m;
  }, [perf.data]);

  const [open, setOpen] = useCreateOpen();
  const [q, setQ] = useState("");
  const [tabRaw, setTabRaw] = useQueryState("tab", "all");
  const tab = (["all", "oem", "after", "owing"].includes(tabRaw) ? tabRaw : "all") as "all" | "oem" | "after" | "owing";
  const setTab = (next: typeof tab) => setTabRaw(next);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/vendors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["vendors-dashboard"] });
      setOpen(false);
    },
  });

  const rows = useMemo(() => {
    return data.filter((v) => {
      if (tab === "oem" && !v.oem) return false;
      if (tab === "after" && v.oem) return false;
      if (tab === "owing" && !(v.apBalance && v.apBalance > 0.01)) return false;
      return `${v.name} ${v.phone || ""}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [data, q, tab]);

  const listing = useListSort(rows, [
    { id: "name", label: "Name A–Z", get: (v) => v.name, dir: "asc" },
    { id: "ap", label: "Highest owed", get: (v) => v.apBalance || 0, dir: "desc" },
    { id: "lead", label: "Lead days", get: (v) => v.leadDays || 0, dir: "asc" },
  ], "name");
  const pager = usePager(listing.sorted, `${tab}|${q}|${listing.sort}`);

  const oem = data.filter((v) => v.oem).length;
  const owing = data.filter((v) => (v.apBalance || 0) > 0.01).length;
  const d = dash.data;
  const filtersActive = Boolean(q) || tab !== "all";

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Sourcing" title="Vendors" />
      <StatGrid cols={6}>
        <Stat icon={Store} label="Suppliers" value={d?.total ?? data.length} hint="Active vendors" to="/vendors?tab=all" />
        <Stat icon={Factory} label="OEM" value={oem} chart="ring" max={(d?.total ?? data.length) || 1} to="/vendors?tab=oem" />
        <Stat icon={Wrench} label="Aftermarket" value={(d?.total ?? data.length) - oem} chart="ring" max={(d?.total ?? data.length) || 1} to="/vendors?tab=after" />
        <Stat icon={Truck} label="Open POs" value={d?.openPOs ?? 0} hint="Awaiting delivery" to="/procurement" />
        <Stat icon={Wallet} label="Payable" amount={d?.apOpen ?? 0} hint={`${d?.openBills ?? 0} open bills`} to="/finance?section=ap" />
        <Stat icon={Clock} label="Avg lead time" value={d?.avgLead ?? 0} hint={`${owing} with balance`} to="/vendors?tab=owing" />
      </StatGrid>

      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input className="min-w-0 flex-1" placeholder="Search suppliers…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                  { value: "owing", label: "Owing" },
                ],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={tab} onChange={(e) => setTab(e.target.value as typeof tab)} aria-label="Supplier type">
                  <option value="all">All suppliers</option>
                  <option value="oem">OEM</option>
                  <option value="after">Aftermarket</option>
                  <option value="owing">With balance due</option>
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
                headers={["Name", "Phone", "Lead days", "Type", "Open POs", "Balance due"]}
                rows={rows.map((v) => [
                  v.name,
                  v.phone || "",
                  String(v.leadDays),
                  v.oem ? "OEM" : "Aftermarket",
                  String(v.openPOs || 0),
                  String(v.apBalance || 0),
                ])}
              />
              <Link to="/procurement/new" className="btn-ghost module-btn-sm">New PO</Link>
              <button type="button" className="btn-gold module-btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> New supplier</button>
            </div>
          </div>
        </div>

        <Register
          rows={listing.sorted}
          pager={pager}
          getId={(v) => v.id}
          onOpen={(v) => nav(`/vendors/${v.id}`)}
          empty={{ title: "No suppliers yet", actionLabel: "Add supplier", onAction: () => setOpen(true) }}
          sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
          mobile={{
            title: (v) => v.name,
            subtitle: (v) => v.phone || "No phone",
            status: (v) => vendorPill(v),
            fields: [
              { label: "Lead", value: (v) => `${v.leadDays} days` },
              { label: "Owed", value: (v) => money(v.apBalance || 0), align: "right" },
            ],
            actions: (v) => (
              <Link className="btn-gold w-full" to={`/vendors/${v.id}`}>Open supplier</Link>
            ),
          }}
          action={<button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> New</button>}
        >
          <div className="table-wrap">
            <table className="invoice suite-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Phone</th>
                  <th className="num">Lead</th>
                  <th className="num">Open POs</th>
                  <th className="num">Owed</th>
                  <th>On-time</th>
                  <th>Type</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {listing.sorted.length === 0 && (
                  <EmptyRow cols={8} label="No suppliers match." actionLabel="Add supplier" onAction={() => setOpen(true)} />
                )}
                {pager.slice.map((v) => {
                  const p = perfMap.get(v.id);
                  return (
                    <tr key={v.id} className="cursor-pointer" onClick={() => nav(`/vendors/${v.id}`)}>
                      <td><Link to={`/vendors/${v.id}`} className="font-medium text-ink" onClick={(e) => e.stopPropagation()}>{v.name}</Link></td>
                      <td>{v.phone || "—"}</td>
                      <td className="num">{v.leadDays}d</td>
                      <td className="num">{v.openPOs || 0}</td>
                      <td className={`num ${(v.apBalance || 0) > 0.01 ? "font-semibold text-amber-800" : ""}`}>{money(v.apBalance || 0)}</td>
                      <td>{p?.onTime != null ? `${p.onTime}%` : "—"}</td>
                      <td>{vendorPill(v)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <RowPdf
                          title={`Vendor ${v.name}`}
                          fields={[
                            ["Name", v.name],
                            ["Phone", v.phone || "—"],
                            ["Lead days", String(v.leadDays)],
                            ["Type", v.oem ? "OEM" : "Aftermarket"],
                            ["Balance due", money(v.apBalance || 0)],
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
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
            <h2 className="text-xl font-semibold tracking-tight">New supplier</h2>
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            <input name="name" placeholder="Company name" required />
            <input name="phone" placeholder="Phone / WhatsApp" />
            <input name="leadDays" type="number" placeholder="Lead days" defaultValue={7} min={0} />
            <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal">
              <input name="oem" type="checkbox" className="w-auto" /> OEM supplier
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-gold" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save supplier"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function vendorPill(v: Vendor) {
  return v.oem
    ? <span className="status-pill status-pill-warn"><Factory size={11} aria-hidden /> OEM</span>
    : <span className="status-pill status-pill-info">Aftermarket</span>;
}
