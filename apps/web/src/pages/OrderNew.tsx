import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DocPaper } from "../components/DocPaper";
import { DocPreview } from "../components/DocPreview";
import { MteSelect, PageHeader, mapSelectOptions } from "../components/ui";
import { api, money } from "../lib/api";
import type { DocModel } from "../lib/doc-style";
import { flattenWarehouseBins, type WarehouseTree } from "../lib/warehouse-bins";

type SaleLine = { partId: string; qty: number; salePrice?: number; pickLocation: string };

function storeLocationLabel(site: WarehouseTree) {
  const bits = [site.name, `(${site.code})`];
  if (site.address) bits.push(`— ${site.address}`);
  return bits.join(" ");
}

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
  const [branchId, setBranchId] = useState("");
  const [warehouseSiteId, setWarehouseSiteId] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([{ partId: "", qty: 1, salePrice: undefined, pickLocation: "" }]);
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<{ id: string; name: string; code: string }[]>("/api/settings/branches"),
  });
  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api<WarehouseTree[]>("/api/inventory/warehouses"),
  });
  const [preview, setPreview] = useState(false);

  const save = useMutation({
    mutationFn: async (asQuote: boolean) => {
      const site = warehouses.data?.find((w) => w.id === warehouseSiteId);
      if (!site) throw new Error("Select the store or warehouse where stock is held");
      const o = await api<{ id: string; offline?: boolean }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          channel,
          customerId,
          branchId: branchId || undefined,
          saleLocation: storeLocationLabel(site),
          dispatchMethod,
          lpo: lpo || undefined,
          validDays: asQuote ? validDays : undefined,
          intro: intro || (asQuote ? "Please quote the following goods" : "Please supply the following goods"),
          lines: lines.filter((l) => l.partId && l.pickLocation.trim()).map((l) => ({
            partId: l.partId,
            qty: l.qty,
            pickLocation: l.pickLocation.trim(),
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
    return Math.round(net * 100) / 100;
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

  const branchOptions = useMemo(
    () => mapSelectOptions(branches.data || [], (b) => b.id, (b) => b.name, (b) => b.code),
    [branches.data],
  );
  const storeOptions = useMemo(
    () => mapSelectOptions(warehouses.data || [], (s) => s.id, (s) => s.name, (s) => `${s.code}${s.address ? ` · ${s.address}` : ""}`),
    [warehouses.data],
  );
  const binRows = useMemo(() => flattenWarehouseBins(warehouses.data || []), [warehouses.data]);
  const binOptions = useMemo(
    () => mapSelectOptions(binRows, (b) => b.path, (b) => b.path, (b) => b.hint),
    [binRows],
  );

  function setLinePart(i: number, partId: string) {
    const catalog = parts.data?.find((x) => x.id === partId);
    setLines((prev) => {
      const next = [...prev];
      next[i] = {
        ...next[i],
        partId,
        salePrice: undefined,
        pickLocation: catalog?.binLocation || next[i].pickLocation || "",
      };
      return next;
    });
  }

  useEffect(() => {
    if (warehouseSiteId || !warehouses.data?.length) return;
    if (warehouses.data.length === 1) setWarehouseSiteId(warehouses.data[0].id);
  }, [warehouses.data, warehouseSiteId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!warehouseSiteId) return;
    const missingLoc = lines.some((l) => l.partId && !l.pickLocation.trim());
    if (missingLoc) return;
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
            <span className="font-medium">Save as quote first</span>
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
            {(branches.data || []).length > 0 && (
              <div>
                <label>Shop / branch</label>
                <MteSelect
                  aria-label="Shop branch"
                  value={branchId}
                  onChange={setBranchId}
                  options={branchOptions}
                  placeholder="Select branch…"
                />
              </div>
            )}
            <div className={saveAsQuote ? "" : "sm:col-span-2"}>
              <label>Store / warehouse <span className="text-red-600">*</span></label>
              <MteSelect
                aria-label="Store or warehouse"
                value={warehouseSiteId}
                onChange={setWarehouseSiteId}
                options={storeOptions}
                placeholder={warehouses.isLoading ? "Loading stores…" : "Select store…"}
                required
              />
              <p className="mt-0.5 text-[11px] text-stone-500">
                Overall store for this sale. Enter each item&apos;s bin location on the product lines below.
              </p>
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

          <div className="card space-y-3">
            <h2 className="font-semibold">Products</h2>
            <div className="sale-line-stack">
            {lines.map((l, i) => {
              const catalog = parts.data?.find((x) => x.id === l.partId);
              const unit = lineUnitPrice(l);
              const uplift = catalog && unit > catalog.salePrice ? unit - catalog.salePrice : 0;
              return (
                <div key={i} className="sale-line-card">
                  <div className="sale-line-card-head">
                    <span className="sale-line-num">Line {i + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="sale-line-remove"
                        aria-label="Remove line"
                        onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="sale-line-field">
                    <label>Product</label>
                    <MteSelect
                      aria-label="Product"
                      value={l.partId}
                      onChange={(partId) => setLinePart(i, partId)}
                      options={partOptions}
                      placeholder="Choose product…"
                      required={i === 0}
                      searchable
                    />
                    {catalog ? (
                      <p className="sale-line-meta">
                        <span className="font-mono">{catalog.sku}</span>
                        <span aria-hidden> · </span>
                        {catalog.oemNumber}
                        <span aria-hidden> · </span>
                        <span className="sale-line-badge">{catalog.category}</span>
                        <span aria-hidden> · </span>
                        {catalog.qtyOnHand} in stock
                        {catalog.binLocation ? (
                          <>
                            <span aria-hidden> · </span>
                            Bin {catalog.binLocation}
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="sale-line-meta">Search or scroll the list to choose a product.</p>
                    )}
                  </div>
                  <div className="sale-line-row">
                    <div className="sale-line-grow">
                      <label>Item location</label>
                      {binOptions.length > 0 ? (
                        <MteSelect
                          aria-label="Item stock location"
                          value={l.pickLocation}
                          onChange={(pickLocation) => {
                            const next = [...lines];
                            next[i] = { ...next[i], pickLocation };
                            setLines(next);
                          }}
                          options={binOptions}
                          placeholder={catalog?.binLocation || "Select warehouse bin…"}
                          required={Boolean(l.partId)}
                          searchable
                        />
                      ) : (
                        <input
                          value={l.pickLocation}
                          onChange={(e) => {
                            const next = [...lines];
                            next[i] = { ...next[i], pickLocation: e.target.value };
                            setLines(next);
                          }}
                          placeholder={catalog?.binLocation || "e.g. MAIN-A-12-03"}
                          required={Boolean(l.partId)}
                          aria-label="Item stock location"
                        />
                      )}
                    </div>
                    <div className="sale-line-qty">
                      <label>Qty</label>
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
                    </div>
                    <div className="sale-line-price">
                      <label>Unit price</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        aria-label="Unit price"
                        placeholder={catalog ? String(catalog.salePrice) : "Catalog price"}
                        value={l.salePrice ?? ""}
                        onChange={(e) => {
                          const next = [...lines];
                          const v = e.target.value;
                          next[i].salePrice = v === "" ? undefined : Number(v);
                          setLines(next);
                        }}
                      />
                      {catalog && uplift > 0 && (
                        <p className="sale-line-hint">+{money(uplift)}/unit above list</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
            <p className="text-xs text-stone-500">
              Leave unit price blank to use the catalog price. Pick the bin where stock will be taken from.
            </p>
            <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { partId: "", qty: 1, salePrice: undefined, pickLocation: "" }])}>Add another product</button>
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

      {lines.some((l) => l.partId && !l.pickLocation.trim()) && (
        <p className="text-sm text-amber-800">Enter a stock location for each product line.</p>
      )}
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
