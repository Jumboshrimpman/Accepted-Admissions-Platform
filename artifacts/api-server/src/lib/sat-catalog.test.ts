import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_SAT_CATALOG,
  RETIRED_TEST_SAT_HOUR_SLUG,
  SAMA_LIVE_CHECKOUT_TEST_SLUG,
  SAT_SESSION_120_PRICE_CENTS,
  SAT_SESSION_90_PRICE_CENTS,
  SINGLE_SAT_SESSION_PRICE_CENTS,
  TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
  canBuySamaLiveCheckoutTest,
  isAcceptedSatCatalogProduct,
  isRetiredSatTestProduct,
  previewOffersFromCatalogProducts,
} from "./sat-catalog.ts";

test("SAT catalog lists only live hourly and package prices", () => {
  assert.equal(
    ACCEPTED_SAT_CATALOG.some((product) => product.slug === RETIRED_TEST_SAT_HOUR_SLUG),
    false,
  );
  assert.equal(
    ACCEPTED_SAT_CATALOG.some((product) => product.name.toLowerCase() === "test"),
    false,
  );
  assert.equal(isRetiredSatTestProduct(RETIRED_TEST_SAT_HOUR_SLUG), true);

  const single = ACCEPTED_SAT_CATALOG.find((product) => product.slug === "single-sat-session");
  const pack = ACCEPTED_SAT_CATALOG.find((product) => product.slug === "ten-sat-session-package");

  assert.equal(single?.name, "Single SAT Session");
  assert.equal(single?.totalPriceCents, SINGLE_SAT_SESSION_PRICE_CENTS);
  assert.equal(SINGLE_SAT_SESSION_PRICE_CENTS, 13_000);

  assert.equal(pack?.name, "Ten SAT Session Package");
  assert.equal(pack?.totalPriceCents, TEN_SAT_SESSION_PACKAGE_PRICE_CENTS);
  assert.equal(TEN_SAT_SESSION_PACKAGE_PRICE_CENTS, 130_000);
  assert.equal(ACCEPTED_SAT_CATALOG.length, 4);
  const ninety = ACCEPTED_SAT_CATALOG.find((product) => product.slug === "sat-session-90");
  const oneTwenty = ACCEPTED_SAT_CATALOG.find((product) => product.slug === "sat-session-120");
  assert.equal(ninety?.durationHours, 1.5);
  assert.equal(ninety?.totalPriceCents, SAT_SESSION_90_PRICE_CENTS);
  assert.equal(SAT_SESSION_90_PRICE_CENTS, 19_500);
  assert.equal(oneTwenty?.durationHours, 2);
  assert.equal(oneTwenty?.totalPriceCents, SAT_SESSION_120_PRICE_CENTS);
  assert.equal(SAT_SESSION_120_PRICE_CENTS, 26_000);
  assert.equal(
    ACCEPTED_SAT_CATALOG.some((product) => product.slug === SAMA_LIVE_CHECKOUT_TEST_SLUG),
    false,
  );
});

test("checkout allowlist rejects the retired test SKU and price drift", () => {
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: RETIRED_TEST_SAT_HOUR_SLUG,
      active: true,
      durationHours: 1,
      totalPriceCents: 100,
    }),
    false,
  );
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: "single-sat-session",
      active: false,
      durationHours: 1,
      totalPriceCents: 13_000,
    }),
    false,
  );
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: "single-sat-session",
      active: true,
      durationHours: 1,
      totalPriceCents: 100,
    }),
    false,
  );
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: "single-sat-session",
      active: true,
      durationHours: 1,
      totalPriceCents: 13_000,
    }),
    true,
  );
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: "ten-sat-session-package",
      active: true,
      durationHours: 10,
      totalPriceCents: 130_000,
    }),
    true,
  );
});

test("preview offers load both active catalog products", () => {
  const offers = previewOffersFromCatalogProducts(
    ACCEPTED_SAT_CATALOG.map((product) => ({ ...product, active: true })),
  );
  assert.deepEqual(
    offers.map((offer) => offer.slug),
    ["single-sat-session", "sat-session-90", "sat-session-120", "ten-sat-session-package"],
  );
  assert.equal(offers[0]?.priceCents, SINGLE_SAT_SESSION_PRICE_CENTS);
  assert.equal(offers[1]?.priceCents, SAT_SESSION_90_PRICE_CENTS);
  assert.equal(offers[2]?.priceCents, SAT_SESSION_120_PRICE_CENTS);
  assert.equal(offers[3]?.priceCents, TEN_SAT_SESSION_PACKAGE_PRICE_CENTS);
  assert.equal(offers.every((offer) => offer.durationMinutes === 60), true);
});

test("the $1 checkout is limited to Sama's account and administrators", () => {
  assert.equal(canBuySamaLiveCheckoutTest({ role: "administrator", email: "other@example.com" }), true);
  assert.equal(
    canBuySamaLiveCheckoutTest({ role: "student", email: "samapostgrad@gmail.com" }),
    true,
  );
  for (const email of [
    "samakubba@gmail.com",
    "samakubba@icloud.com",
    "kubbasama@gmail.com",
    "taito0525@gmail.com",
  ]) {
    assert.equal(canBuySamaLiveCheckoutTest({ role: "student", email }), false);
  }
  assert.equal(canBuySamaLiveCheckoutTest({ role: "tutor", email: "samakubba@icloud.com" }), false);
  assert.equal(isRetiredSatTestProduct(SAMA_LIVE_CHECKOUT_TEST_SLUG), false);
});
