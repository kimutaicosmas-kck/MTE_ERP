import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EmptyRow, ExportButtons, PageHeader, Pager, RowPdf, Stat, StatGrid, Tabs } from "../components/ui";
import { api, money } from "../lib/api";
import { usePager } from "../lib/pager";

export function Reports() {
  const [tab, setTab] = useState<"ageing" | "fastest" | "bestSellers" | "dead" | "reorder" | "customers" | "team">("ageing");
  const [q, setQ] = useState("");
  const inv = useQuery({ queryKey: ["inv-report"], queryFn: () => api<any>("/api/reports/inventory") });
  const customers = useQuery({ queryKey: ["cust-report"], queryFn: () => api<any[]>("/api/reports/customers") });
  const team = useQuery({ queryKey: ["sales-report"], queryFn: () => api<any[]>("/api/reports/sales") });
  const raw = tab === "customers" ? customers.data || [] : tab === "team" ? team.data || [] : inv.data?.[tab] || [];
  const rows = useMemo(() => {
    return raw.filter((r: any) => `${r.sku || ""} ${r.name || ""}`.toLowerCase().includes(q.toLowerCase()));
  }, [raw, q]);
  const pager = usePager(rows, `${tab}|${q}`);

  const stats = {
    ageing: inv.data?.ageing?.length || 0,
    dead: inv.data?.dead?.length || 0,
    reorder: inv.data?.reorder?.length || 0,
    customers: customers.data?.length || 0,
  };

  const headers =
    tab === "customers"
      ? ["Customer", "Orders", "Revenue", "Paid", "Outstanding"]
      : tab === "team"
        ? ["Sales person", "Orders", "Revenue", "Target", "Attainment", "Commission"]
        : ["Product name", "Part number", "On hand", "Sold", "Revenue", "Idle"];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Intelligence" title="Reports" />
      <StatGrid>
        <Stat label="SKUs tracked" value={stats.ageing} />
        <Stat label="Dead stock" value={stats.dead} />
        <Stat label="Reorder list" value={stats.reorder} />
        <Stat label="Customers" value={stats.customers} />
      </StatGrid>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "ageing", label: "Ageing" },
          { id: "fastest", label: "Fastest" },
          { id: "bestSellers", label: "Best sellers" },
          { id: "dead", label: "Dead stock" },
          { id: "reorder", label: "Reorder" },
          { id: "customers", label: "Customers" },
          { id: "team", label: "Sales team" },
        ]}
      />
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
        <ExportButtons
          title="Reports"
          filename={`report-${tab}.csv`}
          headers={headers}
          rows={rows.map((r: any) =>
            tab === "customers"
              ? [r.name, String(r.orders), String(r.revenue), String(r.paid), String(r.outstanding)]
              : tab === "team"
                ? [r.name, String(r.orders), String(r.revenue), String(r.target), `${Math.round((r.attainment || 0) * 100)}%`, String(r.commission)]
                : [r.name, r.sku, String(r.qtyOnHand), String(r.sold), String(r.revenue), `${r.daysIdle}d`]
          )}
        />
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              {tab === "customers" ? (
                <><th>Customer</th><th>Orders</th><th>Revenue</th><th>Paid</th><th>Outstanding</th><th>PDF</th></>
              ) : tab === "team" ? (
                <><th>Sales person</th><th>Orders</th><th>Revenue</th><th>Target</th><th>Attainment</th><th>Commission</th><th>PDF</th></>
              ) : (
                <><th>Product name</th><th>Part number</th><th>On hand</th><th>Sold</th><th>Revenue</th><th>Idle</th><th>PDF</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={tab === "customers" ? 6 : tab === "team" ? 7 : 7} label="No rows match." />}
            {tab === "customers"
              ? pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.name}<div className="text-xs text-stone-500">{r.phone}</div></td>
                    <td>{r.orders}</td>
                    <td>{money(r.revenue)}</td>
                    <td>{money(r.paid)}</td>
                    <td>{money(r.outstanding)}</td>
                    <td>
                      <RowPdf
                        title={`Customer ${r.name}`}
                        fields={[
                          ["Customer", r.name],
                          ["Orders", String(r.orders)],
                          ["Revenue", money(r.revenue)],
                          ["Paid", money(r.paid)],
                          ["Outstanding", money(r.outstanding)],
                        ]}
                      />
                    </td>
                  </tr>
                ))
              : tab === "team"
              ? pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}<div className="text-xs text-stone-500">{r.role.replace("_", " ")}</div></td>
                    <td>{r.orders}</td>
                    <td>{money(r.revenue)}</td>
                    <td>{money(r.target)}</td>
                    <td>{Math.round((r.attainment || 0) * 100)}%</td>
                    <td>{money(r.commission)}</td>
                    <td>
                      <RowPdf
                        title={`Sales ${r.name}`}
                        fields={[
                          ["Sales person", r.name],
                          ["Orders", String(r.orders)],
                          ["Revenue", money(r.revenue)],
                          ["Target", money(r.target)],
                          ["Attainment", `${Math.round((r.attainment || 0) * 100)}%`],
                          ["Commission", money(r.commission)],
                        ]}
                      />
                    </td>
                  </tr>
                ))
              : pager.slice.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name} {r.critical && <span className="badge bg-red-50 text-red-700">Critical</span>}</td>
                    <td>{r.sku}</td>
                    <td className={r.low ? "text-red-700 font-semibold" : ""}>{r.qtyOnHand}</td>
                    <td>{r.sold}</td>
                    <td>{money(r.revenue)}</td>
                    <td>{r.daysIdle}d</td>
                    <td>
                      <RowPdf
                        title={`Product ${r.name}`}
                        fields={[
                          ["Product name", r.name],
                          ["Part number", r.sku],
                          ["Bin", r.binLocation],
                          ["Qty", String(r.qtyOnHand)],
                          ["Sold", String(r.sold)],
                          ["Revenue", money(r.revenue)],
                          ["Idle", `${r.daysIdle}d`],
                        ]}
                      />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}
