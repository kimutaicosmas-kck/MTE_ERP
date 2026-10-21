import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BarcodeScan } from "../components/BarcodeScan";
import { CaptureField } from "../components/CaptureField";
import { MteSelect, OrderDocs, mapSelectOptions } from "../components/ui";
import { api, money } from "../lib/api";
import {
  DISPATCH_LABEL,
  DISPATCH_METHODS,
  DISPATCH_NEXT,
  DISPATCH_STEPS,
  dispatchStepLabel,
  dispatchStepOn,
} from "../lib/dispatch-status";
import { useSetPageTitle } from "../lib/page-title";

export function DispatchJob() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [tracking, setTracking] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [pod, setPod] = useState({ receiver: "", phone: "" });
  const [vehicleId, setVehicleId] = useState("");
  const [scanMsg, setScanMsg] = useState("");
  const [showMore, setShowMore] = useState(false);

  const { data: o, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<any>(`/api/orders/${id}`),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<any[]>("/api/dispatch/vehicles"),
  });
  const vehicleOptions = useMemo(
    () =>
      mapSelectOptions(
        vehicles.data || [],
        (v) => v.id,
        (v) => v.number,
        (v) => v.driverName || undefined,
      ),
    [vehicles.data],
  );
  const captures = useQuery({
    queryKey: ["captures", id],
    queryFn: () => api<any[]>(`/api/captures?kind=delivery&refId=${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!o?.lines) return;
    const p: Record<string, number> = {};
    for (const l of o.lines) {
      p[l.id] = l.pickedQty ?? 0;
    }
    setPicked(p);
    setPod({ receiver: o.podReceiver || "", phone: o.podPhone || "" });
    setVehicleId(o.vehicleId || "");
    setTracking(o.tracking || "");
  }, [o?.id, o?.lines, o?.podReceiver, o?.podPhone, o?.vehicleId, o?.tracking]);

  const savePick = useMutation({
    mutationFn: () => api(`/api/orders/${id}/pick`, {
      method: "POST",
      body: JSON.stringify({ lines: (o?.lines || []).map((l: any) => ({ id: l.id, pickedQty: picked[l.id] || 0 })) }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", id] }),
  });
  const savePack = useMutation({
    mutationFn: () => api(`/api/orders/${id}/pack`, {
      method: "POST",
      body: JSON.stringify({
        lines: (o?.lines || []).map((l: any) => ({ id: l.id, packedQty: picked[l.id] || 0 })),
      }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", id] }),
  });
  const saveQc = useMutation({
    mutationFn: () => api(`/api/orders/${id}/qc`, { method: "POST", body: JSON.stringify({ passed: true, notes: "" }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", id] }),
  });
  const savePod = useMutation({
    mutationFn: () => api(`/api/orders/${id}/pod`, { method: "POST", body: JSON.stringify(pod) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", id] }),
  });
  const move = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`/api/orders/${id}/status`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dispatch-dashboard"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  useSetPageTitle("Dispatch", o?.number || "Job", "/dispatch");

  const next = o ? DISPATCH_NEXT[o.status] : undefined;
  const picking = o && ["CONFIRMED", "PICKING", "PACKING"].includes(o.status);
  const shipping = o && ["PICKED", "DISPATCHED", "IN_TRANSIT"].includes(o.status);
  const delivering = o && next?.status === "DELIVERED";

  const pickComplete = useMemo(() => {
    if (!o?.lines?.length) return false;
    return o.lines.every((l: any) => (picked[l.id] || 0) >= l.qty);
  }, [o, picked]);

  function onScan(code: string) {
    if (!o?.lines) return;
    const hit = o.lines.find((l: any) => {
      const sku = String(l.part?.sku || "").toLowerCase();
      const oem = String(l.part?.oemNumber || "").toLowerCase();
      const c = code.toLowerCase();
      return sku === c || oem === c || sku.includes(c) || oem.includes(c);
    });
    if (!hit) {
      setScanMsg(`No line for "${code}"`);
      return;
    }
    const cur = picked[hit.id] || 0;
    if (cur >= hit.qty) {
      setScanMsg(`${hit.part?.sku} already complete`);
      return;
    }
    setPicked((p) => ({ ...p, [hit.id]: cur + 1 }));
    setScanMsg(`Picked ${hit.part?.name} (${cur + 1}/${hit.qty})`);
  }

  async function tryAdvance() {
    if (!next) return;
    const target = next.status;
    try {
      if (target === "PICKED") {
        await savePick.mutateAsync();
        await savePack.mutateAsync();
        await saveQc.mutateAsync();
      }
      if (target === "DELIVERED") {
        await savePod.mutateAsync();
      }
      move.mutate({
        status: target,
        tracking: tracking || undefined,
        vehicleId: vehicleId || undefined,
      });
    } catch (e) {
      setScanMsg(e instanceof Error ? e.message : "Could not save");
    }
  }

  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!o) return <p>Loading…</p>;

  const photos = [
    ...(captures.data || []).map((c) => ({ id: c.id, name: c.name, src: c.data, mime: c.mime })),
    ...(o.files || []).map((f: any) => ({ id: f.id, name: f.name, src: f.path, mime: f.mime })),
  ];
  const busy = move.isPending || savePick.isPending || savePack.isPending || savePod.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{o.number}</h1>
          <p className="text-stone-500">{o.customer?.name}</p>
          <p className="text-sm text-stone-400">
            {DISPATCH_METHODS.find((m) => m.id === o.dispatchMethod)?.label || String(o.dispatchMethod || "").replace(/_/g, " ").toLowerCase()}
            {o.customer?.phone ? ` · ${o.customer.phone}` : ""}
            {o.totals?.gross != null ? ` · ${money(o.totals.gross)}` : ""}
          </p>
        </div>
        <span className={`badge ${o.status === "DELIVERED" ? "bg-emerald-100 text-emerald-800" : o.status === "FAILED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
          {DISPATCH_LABEL[o.status] || o.status}
        </span>
      </div>

      <ol className="suite-doc-steps !mb-0 overflow-x-auto" style={{ ["--doc-ink" as string]: "#059669", ["--doc-dark" as string]: "#047857" }}>
        {DISPATCH_STEPS.map((s) => (
          <li key={s} className={dispatchStepOn(s, o.status) ? "is-on" : ""}>{dispatchStepLabel(s)}</li>
        ))}
      </ol>

      {next && o.status !== "CANCELLED" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">What to do now</h2>
          {shipping && o.status === "PICKED" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label>Vehicle (optional)</label>
                <MteSelect
                  aria-label="Vehicle"
                  value={vehicleId}
                  onChange={setVehicleId}
                  options={vehicleOptions}
                  placeholder="No vehicle assigned"
                />
              </div>
              {o.dispatchMethod === "COURIER" && (
                <div>
                  <label>Tracking number (optional)</label>
                  <input placeholder="Courier tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                </div>
              )}
            </div>
          )}
          {delivering && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label>Who received the goods?</label>
                <input value={pod.receiver} onChange={(e) => setPod((p) => ({ ...p, receiver: e.target.value }))} placeholder="Receiver name" />
              </div>
              <div>
                <label>Phone (optional)</label>
                <input value={pod.phone} onChange={(e) => setPod((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
              </div>
              <div className="sm:col-span-2">
                <CaptureField kind="delivery" refId={o.id} label="Photo proof (optional)" onSaved={() => qc.invalidateQueries({ queryKey: ["captures", id] })} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={next.success ? "btn-success" : "btn-gold"}
              disabled={busy || (next.status === "PICKED" && !pickComplete)}
              onClick={() => tryAdvance()}
            >
              {busy ? "Saving…" : next.label}
            </button>
            <OrderDocs orderId={o.id} status={o.status} />
          </div>
          {move.error && <p className="text-sm text-red-600">{(move.error as Error).message}</p>}
        </div>
      )}

      {picking && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Items to pick</h2>
            <div className="flex items-center gap-2">
              <BarcodeScan onDetect={onScan} />
              <input
                className="w-40"
                placeholder="Type SKU…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onScan((e.target as HTMLInputElement).value.trim());
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>
          </div>
          {scanMsg && <p className="text-sm text-stone-600">{scanMsg}</p>}
          <div className="table-wrap table-keep">
            <table className="invoice">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Location</th>
                  <th className="num">Need</th>
                  <th className="num">Picked</th>
                </tr>
              </thead>
              <tbody>
                {(o.lines || []).map((l: any) => {
                  const got = picked[l.id] || 0;
                  const done = got >= l.qty;
                  return (
                    <tr key={l.id} className={done ? "bg-emerald-50/60" : got > 0 ? "bg-amber-50/50" : ""}>
                      <td>
                        <div className="font-medium">{l.part?.name}</div>
                        <div className="text-xs text-stone-400">{l.part?.sku}</div>
                      </td>
                      <td>{l.part?.binLocation || "—"}</td>
                      <td className="num font-semibold">{l.qty}</td>
                      <td className="num">
                        <span className={done ? "font-semibold text-emerald-700" : got ? "text-amber-700" : ""}>{got}</span>
                        {!done && (
                          <button
                            type="button"
                            className="btn-ghost ml-2 px-2 py-0.5 text-xs"
                            onClick={() => setPicked((p) => ({ ...p, [l.id]: Math.min(l.qty, (p[l.id] || 0) + 1) }))}
                          >
                            +1
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(photos.length > 0 || (o.statusLogs || []).length > 0) && (
        <div className="card space-y-2">
          <button type="button" className="text-sm font-medium text-stone-600 underline" onClick={() => setShowMore((v) => !v)}>
            {showMore ? "Hide details" : "Show delivery photos & history"}
          </button>
          {showMore && (
            <>
              {photos.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {photos.map((f) => (
                    <a key={f.id} href={f.src} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border">
                      {String(f.mime).startsWith("image/") ? (
                        <img src={f.src} alt={f.name} className="h-32 w-full object-cover" />
                      ) : (
                        <div className="grid h-32 place-items-center text-xs">{f.name}</div>
                      )}
                    </a>
                  ))}
                </div>
              )}
              {(o.statusLogs || []).length > 0 && (
                <ul className="space-y-1 text-sm">
                  {(o.statusLogs || []).map((log: any) => (
                    <li key={log.id} className="flex flex-wrap justify-between gap-2 border-b border-stone-100 py-1.5 last:border-0">
                      <span><strong>{DISPATCH_LABEL[log.status] || log.status}</strong>{log.notes ? ` — ${log.notes}` : ""}</span>
                      <span className="text-stone-400">{new Date(log.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-sm text-stone-500">
        <Link className="underline" to={`/sales/${o.id}`}>View sales order</Link>
        {" · "}
        <Link className="underline" to="/dispatch">Back to dispatch list</Link>
      </p>
    </div>
  );
}
