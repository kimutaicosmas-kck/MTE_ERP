import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, money } from "../lib/api";

export function Staff() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<any[]>("/api/users") });
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: any) => api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Access</p>
          <h1 className="font-serif text-4xl">Staff</h1>
        </div>
        <button className="btn-gold" onClick={() => setOpen(true)}>Add user</button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Role</th><th>Target</th><th>Commission</th><th>Status</th></tr></thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <td>{u.name}<div className="text-xs text-stone-500">{u.email}</div></td>
                <td>{u.role.replace("_", " ")}</td>
                <td>
                  <input
                    className="w-28"
                    type="number"
                    defaultValue={u.monthlyTarget}
                    onBlur={(e) => patch.mutate({ id: u.id, monthlyTarget: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="w-20"
                    type="number"
                    step="0.005"
                    defaultValue={u.commissionRate}
                    onBlur={(e) => patch.mutate({ id: u.id, commissionRate: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button className="btn-ghost text-xs" onClick={() => patch.mutate({ id: u.id, active: !u.active })}>
                    {u.active ? "Active" : "Off"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">Targets are monthly revenue. Commission is a decimal (0.04 = 4%). {money(0)} shown on Sales uses these rates.</p>
      {open && (
        <div className="fixed inset-0 grid place-items-center bg-black/40 p-4">
          <form
            className="card w-full max-w-md space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              save.mutate({
                name: fd.get("name"),
                email: fd.get("email"),
                password: fd.get("password"),
                role: fd.get("role"),
                monthlyTarget: Number(fd.get("monthlyTarget") || 0),
                commissionRate: Number(fd.get("commissionRate") || 0.03),
              });
            }}
          >
            <h2 className="font-serif text-2xl">New staff</h2>
            <input name="name" placeholder="Name" required />
            <input name="email" type="email" placeholder="Email" required />
            <input name="password" type="password" placeholder="Password" required />
            <select name="role">
              {["SALES", "WAREHOUSE", "FINANCE", "ADMIN"].map((r) => <option key={r}>{r}</option>)}
            </select>
            <input name="monthlyTarget" type="number" placeholder="Monthly target" />
            <input name="commissionRate" type="number" step="0.005" placeholder="Commission rate" defaultValue="0.03" />
            {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
