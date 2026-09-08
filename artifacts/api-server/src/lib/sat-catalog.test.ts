import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_SAT_CATALOG,
  SINGLE_SAT_SESSION_PRICE_CENTS,
  TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
  TEST_SAT_HOUR_PRICE_CENTS,
  TEST_SAT_HOUR_SLUG,
  isAcceptedSatCatalogProduct,
} from "./sat-catalog.ts";

test("SAT catalog includes a $1 test SKU without changing live prices", () => {
  const testProduct = ACCEPTED_SAT_CATALOG.find((product) => product.slug === TEST_SAT_HOUR_SLUG);
  const single = ACCEPTED_SAT_CATALOG.find((product) => product.slug === "single-sat-session");
  const pack = ACCEPTED_SAT_CATALOG.find((product) => product.slug === "ten-sat-session-package");

  assert.equal(testProduct?.name, "test");
  assert.equal(testProduct?.durationHours, 1);
  assert.equal(testProduct?.totalPriceCents, TEST_SAT_HOUR_PRICE_CENTS);
  assert.equal(TEST_SAT_HOUR_PRICE_CENTS, 100);

  assert.equal(single?.name, "Single SAT Session");
  assert.equal(single?.totalPriceCents, SINGLE_SAT_SESSION_PRICE_CENTS);
  assert.equal(SINGLE_SAT_SESSION_PRICE_CENTS, 13_000);

  assert.equal(pack?.name, "Ten SAT Session Package");
  assert.equal(pack?.totalPriceCents, TEN_SAT_SESSION_PACKAGE_PRICE_CENTS);
  assert.equal(TEN_SAT_SESSION_PACKAGE_PRICE_CENTS, 130_000);
});

test("checkout allowlist accepts the active $1 test SKU and rejects price drift", () => {
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: TEST_SAT_HOUR_SLUG,
      active: true,
      durationHours: 1,
      totalPriceCents: 100,
    }),
    true,
  );
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: TEST_SAT_HOUR_SLUG,
      active: false,
      durationHours: 1,
      totalPriceCents: 100,
    }),
    false,
  );
  assert.equal(
    isAcceptedSatCatalogProduct({
      slug: TEST_SAT_HOUR_SLUG,
      active: true,
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
      totalPriceCents: 13_000,
    }),
    true,
  );
});
