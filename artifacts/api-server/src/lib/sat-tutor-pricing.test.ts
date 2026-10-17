import assert from "node:assert/strict";
import test from "node:test";
import { MICHELLE_MAKAREM_CLERK_USER_ID } from "./calendar-pair-attendees.ts";
import { checkoutLineItemFields, hostedInvoiceItemFields } from "./payment-service.ts";
import {
  SAT_TUTOR_PRODUCTS,
  SOPHIA_SLEIMAN_SAT_USER_ID,
  allowsLegacySatPool,
  canBookSatTutor,
  displayedSatDescription,
  displayedSatHourlyCents,
  displayedSatPriceCents,
  isLegacySharedSatSlug,
  isSophiaSleimanUser,
  satTutorRosterRefusalMessage,
  isMichelleMakaremUser,
  isStandardSatTutorProduct,
  previewOffersFromSatTutorProducts,
  satDebitPlan,
  satSpendableHours,
  satTutorKeyForName,
} from "./sat-tutor-pricing.ts";

const michelle = {
  clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
  email: "someone-else@example.com",
};
const michelleEmail = { email: "MakaremMichelle7@gmail.com" };
const retiredMichelleEmail = { email: "michaelmakarem@gmail.com" };
const sophia = {
  id: SOPHIA_SLEIMAN_SAT_USER_ID,
  email: "kubbasama@gmail.com",
  clerkUserId: "user_3KnHZLQbestfMDxWWpHThXLFiNO",
};
const otherSatClient = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "other-sat-client@example.com",
  clerkUserId: "user_other_sat_client",
};

function product(slug: string) {
  const found = SAT_TUTOR_PRODUCTS.find((item) => item.slug === slug);
  if (!found) throw new Error(slug);
  return found;
}

test("per-tutor SAT catalog stores the standard rates", () => {
  assert.equal(SAT_TUTOR_PRODUCTS.length, 12);
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
  assert.deepEqual(
    SAT_TUTOR_PRODUCTS.filter((item) => item.tutorKey === "nika").map((item) => item.totalPriceCents),
    [13_000, 19_500, 26_000],
  );
  assert.equal(product("sat-nika-60").firstName, "Nika");
  assert.equal(product("sat-nika-60").fullName, "Nika Raiffe");
  assert.equal(product("sat-nika-60").name, "SAT 1 hour with Nika");
  assert.equal(satTutorKeyForName("Nika Raiffe"), "nika");
  assert.equal(satTutorKeyForName("Nika"), null);
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

test("Michelle and Sophia keep Xavier at $130 and other clients see $200", () => {
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
  assert.equal(isSophiaSleimanUser(sophia), true);
  assert.equal(isSophiaSleimanUser(otherSatClient), false);
  assert.equal(displayedSatHourlyCents("xavier", sophia), 13_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-60"), sophia), 13_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-90"), sophia), 19_500);
  assert.equal(displayedSatPriceCents(product("sat-xavier-120"), sophia), 26_000);
  assert.match(displayedSatDescription(product("sat-xavier-60"), sophia), /\$130\/hour/);
  assert.equal(displayedSatHourlyCents("eunice", sophia), 13_000);
  assert.equal(canBookSatTutor("xavier", sophia), true);
  assert.equal(canBookSatTutor("eunice", sophia), true);
  assert.equal(canBookSatTutor("victoria", sophia), false);
  assert.equal(canBookSatTutor("nika", sophia), false);
  assert.equal(canBookSatTutor("victoria", otherSatClient), true);
  assert.equal(canBookSatTutor("xavier", otherSatClient), true);
  assert.equal(displayedSatHourlyCents("xavier", otherSatClient), 20_000);
  assert.equal(allowsLegacySatPool("xavier", sophia), true);
  assert.equal(allowsLegacySatPool("eunice", sophia), true);
  assert.equal(allowsLegacySatPool("victoria", sophia), false);
  assert.equal(allowsLegacySatPool("nika", sophia), false);
  assert.equal(isLegacySharedSatSlug("ten-sat-session-package"), true);
  assert.equal(satTutorRosterRefusalMessage(sophia), "Choose Eunice or Xavier for an SAT session.");
  assert.equal(
    satTutorRosterRefusalMessage(otherSatClient),
    "Choose Eunice, Victoria, or Xavier for an SAT session.",
  );
  assert.equal(allowsLegacySatPool("xavier", michelle), true);
  assert.equal(allowsLegacySatPool("eunice", sophia), true);
});

test("Nika SAT is $130 for Michelle and hidden from Sophia and other clients", () => {
  assert.equal(canBookSatTutor("nika", sophia), false);
  for (const user of [michelle, michelleEmail]) {
    assert.equal(canBookSatTutor("nika", user), true);
    assert.equal(displayedSatHourlyCents("nika", user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-nika-60"), user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-nika-90"), user), 19_500);
    assert.equal(displayedSatPriceCents(product("sat-nika-120"), user), 26_000);
    assert.match(displayedSatDescription(product("sat-nika-60"), user), /with Nika at \$130\/hour/);
    assert.equal(allowsLegacySatPool("nika", user), false);
  }
  assert.equal(canBookSatTutor("nika", otherSatClient), false);
  assert.equal(
    canBookSatTutor("nika", {
      email: "samapostgrad@gmail.com",
      clerkUserId: "user_3IxQY4GUjQGp9wT1WXzbyCVH67G",
    }),
    true,
  );
  assert.equal(canBookSatTutor("eunice", {
    email: "samapostgrad@gmail.com",
  }), true);
  assert.equal(canBookSatTutor("nika", retiredMichelleEmail), false);
  assert.equal(canBookSatTutor("eunice", otherSatClient), true);
  assert.equal(allowsLegacySatPool("nika", otherSatClient), false);

  const entries = [
    { entryType: "original", hours: 2, productId: "nika-hour" },
    { entryType: "original", hours: 3, productId: "legacy-hour" },
    { entryType: "original", hours: 1, productId: "eunice-hour" },
  ];
  assert.equal(
    satSpendableHours(entries, {
      tutorProductIds: ["nika-hour"],
      legacyProductIds: ["legacy-hour"],
      allowLegacy: false,
    }),
    2,
  );
  assert.equal(
    satSpendableHours(entries, {
      tutorProductIds: ["eunice-hour"],
      legacyProductIds: ["legacy-hour"],
      allowLegacy: true,
    }),
    4,
  );
  const nikaFromLegacy = satDebitPlan(entries, {
    tutorProductIds: ["nika-hour"],
    legacyProductIds: ["legacy-hour"],
    requiredHours: 3,
    tutorHourProductId: "nika-hour",
    allowLegacy: false,
  });
  assert.equal(nikaFromLegacy.ok, false);
  const euniceFromNika = satDebitPlan(entries, {
    tutorProductIds: ["eunice-hour"],
    legacyProductIds: [],
    requiredHours: 2,
    tutorHourProductId: "eunice-hour",
    allowLegacy: false,
  });
  assert.equal(euniceFromNika.ok, false);
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
      { slug: "sat-xavier-60", priceCents: 13_000, durationMinutes: 60 },
    ],
  );
  const strangerOffers = previewOffersFromSatTutorProducts(
    SAT_TUTOR_PRODUCTS.map((item) => ({ ...item, active: true })),
    otherSatClient,
  );
  assert.equal(strangerOffers.some((offer) => offer.slug.startsWith("sat-nika")), false);
  const michelleOffers = previewOffersFromSatTutorProducts(
    SAT_TUTOR_PRODUCTS.map((item) => ({ ...item, active: true })),
    michelle,
  );
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-xavier-60")?.priceCents, 13_000);
  assert.match(michelleOffers.find((offer) => offer.slug === "sat-xavier-60")?.description ?? "", /\$130\/hour/);
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-nika-60")?.priceCents, 13_000);
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-nika-60")?.name, "SAT 1 hour with Nika");
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
