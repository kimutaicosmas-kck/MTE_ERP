import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, money } from "../lib/api";

const titles: Record<string, string> = {
  invoice: "Tax invoice",
  quote: "Quotation",
  picking: "Picking list",
  delivery: "Delivery note",
};

export function OrderPrint() {
  const { id, kind = "invoice" } = useParams();
  const { data: o } = useQuery({ queryKey: ["order", id], queryFn: () => api<any>(`/api/orders/${id}`) });
  if (!o) return <p className="p-8">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 text-ink print:p-0">
      <div className="flex justify-between border-b border-ink pb-4">
        <div>
          <div className="font-serif text-4xl">ERP</div>
          <div className="text-xs uppercase tracking-widest text-stone-500">Earth-moving parts</div>
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl">{titles[kind] || kind}</div>
          <div className="font-semibold">{o.number}</div>
          <div className="text-sm text-stone-500">{new Date(o.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs uppercase text-stone-500">Customer</div>
          <div className="font-semibold">{o.customer.name}</div>
          <div>{o.customer.phone}</div>
          <div>{o.customer.kraPin}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-stone-500">Dispatch</div>
          <div>{o.dispatchMethod.replace("_", " ")}</div>
          <div>{o.tracking || "—"}</div>
          <div>Channel {o.channel}</div>
        </div>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left">SKU</th>
            <th className="text-left">Part</th>
            {kind === "picking" && <th className="text-left">Bin</th>}
            <th className="text-right">Qty</th>
            {kind !== "picking" && <th className="text-right">Price</th>}
            {kind !== "picking" && <th className="text-right">Line</th>}
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l: any) => (
            <tr key={l.id} className="border-b border-stone-100">
              <td className="py-2">{l.part.sku}</td>
              <td>{l.part.name}</td>
              {kind === "picking" && <td>{l.part.binLocation}</td>}
              <td className="text-right">{l.qty}</td>
              {kind !== "picking" && <td className="text-right">{money(l.salePrice)}</td>}
              {kind !== "picking" && <td className="text-right">{money(l.qty * l.salePrice)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {kind !== "picking" && (
        <div className="ml-auto mt-4 w-56 space-y-1 text-sm">
          <div className="flex justify-between"><span>Net</span><span>{money(o.totals.net)}</span></div>
          <div className="flex justify-between"><span>VAT 16%</span><span>{money(o.totals.vat)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span>{money(o.totals.gross)}</span></div>
        </div>
      )}
      <p className="mt-10 text-xs text-stone-500">Printed from MTE ERP · {o.number}</p>
      <button className="btn mt-6 print:hidden" onClick={() => window.print()}>Print / save PDF</button>
    </div>
  );
}
