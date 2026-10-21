/**
 * Quick checks for assistant rule routing (no HTTP).
 * Run: npx tsx scripts/assistant-smoke.ts
 */
import { searchLiveContext } from "../src/lib/assistant.js";
import { matchSalespersonHint } from "../src/lib/customer-search.js";

const user = { id: "test", role: "SUPER_ADMIN" };

async function main() {
  const msg = "how to create a sales order";
  const live = await searchLiveContext(user, msg);
  if (live.salespersonHint) {
    console.error("FAIL: workflow question should not set salespersonHint:", live.salespersonHint);
    process.exit(1);
  }
  const hint = await matchSalespersonHint(["sales", "order", "create"]);
  if (hint) {
    console.error("FAIL: generic terms should not match salesperson:", hint.name);
    process.exit(1);
  }
  const amina = await matchSalespersonHint(["amina"]);
  if (!amina || !amina.name.toLowerCase().includes("amina")) {
    console.error("FAIL: should still match amina by name");
    process.exit(1);
  }
  console.log("assistant-smoke: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
