import { Camera } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";

export function CaptureField({
  kind,
  refId,
  label,
}: {
  kind: "delivery" | "product" | "receipt" | "customer";
  refId: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  return (
    <label className="btn-ghost cursor-pointer">
      <Camera size={16} />
      {busy ? "Saving…" : label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !refId) return;
          const reader = new FileReader();
          reader.onload = async () => {
            setBusy(true);
            setErr("");
            setOk("");
            try {
              await api("/api/captures", {
                method: "POST",
                body: JSON.stringify({
                  kind,
                  refId,
                  name: file.name,
                  mime: file.type || "image/jpeg",
                  data: String(reader.result),
                }),
              });
              setOk("Saved");
            } catch (error) {
              setErr((error as Error).message);
            } finally {
              setBusy(false);
            }
          };
          reader.readAsDataURL(file);
        }}
      />
      {ok && <span className="text-xs text-emerald-600">{ok}</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </label>
  );
}
