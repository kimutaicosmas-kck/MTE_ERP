import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DocPaper } from "../components/DocPaper";
import { DocPreview } from "../components/DocPreview";
import { MachinePartSearch } from "../components/MachinePartSearch";
import { MteSelect, PageHeader, mapSelectOptions } from "../components/ui";
import { api, money } from "../lib/api";
import type { DocModel } from "../lib/doc-style";

export function OrderNew() {
  const nav = useNavigate();
  const customers = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/api/customers") });
  const parts = useQuery({ queryKey: ["parts"], queryFn: () => api<any[]>("/api/parts") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<any>("/api/settings") });
  const [saveAsQuote, setSaveAsQuote] = useState(false);
  const [channel, setChannel] = useState("SHOP");
  const [customerId, setCustomerId] = useState("");
  const [dispatchMethod, setDispatchMethod] = useState("SHOP_COLLECT");
  const [lpo, setLpo] = useState("");
  const [validDays, setValidDays] = useState(14);
  const [intro, setIntro] = useState("");
  const [lines, setLines] = useState([{ partId: "", qty: 1, salePrice: undefined as number | undefined }]);
  const [preview, setPreview] = useState(false);

  const save = useMutation({
    mutationFn: async (asQuote: boolean) => {
      const o = await api<{ id: string; offline?: boolean }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          channel,
          customerId,
          dispatchMethod,
          lpo: lpo || undefined,
          validDays: asQuote ? validDays : undefined,
          intro: intro || (asQuote ? "Please quote the following goods" : "Please supply the following goods"),
          lines: lines.filter((l) => l.partId).map((l) => ({
            partId: l.partId,
            qty: l.qty,
            ...(l.salePrice != null && l.salePrice > 0 ? { salePrice: l.salePrice } : {}),
          })),
        }),
      });
      if (!o?.offline && !asQuote) {
        await api(`/api/orders/${o.id}/convert`, { method: "POST" });
      }
      return { o, asQuote };
    },
    onSuccess: ({ o, asQuote }) => nav(o?.offline ? (asQuote ? "/sales?tab=quotes" : "/sales") : `/sales/${o.id}`),
  });

  const customerOptions = useMemo(
    () => mapSelectOptions(customers.data || [], (c) => c.id, (c) => c.name, (c) => c.phone || undefined),
    [customers.data],
  );
  const partOptions = useMemo(
    () =>
      mapSelectOptions(
        parts.data || [],
        (p) => p.id,
        (p) => `${p.sku} · ${p.name}`,
        (p) => `${p.qtyOnHand} in stock`,
      ),
    [parts.data],
  );
  const customer = customers.data?.find((c) => c.id === customerId);
  const credit = useQuery({
    queryKey: ["credit", customerId],
    queryFn: () => api<{ outstanding: number; creditLimit: number; available: number | null; blocked: boolean }>(`/api/customers/${customerId}/credit`),
    enabled: !!customerId,
  });
  const company = settings.data || {};
  const lineUnitPrice = (l: { partId: string; salePrice?: number }) => {
    const p = parts.data?.find((x) => x.id === l.partId);
    if (!p) return 0;
    return l.salePrice != null && l.salePrice > 0 ? l.salePrice : p.salePrice;
  };
  const estGross = useMemo(() => {
    const net = lines.reduce((s, l) => s + lineUnitPrice(l) * l.qty, 0);
    return Math.round(net * 1.16 * 100) / 100;
  }, [lines, parts.data]);
  const doc = useMemo<DocModel>(() => ({
    kind: saveAsQuote ? "quotation" : "sales-order",
    number: saveAsQuote ? "QT-NEW" : "SO-NEW",
    date: new Date().toLocaleDateString("en-GB"),
    customerName: customer?.name || "",
    customerPhone: customer?.phone,
    companyName: company.legalName || company.companyName || "MTE ERP",
    companyPhone: company.phone,
    companyEmail: company.email,
    companyAddress: company.address,
    paybill: company.mpesaPaybill,
    account: company.mpesaAccount,
    status: saveAsQuote ? "DRAFT" : "CONFIRMED",
    intro: intro || (saveAsQuote ? "Please quote the following goods" : "Please supply the following goods"),
    validDays: saveAsQuote ? validDays : undefined,
    lpo,
    dispatchMethod,
    vatRate: 0.16,
    lines: lines
      .map((l) => {
        const p = parts.data?.find((x) => x.id === l.partId);
        return p ? { sku: p.sku, name: p.name, qty: l.qty, price: lineUnitPrice(l) } : null;
      })
      .filter(Boolean) as DocModel["lines"],
  }), [saveAsQuote, customer, company, intro, validDays, lpo, dispatchMethod, lines, parts.data]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate(saveAsQuote);
  }

  return (
    <form onSubmit={onSubmit} className="doc-composer">
      <PageHeader
        eyebrow="Sales"
        title={saveAsQuote ? "New quotation" : "New sales order"}
        backTo="/sales"
      />

      <div className="doc-composer-grid">
        <div className="space-y-4">
          <label className="card flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={saveAsQuote}
              onChange={(e) => setSaveAsQuote(e.target.checked)}
            />
            <span>
              <span className="block font-medium">Save as quote first</span>
              <span className="block text-sm text-stone-500">
                Send a quotation to the customer. Confirm it as a sales order when they accept.
              </span>
            </span>
          </label>

          <div className="card grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="order-customer">Customer</label>
              <MteSelect
                id="order-customer"
                aria-label="Customer"
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                placeholder="Select customer…"
                required
              />
            </div>
            <div>
              <label>How will they get it?</label>
              <MteSelect
                aria-label="Delivery method"
                value={dispatchMethod}
                onChange={setDispatchMethod}
                allowEmpty={false}
                options={[
                  { value: "SHOP_COLLECT", label: "Customer collects from shop" },
                  { value: "COURIER", label: "Send by courier" },
                ]}
              />
            </div>
            <div>
              <label>How did they order?</label>
              <MteSelect
                aria-label="Order channel"
                value={channel}
                onChange={setChannel}
                allowEmpty={false}
                options={["SHOP", "PHONE", "FIELD", "EMAIL"].map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <label>Customer PO / LPO</label>
              <input value={lpo} onChange={(e) => setLpo(e.target.value)} placeholder="Optional" />
            </div>
            {saveAsQuote && (
              <div>
                <label>Quote valid for</label>
                <MteSelect
                  aria-label="Quote validity"
                  value={String(validDays)}
                  onChange={(v) => setValidDays(Number(v))}
                  allowEmpty={false}
                  options={[7, 14, 21, 30, 60].map((d) => ({ value: String(d), label: `${d} days` }))}
                />
              </div>
            )}
          </div>

          {customerId && credit.data && credit.data.creditLimit > 0 && (
            <div className={`card text-sm ${credit.data.blocked || (credit.data.available != null && estGross > credit.data.available) ? "border-amber-300 bg-amber-50" : ""}`}>
              <strong>Credit:</strong> {money(credit.data.outstanding)} outstanding · limit {money(credit.data.creditLimit)}
              {estGross > 0 && <> · this order ~{money(estGross)}</>}
              {credit.data.blocked && <p className="mt-1 text-amber-800">Customer is at credit limit. Super Admin must approve new orders.</p>}
            </div>
          )}

          <MachinePartSearch
            compact
            onPick={(p) => {
              const empty = lines.findIndex((l) => !l.partId);
              if (empty >= 0) {
                const next = [...lines];
                next[empty] = { partId: p.id, qty: 1, salePrice: undefined };
                setLines(next);
              } else {
                setLines([...lines, { partId: p.id, qty: 1, salePrice: undefined }]);
              }
            }}
          />

          <div className="card space-y-3">
            <h2 className="font-semibold">Products</h2>
            {lines.map((l, i) => {
              const catalog = parts.data?.find((x) => x.id === l.partId);
              const unit = lineUnitPrice(l);
              const uplift = catalog && unit > catalog.salePrice ? unit - catalog.salePrice : 0;
              return (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <MteSelect
                    className="sm:col-span-2"
                    aria-label="Product"
                    value={l.partId}
                    onChange={(partId) => {
                      const next = [...lines];
                      next[i] = { ...next[i], partId, salePrice: undefined };
                      setLines(next);
                    }}
                    options={partOptions}
                    placeholder="Choose product…"
                    required={i === 0}
                  />
                  <input
                    type="number"
                    min={1}
                    aria-label="Quantity"
                    value={l.qty}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i].qty = Number(e.target.value);
                      setLines(next);
                    }}
                  />
                  <div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label="Unit price"
                      placeholder={catalog ? String(catalog.salePrice) : "Price"}
                      value={l.salePrice ?? ""}
                      onChange={(e) => {
                        const next = [...lines];
                        const v = e.target.value;
                        next[i].salePrice = v === "" ? undefined : Number(v);
                        setLines(next);
                      }}
                    />
                    {catalog && (
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        List {money(catalog.salePrice)}
                        {uplift > 0 && <> · +{money(uplift)}/unit markup</>}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-stone-500">
              Leave unit price blank to use the catalog price. Enter a higher price when the customer agrees to pay above list — sales commission on that uplift is calculated when the invoice is issued.
            </p>
            <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { partId: "", qty: 1, salePrice: undefined }])}>Add another product</button>
            {parts.error && <p className="text-sm text-red-600">{(parts.error as Error).message}</p>}
            {!saveAsQuote && lines.some((l) => {
              const p = parts.data?.find((x) => x.id === l.partId);
              return p && l.qty > p.qtyOnHand;
            }) && (
              <p className="text-sm text-amber-800">Some lines exceed stock on hand. Check quantities before saving.</p>
            )}
          </div>
        </div>

        <aside className="doc-live">
          <div className="doc-live-inner">
            <DocPaper doc={doc} />
          </div>
        </aside>
      </div>

      {save.error && <p className="text-red-600">{(save.error as Error).message}</p>}
      <div className="doc-composer-actions">
        <button type="button" className="btn-ghost" onClick={() => setPreview(true)}>
          <Eye size={16} /> {saveAsQuote ? "Preview quotation" : "Preview sales order"}
        </button>
        <button
          type="submit"
          className={saveAsQuote ? "btn-gold" : "btn-success"}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : saveAsQuote ? "Save quotation" : "Create sales order"}
        </button>
      </div>

      {preview && <DocPreview doc={doc} onClose={() => setPreview(false)} />}
    </form>
  );
}
