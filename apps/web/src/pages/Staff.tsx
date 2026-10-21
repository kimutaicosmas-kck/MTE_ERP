import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ImportButton } from "../components/ImportButton";
import { MobileFilters } from "../components/filters";
import { Register, useListSort } from "../components/register";
import { ConfirmDialog, EmptyRow, Modal, MteSelect, Pager, RowPdf, Stat, StatGrid, useCreateOpen, useQueryState } from "../components/ui";
import { DEPARTMENTS, MODULES, ROLE_MODULES } from "../lib/access";
import { api } from "../lib/api";
import { usePager } from "../lib/pager";

const ROLES = ["SALES", "WAREHOUSE", "FINANCE", "ADMIN"];
const DEPT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }));

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  modules?: string[];
  phone?: string | null;
  salary?: number;
  monthlyTarget: number;
  commissionRate: number;
  jobTitle?: string | null;
  nationalId?: string | null;
  hireDate?: string | null;
  active: boolean;
  branch?: { code: string } | null;
};

function ModuleChecks({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200 p-3 dark:border-white/10">
      {MODULES.map((m) => (
        <label key={m.id} className="flex items-center gap-2 text-xs font-medium normal-case tracking-normal text-ink dark:text-stone-100">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#c4a035]"
            checked={value.includes(m.id)}
            onChange={(e) => {
              onChange(e.target.checked ? [...value, m.id] : value.filter((id) => id !== m.id));
            }}
          />
          {m.label}
        </label>
      ))}
    </div>
  );
}

export function EmployeesTab() {
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<StaffUser[]>("/api/users") });
  const active = data.filter((u) => u.active).length;
  const sales = data.filter((u) => u.role === "SALES").length;
  const departments = new Set(data.map((u) => u.department || "Other")).size;
  const admins = data.filter((u) => u.role === "ADMIN" || u.role === "SUPERADMIN").length;
  return (
    <StatGrid cols={6}>
      <Stat label="Employees" value={data.length} series={Object.values(data.reduce<Record<string, number>>((acc, u) => { acc[u.department || "Other"] = (acc[u.department || "Other"] || 0) + 1; return acc; }, {}))} chart="bars" to="/hr?tab=employees" />
      <Stat label="Active" value={active} chart="ring" max={data.length || 1} to="/hr?tab=employees&status=active" />
      <Stat label="Sales employees" value={sales} chart="ring" max={data.length || 1} to="/hr?tab=employees&role=SALES" />
      <Stat label="Inactive" value={data.length - active} chart="ring" max={data.length || 1} to="/hr?tab=employees&status=inactive" />
      <Stat label="Departments" value={departments} chart="spark" series={Object.values(data.reduce<Record<string, number>>((acc, u) => { acc[u.department || "Other"] = (acc[u.department || "Other"] || 0) + 1; return acc; }, {}))} to="/hr?tab=employees" />
      <Stat label="Admins" value={admins} chart="ring" max={data.length || 1} to="/hr?tab=employees" />
    </StatGrid>
  );
}

export function StaffDirectory({ showStats = true }: { showStats?: boolean }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<StaffUser[]>("/api/users") });
  const [open, setOpen] = useCreateOpen();
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useQueryState("status", "");
  const [roleFilter, setRoleFilter] = useQueryState("role", "");
  const [hireFrom, setHireFrom] = useState("");
  const [confirm, setConfirm] = useState<StaffUser | null>(null);
  const [secret, setSecret] = useState("");
  const [role, setRole] = useState("SALES");
  const [department, setDepartment] = useState("Sales");
  const [modules, setModules] = useState<string[]>(ROLE_MODULES.SALES);
  const [editRole, setEditRole] = useState("SALES");
  const [editDept, setEditDept] = useState("Operations");
  const [editModules, setEditModules] = useState<string[]>([]);
  const rows = useMemo(
    () => data.filter((u) => {
      const hay = `${u.name} ${u.email} ${u.role} ${u.department || ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (dept && (u.department || "") !== dept) return false;
      if (status === "active" && !u.active) return false;
      if (status === "inactive" && u.active) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (hireFrom && (!u.hireDate || u.hireDate.slice(0, 10) < hireFrom)) return false;
      return true;
    }),
    [data, q, dept, status, hireFrom, roleFilter]
  );
  const listing = useListSort(rows, [
    { id: "name", label: "Name A–Z", get: (u) => u.name, dir: "asc" },
    { id: "dept", label: "Department", get: (u) => u.department || "", dir: "asc" },
  ], "name");
  const pager = usePager(listing.sorted, `${q}|${dept}|${status}|${listing.sort}`);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      setOpen(false);
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: any) => api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      setEditing(null);
    },
  });

  function openCreate() {
    setRole("SALES");
    setDepartment("Sales");
    setModules(ROLE_MODULES.SALES);
    setOpen(true);
  }

  function openEdit(u: StaffUser) {
    setEditing(u);
    setEditRole(u.role);
    setEditDept(u.department || "Operations");
    setEditModules(u.modules?.length ? u.modules : ROLE_MODULES[u.role] || ROLE_MODULES.SALES);
  }

  const filtersActive = Boolean(q || dept || status || roleFilter || hireFrom);

  return (
    <div className="space-y-4">
      {showStats && <EmployeesTab />}
      <section className="suite-panel suite-panel-table module-list-suite overflow-hidden">
        <div className="module-list-toolbar">
          <label className="module-search-field">
            <Search size={17} className="module-search-icon" aria-hidden />
            <input className="min-w-0 flex-1" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <MobileFilters
        title="Filter employees"
        onClear={() => { setQ(""); setDept(""); setStatus(""); setRoleFilter(""); setHireFrom(""); }}
        fields={[
          {
            kind: "select",
            label: "Department",
            value: dept,
            onChange: setDept,
            options: [{ value: "", label: "All departments" }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))],
          },
          {
            kind: "chips",
            label: "Status",
            value: status || "all",
            onChange: (v) => setStatus(v === "all" ? "" : v),
            options: [
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
          { kind: "date", label: "Joined from", value: hireFrom, onChange: setHireFrom },
        ]}
          />
          <div className="module-toolbar-bottom">
            <div className={`module-filter-group ${filtersActive ? "module-filter-group-active" : ""}`}>
              <span className="module-filter-group-label">Filters</span>
              <div className="module-filter-controls">
                <select className="module-select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
                  <option value="">All departments</option>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
                <select className="module-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <input type="date" className="module-select w-auto" value={hireFrom} onChange={(e) => setHireFrom(e.target.value)} title="Joined from" />
                <button type="button" className="module-filter-reset" disabled={!filtersActive} onClick={() => { setQ(""); setDept(""); setStatus(""); setRoleFilter(""); setHireFrom(""); }}>
                  Reset
                </button>
              </div>
            </div>
            <div className="module-toolbar-actions">
              <ImportButton kind="users" />
              <button type="button" className="btn-gold module-btn-sm" onClick={openCreate}><Plus size={16} /> Add employee</button>
            </div>
          </div>
        </div>
      <Register
        rows={listing.sorted}
        pager={pager}
        getId={(u) => u.id}
        onOpen={(u) => { if (u.role !== "SUPER_ADMIN") openEdit(u); }}
        empty={{ title: "No employees yet — Create one", actionLabel: "Create one", onAction: openCreate }}
        sort={{ value: listing.sort, onChange: listing.setSort, options: listing.options }}
        mobile={{
          title: (u) => u.name,
          subtitle: (u) => u.email,
          status: (u) => <span className={`badge ${u.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{u.active ? "Active" : "Off"}</span>,
          fields: [
            { label: "Department", value: (u) => u.department || "—" },
            { label: "Role", value: (u) => u.role.replace("_", " ") },
          ],
          details: (u) => [
            { label: "Email", value: u.email },
            { label: "Department", value: u.department || "—" },
            { label: "Role", value: u.role.replace("_", " ") },
            { label: "Salary", value: u.salary || 0, align: "right" },
            { label: "Status", value: u.active ? "Active" : "Off" },
          ],
        }}
        action={<button className="btn-gold" onClick={openCreate}><Plus size={16} /> Add employee</button>}
      >
      <div className="table-wrap">
        <table className="invoice min-w-[78rem]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Role</th>
              <th>Modules</th>
              <th className="num">Salary</th>
              <th className="num">Target</th>
              <th className="num">Commission</th>
              <th>Status</th>
              <th>Access</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {listing.sorted.length === 0 && <EmptyRow cols={10} label="No employees yet — Create one" actionLabel="Create one" onAction={openCreate} />}
            {pager.slice.map((u) => {
              const moduleLabels = (u.modules || []).map((id) => MODULES.find((m) => m.id === id)?.label || id);
              const shown = moduleLabels.slice(0, 3);
              const extra = moduleLabels.length - shown.length;
              return (
              <tr key={u.id}>
                <td>{u.name}<div className="text-xs text-stone-500">{u.email}</div></td>
                <td>{u.department || "—"}</td>
                <td>{u.role.replace("_", " ")}{u.branch ? <div className="text-xs text-stone-500">{u.branch.code}</div> : null}</td>
                <td className="cell-wrap">
                  {moduleLabels.length === 0 ? (
                    <span className="text-xs text-stone-400">Role default</span>
                  ) : (
                    <div className="flex flex-wrap gap-1" title={moduleLabels.join(", ")}>
                      {shown.map((label) => (
                        <span key={label} className="badge bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-200">{label}</span>
                      ))}
                      {extra > 0 && <span className="text-xs text-stone-400">+{extra}</span>}
                    </div>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={u.salary || 0}
                    onBlur={(e) => patch.mutate({ id: u.id, salary: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={u.monthlyTarget}
                    onBlur={(e) => patch.mutate({ id: u.id, monthlyTarget: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.005"
                    defaultValue={u.commissionRate}
                    onBlur={(e) => patch.mutate({ id: u.id, commissionRate: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button
                    className={`${u.active ? "btn-danger" : "btn-success"} px-2.5 py-1 text-xs`}
                    onClick={() => (u.active ? setConfirm(u) : patch.mutate({ id: u.id, active: true }))}
                  >
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
                <td>
                  <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => openEdit(u)} disabled={u.role === "SUPER_ADMIN"}>
                    <Pencil size={14} /> Edit
                  </button>
                </td>
                <td>
                  <RowPdf
                    title={`Employee ${u.name}`}
                    fields={[
                      ["Name", u.name],
                      ["Email", u.email],
                      ["Department", u.department || "—"],
                      ["Role", u.role.replace("_", " ")],
                      ["Modules", moduleLabels.join(", ")],
                      ["Target", String(u.monthlyTarget)],
                      ["Commission", String(u.commissionRate)],
                      ["Status", u.active ? "Active" : "Off"],
                    ]}
                  />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Register>
      </section>
      {open && (
        <Modal onClose={() => setOpen(false)} className="max-w-xl">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save.mutate({
                name: fd.get("name"),
                email: fd.get("email"),
                password: fd.get("password"),
                phone: fd.get("phone"),
                role,
                department,
                modules,
                jobTitle: fd.get("jobTitle"),
                hireDate: fd.get("hireDate") || null,
                monthlyTarget: Number(fd.get("monthlyTarget") || 0),
                commissionRate: Number(fd.get("commissionRate") || 0.03),
                salary: Number(fd.get("salary") || 0),
              });
            }}
          >
            <h2 className="text-xl font-semibold tracking-tight">New employee</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label>Name</label><input name="name" required /></div>
              <div><label>Email</label><input name="email" type="email" required /></div>
              <div><label>Password</label><input name="password" type="password" required /></div>
              <div><label>Phone</label><input name="phone" /></div>
              <div>
                <label>Department</label>
                <MteSelect aria-label="Department" value={department} onChange={setDepartment} allowEmpty={false} options={DEPT_OPTIONS} />
              </div>
              <div>
                <label>Role</label>
                <MteSelect
                  aria-label="Role"
                  value={role}
                  onChange={(next) => {
                    setRole(next);
                    setModules(ROLE_MODULES[next] || ROLE_MODULES.SALES);
                  }}
                  allowEmpty={false}
                  options={ROLE_OPTIONS}
                />
              </div>
              <div><label>Job title</label><input name="jobTitle" /></div>
              <div><label>Hire date</label><input name="hireDate" type="date" /></div>
              <div><label>Monthly salary</label><input name="salary" type="number" /></div>
              <div><label>Monthly target</label><input name="monthlyTarget" type="number" /></div>
              <div className="sm:col-span-2"><label>Commission rate</label><input name="commissionRate" type="number" step="0.005" defaultValue="0.03" /></div>
            </div>
            <div>
              <label>Module access</label>
              <ModuleChecks value={modules} onChange={setModules} />
            </div>
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-gold">Create</button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)} className="max-w-xl">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              patch.mutate({
                id: editing.id,
                role: editRole,
                department: editDept,
                modules: editModules,
                jobTitle: fd.get("jobTitle"),
                nationalId: fd.get("nationalId"),
                hireDate: fd.get("hireDate") || null,
                phone: fd.get("phone"),
              });
            }}
          >
            <h2 className="text-xl font-semibold tracking-tight">Employee · {editing.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label>Job title</label><input name="jobTitle" defaultValue={editing.jobTitle || ""} /></div>
              <div><label>National ID</label><input name="nationalId" defaultValue={editing.nationalId || ""} /></div>
              <div><label>Hire date</label><input name="hireDate" type="date" defaultValue={editing.hireDate ? editing.hireDate.slice(0, 10) : ""} /></div>
              <div><label>Phone</label><input name="phone" defaultValue={editing.phone || ""} /></div>
              <div>
                <label>Department</label>
                <MteSelect aria-label="Department" value={editDept} onChange={setEditDept} allowEmpty={false} options={DEPT_OPTIONS} />
              </div>
              <div>
                <label>Role</label>
                <MteSelect
                  aria-label="Role"
                  value={editRole}
                  onChange={(next) => {
                    setEditRole(next);
                    setEditModules(ROLE_MODULES[next] || ROLE_MODULES.SALES);
                  }}
                  allowEmpty={false}
                  options={ROLE_OPTIONS}
                />
              </div>
            </div>
            <div>
              <label>Module access</label>
              <ModuleChecks value={editModules} onChange={setEditModules} />
            </div>
            {patch.error && <p className="text-sm text-red-600">{(patch.error as Error).message}</p>}
            <EmployeeFiles userId={editing.id} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={async () => {
                  const res = await api<{ code: string }>("/api/users/" + editing.id + "/reset-code", { method: "POST", body: "{}" });
                  setSecret(`Reset code ${res.code} · valid 30 minutes`);
                }}
              >
                Issue reset code
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={async () => {
                  const res = await api<{ password: string }>("/api/users/" + editing.id + "/temp-password", { method: "POST", body: "{}" });
                  setSecret(`Temporary password: ${res.password}`);
                }}
              >
                Set temporary password
              </button>
            </div>
            {secret && <p className="text-sm text-emerald-700">{secret}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setSecret(""); }}>Cancel</button>
              <button className="btn-gold">Save employee</button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <ConfirmDialog
          title="Deactivate employee"
          body={`${confirm.name} will no longer be able to sign in. You can activate them again later.`}
          confirmLabel="Deactivate"
          danger
          busy={patch.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            patch.mutate({ id: confirm.id, active: false });
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

type EmpFile = { id: string; name: string; kind: string; path: string; version: number; createdAt: string; createdBy?: { name: string } };

function EmployeeFiles({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const files = useQuery({ queryKey: ["hr-files", userId], queryFn: () => api<EmpFile[]>(`/api/hr/employees/${userId}/files`) });
  const upload = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/api/hr/employees/${userId}/files`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-files", userId] }),
  });
  return (
    <div className="space-y-2 rounded-xl border border-stone-200 p-3 dark:border-white/10">
      <label>Documents</label>
      {(files.data || []).map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{f.name} <span className="text-xs text-stone-400">v{f.version} · {f.kind}</span></span>
          <a className="text-xs text-gold" href={f.path} target="_blank" rel="noreferrer">Preview</a>
        </div>
      ))}
      {!(files.data || []).length && <p className="text-xs text-stone-500">Contracts, IDs, and certificates go here.</p>}
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const kind = /id|national/i.test(file.name) ? "ID" : /cert/i.test(file.name) ? "CERTIFICATE" : /contract/i.test(file.name) ? "CONTRACT" : "OTHER";
            upload.mutate({ name: file.name, mime: file.type, kind, data: String(reader.result) });
          };
          reader.readAsDataURL(file);
        }}
      />
      {upload.error && <p className="text-xs text-red-600">{(upload.error as Error).message}</p>}
    </div>
  );
}
