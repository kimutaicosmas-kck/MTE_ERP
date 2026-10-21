import type { Request } from "express";
import { verifyToken, type TokenUser } from "./auth.js";
import { getRedis, readSession, redisReady, SESSION_TTL } from "./redis.js";

export function tokenFromRequest(req: Request) {
  const header = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : "";
  const raw = req.query.token;
  const query = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return header || query || "";
}

/** Verify JWT and ensure Redis session exists (rehydrate from JWT when TTL lapsed). */
export async function authenticateToken(token: string): Promise<TokenUser> {
  const user = verifyToken(token);
  if (!redisReady() || !user.sid) return user;

  const session = await readSession(user.sid);
  if (session.ok) return user;

  const client = getRedis();
  if (!client) return user;

  const payload = JSON.stringify({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await client.set(`sess:${user.sid}`, payload, "EX", SESSION_TTL);
  await client.sadd(`user:sess:${user.id}`, user.sid);
  await client.expire(`user:sess:${user.id}`, SESSION_TTL);
  return user;
}
