import assert from "node:assert/strict";
import test from "node:test";
import {
  canPurchaseOrBookSatCredits,
  canSeePortalSatNav,
} from "./portal-sat.ts";

test("only students can purchase or book SAT credits", () => {
  assert.equal(canPurchaseOrBookSatCredits("student"), true);
  assert.equal(canPurchaseOrBookSatCredits("tutor"), false);
  assert.equal(canPurchaseOrBookSatCredits("administrator"), false);
  assert.equal(canPurchaseOrBookSatCredits("viewer"), false);
  assert.equal(canPurchaseOrBookSatCredits(undefined), false);
});

test("Book SAT nav is student-only", () => {
  assert.equal(canSeePortalSatNav("student"), true);
  assert.equal(canSeePortalSatNav("tutor"), false);
  assert.equal(canSeePortalSatNav("administrator"), false);
  assert.equal(canSeePortalSatNav("viewer"), false);
});
