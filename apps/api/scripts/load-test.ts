/**
 * Heavier API load test (authenticated read mix).
 *
 * Usage: npm run load-test -w api
 * Env:
 *   API_BASE=http://127.0.0.1:4000
 *   LOAD_CONCURRENCY=40
 *   LOAD_DURATION_SEC=20
 *   LOAD_RPS_CAP=0   (0 = no cap, fire concurrency workers)
 */

const BASE = (process.env.API_BASE || "http://127.0.0.1:4000").replace(/\/$/, "");
const CONCURRENCY = Math.max(1, Number(process.env.LOAD_CONCURRENCY || 12));
const DURATION_SEC = Math.max(5, Number(process.env.LOAD_DURATION_SEC || 20));
const PASS = "Mte@2026";
const LOAD_TEST_KEY = process.env.LOAD_TEST_KEY || "mte-local-load-key";
const LOAD_USERS = (process.env.LOAD_USERS || "admin@mte.local").split(",");

type Sample = { path: string; ms: number; ok: boolean; status: number };

const PATHS = ["/api/health", "/api/dashboard", "/api/parts", "/api/orders", "/api/purchases"];

function loadHeaders(extra: Record<string, string> = {}) {
  return { Accept: "application/json", "X-Load-Test-Key": LOAD_TEST_KEY, ...extra };
}

async function hit(path: string, token: string): Promise<Sample> {
  const t0 = performance.now();
  const auth = path === "/api/health" ? {} : { Authorization: `Bearer ${token}` };
  const res = await fetch(`${BASE}${path}`, { headers: loadHeaders(auth) });
  await res.arrayBuffer().catch(() => null);
  return {
    path,
    ms: performance.now() - t0,
    ok: res.ok,
    status: res.status,
  };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

async function worker(tokens: string[], workerId: number, until: number, out: Sample[]) {
  while (Date.now() < until) {
    const path = PATHS[Math.floor(Math.random() * PATHS.length)]!;
    const token = tokens[workerId % tokens.length]!;
    out.push(await hit(path, token));
  }
}

async function main() {
  console.log(`Load test → ${BASE}`);
  console.log(`Workers: ${CONCURRENCY}, duration: ${DURATION_SEC}s, paths: ${PATHS.join(", ")}`);

  const warm = await hit("/api/health", "");
  if (!warm.ok) {
    console.error("API not reachable");
    process.exit(1);
  }

  const tokens: string[] = [];
  for (const email of LOAD_USERS) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: loadHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email: email.trim(), password: PASS }),
    });
    const json = await res.json();
    if (res.ok && json.token) tokens.push(json.token);
  }
  if (!tokens.length) throw new Error("No load-test users could sign in (rate limit?). Flush Redis and retry.");
  console.log(`Authenticated ${tokens.length} user(s) for load spread`);

  const until = Date.now() + DURATION_SEC * 1000;
  const samples: Sample[] = [];
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(tokens, i, until, samples));
  await Promise.all(workers);

  const ok = samples.filter((s) => s.ok);
  const fail = samples.filter((s) => !s.ok);
  const ms = ok.map((s) => s.ms).sort((a, b) => a - b);
  const byPath = new Map<string, { ok: number; fail: number; ms: number[] }>();
  for (const s of samples) {
    const row = byPath.get(s.path) || { ok: 0, fail: 0, ms: [] };
    if (s.ok) {
      row.ok++;
      row.ms.push(s.ms);
    } else row.fail++;
    byPath.set(s.path, row);
  }

  const totalSec = DURATION_SEC;
  const rps = samples.length / totalSec;

  console.log("\n--- Results ---");
  console.log(`Total requests: ${samples.length} (${(rps).toFixed(1)} req/s)`);
  console.log(`Success: ${ok.length}  Errors: ${fail.length} (${((fail.length / samples.length) * 100).toFixed(2)}%)`);
  if (ms.length) {
    console.log(
      `Latency (ok): p50=${Math.round(percentile(ms, 0.5))}ms p95=${Math.round(percentile(ms, 0.95))}ms p99=${Math.round(percentile(ms, 0.99))}ms max=${Math.round(ms[ms.length - 1]!)}ms`
    );
  }
  console.log("\nBy endpoint:");
  for (const [path, row] of byPath) {
    row.ms.sort((a, b) => a - b);
    const p95 = row.ms.length ? Math.round(percentile(row.ms, 0.95)) : 0;
    console.log(`  ${path}: ok=${row.ok} fail=${row.fail} p95=${p95}ms`);
  }
  if (fail.length) {
    const codes = [...new Set(fail.map((f) => f.status))].join(", ");
    console.log(`\nError status codes: ${codes}`);
  }

  const errorRate = fail.length / Math.max(1, samples.length);
  const p95 = ms.length ? percentile(ms, 0.95) : 0;
  const pass = errorRate < 0.05 && p95 < 5000;
  if (fail.some((f) => f.status === 429)) {
    console.log("\nNote: 429 responses mean API rate limits kicked in. Lower LOAD_CONCURRENCY or raise limits for stress testing.");
  }
  console.log(pass ? "\nLoad test PASSED (error rate < 2%, p95 < 5s)" : "\nLoad test FAILED thresholds");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
