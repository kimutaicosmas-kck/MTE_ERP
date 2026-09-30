import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, money } from "../lib/api";

export function Reports() {
  const [tab, setTab] = useState<"ageing" | "fastest" | "bestSellers" | "dead" | "reorder" | "customers">("ageing");
  const inv = useQuery({ queryKey: ["inv-report"], queryFn: () => api<any>("/api/reports/inventory") });
  const customers = useQuery({ queryKey: ["cust-report"], queryFn: () => api<any[]>("/api/reports/customers") });
  const rows =
    tab === "customers" ? customers.data || [] : inv.data?.[tab] || [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Intelligence</p>
        <h1 className="font-serif text-4xl">Reports</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["ageing", "Ageing"],
          ["fastest", "Fastest moving"],
          ["bestSellers", "Best sellers"],
          ["dead", "Dead stock"],
          ["reorder", "Reorder"],
          ["customers", "Customers"],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? "btn" : "btn-ghost"} onClick={() => setTab(k as any)}>{l}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {tab === "customers" ? (
                <><th>Customer</th><th>Orders</th><th>Revenue</th><th>Paid</th><th>Outstanding</th></>
              ) : (
                <><th>SKU</th><th>Part</th><th>Bin</th><th>Qty</th><th>Sold</th><th>Revenue</th><th>Idle</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {tab === "customers"
              ? rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.name}<div className="text-xs text-stone-500">{r.phone}</div></td>
                    <td>{r.orders}</td>
                    <td>{money(r.revenue)}</td>
                    <td>{money(r.paid)}</td>
                    <td>{money(r.outstanding)}</td>
                  </tr>
                ))
              : rows.map((r: any) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.sku}</td>
                    <td>{r.name} {r.critical && <span className="badge bg-red-100 text-red-800">Critical</span>}</td>
                    <td>{r.binLocation}</td>
                    <td className={r.low ? "text-red-700 font-semibold" : ""}>{r.qtyOnHand}</td>
                    <td>{r.sold}</td>
                    <td>{money(r.revenue)}</td>
                    <td>{r.daysIdle}d</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
