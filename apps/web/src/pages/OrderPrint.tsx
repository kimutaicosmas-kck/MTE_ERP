import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, money } from "../lib/api";

const titles: Record<string, string> = {
  order: "Sales order",
  quote: "Quotation",
  sale: "Tax invoice",
  invoice: "Tax invoice",
  picking: "Picking list",
  delivery: "Delivery note",
};

export function OrderPrint() {
  const { id, kind = "invoice" } = useParams();
  const { data: o } = useQuery({ queryKey: ["order", id], queryFn: () => api<any>(`/api/orders/${id}`) });
  if (!o) return <p className="p-8">Loading…</p>;
  const title = titles[kind] || kind;
  const packed = kind === "picking" || kind === "delivery";

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-3xl px-10 py-10 print:max-w-none print:px-0 print:py-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-bold">MTE ERP</div>
            <div className="text-sm text-neutral-600">Earth-moving parts</div>
            <div className="text-sm text-neutral-600">Nairobi, Kenya</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold uppercase">{title}</div>
            <div className="text-sm font-semibold">{o.number}</div>
            <div className="text-sm text-neutral-600">{new Date(o.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <hr className="my-4 border-neutral-900" />
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="mb-1 text-xs uppercase text-neutral-500">Bill to</div>
            <div className="font-semibold">{o.customer.name}</div>
            <div className="text-neutral-600">{o.customer.phone || "—"}</div>
            <div className="text-neutral-600">{o.customer.kraPin ? `KRA PIN ${o.customer.kraPin}` : "KRA PIN —"}</div>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase text-neutral-500">Details</div>
            <div>Status: {o.status.replace(/_/g, " ")}</div>
            <div>Sales person: {o.salesperson?.name || "—"}</div>
            <div>Dispatch: {o.dispatchMethod.replace(/_/g, " ")}{o.tracking ? ` ${o.tracking}` : ""}</div>
            <div>Channel: {o.channel}</div>
          </div>
        </div>
        {o.notes && <p className="mt-3 text-sm text-neutral-600">Notes: {o.notes}</p>}
        <hr className="my-4 border-neutral-900" />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-900 text-left text-xs uppercase text-neutral-500">
              <th className="py-2 font-semibold">SKU</th>
              <th className="py-2 font-semibold">Description</th>
              {packed && <th className="py-2 font-semibold">Bin</th>}
              <th className="py-2 text-right font-semibold">Qty</th>
              {!packed && <th className="py-2 text-right font-semibold">Price</th>}
              {!packed && <th className="py-2 text-right font-semibold">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l: any) => (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="py-2 font-semibold">{l.part.sku}</td>
                <td className="py-2">{l.part.name}</td>
                {packed && <td className="py-2">{l.part.binLocation}</td>}
                <td className="py-2 text-right">{l.qty}</td>
                {!packed && <td className="py-2 text-right">{money(l.salePrice)}</td>}
                {!packed && <td className="py-2 text-right">{money(l.qty * l.salePrice)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!packed && (
          <div className="ml-auto mt-4 w-56 space-y-1 text-sm">
            <div className="flex justify-between text-neutral-600"><span>Net</span><span>{money(o.totals.net)}</span></div>
            <div className="flex justify-between text-neutral-600"><span>VAT 16%</span><span>{money(o.totals.vat)}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{money(o.totals.gross)}</span></div>
          </div>
        )}
        {kind === "delivery" && (
          <div className="mt-10 grid grid-cols-2 gap-12 text-sm">
            <Sign label="Received by" />
            <Sign label="Dispatched by" />
          </div>
        )}
        <p className="mt-16 text-center text-xs text-neutral-500">MTE ERP | {title} | {o.number}</p>
        <div className="mt-6 print:hidden">
          <button className="btn-gold" onClick={() => window.print()}>Print / save PDF</button>
        </div>
      </div>
    </div>
  );
}

function Sign({ label }: { label: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="mt-10 border-b border-neutral-900" />
      <div className="mt-1 text-xs text-neutral-500">Name / signature</div>
      <div className="mt-8 border-b border-neutral-900" />
      <div className="mt-1 text-xs text-neutral-500">Date</div>
    </div>
  );
}
