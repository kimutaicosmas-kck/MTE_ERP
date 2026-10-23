import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, FileText, Package, Phone, ShoppingCart, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Modal, PageHeader, Stat, StatGrid } from "../components/ui";
import { api, money } from "../lib/api";
import { useSetPageTitle } from "../lib/page-title";
import { useState } from "react";

type VendorDetail = {
  id: string;
  name: string;
  phone?: string;
  leadDays: number;
  oem: boolean;
  stats: { orders: number; openPOs: number; apBalance: number; totalSpend: number; avgLeadDays: number | null };
  purchases: { id: string; number: string; status: string; createdAt: string; lineCount: number }[];
  bills: {
    id: string;
    number: string;
    status: string;
    gross: number;
    paid: number;
    balance: number;
    createdAt: string;
    purchaseNumber: string | null;
  }[];
};

export function VendorDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const { data, error, isLoading } = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => api<VendorDetail>(`/api/vendors/${id}`),
    enabled: !!id,
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor", id] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setEdit(false);
    },
  });

  useSetPageTitle("Vendors", data?.name || "Supplier", "/vendors");

  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-stone-500">Loading supplier…</p>;

  return (
    <div className="space-y-4 suite-dash">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/vendors" className="btn-ghost inline-flex items-center gap-1 text-sm">
          <ArrowLeft size={16} /> Back to vendors
        </Link>
        <PageHeader
          eyebrow={data.oem ? "OEM supplier" : "Aftermarket supplier"}
          title={data.name}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-ghost module-btn-sm" onClick={() => setEdit(true)}>Edit</button>
          <Link to={`/procurement/new?vendorId=${data.id}`} className="btn-gold module-btn-sm">New purchase order</Link>
          <Link to={`/finance?section=ap`} className="btn-ghost module-btn-sm">Pay bills</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-stone-600">
        {data.phone && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1">
            <Phone size={14} /> {data.phone}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1">
          <Clock size={14} /> Lead time: {data.leadDays} days
        </span>
        {data.stats.avgLeadDays != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
            Actual avg delivery: {data.stats.avgLeadDays} days
          </span>
        )}
      </div>

      <StatGrid cols={6}>
        <Stat icon={Package} label="Purchase orders" value={data.stats.orders} hint="All time" />
        <Stat icon={ShoppingCart} label="Open POs" value={data.stats.openPOs} to={`/procurement`} />
        <Stat icon={Wallet} label="Amount owed" amount={data.stats.apBalance} to="/finance?section=ap" />
        <Stat icon={FileText} label="Total billed" amount={data.stats.totalSpend} />
        <Stat icon={FileText} label="Open bills" value={data.bills.filter((b) => b.balance > 0.01).length} hint="Unpaid" to="/finance?section=ap" />
        <Stat icon={Clock} label="Quoted lead" value={`${data.leadDays}d`} hint={data.stats.avgLeadDays != null ? `Avg ${data.stats.avgLeadDays}d` : "No receipts yet"} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="suite-panel suite-panel-table overflow-hidden">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold">Recent purchase orders</h2>
          <div className="table-wrap">
            <table className="invoice suite-table">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>Status</th>
                  <th>Lines</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.purchases.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-stone-500">No purchase orders yet.</td></tr>
                )}
                {data.purchases.map((p) => (
                  <tr key={p.id} className="cursor-pointer" onClick={() => window.location.assign(`/procurement/${p.id}`)}>
                    <td><Link to={`/procurement/${p.id}`} className="font-medium text-ink">{p.number}</Link></td>
                    <td>{p.status}</td>
                    <td className="num">{p.lineCount}</td>
                    <td>{fmt(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="suite-panel suite-panel-table overflow-hidden">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold">Supplier bills</h2>
          <div className="table-wrap">
            <table className="invoice suite-table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>PO</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.bills.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-stone-500">No bills yet — receive goods on a PO.</td></tr>
                )}
                {data.bills.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.number}</td>
                    <td>{b.purchaseNumber || "—"}</td>
                    <td className={`num ${b.balance > 0.01 ? "font-semibold text-amber-800" : "text-emerald-700"}`}>{money(b.balance)}</td>
                    <td>{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {edit && (
        <Modal onClose={() => setEdit(false)}>
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
            <h2 className="text-xl font-semibold tracking-tight">Edit supplier</h2>
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            <input name="name" defaultValue={data.name} required />
            <input name="phone" defaultValue={data.phone || ""} placeholder="Phone" />
            <input name="leadDays" type="number" defaultValue={data.leadDays} min={0} />
            <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal">
              <input name="oem" type="checkbox" className="w-auto" defaultChecked={data.oem} /> OEM supplier
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEdit(false)}>Cancel</button>
              <button className="btn-gold" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
