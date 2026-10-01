import express from "express";
import cors from "cors";
import { join } from "node:path";
import { attachUser, auth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { partsRouter } from "./routes/parts.js";
import { ordersRouter } from "./routes/orders.js";
import { directoryRouter } from "./routes/directory.js";
import { approvalsRouter } from "./routes/approvals.js";
import { financeRouter } from "./routes/finance.js";
import { reportsRouter } from "./routes/reports.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { webhooksRouter, incomingWebhooksRouter } from "./routes/webhooks.js";
import { systemRouter } from "./routes/system.js";
import { procurementRouter } from "./routes/procurement.js";
import { settingsRouter } from "./routes/settings.js";
import { payrollRouter } from "./routes/payroll.js";
import { hrRouter } from "./routes/hr.js";
import { importRouter } from "./routes/import.js";
import { pushRouter } from "./routes/push.js";
import { capturesRouter } from "./routes/captures.js";
import { noticesRouter } from "./routes/notices.js";
import { mpesaPublicRouter, mpesaRouter } from "./routes/mpesa.js";
import { cacheLayer } from "./middleware/cache.js";
import { limit } from "./middleware/rateLimit.js";
import { redisPing } from "./lib/redis.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "12mb" }));
  app.use("/uploads", express.static(join(process.cwd(), "uploads")));

  app.get("/api/health", async (_req, res) => {
    const redis = await redisPing();
    res.json({
      ok: true,
      name: "MTE ERP",
      pid: process.pid,
      cluster: Boolean(process.env.CLUSTER_WORKERS),
      redis: redis.status,
      redisMemory: redis.memory || undefined,
    });
  });
  app.use("/api", attachUser);
  app.use("/api", limit("api"));
  app.use("/api", cacheLayer);
  app.use("/api/webhooks", incomingWebhooksRouter);
  app.use("/api/mpesa/callback", mpesaPublicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/parts", auth, partsRouter);
  app.use("/api/orders", auth, ordersRouter);
  app.use("/api", auth, directoryRouter);
  app.use("/api/approvals", auth, approvalsRouter);
  app.use("/api/finance", auth, financeRouter);
  app.use("/api/reports", auth, reportsRouter);
  app.use("/api/dashboard", auth, dashboardRouter);
  app.use("/api/hooks", auth, webhooksRouter);
  app.use("/api/system", auth, systemRouter);
  app.use("/api/purchases", auth, procurementRouter);
  app.use("/api/settings", auth, settingsRouter);
  app.use("/api/payroll", auth, payrollRouter);
  app.use("/api/hr", auth, hrRouter);
  app.use("/api/import", auth, importRouter);
  app.use("/api/push", auth, pushRouter);
  app.use("/api/captures", auth, capturesRouter);
  app.use("/api/notices", auth, noticesRouter);
  app.use("/api/mpesa", auth, mpesaRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  });
  return app;
}
