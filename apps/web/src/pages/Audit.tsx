import { useQuery } from "@tanstack/react-query";
import { Activity, Calendar, Search, Tags, Users } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { MobileFilters } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { EmptyRow, ExportButtons, PageHeader, Pager, RowPdf, Stat, StatGrid, seriesByDay } from "../components/ui";
import { api } from "../lib/api";
import { usePager } from "../lib/pager";

const RECORD: Record<string, string> = {
  Order: "Sales order",
  Payment: "Payment",
  Invoice: "Invoice",
  Part: "Product",
  Customer: "Customer",
  Vendor: "Supplier",
  User: "Employee",
  LeaveRequest: "Leave request",
  SalaryAdvance: "Salary advance",
  PayrollRun: "Payroll",
  Payroll: "Payroll",
  PurchaseOrder: "Purchase order",
  Expense: "Expense",
  Approval: "Approval",
  Journal: "Journal entry",
  Period: "Accounts period",
  BankLine: "Bank line",
  VendorPayment: "Supplier payment",
  VendorBill: "Supplier bill",
  SalesReturn: "Sales return",
  EmployeeFile: "Staff file",
  Setting: "Company settings",
  Branch: "Branch",
  Attachment: "Attached file",
  Capture: "Photo",
  System: "System backup",
};

const DID: Record<string, string> = {
  CREATE: "added",
  UPDATE: "updated",
  DELETE: "removed",
  STATUS: "changed the status of",
  POST: "posted",
  APPROVE: "approved",
  APPROVED: "approved",
  REJECT: "declined",
  REJECTED: "declined",
  REQUEST: "asked for a change on",
  IMPORT: "imported",
  RECEIVE: "received goods for",
  MATCH: "matched",
  CLOSE: "closed",
  UNLOCK: "reopened",
  EXPORT: "exported",
  RESTORE: "restored",
  UPLOAD: "uploaded",
  ADJUST_STOCK: "adjusted stock on",
  HR_UPDATE: "updated the HR file for",
  RESET_PASSWORD: "reset the password for",
  CHANGE_PASSWORD: "changed their password",
  UPDATE_PROFILE: "updated their profile",
  UPDATE_AVATAR: "changed their photo",
  ENABLE_MFA: "turned on extra login security",
  DISABLE_MFA: "turned off extra login security",
  ISSUE_RESET_CODE: "sent a password reset for",
  TEMP_PASSWORD: "issued a temporary password for",
};

function titleCase(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function recordName(entity?: string) {
  if (!entity) return "Record";
  return RECORD[entity] || titleCase(entity);
}

function verb(action?: string) {
  if (!action) return "changed";
  return DID[action] || titleCase(action).toLowerCase();
}

function roleName(role?: string) {
  if (!role) return "";
  const map: Record<string, string> = {
    SUPER_ADMIN: "Super admin",
    ADMIN: "Admin",
    SALES: "Sales",
    WAREHOUSE: "Warehouse",
    FINANCE: "Finance",
  };
  return map[role] || titleCase(role);
}

function parseJson(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function facts(raw?: string | null): [string, string][] {
  const obj = parseJson(raw);
  if (!obj) return [];
  const skip = new Set(["id", "passwordHash", "modules", "createdAt", "updatedAt", "userId", "customerId", "partId", "orderId", "branchId"]);
  return Object.entries(obj)
    .filter(([key, value]) => !skip.has(key) && value != null && typeof value !== "object")
    .slice(0, 8)
    .map(([key, value]) => [titleCase(key), titleCase(String(value))]);
}

function story(a: any) {
  const who = a.user?.name || "Someone";
  const thing = recordName(a.entity).toLowerCase();
  const act = verb(a.action);
  if (["CHANGE_PASSWORD", "UPDATE_PROFILE", "UPDATE_AVATAR", "ENABLE_MFA", "DISABLE_MFA"].includes(a.action)) {
    return `${who} ${act}`;
  }
  if (["CREATE", "IMPORT", "UPLOAD"].includes(a.action)) return `${who} added a ${thing}`;
  if (["APPROVE", "APPROVED", "REJECT", "REJECTED", "POST", "CLOSE", "UNLOCK", "DELETE"].includes(a.action)) {
    return `${who} ${act} a ${thing}`;
  }
  if (a.action === "STATUS") return `${who} changed the status of a ${thing}`;
  return `${who} ${act} a ${thing}`;
}

function changeLine(a: any) {
  if (a.reason) return a.reason;
  const before = parseJson(a.oldValue);
  const after = parseJson(a.newValue);
  if (before?.status && after?.status && before.status !== after.status) {
    return `Status: ${titleCase(String(before.status))} → ${titleCase(String(after.status))}`;
  }
  if (after?.number) return `Number ${after.number}`;
  if (after?.amount != null) return `Amount ${after.amount}`;
  if (after?.email) return String(after.email);
  if (after?.name) return String(after.name);
  if (before || after) return "Tap the row to see what changed";
  return "No extra details";
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Audit() {
  const { data = [] } = useQuery({ queryKey: ["audit"], queryFn: () => api<any[]>("/api/reports/audit") });
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    return data.filter((a) => {
      const hay = `${story(a)} ${recordName(a.entity)} ${a.user?.name || ""} ${a.reason || ""} ${changeLine(a)}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (action && a.action !== action) return false;
      if (entity && a.entity !== entity) return false;
      return true;
    });
  }, [data, q, action, entity]);

  const listing = useListSort(rows, [
    { id: "time", label: "Newest first", get: (a) => a.createdAt, dir: "desc" },
    { id: "user", label: "Person A–Z", get: (a) => a.user?.name || "", dir: "asc" },
  ], "time");
  const pager = usePager(listing.sorted, `${q}|${listing.sort}`);

  const people = new Set(data.map((a) => a.user?.name).filter(Boolean)).size;
  const today = data.filter((a) => new Date(a.createdAt).toDateString() === new Date().toDateString()).length;
  const kinds = new Set(data.map((a) => a.action)).size;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const week = data.filter((a) => new Date(a.createdAt) >= weekStart).length;
  const entities = new Set(data.map((a) => a.entity)).size;

  const filtersActive = Boolean(q || action || entity);

  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Activity log" title="Audit" />
      <StatGrid cols={6}>
        <Stat icon={Calendar} label="Today" value={today} series={seriesByDay(data, (a) => a.createdAt, () => 1, 14)} chart="bars" hint="What happened today" to="/audit" />
        <Stat icon={Activity} label="All activity" value={data.length} series={seriesByDay(data, (a) => a.createdAt, () => 1, 14)} chart="area" hint="Saved history" to="/audit" />
        <Stat icon={Users} label="People" value={people} chart="ring" max={Math.max(data.length, 1)} hint="Who appears in the log" to="/hr?tab=employees" />
        <Stat icon={Tags} label="Kinds of change" value={kinds} series={Object.values(data.reduce<Record<string, number>>((acc, a) => { acc[a.action] = (acc[a.action] || 0) + 1; return acc; }, {}))} chart="spark" hint="Added, approved, posted…" to="/audit" />
        <Stat icon={Calendar} label="Last 7 days" value={week} series={seriesByDay(data, (a) => a.createdAt, () => 1, 7)} chart="area" to="/audit" />
        <Stat icon={Tags} label="Record types" value={entities} chart="ring" max={Math.max(data.length, 1)} to="/audit" />
      </StatGrid>
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input className="min-w-0 flex-1" placeholder="Search a name or what they did…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <MobileFilters
            title="Filter activity"
            onClear={() => { setQ(""); setAction(""); setEntity(""); }}
            fields={[
              {
                kind: "select",
                label: "What they did",
                value: action,
                onChange: setAction,
                options: [{ value: "", label: "Everything" }, ...[...new Set(data.map((a) => a.action).filter(Boolean))].sort().map((v) => ({ value: v, label: titleCase(DID[v] || v) }))],
              },
              {
                kind: "select",
                label: "Which record",
                value: entity,
                onChange: setEntity,
                options: [{ value: "", label: "All records" }, ...[...new Set(data.map((a) => a.entity).filter(Boolean))].sort().map((v) => ({ value: v, label: recordName(v) }))],
              },
            ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
                  <option value="">Everything</option>
                  {[...new Set(data.map((a) => a.action).filter(Boolean))].sort().map((v) => (
                    <option key={v} value={v}>{titleCase(DID[v] || v)}</option>
                  ))}
                </select>
                <select className="module-select" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Record type">
                  <option value="">All records</option>
                  {[...new Set(data.map((a) => a.entity).filter(Boolean))].sort().map((v) => (
                    <option key={v} value={v}>{recordName(v)}</option>
                  ))}
                </select>
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={() => { setQ(""); setAction(""); setEntity(""); }}>
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
              <ExportButtons
                title="Activity log"
                filename="activity-log.csv"
                headers={["When", "Who", "What happened", "Record", "Details"]}
                rows={rows.map((a) => [when(a.createdAt), a.user?.name || "", story(a), recordName(a.entity), a.reason || changeLine(a)])}
              />
            </div>
          </div>
        </div>
      <Register
        rows={listing.sorted}
        pager={pager}
        getId={(a) => a.id}
        onOpen={(a) => setOpen(open === a.id ? null : a.id)}
        empty={{ title: "No activity yet" }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (a) => story(a),
          subtitle: (a) => when(a.createdAt),
          status: (a) => <span className="badge bg-slate-100 text-slate-600">{recordName(a.entity)}</span>,
          fields: [
            { label: "Who", value: (a) => a.user?.name || "—" },
            { label: "Details", value: (a) => changeLine(a) },
          ],
          details: (a) => [
            { label: "When", value: when(a.createdAt) },
            { label: "Who", value: `${a.user?.name || "—"} ${roleName(a.user?.role) ? `· ${roleName(a.user?.role)}` : ""}` },
            { label: "What happened", value: story(a) },
            { label: "Record", value: recordName(a.entity) },
            { label: "Details", value: changeLine(a) },
            ...facts(a.oldValue).map(([k, v]) => ({ label: `Before · ${k}`, value: v })),
            ...facts(a.newValue).map(([k, v]) => ({ label: `After · ${k}`, value: v })),
          ],
        }}
      >
      <div className="table-wrap">
        <table className="invoice suite-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What happened</th>
              <th>Record</th>
              <th>Details</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={6} label="Nothing matches this search." />}
            {pager.slice.map((a) => (
              <Fragment key={a.id}>
              <tr className="cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
                <td className="whitespace-nowrap text-xs">{when(a.createdAt)}</td>
                <td>
                  {a.user?.name || "—"}
                  {roleName(a.user?.role) ? <div className="text-xs text-stone-500">{roleName(a.user?.role)}</div> : null}
                </td>
                <td>{story(a)}</td>
                <td><span className="badge bg-stone-100">{recordName(a.entity)}</span></td>
                <td className="max-w-xs truncate">{changeLine(a)}</td>
                <td>
                  <RowPdf
                    title="Activity"
                    fields={[
                      ["When", when(a.createdAt)],
                      ["Who", a.user?.name || "—"],
                      ["What happened", story(a)],
                      ["Record", recordName(a.entity)],
                      ["Details", changeLine(a)],
                      ...facts(a.oldValue).map(([k, v]) => [`Before · ${k}`, v] as [string, string]),
                      ...facts(a.newValue).map(([k, v]) => [`After · ${k}`, v] as [string, string]),
                    ]}
                  />
                </td>
              </tr>
              {open === a.id && (
                <tr>
                  <td colSpan={6} className="bg-stone-50 text-sm dark:bg-white/5">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{story(a)}</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{changeLine(a)}</p>
                    {(facts(a.oldValue).length > 0 || facts(a.newValue).length > 0) ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Before</div>
                          {facts(a.oldValue).length ? facts(a.oldValue).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3 py-0.5 text-slate-600 dark:text-slate-300"><span>{k}</span><span>{v}</span></div>
                          )) : <div className="text-slate-400">Nothing recorded</div>}
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">After</div>
                          {facts(a.newValue).length ? facts(a.newValue).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3 py-0.5 text-slate-600 dark:text-slate-300"><span>{k}</span><span>{v}</span></div>
                          )) : <div className="text-slate-400">Nothing recorded</div>}
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </Register>
      </section>
    </div>
  );
}
