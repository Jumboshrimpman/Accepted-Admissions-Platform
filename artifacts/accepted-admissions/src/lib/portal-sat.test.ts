import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTAL_SAT_HREF,
  PORTAL_SAT_PURCHASE_HREF,
  canPurchaseOrBookSatCredits,
  canSeePortalSatNav,
  isPortalHomePath,
  portalPathname,
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

test("Book SAT points at the homepage booking section", () => {
  assert.equal(PORTAL_SAT_HREF, "/portal#booking-schedule");
  assert.equal(PORTAL_SAT_PURCHASE_HREF, "/portal/sat");
  assert.equal(isPortalHomePath("/portal"), true);
  assert.equal(isPortalHomePath("/portal/curriculum"), true);
  assert.equal(isPortalHomePath("/portal/sat"), false);
  assert.equal(portalPathname("/portal#booking-schedule"), "/portal");
});
