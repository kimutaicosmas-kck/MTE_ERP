import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyRow, Modal, PageHeader, Pager, Stat, StatGrid, Tabs } from "../components/ui";
import { canModule, DEPARTMENTS } from "../lib/access";
import { api, money } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePager } from "../lib/pager";
import { StaffDirectory } from "./Staff";

type Tab = "people" | "leave" | "advance" | "attendance" | "payroll";
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
  const [tab, setTab] = useState<Tab>(admin ? "people" : "leave");
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Human resources" title="HR" />
      {tab === "leave" && <LeaveTab />}
      {tab === "advance" && <AdvanceTab />}
      {tab === "attendance" && admin && <AttendanceTab />}
      {tab === "payroll" && admin && <PayrollTab />}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ...(admin ? [{ id: "people" as const, label: "Staff" }] : []),
          { id: "leave", label: "Leave" },
          { id: "advance", label: "Salary advance" },
          ...(admin ? [
            { id: "attendance" as const, label: "Attendance" },
            { id: "payroll" as const, label: "Payroll" },
          ] : []),
        ]}
      />
      {tab === "people" && admin && <StaffDirectory />}
      {tab === "leave" && <LeavePanel />}
      {tab === "advance" && <AdvancePanel />}
      {tab === "attendance" && admin && <AttendancePanel />}
      {tab === "payroll" && admin && <PayrollPanel />}
    </div>
  );
}

function LeaveTab() {
  const { data = [] } = useQuery({ queryKey: ["hr-leave"], queryFn: () => api<Leave[]>("/api/hr/leave") });
  return (
    <StatGrid>
      <Stat label="Requests" value={data.length} />
      <Stat label="Pending" value={data.filter((l) => l.status === "PENDING").length} />
      <Stat label="Approved" value={data.filter((l) => l.status === "APPROVED").length} />
      <Stat label="Days pending" value={data.filter((l) => l.status === "PENDING").reduce((s, l) => s + l.days, 0)} />
    </StatGrid>
  );
}

function LeavePanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = canModule(user, "hr");
  const people = useQuery({ queryKey: ["hr-people"], queryFn: () => api<Person[]>("/api/hr/people"), enabled: admin });
  const { data = [] } = useQuery({ queryKey: ["hr-leave"], queryFn: () => api<Leave[]>("/api/hr/leave") });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const rows = useMemo(
    () => data.filter((l) => `${l.user.name} ${l.type} ${l.reason || ""}`.toLowerCase().includes(q.toLowerCase()) && (!status || l.status === status)),
    [data, q, status]
  );
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
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={7} label="No leave requests." />}
            {rows.map((l) => (
              <tr key={l.id}>
                <td>{l.user.name}<div className="text-xs text-stone-500">{l.user.department}</div></td>
                <td>{l.type}</td>
                <td>{l.startDate.slice(0, 10)}</td>
                <td>{l.endDate.slice(0, 10)}</td>
                <td>{l.days}</td>
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
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save.mutate({
                userId: fd.get("userId") || user?.id,
                type: fd.get("type"),
                startDate: fd.get("startDate"),
                endDate: fd.get("endDate"),
                reason: fd.get("reason"),
              });
            }}
          >
            <h2 className="font-serif text-2xl">Request leave</h2>
            {admin ? (
              <div>
                <label>Employee</label>
                <select name="userId" defaultValue={user?.id}>
                  {(people.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-sm text-stone-500">{user?.name}</p>
            )}
            <div>
              <label>Type</label>
              <select name="type">{["ANNUAL", "SICK", "UNPAID", "COMPASSIONATE", "MATERNITY"].map((t) => <option key={t}>{t}</option>)}</select>
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
    <StatGrid>
      <Stat label="Requests" value={data.length} />
      <Stat label="Pending" value={data.filter((a) => a.status === "PENDING").length} />
      <Stat label="Approved" value={money(data.filter((a) => a.status === "APPROVED").reduce((s, a) => s + a.amount, 0))} />
      <Stat label="Deducted" value={money(data.filter((a) => a.status === "DEDUCTED").reduce((s, a) => s + a.amount, 0))} />
    </StatGrid>
  );
}

function AdvancePanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = canModule(user, "hr");
  const people = useQuery({ queryKey: ["hr-people"], queryFn: () => api<Person[]>("/api/hr/people"), enabled: admin });
  const { data = [] } = useQuery({ queryKey: ["hr-advances"], queryFn: () => api<Advance[]>("/api/hr/advances") });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const now = new Date();
  const rows = useMemo(
    () => data.filter((a) => `${a.user.name} ${a.reason || ""}`.toLowerCase().includes(q.toLowerCase()) && (!status || a.status === status)),
    [data, q, status]
  );
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
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Staff</th><th>Amount</th><th>Recover in</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} label="No salary advances." />}
            {rows.map((a) => (
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
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save.mutate({
                userId: fd.get("userId") || user?.id,
                amount: Number(fd.get("amount")),
                year: Number(fd.get("year")),
                month: Number(fd.get("month")),
                reason: fd.get("reason"),
              });
            }}
          >
            <h2 className="font-serif text-2xl">Request salary advance</h2>
            {admin ? (
              <div>
                <label>Employee</label>
                <select name="userId" defaultValue={user?.id}>
                  {(people.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-sm text-stone-500">{user?.name}</p>
            )}
            <div><label>Amount</label><input name="amount" type="number" min="1" required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label>Recover month</label>
                <select name="month" defaultValue={now.getMonth() + 1}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
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
    <StatGrid>
      <Stat label="Today" value={data.length} />
      <Stat label="Present" value={data.filter((a) => a.status === "PRESENT" || a.status === "LATE").length} />
      <Stat label="Late" value={data.filter((a) => a.status === "LATE").length} />
      <Stat label="Absent" value={data.filter((a) => a.status === "ABSENT").length} />
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
      <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Staff</th><th>Date</th><th>In</th><th>Out</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} label="No attendance yet." />}
            {rows.map((a) => (
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
    </>
  );
}

function PayrollTab() {
  const runs = useQuery({ queryKey: ["payroll"], queryFn: () => api<any[]>("/api/payroll") });
  const list = runs.data || [];
  const latest = list[0];
  return (
    <StatGrid>
      <Stat label="Runs" value={list.length} />
      <Stat label="Posted" value={list.filter((r) => r.status === "POSTED").length} />
      <Stat label="Latest" value={latest?.number || "—"} />
      <Stat label="Latest net" value={money(latest?.lines?.reduce((s: number, l: any) => s + l.net, 0))} />
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
              <thead><tr><th>Staff</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>PAYE</th><th>Net</th></tr></thead>
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
