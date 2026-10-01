import { api } from "./api";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePush() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Notifications are not supported in this browser");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission denied");
  const { publicKey } = await api<{ publicKey: string }>("/api/push/vapid");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  localStorage.setItem("mte_push", "1");
}

export function pushEnabled() {
  return localStorage.getItem("mte_push") === "1";
}
