import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYMENT_CONFIRMING_BODY,
  PAYMENT_CONFIRMING_TITLE,
  PAYMENT_GRANTED_TITLE,
  PAYMENT_TIMEOUT_TITLE,
  bookingCreditWallState,
  paymentCreditBannerCopy,
  paymentCreditBannerState,
  prepaidHoursBadgeLabel,
  remainingCreditsCaption,
} from "./portal-sat-payment.ts";

test("checkout return with an unchanged zero balance is confirming, not granted", () => {
  assert.equal(
    paymentCreditBannerState({ remainingHours: 0, baselineHours: 0, timedOut: false }),
    "confirming",
  );
  const copy = paymentCreditBannerCopy("confirming", 0);
  assert.equal(copy.title, PAYMENT_CONFIRMING_TITLE);
  assert.equal(copy.body, PAYMENT_CONFIRMING_BODY);
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /credits are ready/i);
  assert.match(copy.body, /webhook/i);
});

test("credits are granted only after the ledger increases", () => {
  assert.equal(
    paymentCreditBannerState({ remainingHours: 1, baselineHours: 0, timedOut: false }),
    "granted",
  );
  const copy = paymentCreditBannerCopy("granted", 1);
  assert.equal(copy.title, PAYMENT_GRANTED_TITLE);
  assert.match(copy.body, /1 prepaid hour/);
});

test("timeout stays honest when the webhook has not posted credit", () => {
  assert.equal(
    paymentCreditBannerState({ remainingHours: 0, baselineHours: 0, timedOut: true }),
    "timeout",
  );
  const copy = paymentCreditBannerCopy("timeout", 0);
  assert.equal(copy.title, PAYMENT_TIMEOUT_TITLE);
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /credits are ready/i);
  assert.match(copy.body, /webhook/i);
});

test("a spent prepaid hour still counts as granted after checkout", () => {
  assert.equal(
    paymentCreditBannerState({
      remainingHours: 0,
      baselineHours: 0,
      timedOut: false,
      purchasedHours: 1,
      baselinePurchasedHours: 0,
    }),
    "granted",
  );
  const copy = paymentCreditBannerCopy("granted", 0, { usedHours: 1 });
  assert.equal(copy.title, PAYMENT_GRANTED_TITLE);
  assert.match(copy.body, /reserved on the booked session/i);
  assert.doesNotMatch(copy.body, /has not granted credit/i);
});

test("zero remaining with a reserved session is not an unpaid purchase wall", () => {
  assert.equal(
    bookingCreditWallState({
      remainingHours: 0,
      purchasedHours: 1,
      hasLiveBookedSession: true,
      rescheduling: false,
    }),
    "reserved",
  );
  assert.equal(
    bookingCreditWallState({
      remainingHours: 0,
      purchasedHours: 0,
      hasLiveBookedSession: false,
      rescheduling: false,
    }),
    "unpaid",
  );
  assert.equal(
    bookingCreditWallState({
      remainingHours: 0,
      purchasedHours: 1,
      hasLiveBookedSession: true,
      rescheduling: true,
    }),
    "none",
  );
});

test("a restored remaining hour is available to book, not reserved or unpaid", () => {
  assert.equal(
    bookingCreditWallState({
      remainingHours: 1,
      purchasedHours: 1,
      hasLiveBookedSession: false,
      rescheduling: false,
    }),
    "available",
  );
  assert.equal(
    bookingCreditWallState({
      remainingHours: 0,
      purchasedHours: 1,
      hasLiveBookedSession: false,
      rescheduling: false,
    }),
    "spent",
  );
});

test("zero remaining after a purchase is reserved copy only while a session is booked", () => {
  assert.equal(prepaidHoursBadgeLabel(0, 1, true), "Hour reserved");
  assert.equal(prepaidHoursBadgeLabel(1, 1, false), "1 prepaid hour");
  assert.equal(prepaidHoursBadgeLabel(0, 1, false), "0 prepaid hours");
  assert.equal(prepaidHoursBadgeLabel(0, 0), "0 prepaid hours");
  assert.match(
    remainingCreditsCaption({
      remainingHours: 0,
      purchasedHours: 1,
      usedHours: 1,
      hasLiveBookedSession: true,
    }),
    /reserved on a booked session/i,
  );
  assert.equal(
    remainingCreditsCaption({ remainingHours: 1, purchasedHours: 1, usedHours: 0 }),
    "Remaining credits: 1",
  );
  assert.equal(
    remainingCreditsCaption({ remainingHours: 0, purchasedHours: 1, usedHours: 0 }),
    "Remaining credits: 0",
  );
});
