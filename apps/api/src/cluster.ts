import cluster from "node:cluster";
import os from "node:os";
import { createApp } from "./app.js";
import { beat } from "./lib/heartbeat.js";
import { ensureDefaultEndpoint } from "./lib/webhooks.js";

const count = Math.max(1, Number(process.env.CLUSTER_WORKERS || os.cpus().length));
const port = Number(process.env.PORT || 4000);

if (cluster.isPrimary) {
  console.log(`MTE ERP cluster primary ${process.pid} forking ${count} API workers`);
  for (let i = 0; i < count; i++) cluster.fork();
  cluster.on("exit", (worker) => {
    console.log(`API worker ${worker.process.pid} died — respawning`);
    cluster.fork();
  });
} else {
  ensureDefaultEndpoint()
    .then(() => {
      const app = createApp();
      app.listen(port, () => {
        console.log(`MTE ERP API worker ${process.pid} on :${port}`);
      });
      beat("api", { cluster: true, port });
      setInterval(() => beat("api", { cluster: true, port }), 10_000);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
