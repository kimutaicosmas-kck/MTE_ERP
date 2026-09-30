import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, money } from "../lib/api";

export function Customers() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["customers"], queryFn: () => api<any[]>("/api/customers") });
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/customers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-between">
        <h1 className="font-serif text-4xl">Customers</h1>
        <button className="btn-gold" onClick={() => setOpen(true)}>New customer</button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Phone</th><th>PIN</th><th>Terms</th><th>Credit</th><th>Outstanding</th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.kraPin || "—"}</td>
                <td>{c.paymentTerms}</td>
                <td>{money(c.creditLimit)}</td>
                <td>{money(c.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
                kraPin: fd.get("kraPin"),
                creditLimit: Number(fd.get("creditLimit") || 0),
                paymentTerms: fd.get("paymentTerms"),
              });
            }}
          >
            <h2 className="font-serif text-2xl">New customer</h2>
            <input name="name" placeholder="Name" required />
            <input name="phone" placeholder="Phone" />
            <input name="kraPin" placeholder="KRA PIN" />
            <input name="creditLimit" type="number" placeholder="Credit limit" />
            <input name="paymentTerms" placeholder="Terms" defaultValue="COD" />
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
