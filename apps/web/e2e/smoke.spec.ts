import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const LOAD_TEST_KEY = process.env.LOAD_TEST_KEY || "mte-local-load-key";
const PASS = "Mte@2026";

const modulePaths = ["/", "/sales", "/dispatch", "/inventory", "/procurement", "/customers", "/finance"];

async function seedSession(page: Page, request: APIRequestContext, email: string) {
  const res = await request.post("/api/auth/login", {
    headers: { "X-Load-Test-Key": LOAD_TEST_KEY },
    data: { email, password: PASS },
  });
  expect(res.ok(), `login ${email} → ${res.status()}`).toBeTruthy();
  const body = await res.json();
  await page.goto("/login");
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem("mte_token", token);
      localStorage.setItem("mte_user", JSON.stringify(user));
    },
    { token: body.token, user: body.user }
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main.app-main")).toBeVisible();
}

test.describe("MTE ERP UI smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("login page demo chip signs in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("main.app-main")).toBeVisible({ timeout: 20_000 });
  });

  test("super admin opens core modules", async ({ page, request }) => {
    await seedSession(page, request, "superadmin@mte.local");

    for (const path of modulePaths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main.app-main")).toBeVisible();
      await expect(page.getByText(/Sign in required|Invalid email/i)).not.toBeVisible();
      await expect(
        page.locator("main.app-main").locator(".stat-grid, .table-wrap, .suite-dash, .module-nav").first()
      ).toBeVisible({ timeout: 12_000 });
    }
  });

  test("sales user blocked from finance route", async ({ page, request }) => {
    await seedSession(page, request, "sales@mte.local");

    await page.goto("/sales", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main.app-main .suite-dash, main.app-main .table-wrap").first()).toBeVisible();

    await page.goto("/finance", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.locator("main.app-main")).toBeVisible();
  });

  test("API proxy healthy from browser context", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
