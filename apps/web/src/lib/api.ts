import { cacheGet, cacheSet, canCache, isOnline, mutationLabel, optimisticCreate, queueAdd, queueAll, flushQueue } from "./offline";

const TOKEN_KEY = "mte_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function isNetworkError(err: unknown) {
  return err instanceof TypeError || (err instanceof Error && /fetch|network|offline|failed/i.test(err.message));
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    if (!isOnline() && method !== "GET") throw new TypeError("offline");
    const res = await fetch(path, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : res.statusText);
    if (canCache(path, method)) await cacheSet(path, data);
    return data as T;
  } catch (err) {
    if (method === "GET") {
      const cached = await cacheGet<T>(path);
      if (cached !== undefined) return cached;
    }
    if (method !== "GET" && (isNetworkError(err) || !isOnline())) {
      const body = typeof init.body === "string" ? init.body : undefined;
      await queueAdd({ path, method, body, label: mutationLabel(path, method) });
      return optimisticCreate(path, body) as T;
    }
    throw err;
  }
}

export async function syncOfflineQueue() {
  if (!isOnline()) return 0;
  return flushQueue(async (item) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(item.path, { method: item.method, headers, body: item.body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data.error === "string" ? data.error : "Sync failed");
    }
  });
}

export async function pendingCount() {
  return (await queueAll()).length;
}

export async function downloadPdf(orderId: string, kind: "order" | "sale" | "delivery") {
  const token = getToken();
  const res = await fetch(`/api/orders/${orderId}/pdf/${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Could not download PDF");
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
  const name = match?.[1] || `${kind}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadCustomerStatement(customerId: string) {
  const token = getToken();
  const res = await fetch(`/api/customers/${customerId}/statement.pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Could not download statement");
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
  const name = match?.[1] || "customer-statement.pdf";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPurchasePdf(purchaseId: string) {
  const token = getToken();
  const res = await fetch(`/api/purchases/${purchaseId}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Could not download PDF");
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
  const name = match?.[1] || "purchase-order.pdf";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const money = (n?: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n || 0);
