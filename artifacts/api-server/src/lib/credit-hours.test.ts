import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { remainingCreditHours, summarizeCreditHours } from "./credit-hours.ts";

test("cancel-restore nets used hours so purchased, used, and remaining add up", () => {
  const summary = summarizeCreditHours([
    { entryType: "original", hours: 1 },
    { entryType: "debit", hours: 1 },
    { entryType: "restored", hours: 1 },
  ]);
  assert.deepEqual(summary, { purchasedHours: 1, usedHours: 0, remainingHours: 1 });
  assert.equal(summary.purchasedHours, summary.usedHours + summary.remainingHours);
});

test("an active reservation shows as used, not leftover remaining", () => {
  assert.deepEqual(
    summarizeCreditHours([
      { entryType: "original", hours: 1 },
      { entryType: "debit", hours: 1 },
    ]),
    { purchasedHours: 1, usedHours: 1, remainingHours: 0 },
  );
});

test("numeric ledger strings still summarize a restored hour as remaining", () => {
  assert.deepEqual(
    summarizeCreditHours([
      { entryType: "original", hours: "1" },
      { entryType: "debit", hours: "1" },
      { entryType: "restored", hours: "1" },
    ]),
    { purchasedHours: 1, usedHours: 0, remainingHours: 1 },
  );
});

test("remaining hours coerce numeric ledger values so a used purchase is zero, not unpaid", () => {
  assert.equal(
    remainingCreditHours([
      { entryType: "original", hours: "1" },
      { entryType: "debit", hours: "1" },
    ]),
    0,
  );
  assert.equal(remainingCreditHours([{ entryType: "original", hours: 1 }]), 1);
});
