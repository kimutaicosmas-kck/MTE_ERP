import { createApp } from "./app.js";
import { beat } from "./lib/heartbeat.js";
import { ensureDefaultEndpoint } from "./lib/webhooks.js";

const port = Number(process.env.PORT || 4000);

async function start() {
  await ensureDefaultEndpoint();
  const app = createApp();
  app.listen(port, "0.0.0.0", () => {
    console.log(`MTE ERP API http://0.0.0.0:${port} pid=${process.pid}`);
  });
  await beat("api", { port });
  setInterval(() => beat("api", { port }), 10_000);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
