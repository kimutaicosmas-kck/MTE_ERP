import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";

export function Vendors() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => api<any[]>("/api/vendors") });
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/vendors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setOpen(false);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Sourcing</p>
          <h1 className="font-serif text-4xl">Vendors</h1>
        </div>
        <button className="btn-gold" onClick={() => setOpen(true)}>New vendor</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((v) => (
          <div key={v.id} className="card">
            <div className="font-semibold">{v.name} {v.oem && <span className="badge bg-gold/20">OEM</span>}</div>
            <div className="text-sm text-stone-500">{v.phone || "No phone"} · lead time {v.leadDays} days</div>
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 grid place-items-center bg-black/40 p-4">
          <form
            className="card w-full max-w-md space-y-3"
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
            <h2 className="font-serif text-2xl">New vendor</h2>
            <input name="name" placeholder="Name" required />
            <input name="phone" placeholder="Phone" />
            <input name="leadDays" type="number" placeholder="Lead days" defaultValue={7} />
            <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal">
              <input name="oem" type="checkbox" className="w-auto" /> OEM supplier
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
