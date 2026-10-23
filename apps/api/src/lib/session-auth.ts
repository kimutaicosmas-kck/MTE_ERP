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

/** Verify JWT and ensure Redis session exists (sign-out removes session; JWT alone is not enough). */
export async function authenticateToken(token: string): Promise<TokenUser> {
  const user = verifyToken(token);
  if (!redisReady() || !user.sid) return user;

  const session = await readSession(user.sid);
  if (session.ok) return user;

  // Session was removed (sign-out) or expired — do not recreate from JWT alone.
  throw new Error("Session expired");
}
