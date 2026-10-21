import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { MobileFilters, prettyLabel } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { EmptyRow, Modal, MteSelect, PageHeader, Pager, Stat, StatGrid, Tabs, mapSelectOptions, seriesByMonth, useQueryState } from "../components/ui";
import { canModule, DEPARTMENTS } from "../lib/access";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";
import { ModuleReportsPanel } from "../components/ModuleReportsPanel";
import { EmployeesTab, StaffDirectory } from "./Staff";

type Employee = { id: string; name: string };
type Tab = "employees" | "leave" | "onleave" | "advance" | "attendance" | "payroll" | "reports";
type Leave = {
  id: string; type: string; startDate: string; endDate: string; days: number; reason?: string | null; status: string;
  user: { id: string; name: string; department: string }; reviewer?: { name: string } | null;
};
type Punch = {
  id: string; date: string; checkIn?: string | null; checkOut?: string | null; status: string; notes?: string | null;
  user: { id: string; name: string; department: string };
};
type Advance = {
  id: string; amount: number; reason?: string | null; year: number; month: number; status: string;
  user: { id: string; name: string; department: string; salary?: number };
  reviewer?: { name: string } | null;
};

const TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  PRESENT: "bg-emerald-100 text-emerald-800",
  LATE: "bg-amber-100 text-amber-800",
  ABSENT: "bg-red-100 text-red-800",
  LEAVE: "bg-sky-100 text-sky-800",
  DRAFT: "bg-stone-100 text-stone-700",
  POSTED: "bg-emerald-100 text-emerald-800",
  DEDUCTED: "bg-sky-100 text-sky-800",
};

export function HR() {
  const { user } = useAuth();
  const admin = canModule(user, "hr");
  const [tabRaw, setTabRaw] = useQueryState("tab", admin ? "employees" : "leave");
  const allowed: Tab[] = admin
    ? ["employees", "leave", "onleave", "advance", "attendance", "payroll", "reports"]
    : ["leave", "onleave", "advance", "reports"];
  const tab = (allowed.includes(tabRaw as Tab) ? tabRaw : allowed[0]) as Tab;
  const setTab = (next: Tab) => setTabRaw(next);
  return (
    <div className="space-y-4 suite-dash">
      <PageHeader eyebrow="Human resources" title="HR" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ...(admin ? [{ id: "employees" as const, label: "Employees" }] : []),
          { id: "leave", label: "Leave requests" },
          { id: "onleave", label: "Who is away" },
          { id: "advance", label: "Salary advance" },
          ...(admin ? [
            { id: "attendance" as const, label: "Attendance" },
            { id: "payroll" as const, label: "Payroll" },
          ] : []),
          { id: "reports" as const, label: "HR reports" },
        ]}
      />
      {tab === "employees" && admin && <EmployeesTab />}
      {tab === "employees" && admin && <StaffDirectory showStats={false} />}
      {tab === "leave" && (
        <>
          <LeaveTab />
          <LeavePanel />
        </>
      )}
      {tab === "onleave" && (
        <>
          <OnLeaveTab />
          <OnLeavePanel />
        </>
      )}
      {tab === "advance" && (
        <>
          <AdvanceTab />
          <AdvancePanel />
        </>
      )}
      {tab === "attendance" && admin && (
        <>
          <AttendanceTab />
          <AttendancePanel />
        </>
      )}
      {tab === "payroll" && admin && (
        <>
          <PayrollTab />
          <PayrollPanel />
        </>
      )}
      {tab === "reports" && <ModuleReportsPanel moduleId="hr" />}
    </div>
  );
}

function LeaveTab() {
  const { data = [] } = useQuery({ queryKey: ["hr-leave"], queryFn: () => api<Leave[]>("/api/hr/leave") });
  return (
    <StatGrid cols={6}>
      <Stat label="Requests" value={data.length} series={seriesByMonth(data, (l) => l.startDate, () => 1, 8)} chart="bars" to="/hr?tab=leave" />
      <Stat label="Pending" value={data.filter((l) => l.status === "PENDING").length} chart="ring" max={data.length || 1} to="/hr?tab=leave" />
      <Stat label="Approved" value={data.filter((l) => l.status === "APPROVED").length} chart="ring" max={data.length || 1} to="/hr?tab=leave" />
      <Stat label="Days pending" value={data.filter((l) => l.status === "PENDING").reduce((s, l) => s + l.days, 0)} series={data.filter((l) => l.status === "PENDING").map((l) => l.days)} chart="spark" to="/hr?tab=leave" />
      <Stat label="Rejected" value={data.filter((l) => l.status === "REJECTED").length} chart="ring" max={data.length || 1} to="/hr?tab=leave" />
      <Stat label="Approved days" value={data.filter((l) => l.status === "APPROVED").reduce((s, l) => s + l.days, 0)} chart="area" series={data.filter((l) => l.status === "APPROVED").slice(0, 8).map((l) => l.days)} to="/hr?tab=leave" />
    </StatGrid>
  );
}

function dayOnly(value: string) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOnLeaveNow(l: Leave) {
  if (l.status !== "APPROVED") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dayOnly(l.startDate) <= today && dayOnly(l.endDate) >= today;
}

function daysLeft(l: Leave) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((dayOnly(l.endDate).getTime() - today.getTime()) / 86400000) + 1);
}

function OnLeaveTab() {
  const { data = [] } = useQuery({ queryKey: ["hr-leave"], queryFn: () => api<Leave[]>("/api/hr/leave") });
  const away = data.filter(isOnLeaveNow);
  const week = new Date();
  week.setDate(week.getDate() + 7);
  const returning = away.filter((l) => dayOnly(l.endDate) <= week);
  return (
    <StatGrid cols={6}>
      <Stat label="On leave today" value={away.length} series={[away.filter((l) => l.type === "ANNUAL").length, away.filter((l) => l.type === "SICK").length, away.filter((l) => l.type !== "ANNUAL" && l.type !== "SICK").length]} chart="bars" to="/hr?tab=onleave" />
      <Stat label="Returning this week" value={returning.length} chart="ring" max={away.length || 1} to="/hr?tab=onleave" />
      <Stat label="Annual" value={away.filter((l) => l.type === "ANNUAL").length} chart="meter" share={away.length ? away.filter((l) => l.type === "ANNUAL").length / away.length : 0} to="/hr?tab=onleave" />
      <Stat label="Sick" value={away.filter((l) => l.type === "SICK").length} chart="ring" max={away.length || 1} to="/hr?tab=onleave" />
      <Stat label="Other leave" value={away.filter((l) => l.type !== "ANNUAL" && l.type !== "SICK").length} chart="ring" max={away.length || 1} to="/hr?tab=onleave" />
      <Stat label="Days out" value={away.reduce((s, l) => s + l.days, 0)} chart="spark" series={away.slice(0, 8).map((l) => l.days)} to="/hr?tab=onleave" />
    </StatGrid>
  );
}

function OnLeavePanel() {
  const { data = [] } = useQuery({ queryKey: ["hr-leave"], queryFn: () => api<Leave[]>("/api/hr/leave") });
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const rows = useMemo(() => {
    return data.filter(isOnLeaveNow).filter((l) => {
      const hay = `${l.user.name} ${l.type} ${l.user.department}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (dept && l.user.department !== dept) return false;
      return true;
    });
  }, [data, q, dept]);
  const listing = useListSort(rows, [
    { id: "name", label: "Name A–Z", get: (l) => l.user.name, dir: "asc" },
    { id: "end", label: "Returning soon", get: (l) => l.endDate, dir: "asc" },
  ], "end");
  const page = usePager(listing.sorted, `${q}|${dept}|${listing.sort}`);
  return (
    <>
      <div className="toolbar">
        <input placeholder="Search staff on leave…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button className="btn-ghost" onClick={() => { setQ(""); setDept(""); }}>Clear</button>
      </div>
      <MobileFilters
        title="Filter staff on leave"
        onClear={() => { setQ(""); setDept(""); }}
        fields={[
          {
            kind: "select",
            label: "Department",
            value: dept,
            onChange: setDept,
            options: [{ value: "", label: "All departments" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))],
          },
        ]}
      />
      <Register
        rows={listing.sorted}
        pager={page}
        getId={(l) => l.id}
        empty={{ title: "No staff are on leave today" }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (l) => l.user.name,
          subtitle: (l) => l.user.department,
          status: (l) => <span className="badge bg-sky-100 text-sky-800">On leave</span>,
          fields: [
            { label: "Type", value: (l) => l.type },
            { label: "To", value: (l) => l.endDate.slice(0, 10) },
            { label: "Days left", value: (l) => daysLeft(l), align: "right" },
          ],
        }}
      >
      <div className="table-wrap">
        <table className="invoice">
          <thead>
            <tr>
              <th>Employee</th><th>Department</th><th>Type</th><th>From</th><th>To</th><th>Days left</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={7} label="No staff are on leave today." />}
            {page.slice.map((l) => (
              <tr key={l.id}>
                <td>{l.user.name}</td>
                <td>{l.user.department}</td>
                <td>{l.type}</td>
                <td>{l.startDate.slice(0, 10)}</td>
                <td>{l.endDate.slice(0, 10)}</td>
                <td>{daysLeft(l)}</td>
                <td><span className={`badge ${TONE[l.status] || "bg-slate-100"}`}>On leave</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Register>
    </>
  );
}

function LeavePanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = canModule(user, "hr");
  const employees = useQuery({ queryKey: ["hr-employees"], queryFn: () => api<Employee[]>("/api/hr/employees"), enabled: admin });
  const { data = [] } = useQuery({ queryKey: ["hr-leave"], queryFn: () => api<Leave[]>("/api/hr/leave") });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [leaveUserId, setLeaveUserId] = useState("");
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const employeeOptions = useMemo(
    () => mapSelectOptions(employees.data || [], (p) => p.id, (p) => p.name),
    [employees.data],
  );
  const rows = useMemo(
    () => data.filter((l) => `${l.user.name} ${l.type} ${l.reason || ""}`.toLowerCase().includes(q.toLowerCase()) && (!status || l.status === status)),
    [data, q, status]
  );
  const pager = usePager(rows, `${q}|${status}`);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/hr/leave", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-leave"] });
      setOpen(false);
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) => api(`/api/hr/leave/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-leave"] }),
  });

  return (
    <>
      <div className="toolbar">
        <input placeholder="Search leave…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["PENDING", "APPROVED", "REJECTED"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={() => { setQ(""); setStatus(""); }}>Clear</button>
        <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> Request leave</button>
      </div>
      <MobileFilters
        title="Filter leave"
        onClear={() => { setQ(""); setStatus(""); }}
        fields={[
          {
            kind: "chips",
            label: "Status",
            value: status || "all",
            onChange: (v) => setStatus(v === "all" ? "" : v),
            options: [
              { value: "all", label: "All" },
              ...["PENDING", "APPROVED", "REJECTED"].map((s) => ({ value: s, label: prettyLabel(s) })),
            ],
          },
        ]}
      />
      <Register
        rows={rows}
        pager={pager}
        getId={(l) => l.id}
        empty={{ title: "No leave requests yet — Create one", actionLabel: "Create one", onAction: () => setOpen(true) }}
        mobile={{
          title: (l) => l.user.name,
          subtitle: (l) => l.type,
          status: (l) => <span className={`badge ${TONE[l.status] || "bg-stone-100"}`}>{l.status}</span>,
          fields: [
            { label: "From", value: (l) => l.startDate.slice(0, 10) },
            { label: "To", value: (l) => l.endDate.slice(0, 10) },
            { label: "Days", value: (l) => l.days, align: "right" },
          ],
          details: (l) => [
            { label: "Department", value: l.user.department },
            { label: "Type", value: l.type },
            { label: "From", value: l.startDate.slice(0, 10) },
            { label: "To", value: l.endDate.slice(0, 10) },
            { label: "Days", value: l.days, align: "right" },
            { label: "Status", value: l.status },
          ],
          actions: (l) => admin && l.status === "PENDING" ? (
            <>
              <button className="btn-success" onClick={() => decide.mutate({ id: l.id, decision: "APPROVED" })}>Approve</button>
              <button className="btn-danger" onClick={() => decide.mutate({ id: l.id, decision: "REJECTED" })}>Reject</button>
            </>
          ) : null,
        }}
        action={<button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> Request leave</button>}
      >
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th className="num">Days</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={7} label="No leave requests yet — Create one" actionLabel="Create one" onAction={() => setOpen(true)} />}
            {pager.slice.map((l) => (
              <tr key={l.id}>
                <td>{l.user.name}<div className="text-xs text-stone-500">{l.user.department}</div></td>
                <td>{l.type}</td>
                <td>{l.startDate.slice(0, 10)}</td>
                <td>{l.endDate.slice(0, 10)}</td>
                <td className="num">{l.days}</td>
                <td><span className={`badge ${TONE[l.status] || "bg-stone-100"}`}>{l.status}</span></td>
                <td>
                  {admin && l.status === "PENDING" && (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-success text-xs" onClick={() => decide.mutate({ id: l.id, decision: "APPROVED" })}>Approve</button>
                      <button className="btn-danger text-xs" onClick={() => decide.mutate({ id: l.id, decision: "REJECTED" })}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Register>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save.mutate({
                userId: admin ? leaveUserId : user?.id,
                type: leaveType,
                startDate: fd.get("startDate"),
                endDate: fd.get("endDate"),
                reason: fd.get("reason"),
              });
            }}
          >
            <h2 className="text-xl font-semibold tracking-tight">Request leave</h2>
            {admin ? (
              <div>
                <label>Employee</label>
                <MteSelect
                  aria-label="Employee"
                  value={leaveUserId || user?.id || ""}
                  onChange={setLeaveUserId}
                  allowEmpty={false}
                  options={employeeOptions}
                />
              </div>
            ) : (
              <p className="text-sm text-stone-500">{user?.name}</p>
            )}
            <div>
              <label>Type</label>
              <MteSelect
                aria-label="Leave type"
                value={leaveType}
                onChange={setLeaveType}
                allowEmpty={false}
                options={["ANNUAL", "SICK", "UNPAID", "COMPASSIONATE", "MATERNITY"].map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label>From</label><input name="startDate" type="date" required /></div>
              <div><label>To</label><input name="endDate" type="date" required /></div>
            </div>
            <div><label>Reason</label><textarea name="reason" rows={3} /></div>
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-gold">Submit</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function AdvanceTab() {
  const { data = [] } = useQuery({ queryKey: ["hr-advances"], queryFn: () => api<Advance[]>("/api/hr/advances") });
  return (
    <StatGrid cols={6}>
      <Stat label="Requests" value={data.length} series={data.map((a) => a.amount)} chart="bars" to="/hr?tab=advance" />
      <Stat label="Pending" value={data.filter((a) => a.status === "PENDING").length} chart="ring" max={data.length || 1} to="/hr?tab=advance" />
      <Stat label="Approved" value={money(data.filter((a) => a.status === "APPROVED").reduce((s, a) => s + a.amount, 0))} series={data.filter((a) => a.status === "APPROVED").map((a) => a.amount)} chart="area" to="/hr?tab=advance" />
      <Stat label="Deducted" value={money(data.filter((a) => a.status === "DEDUCTED").reduce((s, a) => s + a.amount, 0))} series={data.filter((a) => a.status === "DEDUCTED").map((a) => a.amount)} chart="spark" to="/hr?tab=advance" />
      <Stat label="Rejected" value={data.filter((a) => a.status === "REJECTED").length} chart="ring" max={data.length || 1} to="/hr?tab=advance" />
      <Stat label="Pending amount" value={money(data.filter((a) => a.status === "PENDING").reduce((s, a) => s + a.amount, 0))} chart="bars" series={data.filter((a) => a.status === "PENDING").map((a) => a.amount)} to="/hr?tab=advance" />
    </StatGrid>
  );
}

function AdvancePanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = canModule(user, "hr");
  const employees = useQuery({ queryKey: ["hr-employees"], queryFn: () => api<Employee[]>("/api/hr/employees"), enabled: admin });
  const { data = [] } = useQuery({ queryKey: ["hr-advances"], queryFn: () => api<Advance[]>("/api/hr/advances") });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [advanceUserId, setAdvanceUserId] = useState("");
  const [advanceMonth, setAdvanceMonth] = useState(String(new Date().getMonth() + 1));
  const employeeOptions = useMemo(
    () => mapSelectOptions(employees.data || [], (p) => p.id, (p) => p.name),
    [employees.data],
  );
  const now = new Date();
  const rows = useMemo(
    () => data.filter((a) => `${a.user.name} ${a.reason || ""}`.toLowerCase().includes(q.toLowerCase()) && (!status || a.status === status)),
    [data, q, status]
  );
  const pager = usePager(rows, `${q}|${status}`);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/hr/advances", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-advances"] });
      setOpen(false);
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) => api(`/api/hr/advances/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-advances"] }),
  });

  return (
    <>
      <div className="toolbar">
        <input placeholder="Search advances…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["PENDING", "APPROVED", "REJECTED", "DEDUCTED"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={() => { setQ(""); setStatus(""); }}>Clear</button>
        <button className="btn-gold" onClick={() => setOpen(true)}><Plus size={16} /> Request advance</button>
      </div>
      <MobileFilters
        title="Filter advances"
        onClear={() => { setQ(""); setStatus(""); }}
        fields={[
          {
            kind: "chips",
            label: "Status",
            value: status || "all",
            onChange: (v) => setStatus(v === "all" ? "" : v),
            options: [
              { value: "all", label: "All" },
              ...["PENDING", "APPROVED", "REJECTED", "DEDUCTED"].map((s) => ({ value: s, label: prettyLabel(s) })),
            ],
          },
        ]}
      />
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Employee</th><th>Amount</th><th>Recover in</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} label="No salary advances." />}
            {pager.slice.map((a) => (
              <tr key={a.id}>
                <td>{a.user.name}<div className="text-xs text-stone-500">{a.user.department}</div></td>
                <td>{money(a.amount)}</td>
                <td>{String(a.month).padStart(2, "0")}/{a.year}</td>
                <td className="cell-wrap">{a.reason || "—"}</td>
                <td><span className={`badge ${TONE[a.status] || "bg-stone-100"}`}>{a.status}</span></td>
                <td>
                  {admin && a.status === "PENDING" && (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-success text-xs" onClick={() => decide.mutate({ id: a.id, decision: "APPROVED" })}>Approve</button>
                      <button className="btn-danger text-xs" onClick={() => decide.mutate({ id: a.id, decision: "REJECTED" })}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save.mutate({
                userId: admin ? advanceUserId : user?.id,
                amount: Number(fd.get("amount")),
                year: Number(fd.get("year")),
                month: Number(advanceMonth),
                reason: fd.get("reason"),
              });
            }}
          >
            <h2 className="text-xl font-semibold tracking-tight">Request salary advance</h2>
            {admin ? (
              <div>
                <label>Employee</label>
                <MteSelect
                  aria-label="Employee"
                  value={advanceUserId || user?.id || ""}
                  onChange={setAdvanceUserId}
                  allowEmpty={false}
                  options={employeeOptions}
                />
              </div>
            ) : (
              <p className="text-sm text-stone-500">{user?.name}</p>
            )}
            <div><label>Amount</label><input name="amount" type="number" min="1" required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label>Recover month</label>
                <MteSelect
                  aria-label="Recover month"
                  value={advanceMonth}
                  onChange={setAdvanceMonth}
                  allowEmpty={false}
                  options={Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    return { value: String(m), label: new Date(2000, i, 1).toLocaleString("en-GB", { month: "long" }) };
                  })}
                />
              </div>
              <div><label>Year</label><input name="year" type="number" defaultValue={now.getFullYear()} required /></div>
            </div>
            <div><label>Reason</label><textarea name="reason" rows={3} /></div>
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-gold">Submit</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function AttendanceTab() {
  const today = new Date().toISOString().slice(0, 10);
  const { data = [] } = useQuery({ queryKey: ["hr-attendance", today, today], queryFn: () => api<Punch[]>(`/api/hr/attendance?from=${today}&to=${today}`) });
  return (
    <StatGrid cols={6}>
      <Stat label="Today" value={data.length} series={[data.filter((a) => a.status === "PRESENT").length, data.filter((a) => a.status === "LATE").length, data.filter((a) => a.status === "ABSENT").length]} chart="bars" to="/hr?tab=attendance" />
      <Stat label="Present" value={data.filter((a) => a.status === "PRESENT" || a.status === "LATE").length} chart="ring" max={data.length || 1} to="/hr?tab=attendance" />
      <Stat label="Late" value={data.filter((a) => a.status === "LATE").length} chart="ring" max={data.length || 1} to="/hr?tab=attendance" />
      <Stat label="Absent" value={data.filter((a) => a.status === "ABSENT").length} chart="ring" max={data.length || 1} to="/hr?tab=attendance" />
      <Stat label="On leave" value={data.filter((a) => a.status === "LEAVE").length} chart="ring" max={data.length || 1} to="/hr?tab=attendance" />
      <Stat label="Checked in" value={data.filter((a) => a.checkIn).length} chart="meter" share={data.length ? data.filter((a) => a.checkIn).length / data.length : 0} to="/hr?tab=attendance" />
    </StatGrid>
  );
}

function AttendancePanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const att = useQuery({ queryKey: ["hr-attendance", from, to], queryFn: () => api<Punch[]>(`/api/hr/attendance?from=${from}&to=${to}`) });
  const rows = useMemo(
    () => (att.data || []).filter((a) => `${a.user.name} ${a.status}`.toLowerCase().includes(q.toLowerCase())),
    [att.data, q]
  );
  const pager = usePager(rows, `${from}|${to}|${q}`);
  const punch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/hr/attendance", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-attendance"] }),
  });

  return (
    <>
      <div className="toolbar">
        <input placeholder="Search attendance…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn-ghost" onClick={() => { setQ(""); setFrom(today); setTo(today); }}>Clear</button>
        <button className="btn-gold" onClick={() => punch.mutate({ userId: user?.id, status: "PRESENT" })}>Check in / out</button>
      </div>
      <MobileFilters
        title="Filter attendance"
        onClear={() => { setQ(""); setFrom(today); setTo(today); }}
        fields={[
          { kind: "date", label: "From", value: from, onChange: setFrom },
          { kind: "date", label: "To", value: to, onChange: setTo },
        ]}
      />
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Employee</th><th>Date</th><th>In</th><th>Out</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} label="No attendance yet." />}
            {pager.slice.map((a) => (
              <tr key={a.id}>
                <td>{a.user.name}<div className="text-xs text-stone-500">{a.user.department}</div></td>
                <td>{a.date.slice(0, 10)}</td>
                <td>{a.checkIn ? new Date(a.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td>{a.checkOut ? new Date(a.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td><span className={`badge ${TONE[a.status] || "bg-stone-100"}`}>{a.status}</span></td>
                <td>
                  <select className="w-auto" defaultValue={a.status} onChange={(e) => punch.mutate({ userId: a.user.id, date: a.date.slice(0, 10), status: e.target.value })}>
                    {["PRESENT", "LATE", "ABSENT", "LEAVE"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} />
    </>
  );
}

function PayrollTab() {
  const runs = useQuery({ queryKey: ["payroll"], queryFn: () => api<any[]>("/api/payroll") });
  const list = runs.data || [];
  const latest = list[0];
  return (
    <StatGrid cols={6}>
      <Stat label="Runs" value={list.length} series={list.map((r) => (r.lines || []).reduce((s: number, l: any) => s + (l.net || 0), 0))} chart="bars" to="/hr?tab=payroll" />
      <Stat label="Posted" value={list.filter((r) => r.status === "POSTED").length} chart="ring" max={list.length || 1} to="/hr?tab=payroll" />
      <Stat label="Latest" value={latest?.number || "—"} to="/hr?tab=payroll" />
      <Stat label="Latest net" value={money(latest?.lines?.reduce((s: number, l: any) => s + l.net, 0))} series={(latest?.lines || []).map((l: any) => l.net)} chart="area" to="/hr?tab=payroll" />
      <Stat label="Draft runs" value={list.filter((r) => r.status !== "POSTED").length} chart="ring" max={list.length || 1} to="/hr?tab=payroll" />
      <Stat label="Staff paid" value={latest?.lines?.length || 0} chart="ring" max={Math.max(latest?.lines?.length || 0, 1)} to="/hr?tab=payroll" />
    </StatGrid>
  );
}

function PayrollPanel() {
  const qc = useQueryClient();
  const runs = useQuery({ queryKey: ["payroll"], queryFn: () => api<any[]>("/api/payroll") });
  const create = useMutation({
    mutationFn: () => {
      const now = new Date();
      return api("/api/payroll", { method: "POST", body: JSON.stringify({ year: now.getFullYear(), month: now.getMonth() + 1 }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["hr-advances"] });
    },
  });
  const post = useMutation({
    mutationFn: (id: string) => api(`/api/payroll/${id}/post`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["journals"] });
    },
  });
  const list = runs.data || [];

  return (
    <>
      <div className="toolbar">
        <button className="btn-gold" disabled={create.isPending} onClick={() => create.mutate()}>New month</button>
      </div>
      {(create.error || post.error) && <p className="text-sm text-red-600">{((create.error || post.error) as Error).message}</p>}
      {list.map((run) => (
        <div key={run.id} className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{run.number}</div>
              <span className={`badge ${TONE[run.status] || "bg-stone-100"}`}>{run.status}</span>
            </div>
            {run.status === "DRAFT" && (
              <button className="btn-success" disabled={post.isPending} onClick={() => post.mutate(run.id)}>Post payroll</button>
            )}
          </div>
          <div className="table-wrap">
            <table className="invoice">
              <thead><tr><th>Employee</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>PAYE</th><th>Net</th></tr></thead>
              <tbody>
                {run.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td>{l.user?.name}</td>
                    <td>{money(l.basic)}</td>
                    <td>{money(l.allowances)}</td>
                    <td>{money(l.deductions)}</td>
                    <td>{money(l.paye)}</td>
                    <td>{money(l.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {list.length === 0 && <p className="text-sm text-stone-500">No payroll runs yet.</p>}
    </>
  );
}

export { HR as Payroll };
