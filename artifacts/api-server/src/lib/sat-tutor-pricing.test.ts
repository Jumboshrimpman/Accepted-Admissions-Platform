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
  assert.equal(SAT_TUTOR_PRODUCTS.length, 15);
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
  assert.deepEqual(
    SAT_TUTOR_PRODUCTS.filter((item) => item.tutorKey === "sophia-lamas").map((item) => item.totalPriceCents),
    [18_000, 27_000, 36_000],
  );
  assert.equal(product("sat-sophia-lamas-60").name, "SAT 1 hour with Sophia");
  assert.equal(satTutorKeyForName("Sophia Lamas"), "sophia-lamas");
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

test("Michelle keeps Xavier and Eunice at $130 and Sophia sees $200", () => {
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
    assert.equal(displayedSatHourlyCents("eunice", user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-eunice-60"), user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-eunice-90"), user), 19_500);
    assert.equal(displayedSatPriceCents(product("sat-eunice-120"), user), 26_000);
    assert.equal(displayedSatDescription(product("sat-eunice-60"), user), product("sat-eunice-60").description);
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

test("Nika SAT is $130 for Sophia, $150 for Michelle, and hidden from other clients", () => {
  for (const user of [sophia, michelle, michelleEmail]) {
    assert.equal(canBookSatTutor("nika", user), true);
  }
  assert.equal(displayedSatHourlyCents("nika", sophia), 13_000);
  assert.equal(displayedSatPriceCents(product("sat-nika-60"), sophia), 13_000);
  assert.equal(displayedSatPriceCents(product("sat-nika-90"), sophia), 19_500);
  assert.equal(displayedSatPriceCents(product("sat-nika-120"), sophia), 26_000);
  assert.match(displayedSatDescription(product("sat-nika-60"), sophia), /with Nika at \$130\/hour/);
  for (const user of [michelle, michelleEmail]) {
    assert.equal(displayedSatHourlyCents("nika", user), 15_000);
    assert.equal(displayedSatPriceCents(product("sat-nika-60"), user), 15_000);
    assert.equal(displayedSatPriceCents(product("sat-nika-90"), user), 22_500);
    assert.equal(displayedSatPriceCents(product("sat-nika-120"), user), 30_000);
    assert.match(displayedSatDescription(product("sat-nika-60"), user), /with Nika at \$150\/hour/);
  }
  assert.equal(allowsLegacySatPool("nika", sophia), true);
  assert.equal(allowsLegacySatPool("nika", michelle), false);
  assert.equal(allowsLegacySatPool("nika", michelleEmail), false);
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

test("Sophia's package hours debit on Nika and Xavier stays a separate $200 charge", () => {
  const packageHours = [
    { entryType: "original", hours: 10, productId: "ten-sat-session-package" },
  ];
  const legacyArgs = {
    tutorProductIds: ["sat-nika-60"],
    legacyProductIds: ["ten-sat-session-package"],
    tutorHourProductId: "sat-nika-60",
  };
  assert.equal(allowsLegacySatPool("nika", sophia), true);
  assert.equal(
    allowsLegacySatPool("nika", { email: sophia.email, clerkUserId: sophia.clerkUserId }),
    false,
  );
  assert.equal(allowsLegacySatPool("nika", michelle), false);
  assert.equal(allowsLegacySatPool("nika", otherSatClient), false);
  assert.equal(allowsLegacySatPool("eunice", sophia), true);
  assert.equal(allowsLegacySatPool("victoria", otherSatClient), true);
  assert.equal(allowsLegacySatPool("xavier", sophia), false);
  assert.equal(allowsLegacySatPool("xavier", michelle), true);

  assert.equal(
    satSpendableHours(packageHours, {
      ...legacyArgs,
      allowLegacy: allowsLegacySatPool("nika", sophia),
    }),
    10,
  );
  const nikaHour = satDebitPlan(packageHours, {
    ...legacyArgs,
    requiredHours: 1,
    allowLegacy: allowsLegacySatPool("nika", sophia),
  });
  assert.equal(nikaHour.ok, true);
  if (nikaHour.ok) assert.deepEqual(nikaHour.debits, [{ productId: null, hours: 1 }]);
  const nikaNinety = satDebitPlan(packageHours, {
    ...legacyArgs,
    requiredHours: 90 / 60,
    allowLegacy: allowsLegacySatPool("nika", sophia),
  });
  assert.equal(nikaNinety.ok, true);
  if (nikaNinety.ok) assert.deepEqual(nikaNinety.debits, [{ productId: null, hours: 1.5 }]);

  const michelleNika = satDebitPlan(packageHours, {
    ...legacyArgs,
    requiredHours: 1,
    allowLegacy: allowsLegacySatPool("nika", michelle),
  });
  assert.equal(michelleNika.ok, false);
  const otherNika = satDebitPlan(packageHours, {
    ...legacyArgs,
    requiredHours: 1,
    allowLegacy: allowsLegacySatPool("nika", otherSatClient),
  });
  assert.equal(otherNika.ok, false);

  const xavierFromPackage = satDebitPlan(packageHours, {
    requiredHours: 1,
    tutorProductIds: ["sat-xavier-60"],
    legacyProductIds: ["ten-sat-session-package"],
    tutorHourProductId: "sat-xavier-60",
    allowLegacy: allowsLegacySatPool("xavier", sophia),
  });
  assert.equal(xavierFromPackage.ok, false);
  assert.equal(displayedSatPriceCents(product("sat-xavier-60"), sophia), 20_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-90"), sophia), 30_000);
  assert.equal(displayedSatPriceCents(product("sat-xavier-120"), sophia), 40_000);
  assert.equal(
    displayedSatPriceCents(product("sat-xavier-60"), sophia),
    product("sat-xavier-60").totalPriceCents,
  );
  assert.deepEqual(
    checkoutLineItemFields({
      catalogPriceCents: product("sat-xavier-60").totalPriceCents,
      unitAmountCents: displayedSatPriceCents(product("sat-xavier-60"), sophia),
      priceId: "price_xavier_200",
    }),
    {
      "line_items[0][price]": "price_xavier_200",
      "line_items[0][quantity]": 1,
    },
  );
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
      { slug: "sat-xavier-60", priceCents: 20_000, durationMinutes: 60 },
      { slug: "sat-nika-60", priceCents: 13_000, durationMinutes: 60 },
    ],
  );
  // VICTORIA_BOOKING_ENABLED is false, so Sophia's preview hides Victoria too.
  assert.equal(offers.some((offer) => offer.slug.startsWith("sat-victoria")), false);
  const strangerOffers = previewOffersFromSatTutorProducts(
    SAT_TUTOR_PRODUCTS.map((item) => ({ ...item, active: true })),
    otherSatClient,
  );
  assert.equal(strangerOffers.some((offer) => offer.slug.startsWith("sat-nika")), false);
  assert.equal(strangerOffers.some((offer) => offer.slug.startsWith("sat-victoria")), false);
  const michelleOffers = previewOffersFromSatTutorProducts(
    SAT_TUTOR_PRODUCTS.map((item) => ({ ...item, active: true })),
    michelle,
  );
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-xavier-60")?.priceCents, 13_000);
  assert.match(michelleOffers.find((offer) => offer.slug === "sat-xavier-60")?.description ?? "", /\$130\/hour/);
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-nika-60")?.priceCents, 15_000);
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-eunice-60")?.priceCents, 13_000);
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-sophia-lamas-60")?.priceCents, 18_000);
  assert.equal(
    michelleOffers.find((offer) => offer.slug === "sat-sophia-lamas-60")?.name,
    "SAT 1 hour with Sophia",
  );
  assert.equal(strangerOffers.some((offer) => offer.slug.startsWith("sat-sophia-lamas")), false);
  assert.equal(offers.some((offer) => offer.slug.startsWith("sat-sophia-lamas")), false);
  assert.deepEqual(
    strangerOffers.map((offer) => ({ slug: offer.slug, priceCents: offer.priceCents })),
    [
      { slug: "sat-eunice-60", priceCents: 13_000 },
      { slug: "sat-xavier-60", priceCents: 20_000 },
    ],
  );
  assert.equal(michelleOffers.find((offer) => offer.slug === "sat-nika-60")?.name, "SAT 1 hour with Nika");
  assert.equal(michelleOffers.some((offer) => offer.slug.startsWith("sat-victoria")), false);
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

test("Sophia Lamas is a $180 SAT English offer for Michelle only", () => {
  for (const user of [michelle, michelleEmail]) {
    assert.equal(canBookSatTutor("sophia-lamas", user), true);
    assert.equal(displayedSatHourlyCents("sophia-lamas", user), 18_000);
    assert.equal(displayedSatPriceCents(product("sat-sophia-lamas-60"), user), 18_000);
    assert.equal(displayedSatPriceCents(product("sat-sophia-lamas-90"), user), 27_000);
    assert.equal(displayedSatPriceCents(product("sat-sophia-lamas-120"), user), 36_000);
    assert.equal(allowsLegacySatPool("sophia-lamas", user), false);
  }
  for (const user of [sophia, otherSatClient, retiredMichelleEmail, null]) {
    assert.equal(canBookSatTutor("sophia-lamas", user), false);
    assert.equal(allowsLegacySatPool("sophia-lamas", user), false);
  }
  assert.equal(
    satDebitPlan([{ entryType: "original", hours: 4, productId: "legacy-hour" }], {
      requiredHours: 1,
      tutorProductIds: ["sophia-lamas-hour"],
      legacyProductIds: ["legacy-hour"],
      tutorHourProductId: "sophia-lamas-hour",
      allowLegacy: allowsLegacySatPool("sophia-lamas", michelle),
    }).ok,
    false,
  );
});

test("other clients keep standard SAT prices", () => {
  for (const user of [sophia, otherSatClient, retiredMichelleEmail]) {
    assert.equal(displayedSatHourlyCents("eunice", user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-eunice-60"), user), 13_000);
    assert.equal(displayedSatDescription(product("sat-eunice-60"), user), product("sat-eunice-60").description);
    assert.equal(displayedSatHourlyCents("nika", user), 13_000);
    assert.equal(displayedSatPriceCents(product("sat-nika-60"), user), 13_000);
    assert.equal(displayedSatHourlyCents("xavier", user), 20_000);
    assert.equal(displayedSatPriceCents(product("sat-xavier-60"), user), 20_000);
  }
});

test("Michelle's $150 Nika checkout uses price_data; her Eunice checkout keeps the $130 price id", () => {
  const nika = product("sat-nika-60");
  assert.equal(nika.totalPriceCents, 13_000);
  assert.equal(isStandardSatTutorProduct({ ...nika, active: true }), true);
  assert.deepEqual(
    checkoutLineItemFields({
      catalogPriceCents: nika.totalPriceCents,
      unitAmountCents: displayedSatPriceCents(nika, michelle),
      stripeProductId: "prod_nika",
      priceId: "price_nika_130",
    }),
    {
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": 15_000,
      "line_items[0][price_data][product]": "prod_nika",
      "line_items[0][quantity]": 1,
    },
  );
  const sophiaLamas = product("sat-sophia-lamas-60");
  assert.deepEqual(
    checkoutLineItemFields({
      catalogPriceCents: sophiaLamas.totalPriceCents,
      unitAmountCents: displayedSatPriceCents(sophiaLamas, michelle),
      priceId: "price_sophia_lamas_180",
    }),
    {
      "line_items[0][price]": "price_sophia_lamas_180",
      "line_items[0][quantity]": 1,
    },
  );
  const eunice = product("sat-eunice-60");
  for (const user of [michelle, otherSatClient]) {
    assert.deepEqual(
      checkoutLineItemFields({
        catalogPriceCents: eunice.totalPriceCents,
        unitAmountCents: displayedSatPriceCents(eunice, user),
        priceId: "price_eunice_130",
      }),
      {
        "line_items[0][price]": "price_eunice_130",
        "line_items[0][quantity]": 1,
      },
    );
  }
});
