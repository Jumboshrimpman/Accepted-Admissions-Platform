import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYMENT_CONFIRMING_BODY,
  PAYMENT_CONFIRMING_TITLE,
  PAYMENT_GRANTED_TITLE,
  PAYMENT_TIMEOUT_TITLE,
  paymentCreditBannerCopy,
  paymentCreditBannerState,
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
