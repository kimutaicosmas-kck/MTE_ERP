import type { Request, Response, NextFunction } from "express";
import { cacheGet, cacheInvalidate, cacheSet } from "../lib/redis.js";

type Rule = { test: RegExp; ttl: number; tag: string; vary: "none" | "role" | "user" };

const RULES: Rule[] = [
  { test: /^\/api\/parts\/?$/, ttl: 20, tag: "parts", vary: "role" },
  { test: /^\/api\/customers\/?$/, ttl: 20, tag: "customers", vary: "none" },
  { test: /^\/api\/vendors\/?$/, ttl: 30, tag: "vendors", vary: "none" },
  { test: /^\/api\/users\/?$/, ttl: 20, tag: "users", vary: "none" },
  { test: /^\/api\/settings\/?$/, ttl: 45, tag: "settings", vary: "none" },
  { test: /^\/api\/dashboard\/?$/, ttl: 15, tag: "dashboard", vary: "user" },
  { test: /^\/api\/finance\/invoices\/?$/, ttl: 12, tag: "invoices", vary: "none" },
  { test: /^\/api\/finance\/accounts\/?$/, ttl: 60, tag: "accounts", vary: "none" },
  { test: /^\/api\/reports\//, ttl: 25, tag: "reports", vary: "user" },
  { test: /^\/api\/orders\/?$/, ttl: 12, tag: "orders", vary: "user" },
];

const WRITE_TAGS: { test: RegExp; tags: string[] }[] = [
  { test: /^\/api\/parts/, tags: ["parts", "dashboard", "reports"] },
  { test: /^\/api\/orders/, tags: ["orders", "invoices", "dashboard", "reports"] },
  { test: /^\/api\/customers/, tags: ["customers", "dashboard"] },
  { test: /^\/api\/vendors/, tags: ["vendors"] },
  { test: /^\/api\/users/, tags: ["users"] },
  { test: /^\/api\/settings/, tags: ["settings"] },
  { test: /^\/api\/finance/, tags: ["invoices", "accounts", "dashboard", "reports"] },
  { test: /^\/api\/purchases/, tags: ["dashboard", "reports", "parts"] },
  { test: /^\/api\/import/, tags: ["parts", "customers", "users", "vendors", "dashboard"] },
  { test: /^\/api\/mpesa/, tags: ["invoices", "dashboard", "reports"] },
  { test: /^\/api\/hr/, tags: ["users"] },
  { test: /^\/api\/payroll/, tags: ["users"] },
];

const SKIP = /\/(pdf|backup|callback|webhooks|login|password|avatar|logout)/i;

function fullPath(req: Request) {
  const raw = `${req.baseUrl || ""}${req.path || ""}` || req.originalUrl.split("?")[0];
  return raw;
}

function ruleFor(path: string) {
  return RULES.find((r) => r.test.test(path));
}

function cacheKey(req: Request, rule: Rule) {
  const vary =
    rule.vary === "user" ? req.user?.id || "anon" :
    rule.vary === "role" ? req.user?.role || "anon" : "all";
  return `http:${rule.tag}:${vary}:${req.originalUrl}`;
}

export function cacheLayer(req: Request, res: Response, next: NextFunction) {
  const path = fullPath(req);
  if (SKIP.test(path) || SKIP.test(req.originalUrl)) return next();

  if (req.method === "GET") {
    const rule = ruleFor(path);
    if (!rule) return next();
    const key = cacheKey(req, rule);
    cacheGet(key).then((hit) => {
      if (hit != null) {
        res.setHeader("X-Cache", "HIT");
        return res.json(hit);
      }
      const json = res.json.bind(res);
      res.json = ((body: unknown) => {
        if (res.statusCode < 400) cacheSet(key, body, rule.ttl, rule.tag);
        res.setHeader("X-Cache", "MISS");
        return json(body);
      }) as Response["json"];
      next();
    }).catch(() => next());
    return;
  }

  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const tags = WRITE_TAGS.filter((w) => w.test.test(path)).flatMap((w) => w.tags);
      if (tags.length) cacheInvalidate(...new Set(tags));
    });
  }
  next();
}
