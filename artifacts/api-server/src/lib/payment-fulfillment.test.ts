import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { missingProductFulfillmentError, paymentRequiresCatalogProduct, purchaseCreditFulfillmentKey, purchaseCreditHours } from "./payment-fulfillment-rules.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { TEST_SAT_HOUR_DURATION_HOURS, TEST_SAT_HOUR_PRICE_CENTS } from "./sat-catalog.ts";

test("purchase fulfillment hours always come from product.durationHours", () => {
  assert.equal(purchaseCreditHours({ durationHours: 1 }), 1);
  assert.equal(purchaseCreditHours({ durationHours: 10 }), 10);
  assert.equal(purchaseCreditHours({ durationHours: TEST_SAT_HOUR_DURATION_HOURS }), 1);
  assert.equal(purchaseCreditHours({ durationHours: "3" }), 3);
  assert.throws(() => purchaseCreditHours({ durationHours: 0 }), /durationHours/);
  assert.throws(() => purchaseCreditHours({ durationHours: -1 }), /durationHours/);
  assert.throws(() => purchaseCreditHours({ durationHours: "missing" }), /durationHours/);
});

test("$1 test SAT hour still grants one catalog hour, not a dollar-derived fraction", () => {
  assert.equal(TEST_SAT_HOUR_PRICE_CENTS, 100);
  assert.equal(purchaseCreditHours({ durationHours: TEST_SAT_HOUR_DURATION_HOURS }), 1);
  assert.notEqual(TEST_SAT_HOUR_PRICE_CENTS / 13_000, TEST_SAT_HOUR_DURATION_HOURS);
});

test("checkout payments require a catalog product before they can be marked paid", () => {
  assert.equal(paymentRequiresCatalogProduct({ productId: "prod", method: "stripe_checkout" }), true);
  assert.equal(paymentRequiresCatalogProduct({ productId: null, method: "stripe_checkout" }), true);
  assert.equal(paymentRequiresCatalogProduct({ productId: "prod", method: "offline" }), true);
  assert.equal(paymentRequiresCatalogProduct({ productId: null, method: "offline" }), false);
});

test("missing product errors stay explicit and refuse a silent paid mark", () => {
  const error = missingProductFulfillmentError("pay_123", "prod_missing");
  assert.match(error.message, /pay_123/);
  assert.match(error.message, /prod_missing/);
  assert.match(error.message, /Credits were not granted/);
  assert.equal(purchaseCreditFulfillmentKey("pay_123"), "payment:pay_123");
});
