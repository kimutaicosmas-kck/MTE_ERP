import express from "express";
import cors from "cors";
import { join } from "node:path";
import { auth } from "./middleware/auth.js";
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

export function createApp() {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "12mb" }));
  app.use("/uploads", express.static(join(process.cwd(), "uploads")));

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, name: "MTE ERP", pid: process.pid, cluster: Boolean(process.env.CLUSTER_WORKERS) })
  );
  app.use("/api/webhooks", incomingWebhooksRouter);
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

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  });
  return app;
}
