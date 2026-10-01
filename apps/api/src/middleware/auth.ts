import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { canModule } from "../lib/access.js";
import { getCachedAcl, readSession, redisReady, setCachedAcl } from "../lib/redis.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string; role: string; sid?: string };
    }
  }
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try { req.user = verifyToken(header.slice(7)); } catch { /* public or expired */ }
  }
  next();
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sign in required" });
  }
  try {
    const user = verifyToken(header.slice(7));
    if (redisReady() && user.sid) {
      const session = await readSession(user.sid);
      if (!session.ok) return res.status(401).json({ error: "Session expired" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}

export function roles(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed for this role" });
    }
    next();
  };
}

export function moduleAccess(...mods: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Sign in required" });
    let user = await getCachedAcl(req.user.id);
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true, modules: true },
      });
      if (user) await setCachedAcl(req.user.id, user);
    }
    if (!user) return res.status(401).json({ error: "Sign in required" });
    if (mods.some((m) => canModule(user, m))) return next();
    return res.status(403).json({ error: "You do not have access to this module" });
  };
}
