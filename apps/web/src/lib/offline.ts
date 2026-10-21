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

function resetDb() {
  dbPromise = null;
}

function isIdbFault(err: unknown) {
  if (!(err instanceof DOMException) && !(err instanceof Error)) return false;
  const msg = err.message || "";
  return /IDBDatabase|database connection is closing|connection is closing|InvalidStateError/i.test(msg);
}

function openDb() {
  if (!dbPromise) {
    dbPromise = openDB("mte-erp", 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("cache")) database.createObjectStore("cache");
        if (!database.objectStoreNames.contains("queue")) database.createObjectStore("queue", { keyPath: "id" });
      },
      blocked() {
        resetDb();
      },
      terminated() {
        resetDb();
      },
    }).catch((err) => {
      resetDb();
      throw err;
    });
  }
  return dbPromise;
}

async function withDb<T>(run: (database: IDBPDatabase) => Promise<T>): Promise<T | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const database = await openDb();
      return await run(database);
    } catch (err) {
      if (isIdbFault(err)) {
        resetDb();
        if (attempt === 0) continue;
      }
      return undefined;
    }
  }
  return undefined;
}

export async function cacheGet<T>(path: string): Promise<T | undefined> {
  const key = cacheKey(path);
  return withDb(async (database) => database.get("cache", key) as Promise<T | undefined>);
}

export async function cacheSet(path: string, value: unknown) {
  const key = cacheKey(path);
  await withDb(async (database) => {
    await database.put("cache", value, key);
  });
}

export async function queueAdd(item: Omit<QueueItem, "id" | "createdAt">): Promise<QueueItem | null> {
  const row: QueueItem = { ...item, id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() };
  const ok = await withDb(async (database) => {
    await database.put("queue", row);
    return true;
  });
  if (!ok) return null;
  window.dispatchEvent(new Event("mte-offline-change"));
  return row;
}

export async function queueAll(): Promise<QueueItem[]> {
  const rows = await withDb(async (database) => database.getAll("queue") as Promise<QueueItem[]>);
  return rows || [];
}

export async function queueRemove(id: string) {
  const ok = await withDb(async (database) => {
    await database.delete("queue", id);
    return true;
  });
  if (ok) window.dispatchEvent(new Event("mte-offline-change"));
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
