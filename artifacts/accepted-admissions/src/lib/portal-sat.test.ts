import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTAL_SAT_HREF,
  PORTAL_SAT_PURCHASE_HREF,
  canPurchaseOrBookSatCredits,
  canSeePortalSatNav,
  isOffPlatformProgramClient,
  isPortalHomePath,
  portalPathname,
  shouldShowSatPaymentReceipts,
  showsSelfServeSatCommerce,
} from "./portal-sat.ts";

test("only students can purchase or book SAT credits", () => {
  assert.equal(canPurchaseOrBookSatCredits("student"), true);
  assert.equal(canPurchaseOrBookSatCredits("tutor"), false);
  assert.equal(canPurchaseOrBookSatCredits("administrator"), false);
  assert.equal(canPurchaseOrBookSatCredits("viewer"), false);
  assert.equal(canPurchaseOrBookSatCredits(undefined), false);
});

const michelleCredits = { selfServeSatBooking: true, twelveSessionPlan: false };
const taitoCredits = { selfServeSatBooking: false, twelveSessionPlan: true };

test("Book SAT nav is only for self-serve students", () => {
  assert.equal(canSeePortalSatNav("student", michelleCredits), true);
  assert.equal(canSeePortalSatNav("student", taitoCredits), false);
  assert.equal(canSeePortalSatNav("student", null), false);
  assert.equal(canSeePortalSatNav("student"), false);
  assert.equal(canSeePortalSatNav("tutor", michelleCredits), false);
  assert.equal(canSeePortalSatNav("administrator", michelleCredits), false);
  assert.equal(canSeePortalSatNav("viewer", taitoCredits), false);
  assert.equal(canSeePortalSatNav("viewer", michelleCredits), false);
  assert.equal(showsSelfServeSatCommerce(michelleCredits), true);
  assert.equal(showsSelfServeSatCommerce(taitoCredits), false);
  assert.equal(showsSelfServeSatCommerce(null), false);
});

test("off-platform program clients skip Stripe booking and purchase gates", () => {
  assert.equal(isOffPlatformProgramClient(null), false);
  assert.equal(isOffPlatformProgramClient({ selfServeSatBooking: true, twelveSessionPlan: false }), false);
  assert.equal(isOffPlatformProgramClient({ selfServeSatBooking: false, twelveSessionPlan: false }), true);
  assert.equal(isOffPlatformProgramClient({ selfServeSatBooking: true, twelveSessionPlan: true }), true);
});

test("SAT payment and receipts stay hidden for Taito and visible for self-serve clients", () => {
  assert.equal(
    shouldShowSatPaymentReceipts({ selfServeSatBooking: false, twelveSessionPlan: true }),
    false,
  );
  assert.equal(
    shouldShowSatPaymentReceipts({ selfServeSatBooking: true, twelveSessionPlan: false }),
    true,
  );
  assert.equal(shouldShowSatPaymentReceipts(null), true);
});

test("Book SAT points at the homepage booking section", () => {
  assert.equal(PORTAL_SAT_HREF, "/portal#booking-schedule");
  assert.equal(PORTAL_SAT_PURCHASE_HREF, "/portal/sat");
  assert.equal(isPortalHomePath("/portal"), true);
  assert.equal(isPortalHomePath("/portal/curriculum"), true);
  assert.equal(isPortalHomePath("/portal/sat"), false);
  assert.equal(portalPathname("/portal#booking-schedule"), "/portal");
});
