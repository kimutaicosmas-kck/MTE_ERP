import type { Request, Response, NextFunction } from "express";

export function trustProxy(app: { set: (key: string, value: number) => void }) {
  app.set("trust proxy", 1);
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.removeHeader("X-Powered-By");
  next();
}

/** Reject non-JSON bodies on mutating API routes (webhooks/callbacks exempt). */
export function requireJson(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) return next();
  const len = Number(req.headers["content-length"] || 0);
  if (!len) return next();
  const ct = String(req.headers["content-type"] || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }
  next();
}

/** Block obvious path traversal in static file segments. */
export function blockBadPaths(req: Request, res: Response, next: NextFunction) {
  const raw = decodeURIComponent(req.path);
  if (raw.includes("..") || raw.includes("\\") || /\0/.test(raw)) {
    return res.status(400).json({ error: "Invalid path" });
  }
  next();
}
