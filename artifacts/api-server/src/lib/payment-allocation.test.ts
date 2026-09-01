import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import { tutorShareForRefund } from "./payment-allocation.ts";

test("allocates Xavier's exact $65 share from a $150 purchase", () => {
  assert.equal(tutorShareForRefund(6_500, 15_000, 0), 0);
  assert.equal(tutorShareForRefund(6_500, 15_000, 15_000), 6_500);
});

test("reverses Xavier's share proportionally and cumulatively", () => {
  assert.equal(tutorShareForRefund(6_500, 15_000, 3_000), 1_300);
  assert.equal(
    tutorShareForRefund(6_500, 15_000, 6_000) -
      tutorShareForRefund(6_500, 15_000, 3_000),
    1_300,
  );
  assert.equal(tutorShareForRefund(6_500, 15_000, 7_500), 3_250);
  assert.equal(tutorShareForRefund(6_500, 15_000, 30_000), 6_500);
});