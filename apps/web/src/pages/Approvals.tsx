import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Layers, Search, User, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { MobileFilters } from "../components/filters";
import { EmptyState } from "../components/register";
import { PageHeader, Pager, Stat, StatGrid, useQueryState } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";

export function Approvals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["approvals"], queryFn: () => api<any[]>("/api/approvals") });
  const [tabRaw, setTabRaw] = useQueryState("tab", "PENDING");
  const tab = (["PENDING", "APPROVED", "REJECTED", "ALL"].includes(tabRaw) ? tabRaw : "PENDING") as "PENDING" | "APPROVED" | "REJECTED" | "ALL";
  const setTab = (next: typeof tab) => setTabRaw(next);
  const [q, setQ] = useState("");
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      api(`/api/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });

  const pending = data.filter((a) => a.status === "PENDING").length;
  const approved = data.filter((a) => a.status === "APPROVED").length;
  const rejected = data.filter((a) => a.status === "REJECTED").length;
  const kinds = new Set(data.map((a) => a.type)).size;
  const mine = data.filter((a) => a.status === "PENDING" && a.requester?.id === user?.id).length;

  const rows = useMemo(() => {
    return data.filter((a) => {
      if (tab !== "ALL" && a.status !== tab) return false;
      return `${a.type} ${a.entity} ${a.reason} ${a.requester?.name || ""}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [data, tab, q]);
  const pager = usePager(rows, `${tab}|${q}`);

  const filtersActive = Boolean(q) || tab !== "PENDING";

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Workflow" title="Approvals" />
      <StatGrid cols={6}>
        <Stat icon={ClipboardCheck} label="Pending" value={pending} chart="ring" max={data.length || 1} to="/approvals?tab=PENDING" />
        <Stat icon={CheckCircle2} label="Approved" value={approved} chart="ring" max={data.length || 1} to="/approvals?tab=APPROVED" />
        <Stat icon={XCircle} label="Rejected" value={rejected} chart="ring" max={data.length || 1} to="/approvals?tab=REJECTED" />
        <Stat icon={ClipboardCheck} label="All time" value={data.length} series={[pending, approved, rejected]} chart="bars" to="/approvals?tab=ALL" />
        <Stat icon={Layers} label="Request types" value={kinds} chart="spark" series={Object.values(data.reduce<Record<string, number>>((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {}))} to="/approvals?tab=ALL" />
        <Stat icon={User} label="My pending" value={mine} chart="ring" max={pending || 1} hint={user?.name} to="/approvals?tab=PENDING" />
      </StatGrid>
      <section className="suite-panel module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input className="min-w-0 flex-1" placeholder="Search approvals…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <MobileFilters
            title="Filter approvals"
            onClear={() => { setQ(""); setTab("PENDING"); }}
            fields={[
              {
                kind: "chips",
                label: "Status",
                value: tab,
                onChange: (v) => setTab(v as typeof tab),
                options: [
                  { value: "ALL", label: "All" },
                  { value: "PENDING", label: "Pending" },
                  { value: "APPROVED", label: "Approved" },
                  { value: "REJECTED", label: "Rejected" },
                ],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={tab} onChange={(e) => setTab(e.target.value as typeof tab)} aria-label="Status">
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ALL">All</option>
                </select>
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={() => { setQ(""); setTab("PENDING"); }}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      <div className="module-list-body">
        <div className="space-y-3 p-4 pt-0">
          {rows.length === 0 && <EmptyState title="No approvals yet" />}
          {pager.slice.map((a) => (
            <div key={a.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{approvalTitle(a.type)}</div>
                  <div className="text-sm text-stone-500">{a.requester.name} · {a.reason}</div>
                  <p className="mt-2 text-sm">{approvalStory(a)}</p>
                </div>
                <span className={`status-pill shrink-0 ${a.status === "PENDING" ? "status-pill-warn" : a.status === "APPROVED" ? "status-pill-ok" : "status-pill-danger"}`}>{a.status}</span>
              </div>
              {a.status === "PENDING" && user?.role === "SUPER_ADMIN" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-success" onClick={() => decide.mutate({ id: a.id, decision: "APPROVED" })}>Approve</button>
                  <button className="btn-danger" onClick={() => decide.mutate({ id: a.id, decision: "REJECTED" })}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {rows.length > 0 && <div className="px-4 pb-4"><Pager {...pager} /></div>}
      </div>
      </section>
    </div>
  );
}

const TITLES: Record<string, string> = {
  ADJUST_STOCK: "Change stock quantity",
  DELETE_PART: "Remove a product",
  CANCEL_ORDER: "Cancel a sales order",
  CREDIT_OVERRIDE: "Raise a credit limit",
  EDIT_PRICE: "Change a price or cost",
  EDIT_PART: "Update a product",
  EDIT_CUSTOMER: "Update a customer",
  POST_JOURNAL: "Post a manual journal",
  DELETE_EXPENSE: "Delete an expense",
  VOID_PAYMENT: "Void a payment",
  DELETE_CUSTOMER: "Remove a customer",
  SALES_RETURN: "Return sold goods",
  USER_SENSITIVE: "Change pay or sign-in access",
};

function approvalTitle(type: string) {
  return TITLES[type] || type.replace(/_/g, " ").toLowerCase();
}

function facts(raw: string) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function approvalStory(a: { type: string; reason?: string; oldValue?: string; newValue?: string }) {
  const old = facts(a.oldValue || "");
  const next = facts(a.newValue || "");
  if (a.type === "EDIT_PRICE") {
    return `Selling price ${old.salePrice ?? "—"} → ${next.salePrice ?? "—"}. Cost ${old.cost ?? "—"} → ${next.cost ?? "—"}.`;
  }
  if (a.type === "EDIT_PART") {
    return next.name ? `Product ${old.sku || old.name || ""} → ${next.name} (bin ${next.binLocation ?? old.binLocation ?? "—"}).` : a.reason || "Product master change.";
  }
  if (a.type === "EDIT_CUSTOMER") {
    return `Customer ${old.name || ""} → ${next.name ?? old.name}.`;
  }
  if (a.type === "CREDIT_OVERRIDE") return `Credit limit ${old.creditLimit ?? "—"} → ${next.creditLimit ?? "—"}.`;
  if (a.type === "CANCEL_ORDER") return `Cancel order that is currently ${old.status || "confirmed"}.`;
  if (a.type === "ADJUST_STOCK") return `Move stock by ${next.qty ?? "?"} (${next.type || "adjustment"}).`;
  if (a.type === "USER_SENSITIVE") {
    const bits = [];
    if (next.salary != null) bits.push(`salary ${old.salary ?? "—"} → ${next.salary}`);
    if (next.commissionRate != null) bits.push(`commission ${old.commissionRate ?? "—"} → ${next.commissionRate}`);
    if (next.active === false) bits.push("deactivate sign-in");
    return bits.join(". ") || a.reason || "Change employee pay or access.";
  }
  if (a.type === "SALES_RETURN") return next.reason || "Return goods from a confirmed sale.";
  if (a.type === "VOID_PAYMENT") return `Void ${next.method || old.method || "a payment"} of ${old.amount ?? ""}.`;
  if (a.type === "DELETE_EXPENSE") return `Remove ${old.category || "an expense"} of ${old.amount ?? ""}.`;
  if (a.type === "DELETE_CUSTOMER") return `Remove customer ${old.name || ""}.`;
  if (a.type === "DELETE_PART") return `Remove product ${old.sku || old.name || ""} from the catalogue.`;
  if (a.type === "POST_JOURNAL") return next.memo || "Post a manual ledger entry.";
  return a.reason || "Waiting for Super Admin.";
}
