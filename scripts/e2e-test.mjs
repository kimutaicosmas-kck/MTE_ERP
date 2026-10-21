#!/usr/bin/env node
/**
 * MTE ERP end-to-end API smoke test
 * Usage: node scripts/e2e-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:4000";
const WEB = process.argv[3] || "http://localhost:5173";
const PASS = "Mte@2026";

const roles = {
  superadmin: "superadmin@mte.local",
  admin: "admin@mte.local",
  sales: "sales@mte.local",
  warehouse: "warehouse@mte.local",
  finance: "finance@mte.local",
};

const results = [];

function log(status, area, detail) {
  results.push({ status, area, detail });
  const icon = status === "PASS" ? "✓" : status === "WARN" ? "!" : "✗";
  console.log(`${icon} [${status}] ${area}: ${detail}`);
}

async function req(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function login(email) {
  const r = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASS }) });
  if (!r.ok || !r.body?.token) throw new Error(r.body?.error || `Login failed ${r.status}`);
  return r.body.token;
}

async function testEndpoint(token, method, path, label, expect = 200) {
  const r = await req(path, { method, token });
  if (r.status === expect) log("PASS", label, `${method} ${path} → ${r.status}`);
  else log("FAIL", label, `${method} ${path} → ${r.status} ${typeof r.body === "object" ? r.body?.error || "" : r.body}`);
  return r;
}

async function main() {
  console.log("\n=== MTE ERP E2E TEST ===");
  console.log(`API: ${BASE}  WEB: ${WEB}\n`);

  // Infrastructure
  try {
    const h = await req("/api/health");
    if (h.ok) log("PASS", "Infrastructure", "API health OK");
    else log("FAIL", "Infrastructure", `Health ${h.status}`);
  } catch (e) {
    log("FAIL", "Infrastructure", `API unreachable: ${e.message}`);
    printSummary();
    process.exit(1);
  }

  try {
    const w = await fetch(WEB);
    if (w.ok) log("PASS", "Infrastructure", `Web app ${WEB} → ${w.status}`);
    else log("FAIL", "Infrastructure", `Web ${w.status}`);
  } catch (e) {
    log("FAIL", "Infrastructure", `Web unreachable: ${e.message}`);
  }

  // Login — all demo roles
  const tokens = {};
  for (const [role, email] of Object.entries(roles)) {
    try {
      tokens[role] = await login(email);
      log("PASS", "Auth", `Login ${role} (${email})`);
    } catch (e) {
      log("FAIL", "Auth", `Login ${role}: ${e.message}`);
    }
  }

  const admin = tokens.superadmin || tokens.admin;
  if (!admin) {
    log("FAIL", "Auth", "Cannot continue without admin token");
    printSummary();
    process.exit(1);
  }

  // Session
  const me = await req("/api/auth/me", { token: admin });
  if (me.ok && me.body?.email) log("PASS", "Auth", `/me → ${me.body.name} (${me.body.role})`);
  else log("FAIL", "Auth", `/me failed ${me.status}`);

  // Superadmin — all modules
  const modules = [
    ["Dashboard", "GET", "/api/dashboard"],
    ["Inventory", "GET", "/api/parts"],
    ["Sales orders", "GET", "/api/orders"],
    ["Customers", "GET", "/api/customers"],
    ["Vendors", "GET", "/api/vendors"],
    ["Procurement", "GET", "/api/purchases"],
    ["Finance invoices", "GET", "/api/finance/invoices"],
    ["Finance P&L", "GET", "/api/finance/pnl"],
    ["Finance expenses", "GET", "/api/finance/expenses"],
    ["Finance bills", "GET", "/api/finance/bills"],
    ["Finance journals", "GET", "/api/finance/journals"],
    ["Finance accounts", "GET", "/api/finance/accounts"],
    ["Finance VAT", "GET", "/api/finance/vat"],
    ["Reports inventory", "GET", "/api/reports/inventory"],
    ["Reports sales perf", "GET", "/api/reports/sales?when=month"],
    ["Reports customers", "GET", "/api/reports/customers"],
    ["Reports audit", "GET", "/api/reports/audit"],
    ["Approvals", "GET", "/api/approvals"],
    ["HR employees", "GET", "/api/hr/employees"],
    ["HR leave", "GET", "/api/hr/leave"],
    ["HR attendance", "GET", "/api/hr/attendance"],
    ["Settings", "GET", "/api/settings"],
    ["Notices", "GET", "/api/notices"],
    ["System workers", "GET", "/api/system/workers"],
  ];

  for (const [label, method, path] of modules) {
    await testEndpoint(admin, method, path, `Module/${label}`);
  }

  // Data sanity
  const dash = await req("/api/dashboard", { token: admin });
  if (dash.ok) {
    const t = dash.body?.tiles || {};
    const mix = dash.body?.salesMix?.length || 0;
    const inv = dash.body?.invoices?.length || 0;
    if (t.products > 0) log("PASS", "Data", `Dashboard: ${t.products} products, ${inv} invoices, ${mix} sales categories`);
    else log("WARN", "Data", "Dashboard tiles empty — seed may be missing");
    if (mix > 0) log("PASS", "Data", "Sales mix by category populated");
    else log("WARN", "Data", "Sales mix empty for this month");
  }

  const fin = await req("/api/finance/invoices", { token: admin });
  if (fin.ok && Array.isArray(fin.body) && fin.body.length > 0) {
    const paid = fin.body.filter((i) => i.totals?.balance <= 0.01);
    const overdue = fin.body.filter((i) => i.status === "OVERDUE" || (i.totals?.balance > 0.01 && i.dueAt && new Date(i.dueAt) < new Date()));
    const paidAmt = paid.reduce((s, i) => s + (i.totals?.gross || 0), 0);
    log("PASS", "Finance KPIs", `${fin.body.length} invoices, ${paid.length} paid (${Math.round(paidAmt).toLocaleString()} KES), ${overdue.length} overdue`);
  }

  // Role-based access
  if (tokens.sales) {
    await testEndpoint(tokens.sales, "GET", "/api/orders", "RBAC/Sales→orders");
    await testEndpoint(tokens.sales, "GET", "/api/reports/sales", "RBAC/Sales→performance");
    const denied = await req("/api/finance/invoices", { token: tokens.sales });
    if (denied.status === 403) log("PASS", "RBAC", "Sales blocked from finance invoices");
    else log("WARN", "RBAC", `Sales finance access: ${denied.status} (expected 403)`);
  }

  if (tokens.warehouse) {
    await testEndpoint(tokens.warehouse, "GET", "/api/orders", "RBAC/Warehouse→orders");
    await testEndpoint(tokens.warehouse, "GET", "/api/purchases", "RBAC/Warehouse→procurement");
    const denied = await req("/api/reports/audit", { token: tokens.warehouse });
    if (denied.status === 403) log("PASS", "RBAC", "Warehouse blocked from audit");
    else log("WARN", "RBAC", `Warehouse audit: ${denied.status}`);
  }

  if (tokens.finance) {
    await testEndpoint(tokens.finance, "GET", "/api/finance/invoices", "RBAC/Finance→invoices");
    await testEndpoint(tokens.finance, "GET", "/api/reports/customers", "RBAC/Finance→reports");
  }

  // Sales flow read check
  const orders = await req("/api/orders", { token: admin });
  if (orders.ok && orders.body?.length) {
    const confirmed = orders.body.filter((o) => o.status === "CONFIRMED" || o.status === "PICKING");
    log("PASS", "Dispatch", `${orders.body.length} orders, ${confirmed.length} in dispatch queue`);
    const sample = orders.body.find((o) => o.status !== "DRAFT" && o.status !== "CANCELLED");
    if (sample) {
      const pdf = await req(`/api/orders/${sample.id}/pdf/delivery`, { token: admin });
      if (pdf.status === 200 && typeof pdf.body !== "object") log("PASS", "Documents", "Delivery note PDF generates");
      else if (pdf.ok) log("PASS", "Documents", "Delivery note PDF OK");
      else log("WARN", "Documents", `Delivery PDF ${pdf.status}`);
    }
  }

  // Logout
  const logout = await req("/api/auth/logout", { method: "POST", token: admin });
  if (logout.ok || logout.status === 204) log("PASS", "Auth", "Logout OK");
  else log("FAIL", "Auth", `Logout ${logout.status}`);

  const after = await req("/api/auth/me", { token: admin });
  if (after.status === 401) log("PASS", "Auth", "Session invalidated after logout");
  else log("WARN", "Auth", `Post-logout /me → ${after.status} (expected 401)`);

  // Web SPA routes (index.html)
  const routes = ["/", "/sales", "/sales/performance", "/dispatch", "/inventory", "/finance", "/reports", "/hr", "/settings"];
  for (const route of routes) {
    try {
      const r = await fetch(`${WEB}${route}`);
      if (r.ok) log("PASS", "Web route", `${route} → ${r.status}`);
      else log("FAIL", "Web route", `${route} → ${r.status}`);
    } catch (e) {
      log("FAIL", "Web route", `${route}: ${e.message}`);
    }
  }

  printSummary();
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log("\n=== SUMMARY ===");
  console.log(`PASS: ${pass}  WARN: ${warn}  FAIL: ${fail}  TOTAL: ${results.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
