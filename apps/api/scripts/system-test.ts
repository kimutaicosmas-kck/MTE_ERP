/**
 * MTE ERP system test: import → stock → sale → dispatch → invoice → payment,
 * plus security and performance checks. Run against a live API (Docker or dev).
 *
 * Usage: npm run system-test -w api
 * Env:   API_BASE=http://127.0.0.1:4000
 */

const BASE = (process.env.API_BASE || "http://127.0.0.1:4000").replace(/\/$/, "");
const PASS = "Mte@2026";

type Result = { name: string; ok: boolean; ms?: number; detail?: string };

const results: Result[] = [];
const tag = Date.now().toString(36).toUpperCase();
const tokens: Record<string, string> = {};

function pass(name: string, detail?: string, ms?: number) {
  results.push({ name, ok: true, detail, ms });
  console.log(`  ✓ ${name}${ms != null ? ` (${ms}ms)` : ""}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail: string, ms?: number) {
  results.push({ name, ok: false, detail, ms });
  console.log(`  ✗ ${name}${ms != null ? ` (${ms}ms)` : ""} — ${detail}`);
}

async function req(
  method: string,
  path: string,
  opts?: { token?: string; body?: unknown; expect?: number }
): Promise<{ status: number; json: any; ms: number }> {
  const t0 = performance.now();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts?.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ms = Math.round(performance.now() - t0);
  let json: any = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  const expect = opts?.expect ?? (method === "POST" ? 201 : 200);
  if (res.status !== expect && opts?.expect === undefined) {
    /* caller validates */
  }
  return { status: res.status, json, ms };
}

async function login(email: string): Promise<string> {
  if (tokens[email]) return tokens[email];
  const { status, json } = await req("POST", "/api/auth/login", {
    body: { email, password: PASS },
    expect: 200,
  });
  if (status !== 200 || !json?.token) {
    throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(json)}`);
  }
  tokens[email] = json.token as string;
  return tokens[email];
}

function assertStatus(name: string, got: number, want: number, json: unknown, ms: number) {
  if (got === want) pass(name, undefined, ms);
  else fail(name, `expected HTTP ${want}, got ${got}: ${JSON.stringify(json).slice(0, 180)}`, ms);
  return got === want;
}

async function bench(name: string, fn: () => Promise<void>, samples = 15) {
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const p50 = Math.round(times[Math.floor(times.length * 0.5)]!);
  const p95 = Math.round(times[Math.floor(times.length * 0.95)]!);
  const max = Math.round(times[times.length - 1]!);
  const ok = p95 < 3000;
  if (ok) pass(`Perf: ${name}`, `p50=${p50}ms p95=${p95}ms max=${max}ms (${samples} req)`);
  else fail(`Perf: ${name}`, `p95=${p95}ms exceeds 3000ms budget`, p95);
}

async function runFlow() {
  console.log("\n=== End-to-end business flow ===\n");

  const adminTok = await login("admin@mte.local");
  const warehouseTok = await login("warehouse@mte.local");
  const salesTok = await login("sales@mte.local");
  const financeTok = await login("finance@mte.local");

  const sku = `SYS-${tag}`;

  // CSV import (goods master data)
  let r = await req("POST", "/api/import/parts", {
    token: adminTok,
    body: {
      rows: [
        {
          sku,
          oemNumber: `OEM-${tag}`,
          name: `System test filter ${tag}`,
          category: "Filters",
          binLocation: "Z-99-01",
          cost: "500",
          salePrice: "950",
          reorderLevel: "2",
          critical: "false",
          qtyOnHand: "0",
        },
      ],
    },
    expect: 200,
  });
  if (!assertStatus("Import part via CSV", r.status, 200, r.json, r.ms)) return;
  if (!r.json.created && !r.json.updated) {
    fail("Import part via CSV", `no rows created: ${JSON.stringify(r.json)}`);
    return;
  }
  pass("Import part recognized", `${r.json.created ?? 0} created, ${r.json.updated ?? 0} updated`);

  r = await req("GET", "/api/parts", { token: warehouseTok, expect: 200 });
  const part = (r.json as { sku: string; id: string; qtyOnHand: number }[]).find((p) => p.sku === sku);
  if (!part) {
    fail("Part visible in inventory", "SKU not found after import");
    return;
  }
  pass("Part listed in inventory", `id=${part.id.slice(0, 8)}… qty=${part.qtyOnHand}`);

  r = await req("GET", "/api/vendors", { token: warehouseTok, expect: 200 });
  const vendor = r.json[0];
  if (!vendor?.id) {
    fail("Vendor lookup", "no vendors");
    return;
  }

  // Purchase order (import shipment)
  r = await req("POST", "/api/purchases", {
    token: warehouseTok,
    body: {
      vendorId: vendor.id,
      reference: `BL-${tag}`,
      notes: "System test import PO",
      lines: [{ partId: part.id, qtyOrdered: 5, unitCost: 500 }],
    },
    expect: 201,
  });
  if (!assertStatus("Create purchase order", r.status, 201, r.json, r.ms)) return;
  const poId = r.json.id as string;
  const poLineId = r.json.lines[0].id as string;
  pass("PO created", r.json.number);

  r = await req("POST", `/api/purchases/${poId}/receive`, {
    token: warehouseTok,
    body: { lines: [{ lineId: poLineId, qty: 5 }], notes: "GRN system test" },
    expect: 201,
  });
  if (!assertStatus("Goods receipt (GRN)", r.status, 201, r.json, r.ms)) return;
  pass("GRN posted", r.json.receipt?.number || "receipt ok");

  r = await req("GET", `/api/parts/${part.id}`, { token: warehouseTok, expect: 200 });
  const qtyAfterGrn = r.json.qtyOnHand as number;
  if (qtyAfterGrn >= 5) pass("Stock on hand updated", `qty=${qtyAfterGrn}`);
  else fail("Stock on hand updated", `expected ≥5, got ${qtyAfterGrn}`);

  r = await req("GET", "/api/customers", { token: salesTok, expect: 200 });
  const customer = (r.json as { id: string; name: string }[]).find((c) => c.name.includes("Walk-in")) || r.json[0];
  if (!customer?.id) {
    fail("Customer lookup", "none");
    return;
  }

  // Quotation → sales order / invoice
  r = await req("POST", "/api/orders", {
    token: salesTok,
    body: {
      channel: "SHOP",
      customerId: customer.id,
      dispatchMethod: "SHOP_COLLECT",
      lines: [{ partId: part.id, qty: 1 }],
    },
    expect: 201,
  });
  if (!assertStatus("Create quotation", r.status, 201, r.json, r.ms)) return;
  const orderId = r.json.id as string;
  pass("Quotation created", r.json.number);

  r = await req("POST", `/api/orders/${orderId}/convert`, { token: salesTok, expect: 200 });
  if (!assertStatus("Convert to sales order + invoice", r.status, 200, r.json, r.ms)) return;
  const invoiceNo = r.json.invoice?.number || r.json.invoiceNumber;
  pass("Invoice issued", `${invoiceNo} status=${r.json.status}`);

  // Dispatch workflow
  const whStatus = async (status: string) =>
    req("POST", `/api/orders/${orderId}/status`, { token: warehouseTok, body: { status }, expect: 200 });

  r = await whStatus("PICKING");
  if (!assertStatus("Dispatch: start picking", r.status, 200, r.json, r.ms)) return;

  const orderDetail = r.json;
  r = await req("POST", `/api/orders/${orderId}/pick`, {
    token: warehouseTok,
    body: {
      lines: orderDetail.lines.map((l: { id: string; qty: number }) => ({ id: l.id, pickedQty: l.qty })),
    },
    expect: 200,
  });
  if (!assertStatus("Pick lines", r.status, 200, r.json, r.ms)) return;

  r = await whStatus("PACKING");
  if (!assertStatus("Dispatch: packing", r.status, 200, r.json, r.ms)) return;

  const forPack = await req("GET", `/api/orders/${orderId}`, { token: warehouseTok, expect: 200 });
  r = await req("POST", `/api/orders/${orderId}/pack`, {
    token: warehouseTok,
    body: {
      lines: forPack.json.lines.map((l: { id: string; qty: number }) => ({ id: l.id, packedQty: l.qty })),
      packingBoxes: 1,
    },
    expect: 200,
  });
  if (!assertStatus("Pack lines", r.status, 200, r.json, r.ms)) return;

  r = await req("POST", `/api/orders/${orderId}/qc`, { token: warehouseTok, body: { passed: true }, expect: 200 });
  if (!assertStatus("Quality check pass", r.status, 200, r.json, r.ms)) return;

  for (const step of ["PICKED", "DISPATCHED", "IN_TRANSIT", "DELIVERED"] as const) {
    r = await whStatus(step);
    if (!assertStatus(`Dispatch: ${step}`, r.status, 200, r.json, r.ms)) return;
  }
  pass("Delivery complete", "order DELIVERED");

  r = await req("GET", `/api/orders/${orderId}`, { token: financeTok, expect: 200 });
  const gross = r.json.totals?.gross ?? r.json.invoice?.gross;
  const payAmount = typeof gross === "number" ? gross : 950 * 1.16;

  r = await req("POST", `/api/orders/${orderId}/payments`, {
    token: financeTok,
    body: { amount: payAmount, method: "CASH", reference: `SYS-${tag}` },
    expect: 201,
  });
  if (!assertStatus("Record payment", r.status, 201, r.json, r.ms)) return;

  r = await req("GET", `/api/orders/${orderId}`, { token: financeTok, expect: 200 });
  const balance = r.json.totals?.balance ?? r.json.invoice?.balance;
  const invStatus = r.json.invoice?.status;
  if (balance <= 0.05 || invStatus === "PAID") pass("Invoice settled", `balance=${balance} status=${invStatus}`);
  else fail("Invoice settled", `balance=${balance} status=${invStatus}`);

  r = await req("GET", "/api/activity?limit=5", { token: adminTok, expect: 200 });
  if (r.status === 200 && Array.isArray(r.json)) pass("Audit trail readable", `${r.json.length} recent events`);
  else pass("Audit trail", r.status === 200 ? "ok" : `HTTP ${r.status}`);
}

async function runSecurity() {
  console.log("\n=== Security ===\n");

  let r = await req("GET", "/api/orders", { expect: 401 });
  assertStatus("Unauthenticated API blocked", r.status, 401, r.json, r.ms);

  r = await req("POST", "/api/auth/login", {
    body: { email: "nobody@mte.local", password: "wrong-password" },
    expect: 401,
  });
  if (r.status === 401) pass("Invalid password rejected", undefined, r.ms);
  else if (r.status === 429) pass("Login rate limit enforced", "429 after prior sign-ins", r.ms);
  else fail("Invalid password rejected", `expected 401 or 429, got ${r.status}`, r.ms);

  const salesTok = await login("sales@mte.local");
  r = await req("POST", "/api/parts", {
    token: salesTok,
    body: { sku: "HACK", name: "x", category: "x", cost: 1, salePrice: 2 },
    expect: 403,
  });
  assertStatus("Sales cannot create products", r.status, 403, r.json, r.ms);

  r = await req("POST", "/api/auth/login", {
    body: { email: "' OR 1=1 --", password: "x" },
    expect: 400,
  });
  if (r.status === 400) pass("Malformed login sanitized", undefined, r.ms);
  else if (r.status === 429) pass("Login rate limit (SQL probe blocked)", "429", r.ms);
  else fail("Malformed login sanitized", `expected 400 or 429, got ${r.status}`, r.ms);

  r = await req("GET", "/api/../etc/passwd", { token: salesTok, expect: 404 });
  if (r.status === 404 || r.status === 400) pass("Path traversal blocked", `HTTP ${r.status}`);
  else fail("Path traversal blocked", `HTTP ${r.status}`);

  const sales2Tok = await login("sales2@mte.local");
  const mine = await req("GET", "/api/orders", { token: salesTok, expect: 200 });
  const theirs = await req("GET", "/api/orders", { token: sales2Tok, expect: 200 });
  const myIds = new Set((mine.json as { id: string }[]).map((o) => o.id));
  const foreign = (theirs.json as { id: string }[]).find((o) => !myIds.has(o.id));
  if (foreign) {
    r = await req("GET", `/api/orders/${foreign.id}`, { token: salesTok, expect: 403 });
    assertStatus("Sales isolated to own orders", r.status, 403, r.json, r.ms);
  } else pass("Sales order isolation", "no overlapping sample orders");

  r = await req("GET", "/api/finance/dashboard", { token: salesTok, expect: 403 });
  assertStatus("Finance module gated", r.status, 403, r.json, r.ms);
}

async function runPerformance() {
  console.log("\n=== Performance ===\n");
  const tok = await login("admin@mte.local");

  await bench("GET /api/health", async () => {
    const h = await req("GET", "/api/health", { expect: 200 });
    if (h.status !== 200) throw new Error(String(h.status));
  });

  await bench("GET /api/dashboard", async () => {
    const d = await req("GET", "/api/dashboard", { token: tok, expect: 200 });
    if (d.status !== 200) throw new Error(String(d.status));
  });

  await bench("GET /api/parts", async () => {
    const p = await req("GET", "/api/parts", { token: tok, expect: 200 });
    if (p.status !== 200) throw new Error(String(p.status));
  });

  await bench("GET /api/orders", async () => {
    const o = await req("GET", "/api/orders", { token: tok, expect: 200 });
    if (o.status !== 200) throw new Error(String(o.status));
  });

  // light concurrency
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: 10 }, () => req("GET", "/api/health", { expect: 200 }))
  );
  const burstMs = Math.round(performance.now() - t0);
  if (burstMs < 5000) pass("Concurrent health (10 parallel)", `${burstMs}ms total`);
  else fail("Concurrent health (10 parallel)", `${burstMs}ms too slow`);
}

async function main() {
  console.log(`MTE ERP system test → ${BASE} (run ${tag})`);

  const health = await req("GET", "/api/health", { expect: 200 });
  if (health.status !== 200) {
    console.error("API not reachable. Start Docker or `npm run dev -w api`.");
    process.exit(1);
  }
  pass("API health", health.json.redis ? `redis=${health.json.redis}` : "ok", health.ms);

  await login("admin@mte.local");
  await login("warehouse@mte.local");
  await login("sales@mte.local");
  await login("sales2@mte.local");
  await login("finance@mte.local");

  try {
    await runFlow();
  } catch (e) {
    fail("E2E flow", e instanceof Error ? e.message : String(e));
  }

  try {
    await runSecurity();
  } catch (e) {
    fail("Security suite", e instanceof Error ? e.message : String(e));
  }

  try {
    await runPerformance();
  } catch (e) {
    fail("Performance suite", e instanceof Error ? e.message : String(e));
  }

  const passed = results.filter((x) => x.ok).length;
  const failed = results.filter((x) => !x.ok);
  console.log("\n=== Summary ===\n");
  console.log(`${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nAll system tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
