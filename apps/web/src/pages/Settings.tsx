import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, Tabs } from "../components/ui";
import { canModule } from "../lib/access";
import { api, getToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AccountPanel } from "./Profile";

export function Settings() {
  const { user } = useAuth();
  const admin = canModule(user, "settings");
  const [tab, setTab] = useState<"profile" | "company">(admin ? "company" : "profile");

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={admin ? "Company" : "Account"} title="Settings" />
      {admin ? (
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: "company", label: "Company" },
            { id: "profile", label: "My profile" },
          ]}
        />
      ) : null}
      {admin && tab === "company" ? <CompanySettings /> : <AccountPanel />}
    </div>
  );
}

function CompanySettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api<any>("/api/settings") });
  const [form, setForm] = useState<any>(null);
  const current = form || data || {};
  const save = useMutation({
    mutationFn: () => api("/api/settings", { method: "PATCH", body: JSON.stringify(current) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
  const addBranch = useMutation({
    mutationFn: (body: Record<string, string>) => api("/api/settings/branches", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  async function downloadBackup() {
    const token = getToken();
    const res = await fetch("/api/system/backup", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error("Backup failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mte-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function set(k: string, v: unknown) {
    setForm({ ...current, [k]: v });
  }

  return (
    <>
      <div className="card grid gap-3 sm:grid-cols-2">
        {([
          ["companyName", "Company name"],
          ["legalName", "Legal name"],
          ["address", "Address"],
          ["phone", "Phone"],
          ["email", "Email"],
          ["kraPin", "KRA PIN"],
          ["currency", "Currency"],
          ["invoicePrefix", "Invoice prefix"],
          ["mpesaPaybill", "M-Pesa paybill"],
          ["mpesaAccount", "M-Pesa account"],
        ] as const).map(([k, label]) => (
          <div key={k}>
            <label>{label}</label>
            <input value={current[k] || ""} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
        <div>
          <label>VAT rate</label>
          <input type="number" step="0.01" value={current.vatRate ?? 0.16} onChange={(e) => set("vatRate", Number(e.target.value))} />
        </div>
        <div>
          <label>Default branch</label>
          <select value={current.defaultBranchId || ""} onChange={(e) => set("defaultBranchId", e.target.value)}>
            <option value="">—</option>
            {(data?.branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="sm:col-span-2 flex justify-end">
          <button className="btn-gold" disabled={save.isPending} onClick={() => save.mutate()}>Save company</button>
        </div>
      </div>

      <DarajaSettings data={data} current={current} set={set} />

      <div className="card space-y-3">
        <h2 className="font-semibold">Branches</h2>
        <div className="table-wrap">
        <table className="invoice">
          <thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Status</th></tr></thead>
          <tbody>
            {(data?.branches || []).map((b: any) => (
              <tr key={b.id}>
                <td>{b.code}</td>
                <td>{b.name}</td>
                <td>{b.address || "—"}</td>
                <td>{b.active ? "Active" : "Off"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <form
          className="grid gap-2 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            addBranch.mutate({ code: String(fd.get("code")), name: String(fd.get("name")), address: String(fd.get("address") || "") });
            e.currentTarget.reset();
          }}
        >
          <input name="code" placeholder="Code" required />
          <input name="name" placeholder="Name" required />
          <input name="address" placeholder="Address" />
          <button className="btn-gold">Add branch</button>
        </form>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Backup</h2>
        <button className="btn-ghost" onClick={() => downloadBackup().catch((e) => alert(e.message))}>Download backup</button>
      </div>
    </>
  );
}

function DarajaSettings({ data, current, set }: { data: any; current: any; set: (k: string, v: unknown) => void }) {
  const qc = useQueryClient();
  const status = data?.daraja || {};
  const test = useMutation({
    mutationFn: () => api("/api/mpesa/test", { method: "POST", body: "{}" }),
  });
  const register = useMutation({
    mutationFn: () => api("/api/mpesa/register-c2b", { method: "POST", body: "{}" }),
  });
  const save = useMutation({
    mutationFn: () => api("/api/settings", { method: "PATCH", body: JSON.stringify({
      darajaEnv: current.darajaEnv,
      darajaType: current.darajaType,
      darajaShortcode: current.darajaShortcode,
      darajaCallbackUrl: current.darajaCallbackUrl,
      darajaInitiator: current.darajaInitiator,
      darajaPartyB: current.darajaPartyB,
      darajaConsumerKey: current.darajaConsumerKey,
      darajaConsumerSecret: current.darajaConsumerSecret,
      darajaPasskey: current.darajaPasskey,
      darajaSecurityCredential: current.darajaSecurityCredential,
      mpesaPaybill: current.mpesaPaybill || current.darajaShortcode,
    }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Safaricom Daraja / M-Pesa</h2>
          <p className="text-sm text-stone-500">STK prompts, paybill confirmation, balance, reversal and B2C payouts. Use the live HTTPS site as the callback URL.</p>
        </div>
        <span className={`text-xs font-semibold uppercase ${status.stkReady ? "text-emerald-700" : "text-amber-600"}`}>
          {status.stkReady ? "STK ready" : "Not connected"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label>Environment</label>
          <select value={current.darajaEnv || "sandbox"} onChange={(e) => set("darajaEnv", e.target.value)}>
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div>
          <label>Shortcode type</label>
          <select value={current.darajaType || "PAYBILL"} onChange={(e) => set("darajaType", e.target.value)}>
            <option value="PAYBILL">Paybill</option>
            <option value="TILL">Till / Buy goods</option>
          </select>
        </div>
        <div>
          <label>Business shortcode</label>
          <input value={current.darajaShortcode || ""} onChange={(e) => set("darajaShortcode", e.target.value)} placeholder="Paybill or till" />
        </div>
        <div>
          <label>Till number if different</label>
          <input value={current.darajaPartyB || ""} onChange={(e) => set("darajaPartyB", e.target.value)} placeholder="Optional Party B" />
        </div>
        <div className="sm:col-span-2">
          <label>Public callback URL</label>
          <input
            value={current.darajaCallbackUrl || ""}
            onChange={(e) => set("darajaCallbackUrl", e.target.value)}
            placeholder={typeof window !== "undefined" ? window.location.origin : "https://erp.company.com"}
          />
        </div>
        <div>
          <label>Consumer key {status.consumerKeySet ? "· saved" : ""}</label>
          <input type="password" autoComplete="off" value={current.darajaConsumerKey || ""} onChange={(e) => set("darajaConsumerKey", e.target.value)} placeholder={status.consumerKeySet ? "Leave blank to keep" : ""} />
        </div>
        <div>
          <label>Consumer secret {status.consumerSecretSet ? "· saved" : ""}</label>
          <input type="password" autoComplete="off" value={current.darajaConsumerSecret || ""} onChange={(e) => set("darajaConsumerSecret", e.target.value)} placeholder={status.consumerSecretSet ? "Leave blank to keep" : ""} />
        </div>
        <div className="sm:col-span-2">
          <label>Lipa Na M-Pesa passkey {status.passkeySet ? "· saved" : ""}</label>
          <input type="password" autoComplete="off" value={current.darajaPasskey || ""} onChange={(e) => set("darajaPasskey", e.target.value)} placeholder={status.passkeySet ? "Leave blank to keep" : ""} />
        </div>
        <div>
          <label>Initiator name</label>
          <input value={current.darajaInitiator || ""} onChange={(e) => set("darajaInitiator", e.target.value)} placeholder="For balance, reverse, B2C" />
        </div>
        <div>
          <label>Security credential {status.securityCredentialSet ? "· saved" : ""}</label>
          <input type="password" autoComplete="off" value={current.darajaSecurityCredential || ""} onChange={(e) => set("darajaSecurityCredential", e.target.value)} placeholder={status.securityCredentialSet ? "Leave blank to keep" : "Encrypted initiator password"} />
        </div>
      </div>
      {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
      {test.error && <p className="text-sm text-red-600">{(test.error as Error).message}</p>}
      {register.error && <p className="text-sm text-red-600">{(register.error as Error).message}</p>}
      {test.data && <p className="text-sm text-emerald-700">Connected to Daraja {String((test.data as any).env)}.</p>}
      {register.data && <p className="text-sm text-emerald-700">Paybill confirmation URLs registered.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" disabled={test.isPending} onClick={() => test.mutate()}>Test connection</button>
        <button type="button" className="btn-ghost" disabled={register.isPending} onClick={() => register.mutate()}>Register paybill URLs</button>
        <button className="btn-gold" disabled={save.isPending} onClick={() => save.mutate()}>Save M-Pesa</button>
      </div>
    </div>
  );
}
