import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DocPreview } from "../components/DocPreview";
import { ShareMenu } from "../components/ShareMenu";
import { StkPrompt } from "../components/StkPrompt";
import { ConfirmDialog, OrderDocs } from "../components/ui";
import { api, money } from "../lib/api";
import { canModule } from "../lib/access";
import { useAuth } from "../lib/auth";
import type { DocModel } from "../lib/doc-style";
import { useSetPageTitle } from "../lib/page-title";
import { salesStatusLabel } from "../lib/sales-status";
import { DISPATCH_LABEL } from "../lib/dispatch-status";

export function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const back = canModule(user, "sales") ? "/sales" : "/dispatch";
  const qc = useQueryClient();
  const [stk, setStk] = useState(false);
  const [accept, setAccept] = useState(false);
  const [preview, setPreview] = useState(false);
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<any>("/api/settings") });
  const { data: o, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<any>(`/api/orders/${id}`),
  });
  const status = useMutation({
    mutationFn: (next: string) => api(`/api/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status: next }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const convert = useMutation({
    mutationFn: () => api(`/api/orders/${id}/convert`, { method: "POST" }),
    onSuccess: () => {
      setAccept(false);
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
  const isDraft = o?.status === "DRAFT";
  const salesBack = isDraft ? "/sales?tab=quotes" : "/sales";
  useSetPageTitle(canModule(user, "sales") ? "Sales" : "Dispatch", o?.number || "Order", canModule(user, "sales") ? salesBack : back);

  const company = settings.data || {};
  const doc = useMemo<DocModel | null>(() => {
    if (!o) return null;
    return {
      kind: isDraft ? "quotation" : "sales-order",
      number: o.number,
      date: new Date(o.createdAt).toLocaleDateString("en-GB"),
      customerName: o.customer?.name || "",
      customerPhone: o.customer?.phone,
      salesperson: o.salesperson?.name,
      companyName: company.legalName || company.companyName || "MTE ERP",
      companyPhone: company.phone,
      companyEmail: company.email,
      companyAddress: company.address,
      paybill: company.mpesaPaybill,
      account: company.mpesaAccount,
      status: o.status,
      intro: o.style?.intro || o.notes,
      validDays: o.style?.validDays,
      lpo: o.lpo,
      dispatchMethod: o.dispatchMethod,
      paid: o.totals?.paid,
      balance: o.totals?.balance,
      vatRate: o.vatRate ?? 0.16,
      lines: (o.lines || []).map((l: any) => ({
        sku: l.part?.sku,
        name: l.part?.name,
        qty: l.qty,
        price: l.salePrice,
      })),
    };
  }, [o, isDraft, company]);

  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!o) return <p>Loading…</p>;

  const inDispatch = ["PICKING", "PICKED", "DISPATCHED"].includes(o.status);
  const completed = o.status === "DELIVERED" || o.status === "PAID";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{o.number}</h1>
          <p className="text-stone-500">{o.customer.name}</p>
          <p className="text-sm text-stone-400">
            {String(o.dispatchMethod || "").replace(/_/g, " ").toLowerCase()}
            {o.tracking ? ` · ${o.tracking}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`badge ${
            completed ? "bg-emerald-100 text-emerald-800" :
            isDraft ? "bg-violet-100 text-violet-800" :
            inDispatch ? "bg-amber-100 text-amber-800" :
            "bg-slate-100 text-slate-700"
          }`}>
            {salesStatusLabel(o.status)}
          </span>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="btn-ghost" onClick={() => setPreview(true)}>
          <Eye size={16} /> Preview
        </button>
        <OrderDocs orderId={o.id} status={o.status} />
        <ShareMenu
          token={o.shareToken}
          kind={isDraft ? "quotation" : "sales-order"}
          number={o.number}
          customerName={o.customer?.name}
          phone={o.customer?.phone}
          email={o.customer?.email || company.email}
        />
        {isDraft && canModule(user, "sales") && (
          <>
            <button type="button" className="btn-success" onClick={() => setAccept(true)}>Confirm sales order</button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                if (confirm("Cancel this quotation?")) status.mutate("CANCELLED");
              }}
            >
              Cancel quote
            </button>
          </>
        )}
        {canModule(user, "dispatch") && !isDraft && !completed && o.status !== "CANCELLED" && (
          <Link className="btn-gold" to={`/dispatch/${o.id}`}>Open in Dispatch</Link>
        )}
        {canModule(user, "sales") && !isDraft && o.status !== "CANCELLED" && !completed && (
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (confirm("Cancel this sales order?")) status.mutate("CANCELLED");
            }}
          >
            Cancel order
          </button>
        )}
      </div>

      {(status.error || convert.error) && (
        <p className="text-sm text-amber-800">{((status.error || convert.error) as Error).message}</p>
      )}

      {!isDraft && !completed && o.status !== "CANCELLED" && (
        <div className="card flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-stone-600">
            Warehouse status: <strong>{DISPATCH_LABEL[o.status] || o.status}</strong>
          </span>
          {canModule(user, "dispatch") && (
            <Link className="text-ink underline" to={`/dispatch/${o.id}`}>Go to Dispatch</Link>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l: any) => (
              <tr key={l.id}>
                <td>
                  {l.part.sku} · {l.part.name}
                  <div className="text-xs text-stone-500">Bin {l.part.binLocation}</div>
                </td>
                <td>{l.qty}</td>
                <td>
                  {money(l.salePrice)}
                  {l.listPrice > 0 && l.salePrice > l.listPrice && (
                    <div className="text-[11px] text-emerald-700">
                      +{money(l.salePrice - l.listPrice)} above list ({money(l.listPrice)})
                    </div>
                  )}
                </td>
                <td className="num">{money(l.qty * l.salePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between text-base font-semibold"><span>Total (incl. VAT)</span><span>{money(o.totals.gross)}</span></div>
          {o.totals.vat > 0 && (
            <div className="flex justify-between text-sm text-stone-600"><span>VAT included</span><span>{money(o.totals.vat)}</span></div>
          )}
          {(o.totals.markupTotal > 0 || o.invoice?.markupTotal > 0) && (
            <>
              <div className="flex justify-between border-t pt-2 text-stone-600">
                <span>Price markup (above list)</span>
                <span>{money(o.totals.markupTotal ?? o.invoice?.markupTotal)}</span>
              </div>
              {(o.totals.markupCommission ?? o.invoice?.markupCommission) > 0 && (
                <div className="flex justify-between font-medium text-emerald-800">
                  <span>
                    Sales commission
                    {o.invoice?.commissionRate != null && (
                      <span className="ml-1 text-xs font-normal text-stone-500">
                        ({Math.round(o.invoice.commissionRate * 1000) / 10}% of markup)
                      </span>
                    )}
                  </span>
                  <span>{money(o.totals.markupCommission ?? o.invoice?.markupCommission)}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between border-t pt-2"><span>Paid</span><span className="text-emerald-700">{money(o.totals.paid)}</span></div>
          <div className="flex justify-between"><span>Balance</span><span className={o.totals.balance > 0.01 ? "text-red-700" : ""}>{money(o.totals.balance)}</span></div>
        </div>
        {!isDraft ? (
          <div className="card space-y-3">
            <h2 className="font-semibold">Payment</h2>
            {(o.invoice?.number || o.invoiceNumber) ? (
              <p className="text-sm">
                Invoice <Link className="font-semibold underline" to="/finance?section=ar">{o.invoice?.number || o.invoiceNumber}</Link>
              </p>
            ) : null}
            {o.invoice && o.totals.balance > 0.01 && canModule(user, "sales") && (
              <button type="button" className="btn-success" onClick={() => setStk(true)}>Send M-Pesa prompt</button>
            )}
            <ul className="text-sm">
              {(o.payments || []).length === 0 && <li className="text-stone-500">No payments yet.</li>}
              {(o.payments || []).map((p: any) => (
                <li key={p.id} className="flex justify-between border-t py-1">
                  <span>{p.method} {p.reference || ""}</span>
                  <span>{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="card space-y-2 text-sm text-stone-500">
            <h2 className="font-semibold text-stone-800">Next step</h2>
            <p>Send the quotation to your customer. When they accept, click <strong>Confirm sales order</strong> above.</p>
          </div>
        )}
      </div>

      {preview && doc && <DocPreview doc={doc} onClose={() => setPreview(false)} />}

      {accept && (
        <ConfirmDialog
          title="Confirm sales order"
          body="Stock will be reserved and an invoice will be created in Finance."
          confirmLabel="Confirm sales order"
          busy={convert.isPending}
          onConfirm={() => convert.mutate()}
          onClose={() => setAccept(false)}
        />
      )}
      {stk && o.invoice && (
        <StkPrompt
          invoiceId={o.invoice.id}
          orderId={o.id}
          defaultPhone={o.customer?.phone || ""}
          defaultAmount={Math.round(o.totals.balance)}
          onClose={() => setStk(false)}
        />
      )}
    </div>
  );
}
