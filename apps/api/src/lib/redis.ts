import { randomUUID } from "node:crypto";
import Redis from "ioredis";

const url = process.env.REDIS_URL || "";
export const SESSION_TTL = 12 * 60 * 60;

let client: Redis | null = null;
let ready = false;

export function redisEnabled() {
  return Boolean(url);
}

export function redisReady() {
  return ready && Boolean(client);
}

export function getRedis() {
  return client;
}

export async function connectRedis() {
  if (!url) {
    console.log("Redis off · set REDIS_URL to enable shared cache");
    return null;
  }
  if (client) return client;
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 20) return 5000;
      return Math.min(times * 200, 3000);
    },
  });
  client.on("ready", () => {
    ready = true;
    console.log("Redis connected");
  });
  client.on("end", () => { ready = false; });
  client.on("error", (err) => {
    ready = false;
    if (process.env.REDIS_DEBUG) console.error("Redis", err.message);
  });
  try {
    await client.ping();
    ready = true;
  } catch (err) {
    ready = false;
    console.error("Redis unavailable · falling back to memory/MySQL", err instanceof Error ? err.message : err);
  }
  return client;
}

export async function redisPing() {
  if (!client || !ready) return { ok: false, status: url ? "down" : "disabled" };
  try {
    const pong = await client.ping();
    const info = await client.info("memory");
    const used = /used_memory_human:(\S+)/.exec(info)?.[1] || "";
    return { ok: pong === "PONG", status: "up", memory: used };
  } catch {
    return { ok: false, status: "down" };
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!client || !ready) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec: number, tag?: string) {
  if (!client || !ready) return;
  try {
    const payload = JSON.stringify(value);
    if (ttlSec > 0) await client.set(key, payload, "EX", ttlSec);
    else await client.set(key, payload);
    if (tag) await client.sadd(`tag:${tag}`, key);
  } catch { /* keep serving */ }
}

export async function cacheDel(...keys: string[]) {
  if (!client || !ready || !keys.length) return;
  try { await client.del(...keys); } catch { /* ignore */ }
}

export async function cacheInvalidate(...tags: string[]) {
  if (!client || !ready || !tags.length) return;
  try {
    for (const tag of tags) {
      const members = await client.smembers(`tag:${tag}`);
      if (members.length) await client.del(...members);
      await client.del(`tag:${tag}`);
    }
  } catch { /* ignore */ }
}

export async function rateLimit(key: string, limit: number, windowSec: number) {
  if (!client || !ready) return { ok: true, remaining: limit };
  try {
    const n = await client.incr(key);
    if (n === 1) await client.expire(key, windowSec);
    const ttl = await client.ttl(key);
    return { ok: n <= limit, remaining: Math.max(0, limit - n), reset: ttl };
  } catch {
    return { ok: true, remaining: limit };
  }
}

export async function createSession(user: { id: string; email: string; name: string; role: string }) {
  const sid = randomUUID();
  if (client && ready) {
    await client.set(`sess:${sid}`, JSON.stringify(user), "EX", SESSION_TTL);
    await client.sadd(`user:sess:${user.id}`, sid);
    await client.expire(`user:sess:${user.id}`, SESSION_TTL);
  }
  return sid;
}

export async function readSession(sid: string) {
  if (!client || !ready) return { ok: true, stale: false };
  const raw = await client.get(`sess:${sid}`);
  if (!raw) return { ok: false, stale: true };
  const idle = Number(process.env.SESSION_TOUCH_SEC || 60);
  const stamp = await client.get(`sess:touch:${sid}`);
  if (!stamp) {
    await client.expire(`sess:${sid}`, SESSION_TTL);
    await client.set(`sess:touch:${sid}`, "1", "EX", idle);
  }
  return { ok: true, stale: false, user: JSON.parse(raw) };
}

export async function destroySession(sid?: string, userId?: string) {
  if (!client || !ready || !sid) return;
  await client.del(`sess:${sid}`, `sess:touch:${sid}`);
  if (userId) await client.srem(`user:sess:${userId}`, sid);
}

export async function destroyUserSessions(userId: string) {
  if (!client || !ready) return;
  const sids = await client.smembers(`user:sess:${userId}`);
  if (sids.length) await client.del(...sids.map((s) => `sess:${s}`), ...sids.map((s) => `sess:touch:${s}`));
  await client.del(`user:sess:${userId}`, `user:acl:${userId}`);
}

export async function getCachedAcl(userId: string) {
  return cacheGet<{ role: string; modules: string | null }>(`user:acl:${userId}`);
}

export async function setCachedAcl(userId: string, acl: { role: string; modules: string | null }) {
  await cacheSet(`user:acl:${userId}`, acl, 60);
}

export async function enqueueRedis(type: string, payload: unknown, delayMs = 0) {
  if (!client || !ready) return false;
  const job = { id: randomUUID(), type, payload, attempts: 0, runAt: Date.now() + delayMs };
  if (delayMs > 0) {
    await client.zadd("jobs:delay", job.runAt, JSON.stringify(job));
  } else {
    await client.lpush("jobs:wait", JSON.stringify(job));
  }
  return true;
}

export async function claimRedisJob() {
  if (!client || !ready) return null;
  const due = await client.zrangebyscore("jobs:delay", 0, Date.now(), "LIMIT", 0, 8);
  if (due.length) {
    for (const raw of due) {
      const moved = await client.zrem("jobs:delay", raw);
      if (moved) await client.lpush("jobs:wait", raw);
    }
  }
  const raw = await client.rpop("jobs:wait");
  return raw ? (JSON.parse(raw) as { id: string; type: string; payload: unknown; attempts: number }) : null;
}

export async function failRedisJob(job: { id: string; type: string; payload: unknown; attempts: number }, error: string) {
  if (!client || !ready) return;
  const next = { ...job, attempts: job.attempts + 1, lastError: error };
  if (next.attempts < 5) {
    await client.zadd("jobs:delay", Date.now() + Math.min(60_000, 1000 * 2 ** next.attempts), JSON.stringify(next));
  } else {
    await client.lpush("jobs:dead", JSON.stringify(next));
  }
}

export async function redisQueueStats() {
  if (!client || !ready) return null;
  const [wait, delayed, dead] = await Promise.all([
    client.llen("jobs:wait"),
    client.zcard("jobs:delay"),
    client.llen("jobs:dead"),
  ]);
  return { wait, delayed, dead };
}
