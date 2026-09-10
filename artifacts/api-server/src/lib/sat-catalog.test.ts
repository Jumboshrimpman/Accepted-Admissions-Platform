import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCEPTED_SAT_CATALOG,
  RETIRED_TEST_SAT_HOUR_SLUG,
  SINGLE_SAT_SESSION_PRICE_CENTS,
  TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
  isAcceptedSatCatalogProduct,
  isRetiredSatTestProduct,
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
  assert.equal(ACCEPTED_SAT_CATALOG.length, 2);
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
