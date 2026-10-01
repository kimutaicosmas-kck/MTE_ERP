import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ImportButton } from "../components/ImportButton";
import { EmptyRow, Modal, Pager, RowPdf, Stat, StatGrid, useCreateOpen } from "../components/ui";
import { DEPARTMENTS, MODULES, ROLE_MODULES } from "../lib/access";
import { api } from "../lib/api";
import { usePager } from "../lib/pager";

const ROLES = ["SALES", "WAREHOUSE", "FINANCE", "ADMIN"];

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

export function StaffDirectory() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<StaffUser[]>("/api/users") });
  const [open, setOpen] = useCreateOpen();
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("SALES");
  const [department, setDepartment] = useState("Sales");
  const [modules, setModules] = useState<string[]>(ROLE_MODULES.SALES);
  const [editRole, setEditRole] = useState("SALES");
  const [editDept, setEditDept] = useState("Operations");
  const [editModules, setEditModules] = useState<string[]>([]);
  const rows = useMemo(
    () => data.filter((u) => `${u.name} ${u.email} ${u.role} ${u.department || ""}`.toLowerCase().includes(q.toLowerCase())),
    [data, q]
  );
  const pager = usePager(rows, q);
  const active = data.filter((u) => u.active).length;
  const sales = data.filter((u) => u.role === "SALES").length;
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["hr-people"] });
      setOpen(false);
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: any) => api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["hr-people"] });
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

  return (
    <div className="space-y-5">
      <StatGrid>
        <Stat label="Staff" value={data.length} />
        <Stat label="Active" value={active} />
        <Stat label="Sales people" value={sales} />
        <Stat label="Inactive" value={data.length - active} />
      </StatGrid>
      <div className="toolbar">
        <input className="min-w-[220px] flex-1" placeholder="Search staff…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => setQ("")}>Clear</button>
        <ImportButton kind="users" />
        <button className="btn-gold" onClick={openCreate}><Plus size={16} /> Add user</button>
      </div>
      <div className="table-wrap">
        <table className="invoice min-w-[78rem]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Role</th>
              <th>Modules</th>
              <th>Salary</th>
              <th>Target</th>
              <th>Commission</th>
              <th>Status</th>
              <th>Access</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={10} label="No staff match." />}
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
                    onClick={() => patch.mutate({ id: u.id, active: !u.active })}
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
                    title={`Staff ${u.name}`}
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
      <Pager {...pager} />
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
            <h2 className="font-serif text-2xl">New staff</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label>Name</label><input name="name" required /></div>
              <div><label>Email</label><input name="email" type="email" required /></div>
              <div><label>Password</label><input name="password" type="password" required /></div>
              <div><label>Phone</label><input name="phone" /></div>
              <div>
                <label>Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label>Role</label>
                <select
                  value={role}
                  onChange={(e) => {
                    const next = e.target.value;
                    setRole(next);
                    setModules(ROLE_MODULES[next] || ROLE_MODULES.SALES);
                  }}
                >
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
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
            <h2 className="font-serif text-2xl">Staff · {editing.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label>Job title</label><input name="jobTitle" defaultValue={editing.jobTitle || ""} /></div>
              <div><label>National ID</label><input name="nationalId" defaultValue={editing.nationalId || ""} /></div>
              <div><label>Hire date</label><input name="hireDate" type="date" defaultValue={editing.hireDate ? editing.hireDate.slice(0, 10) : ""} /></div>
              <div><label>Phone</label><input name="phone" defaultValue={editing.phone || ""} /></div>
              <div>
                <label>Department</label>
                <select value={editDept} onChange={(e) => setEditDept(e.target.value)}>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label>Role</label>
                <select
                  value={editRole}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditRole(next);
                    setEditModules(ROLE_MODULES[next] || ROLE_MODULES.SALES);
                  }}
                >
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label>Module access</label>
              <ModuleChecks value={editModules} onChange={setEditModules} />
            </div>
            {patch.error && <p className="text-sm text-red-600">{(patch.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-gold">Save staff</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
