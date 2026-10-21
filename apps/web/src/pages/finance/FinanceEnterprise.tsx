import { useQuery } from "@tanstack/react-query";
import { EnterpriseRoadmap } from "../../components/EnterpriseRoadmap";
import { EmptyRow, Pager } from "../../components/ui";
import { api, money } from "../../lib/api";
import { usePager } from "../../lib/pager";

function AgingMatrix({ matrix, label }: { matrix?: Record<string, number>; label: string }) {
  if (!matrix) return null;
  const cols = [
    { k: "current", label: "Current" },
    { k: "days1_7", label: "1–7 days" },
    { k: "days8_14", label: "8–14 days" },
    { k: "days15_30", label: "15–30 days" },
    { k: "days30plus", label: "30+ days" },
  ];
  return (
    <div className="card overflow-x-auto">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</div>
      <table className="invoice w-full min-w-[480px]">
        <thead>
          <tr>{cols.map((c) => <th key={c.k}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          <tr>{cols.map((c) => <td key={c.k} className="num font-medium">{money(matrix[c.k] || 0)}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

export function FinanceAgingMatrix({ matrix }: { matrix?: Record<string, number> }) {
  return <AgingMatrix matrix={matrix} label="Customer aging summary" />;
}

export function FinanceApAging() {
  const { data } = useQuery({ queryKey: ["payables-aging"], queryFn: () => api<any>("/api/reports/payables-aging") });
  const rows = data?.rows || [];
  const pager = usePager(rows, "ap-aging");
  return (
    <div className="space-y-3">
      <AgingMatrix matrix={data?.agingMatrix} label="Supplier aging summary" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card"><div className="text-xs uppercase text-stone-400">Outstanding AP</div><div className="text-xl font-semibold">{money(data?.summary?.total)}</div></div>
        <div className="card"><div className="text-xs uppercase text-stone-400">Overdue bills</div><div className="text-xl font-semibold text-rose-700">{money(data?.summary?.overdueAmount)}</div></div>
      </div>
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Bill</th><th>Vendor</th><th>PO</th><th>Due</th><th className="num">Balance</th><th>Age</th></tr></thead>
          <tbody>
            {pager.slice.length === 0 && <EmptyRow cols={6} label="No open vendor bills." />}
            {pager.slice.map((r: any) => (
              <tr key={r.id}>
                <td>{r.number}</td>
                <td>{r.vendor}</td>
                <td>{r.purchase}</td>
                <td>{r.dueAt ? new Date(r.dueAt).toLocaleDateString("en-GB") : "—"}</td>
                <td className="num">{money(r.balance)}</td>
                <td>{r.daysOverdue > 0 ? `${r.daysOverdue}d overdue` : "Current"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </div>
  );
}

export function FinanceEnterpriseSection({ kind }: { kind: "budget" | "assets" | "currency" }) {
  const maps: Record<string, { title: string; intro: string; items: Parameters<typeof EnterpriseRoadmap>[0]["items"] }> = {
    budget: {
      title: "Budgeting",
      intro: "Annual and departmental budgets with variance vs actual — integrated with GL and approvals.",
      items: [
        { title: "Annual budget", blurb: "Company-wide targets by account group.", status: "planned" },
        { title: "Department / branch", blurb: "Split budgets by cost center.", status: "planned" },
        { title: "Variance analysis", blurb: "Budget vs actual from posted journals.", status: "partial", to: "/finance?section=reports" },
        { title: "Budget approval", blurb: "Workflow via Approvals engine.", status: "partial", to: "/approvals" },
      ],
    },
    assets: {
      title: "Fixed assets",
      intro: "Asset register, depreciation, and disposal with automatic journal entries.",
      items: [
        { title: "Asset register", blurb: "Capital items linked from inventory or manual add.", status: "planned" },
        { title: "Depreciation", blurb: "Scheduled runs to accumulated depreciation.", status: "planned" },
        { title: "Transfer & disposal", blurb: "Approval + audit on every movement.", status: "planned" },
      ],
    },
    currency: {
      title: "Multi-currency",
      intro: "Base currency KES today; foreign POs and invoices use fxRate on documents.",
      items: [
        { title: "Exchange rates", blurb: "Daily rate table and history.", status: "planned" },
        { title: "Revaluation", blurb: "Period-end FX gain/loss journals.", status: "planned" },
        { title: "Foreign PO / bills", blurb: "Purchase orders already store fxRate.", status: "partial", to: "/procurement" },
      ],
    },
  };
  const block = maps[kind];
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{block.title}</h2>
      <EnterpriseRoadmap items={block.items} />
    </div>
  );
}
