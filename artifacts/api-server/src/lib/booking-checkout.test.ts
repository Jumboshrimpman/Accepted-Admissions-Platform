import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import {
  NEEL_DHARNI_USER_ID,
  checkoutAudienceForSlug,
  isNeelDharniUser,
} from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import {
  BOOKING_CHECKOUT_SLOT_TAKEN,
  authoritativeCheckoutAmountCents,
  bookingIntentFromBody,
  clientSentCheckoutPrice,
  consultingCheckoutSlug,
  isPerTutorSatSlug,
  satCheckoutSlugCandidates,
  selectBookingCheckoutProduct,
  type CheckoutCatalogProduct,
} from "./booking-checkout.ts";

const SOPHIA_SLEIMAN_USER_ID = "bf530aa6-faaa-43df-b3cf-140026f3313e";

const CONSULTING: CheckoutCatalogProduct[] = [
  product("college-consulting-nika-hour", 1, 10_000),
  product("college-consulting-nika-90", 1.5, 15_000),
  product("college-consulting-nika-120", 2, 20_000),
  product("college-consulting-victoria-hour", 1, 13_000),
  product("college-consulting-victoria-90", 1.5, 19_500),
  product("college-consulting-victoria-120", 2, 26_000),
  product("college-consulting-xavier-hour", 1, 20_000),
  product("college-consulting-xavier-90", 1.5, 30_000),
  product("college-consulting-xavier-120", 2, 40_000),
];

const SHARED_SAT: CheckoutCatalogProduct[] = [
  product("single-sat-session", 1, 13_000),
  product("sat-session-90", 1.5, 19_500),
  product("sat-session-120", 2, 26_000),
];

function product(slug: string, durationHours: number, totalPriceCents: number): CheckoutCatalogProduct {
  return { id: `id-${slug}`, slug, durationHours, totalPriceCents, active: true };
}

test("consulting checkout uses each tutor and length at the stored price", () => {
  const cases = [
    ["nika", 60, "college-consulting-nika-hour", 10_000],
    ["nika", 90, "college-consulting-nika-90", 15_000],
    ["nika", 120, "college-consulting-nika-120", 20_000],
    ["victoria", 60, "college-consulting-victoria-hour", 13_000],
    ["victoria", 90, "college-consulting-victoria-90", 19_500],
    ["victoria", 120, "college-consulting-victoria-120", 26_000],
    ["xavier", 60, "college-consulting-xavier-hour", 20_000],
    ["xavier", 90, "college-consulting-xavier-90", 30_000],
    ["xavier", 120, "college-consulting-xavier-120", 40_000],
  ] as const;
  for (const [tutorKey, minutes, slug, cents] of cases) {
    const selected = selectBookingCheckoutProduct({
      audience: "consulting",
      tutorKey,
      durationMinutes: minutes,
      products: CONSULTING,
    });
    assert.equal(selected?.slug, slug);
    assert.equal(authoritativeCheckoutAmountCents(selected!), cents);
    assert.equal(consultingCheckoutSlug(tutorKey, minutes), slug);
  }
});

test("a client-sent price never replaces the catalog amount", () => {
  const body = {
    tutorProfileId: "tutor-xavier",
    durationMinutes: 90,
    startTime: "2026-11-02T15:00:00.000Z",
    amountCents: 100,
    priceCents: 100,
    unitAmountCents: 100,
  };
  assert.equal(clientSentCheckoutPrice(body), true);
  const selected = selectBookingCheckoutProduct({
    audience: "consulting",
    tutorKey: "xavier",
    durationMinutes: 90,
    products: CONSULTING,
  });
  assert.equal(authoritativeCheckoutAmountCents(selected!), 30_000);
  assert.notEqual(authoritativeCheckoutAmountCents(selected!), body.amountCents);
});

test("Sophia is an SAT client and prefers a per-tutor product when that row exists", () => {
  assert.equal(isNeelDharniUser(SOPHIA_SLEIMAN_USER_ID), false);
  assert.notEqual(SOPHIA_SLEIMAN_USER_ID, NEEL_DHARNI_USER_ID);
  assert.equal(checkoutAudienceForSlug(SOPHIA_SLEIMAN_USER_ID, "sat-xavier-90"), "sat");
  assert.equal(checkoutAudienceForSlug(SOPHIA_SLEIMAN_USER_ID, "single-sat-session"), "sat");
  assert.equal(
    checkoutAudienceForSlug(SOPHIA_SLEIMAN_USER_ID, "college-consulting-xavier-90"),
    "forbidden",
  );
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, "sat-xavier-90"), "forbidden");
  const perTutor = product("sat-xavier-90", 1.5, 30_000);
  const selected = selectBookingCheckoutProduct({
    audience: "sat",
    tutorKey: "xavier",
    durationMinutes: 90,
    products: [...SHARED_SAT, perTutor],
  });
  assert.equal(selected?.slug, "sat-xavier-90");
  assert.equal(authoritativeCheckoutAmountCents(selected!), 30_000);
  assert.deepEqual(satCheckoutSlugCandidates("xavier", 90), [
    "sat-xavier-90",
    "sat-session-90",
  ]);
  assert.equal(isPerTutorSatSlug("sat-eunice-60"), true);
  assert.equal(isPerTutorSatSlug("single-sat-session"), false);
});

test("SAT checkout falls back to the shared length product until a per-tutor row exists", () => {
  const selected = selectBookingCheckoutProduct({
    audience: "sat",
    tutorKey: "eunice",
    durationMinutes: 120,
    products: SHARED_SAT,
  });
  assert.equal(selected?.slug, "sat-session-120");
  assert.equal(authoritativeCheckoutAmountCents(selected!), 26_000);
});

test("booking intent keeps the slot and rejects a partial selection", () => {
  const intent = bookingIntentFromBody({
    tutorProfileId: "tutor-1",
    durationMinutes: 90,
    startTime: "2026-11-02T15:00:00.000Z",
    amountCents: 1,
  });
  assert.equal(intent.present, true);
  if (!intent.present || !("intent" in intent)) assert.fail("intent missing");
  assert.equal(intent.intent.durationMinutes, 90);
  assert.equal(intent.intent.startTime, "2026-11-02T15:00:00.000Z");
  assert.equal(
    bookingIntentFromBody({ tutorProfileId: "tutor-1" }).present &&
      "error" in bookingIntentFromBody({ tutorProfileId: "tutor-1" }),
    true,
  );
  assert.match(BOOKING_CHECKOUT_SLOT_TAKEN, /taken/);
});
