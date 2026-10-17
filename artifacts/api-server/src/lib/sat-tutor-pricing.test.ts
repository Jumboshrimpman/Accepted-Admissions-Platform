import assert from "node:assert/strict";
import test from "node:test";
import { MICHELLE_MAKAREM_CLERK_USER_ID } from "./calendar-pair-attendees.ts";
import { checkoutLineItemFields, hostedInvoiceItemFields } from "./payment-service.ts";
import {
  SAT_TUTOR_PRODUCTS,
  allowsLegacySatPool,
  displayedSatDescription,
  displayedSatHourlyCents,
  displayedSatPriceCents,
  isLegacySharedSatSlug,
  isMichelleMakaremUser,
  isStandardSatTutorProduct,
  previewOffersFromSatTutorProducts,
  satDebitPlan,
  satSpendableHours,
} from "./sat-tutor-pricing.ts";

const michelle = {
  clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
  email: "someone-else@example.com",
};
const michelleEmail = { email: "MakaremMichelle7@gmail.com" };
const retiredMichelleEmail = { email: "michaelmakarem@gmail.com" };
const sophia = {
  id: "bf530aa6-faaa-43df-b3cf-140026f3313e",
  email: "kubbasama@gmail.com",
  clerkUserId: "user_3KnHZLQbestfMDxWWpHThXLFiNO",
};

function product(slug: string) {
  const found = SAT_TUTOR_PRODUCTS.find((item) => item.slug === slug);
  if (!found) throw new Error(slug);
  return found;
}

test("per-tutor SAT catalog stores the standard rates", () => {
  assert.equal(SAT_TUTOR_PRODUCTS.length, 9);
  assert.deepEqual(
    SAT_TUTOR_PRODUCTS.filter((item) => item.tutorKey === "eunice").map((item) => item.totalPriceCents),
    [13_000, 19_500, 26_000],
  );
  assert.deepEqual(
    SAT_TUTOR_PRODUCTS.filter((item) => item.tutorKey === "victoria").map((item) => item.totalPriceCents),
    [13_000, 19_500, 26_000],
  );
  assert.deepEqual(
    SAT_TUTOR_PRODUCTS.filter((item) => item.tutorKey === "xavier").map((item) => item.totalPriceCents),
    [20_000, 30_000, 40_000],
  );
  assert.equal(isStandardSatTutorProduct({ ...product("sat-xavier-60"), active: true }), true);
  assert.equal(
    isStandardSatTutorProduct({ ...product("sat-xavier-60"), active: true, totalPriceCents: 13_000 }),
    false,
  );
  assert.equal(isLegacySharedSatSlug("single-sat-session"), true);
  assert.equal(isLegacySharedSatSlug("sat-eunice-60"), false);
  assert.equal(isStandardSatTutorProduct({
    slug: "single-sat-session",
    active: true,
    durationHours: 1,
    totalPriceCents: 13_000,
  }), false);
});

test("Michelle keeps Xavier at $130 and Sophia sees $200", () => {
  assert.equal(isMichelleMakaremUser(michelle), true);
  assert.equal(isMichelleMakaremUser({ email: "makaremmichelle7@gmail.com" }), true);
  assert.equal(isMichelleMakaremUser(michelleEmail), true);
  assert.equal(isMichelleMakaremUser(retiredMichelleEmail), false);
  assert.equal(isMichelleMakaremUser(sophia), false);
  assert.equal(isMichelleMakaremUser({ email: "kubbasama@gmail.com" }), false);

  for (const user of [michelle, michelleEmail]) {
    assert.equal(displayedSatHourlyCents("xavier", user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-xavier-60"), user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-xavier-90"), user), 19_500);
    assert.equal(displayedSatPriceCents(product("sat-xavier-120"), user), 26_000);
    assert.match(displayedSatDescription(product("sat-xavier-60"), user), /\$130\/hour/);
    assert.equal(displayedSatPriceCents(product("sat-eunice-60"), user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-victoria-90"), user), 19_500);
  }

  assert.equal(displayedSatHourlyCents("xavier", retiredMichelleEmail), 20_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-60"), retiredMichelleEmail), 20_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-90"), retiredMichelleEmail), 30_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-120"), retiredMichelleEmail), 40_000);
  assert.equal(allowsLegacySatPool("xavier", retiredMichelleEmail), false);
  assert.equal(displayedSatHourlyCents("xavier", sophia), 20_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-60"), sophia), 20_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-90"), sophia), 30_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-120"), sophia), 40_000);
  assert.equal(displayedSatDescription(product("sat-xavier-60"), sophia), product("sat-xavier-60").description);
  assert.equal(allowsLegacySatPool("xavier", sophia), false);
  assert.equal(allowsLegacySatPool("xavier", michelle), true);
  assert.equal(allowsLegacySatPool("eunice", sophia), true);
  assert.equal(allowsLegacySatPool("victoria", sophia), true);
});

test("legacy $130 hours book Eunice, Victoria, and Michelle's Xavier only", () => {
  const legacyId = "legacy-product";
  const xavierId = "xavier-product";
  const euniceId = "eunice-product";
  const entries = [
    { entryType: "original", hours: 4, productId: legacyId },
    { entryType: "debit", hours: 1, productId: null },
    { entryType: "original", hours: 2, productId: xavierId },
  ];
  const snapshot = entries.map((entry) => ({ ...entry }));
  const shared = {
    tutorProductIds: [xavierId],
    legacyProductIds: [legacyId],
  };

  assert.equal(satSpendableHours(entries, { ...shared, allowLegacy: false }), 2);
  assert.equal(satSpendableHours(entries, { ...shared, allowLegacy: true }), 5);
  assert.equal(
    satSpendableHours(entries, {
      tutorProductIds: [euniceId],
      legacyProductIds: [legacyId],
      allowLegacy: true,
    }),
    3,
  );

  const sophiaHour = satDebitPlan(entries, {
    ...shared,
    requiredHours: 1.5,
    tutorHourProductId: xavierId,
    allowLegacy: false,
  });
  assert.equal(sophiaHour.ok, true);
  if (sophiaHour.ok) {
    assert.deepEqual(sophiaHour.debits, [{ productId: xavierId, hours: 1.5 }]);
  }
  assert.equal(
    satDebitPlan(entries, {
      ...shared,
      requiredHours: 3,
      tutorHourProductId: xavierId,
      allowLegacy: false,
    }).ok,
    false,
  );

  const michelleSplit = satDebitPlan(entries, {
    ...shared,
    requiredHours: 3,
    tutorHourProductId: xavierId,
    allowLegacy: true,
  });
  assert.equal(michelleSplit.ok, true);
  if (michelleSplit.ok) {
    assert.deepEqual(michelleSplit.debits, [
      { productId: xavierId, hours: 2 },
      { productId: null, hours: 1 },
    ]);
  }

  const legacyOnly = satDebitPlan(entries, {
    tutorProductIds: [euniceId],
    legacyProductIds: [legacyId],
    requiredHours: 2,
    tutorHourProductId: euniceId,
    allowLegacy: true,
  });
  assert.equal(legacyOnly.ok, true);
  if (legacyOnly.ok) {
    assert.deepEqual(legacyOnly.debits, [{ productId: null, hours: 2 }]);
  }
  assert.deepEqual(entries, snapshot);
});

test("admin preview lists one-hour tutor rates for the viewed client", () => {
  const offers = previewOffersFromSatTutorProducts(
    SAT_TUTOR_PRODUCTS.map((item) => ({ ...item, active: true })),
    sophia,
  );
  assert.deepEqual(
    offers.map((offer) => ({ slug: offer.slug, priceCents: offer.priceCents, durationMinutes: offer.durationMinutes })),
    [
      { slug: "sat-eunice-60", priceCents: 13_000, durationMinutes: 60 },
      { slug: "sat-victoria-60", priceCents: 13_000, durationMinutes: 60 },
      { slug: "sat-xavier-60", priceCents: 20_000, durationMinutes: 60 },
    ],
  );
  const michelleOffers = previewOffersFromSatTutorProducts(
    SAT_TUTOR_PRODUCTS.map((item) => ({ ...item, active: true })),
    michelle,
  );
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-xavier-60")?.priceCents, 13_000);
  assert.match(michelleOffers.find((offer) => offer.slug === "sat-xavier-60")?.description ?? "", /\$130\/hour/);
});

test("a client price override uses Checkout price_data and leaves the catalog price id alone", () => {
  assert.deepEqual(
    checkoutLineItemFields({
      catalogPriceCents: 20_000,
      unitAmountCents: 13_000,
      stripeProductId: "prod_xavier",
      priceId: "price_catalog_200",
    }),
    {
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": 13_000,
      "line_items[0][price_data][product]": "prod_xavier",
      "line_items[0][quantity]": 1,
    },
  );
  assert.deepEqual(
    checkoutLineItemFields({
      catalogPriceCents: 20_000,
      unitAmountCents: 20_000,
      priceId: "price_catalog_200",
    }),
    {
      "line_items[0][price]": "price_catalog_200",
      "line_items[0][quantity]": 1,
    },
  );
  assert.deepEqual(
    hostedInvoiceItemFields({
      catalogPriceCents: 20_000,
      unitAmountCents: 13_000,
      stripeProductId: "prod_xavier",
      priceId: "price_catalog_200",
    }),
    {
      "price_data[currency]": "usd",
      "price_data[product]": "prod_xavier",
      "price_data[unit_amount]": 13_000,
    },
  );
  assert.equal(
    Object.keys(
      hostedInvoiceItemFields({
        catalogPriceCents: 20_000,
        unitAmountCents: 13_000,
        stripeProductId: "prod_xavier",
      }),
    ).some((key) => key.startsWith("pricing[price_data]")),
    false,
  );
  assert.deepEqual(
    hostedInvoiceItemFields({
      catalogPriceCents: 20_000,
      priceId: "price_catalog_200",
    }),
    { "pricing[price]": "price_catalog_200" },
  );
});
