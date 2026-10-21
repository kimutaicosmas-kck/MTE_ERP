import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { canModule } from "../lib/access.js";
import { authenticateToken, tokenFromRequest } from "../lib/session-auth.js";
import { getCachedAcl, setCachedAcl } from "../lib/redis.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string; role: string; sid?: string };
    }
  }
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = tokenFromRequest(req);
  if (token) {
    try { req.user = verifyToken(token); } catch { /* public or expired */ }
  }
  next();
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  const token = tokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Sign in required" });
  }
  try {
    req.user = await authenticateToken(token);
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
