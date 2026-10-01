import { openDB, type IDBPDatabase } from "idb";

type QueueItem = {
  id: string;
  path: string;
  method: string;
  body?: string;
  createdAt: number;
  label: string;
};

const CACHEABLE = [
  "/api/parts",
  "/api/customers",
  "/api/orders",
  "/api/dashboard",
  "/api/vendors",
  "/api/finance/invoices",
  "/api/reports/customer-balances",
];

function cacheKey(path: string) {
  return path.split("?")[0];
}

function isCacheable(path: string, method: string) {
  if (method !== "GET") return false;
  const base = cacheKey(path);
  return CACHEABLE.some((p) => base === p || base.startsWith(`${p}/`));
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB("mte-erp", 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("cache")) database.createObjectStore("cache");
        if (!database.objectStoreNames.contains("queue")) database.createObjectStore("queue", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function cacheGet<T>(path: string): Promise<T | undefined> {
  const store = await db();
  return store.get("cache", cacheKey(path));
}

export async function cacheSet(path: string, value: unknown) {
  const store = await db();
  await store.put("cache", value, cacheKey(path));
}

export async function queueAdd(item: Omit<QueueItem, "id" | "createdAt">) {
  const row: QueueItem = { ...item, id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() };
  const store = await db();
  await store.put("queue", row);
  window.dispatchEvent(new Event("mte-offline-change"));
  return row;
}

export async function queueAll() {
  const store = await db();
  return (await store.getAll("queue")) as QueueItem[];
}

export async function queueRemove(id: string) {
  const store = await db();
  await store.delete("queue", id);
  window.dispatchEvent(new Event("mte-offline-change"));
}

export function isOnline() {
  return navigator.onLine;
}

export function canCache(path: string, method: string) {
  return isCacheable(path, method);
}

export function mutationLabel(path: string, method: string) {
  if (path.includes("/orders") && method === "POST" && !path.includes("payments")) return "Sales order / quotation";
  if (path.includes("/customers")) return "Customer";
  if (path.includes("/adjust")) return "Stock movement";
  if (path.includes("/parts")) return "Product";
  if (path.includes("/expenses")) return "Expense";
  if (path.includes("/captures")) return "Photo / document";
  return `${method} ${path}`;
}

export function optimisticCreate(path: string, body?: string) {
  const parsed = body ? JSON.parse(body) : {};
  const id = `offline-${crypto.randomUUID?.() || Date.now()}`;
  if (path === "/api/orders") {
    return {
      id,
      number: `OFF-${String(Date.now()).slice(-5)}`,
      status: "DRAFT",
      offline: true,
      channel: parsed.channel || "FIELD",
      customerId: parsed.customerId,
      createdAt: new Date().toISOString(),
      totals: { gross: 0, paid: 0, balance: 0 },
    };
  }
  return { id, offline: true, ...parsed };
}

export async function flushQueue(send: (item: QueueItem) => Promise<void>) {
  const items = (await queueAll()).sort((a, b) => a.createdAt - b.createdAt);
  for (const item of items) {
    await send(item);
    await queueRemove(item.id);
  }
  return items.length;
}
