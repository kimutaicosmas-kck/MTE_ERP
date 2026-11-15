const WEAK_SECRETS = new Set([
  "mte-erp-local-dev-secret-change-in-production",
  "mte-erp-change-in-production",
  "mte-demo-change-me",
  "CHANGE_ME_DEMO_JWT_SECRET",
]);

/** Refuse boot on public/demo hosts if JWT is still a template secret. */
export function assertProductionSecrets() {
  const strict =
    process.env.MTE_ENFORCE_SECRETS === "1" ||
    Boolean(process.env.PUBLIC_APP_URL) ||
    process.env.NODE_ENV === "production";
  if (!strict) return;

  const jwt = process.env.JWT_SECRET || "";
  if (!jwt || WEAK_SECRETS.has(jwt) || jwt.length < 24) {
    throw new Error(
      "JWT_SECRET must be a long random value in production (see .env.demo-server.example). Set MTE_ENFORCE_SECRETS=0 only for local dev.",
    );
  }

  if (process.env.LOAD_TEST_KEY) {
    console.warn("[MTE ERP] LOAD_TEST_KEY is set — disable on any public server.");
  }
}