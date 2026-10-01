import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "../lib/redis.js";

function ip(req: Request) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function limit(kind: "login" | "api" | "stk") {
  const windowSec = 60;
  const ipMax = kind === "login" ? 20 : kind === "stk" ? 40 : 800;
  const userMax = kind === "login" ? 10 : kind === "stk" ? 20 : 400;
  return async (req: Request, res: Response, next: NextFunction) => {
    const byIp = await rateLimit(`rl:${kind}:ip:${ip(req)}`, ipMax, windowSec);
    if (!byIp.ok) return res.status(429).json({ error: "Too many requests. Wait a minute and try again." });
    if (req.user?.id) {
      const byUser = await rateLimit(`rl:${kind}:u:${req.user.id}`, userMax, windowSec);
      res.setHeader("X-RateLimit-Remaining", String(byUser.remaining));
      if (!byUser.ok) return res.status(429).json({ error: "Too many requests. Wait a minute and try again." });
    } else {
      res.setHeader("X-RateLimit-Remaining", String(byIp.remaining));
    }
    next();
  };
}
