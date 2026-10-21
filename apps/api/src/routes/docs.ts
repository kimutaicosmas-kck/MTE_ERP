import { Router } from "express";
import { roles } from "../middleware/auth.js";

export const docsRouter = Router();

const spec = {
  openapi: "3.0.3",
  info: { title: "MTE ERP API", version: "1.0.0", description: "Authenticated REST API for operations, finance, HR, and inventory." },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Health check", security: [], responses: { "200": { description: "OK" } } } },
    "/auth/login": { post: { summary: "Sign in", security: [], responses: { "200": { description: "JWT or MFA ticket" } } } },
    "/auth/logout": { post: { summary: "Sign out", responses: { "200": { description: "OK" } } } },
    "/auth/forgot": { post: { summary: "Request password reset", security: [], responses: { "200": { description: "Accepted" } } } },
    "/auth/reset": { post: { summary: "Reset password with code", security: [], responses: { "200": { description: "OK" } } } },
    "/auth/mfa": { post: { summary: "Complete MFA sign-in", security: [], responses: { "200": { description: "JWT" } } } },
    "/employees": { get: { summary: "List employees", responses: { "200": { description: "Users" } } }, post: { summary: "Create employee", responses: { "201": { description: "Created" } } } },
    "/employees/{id}": { patch: { summary: "Update employee", responses: { "200": { description: "Updated" } } } },
    "/orders": { get: { summary: "List sales orders" }, post: { summary: "Create sales order" } },
    "/finance/invoices": { get: { summary: "List invoices" } },
    "/parts": { get: { summary: "List products" } },
    "/hr/leave": { get: { summary: "Leave requests" }, post: { summary: "Request leave" } },
    "/system/backup": { get: { summary: "Download JSON backup" } },
    "/system/restore": { post: { summary: "Restore master data from backup" } },
    "/dashboard": { get: { summary: "Dashboard tiles, charts, and activity" } },
  },
};

docsRouter.get("/openapi.json", roles("SUPER_ADMIN", "ADMIN"), (_req, res) => res.json(spec));

docsRouter.get("/", roles("SUPER_ADMIN", "ADMIN"), (_req, res) => {
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"/><title>MTE ERP API</title>
  <style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
  h1{font-family:Georgia,serif} code,pre{background:#f4f1ea;padding:.2rem .4rem;border-radius:4px}
  .path{margin:.75rem 0;padding:.75rem 1rem;border:1px solid #e5e0d4;border-radius:10px}
  .m{font-weight:700;color:#8c6d16;margin-right:.5rem}</style></head><body>
  <h1>MTE ERP API</h1><p>REST + JWT. Download <a href="/api/docs/openapi.json">openapi.json</a> for Swagger / Postman.</p>
  ${Object.entries(spec.paths).map(([p, methods]) =>
    Object.entries(methods as Record<string, { summary?: string }>).map(([m, d]) =>
      `<div class="path"><span class="m">${m.toUpperCase()}</span><code>/api${p}</code><div>${d.summary || ""}</div></div>`
    ).join("")
  ).join("")}
  </body></html>`);
});
