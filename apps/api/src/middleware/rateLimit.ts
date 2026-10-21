import type { Request, Response, NextFunction } from "express";
import { rateLimit as redisRateLimit, redisReady } from "../lib/redis.js";

type LimitKind = "login" | "api" | "stk" | "public";

const memory = new Map<string, { count: number; resetAt: number }>();

function memRateLimit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const row = memory.get(key);
  if (!row || row.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, remaining: max - 1, reset: windowSec };
  }
  row.count += 1;
  const reset = Math.max(1, Math.ceil((row.resetAt - now) / 1000));
  return { ok: row.count <= max, remaining: Math.max(0, max - row.count), reset };
}

async function checkLimit(key: string, max: number, windowSec: number) {
  if (redisReady()) return redisRateLimit(key, max, windowSec);
  return memRateLimit(key, max, windowSec);
}

function ip(req: Request) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.ip || req.socket.remoteAddress || "unknown").slice(0, 64);
}

const RULES: Record<LimitKind, { windowSec: number; ipMax: number; userMax: number }> = {
  login: { windowSec: 900, ipMax: 5, userMax: 5 },
  api: { windowSec: 60, ipMax: 600, userMax: 300 },
  stk: { windowSec: 60, ipMax: 30, userMax: 15 },
  public: { windowSec: 60, ipMax: 120, userMax: 120 },
};

function setHeaders(res: Response, max: number, remaining: number, reset: number) {
  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  if (reset > 0) res.setHeader("Retry-After", String(reset));
}

/** Dev/stress only: set LOAD_TEST_KEY on API and send X-Load-Test-Key from load-test script. */
function loadTestBypass(req: Request) {
  const secret = process.env.LOAD_TEST_KEY?.trim();
  if (!secret) return false;
  const got = req.headers["x-load-test-key"];
  return typeof got === "string" && got === secret;
}

export function limit(kind: LimitKind) {
  const rule = RULES[kind];
  return async (req: Request, res: Response, next: NextFunction) => {
    if (loadTestBypass(req)) return next();
    const byIp = await checkLimit(`rl:${kind}:ip:${ip(req)}`, rule.ipMax, rule.windowSec);
    setHeaders(res, rule.ipMax, byIp.remaining, byIp.ok ? 0 : byIp.reset);
    if (!byIp.ok) {
      return res.status(429).json({ error: "Too many requests. Please wait and try again." });
    }
    if (req.user?.id) {
      const byUser = await checkLimit(`rl:${kind}:u:${req.user.id}`, rule.userMax, rule.windowSec);
      setHeaders(res, rule.userMax, byUser.remaining, byUser.ok ? 0 : byUser.reset);
      if (!byUser.ok) {
        return res.status(429).json({ error: "Too many requests. Please wait and try again." });
      }
    }
    next();
  };
}

/** Extra login throttle keyed by email (call after body is parsed). */
export async function limitLoginEmail(email: string, res: Response, req?: Request) {
  if (req && loadTestBypass(req)) return true;
  const key = `rl:login:email:${email.toLowerCase().slice(0, 120)}`;
  const hit = await checkLimit(key, 5, 900);
  if (!hit.ok) {
    res.setHeader("Retry-After", String(hit.reset));
    return false;
  }
  return true;
}
