import assert from "node:assert/strict";
import { isBusinessDataQuestion, wantsRevenueTotal } from "./assistant-intent.js";

assert.equal(wantsRevenueTotal("how much is todays sales"), true);
assert.equal(wantsRevenueTotal("how much are today's sales"), true);
assert.equal(wantsRevenueTotal("sales today"), true);
assert.equal(isBusinessDataQuestion("how much is todays sales"), true);
assert.equal(isBusinessDataQuestion("find customer kisumu"), false);

console.log("assistant-intent.test.ts ok");