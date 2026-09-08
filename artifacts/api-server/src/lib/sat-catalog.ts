/** Prepaid SAT catalog sold on platform Checkout. Prices are owned by Drizzle migrations. */

export const SINGLE_SAT_SESSION_SLUG = "single-sat-session";
export const TEN_SAT_SESSION_PACKAGE_SLUG = "ten-sat-session-package";
/** Temporary $1 / 1-hour SKU for payment testing. Display name is exactly `test`. */
export const TEST_SAT_HOUR_SLUG = "test-sat-hour";

export const SAT_HOURLY_RATE_CENTS = 13_000;
export const SINGLE_SAT_SESSION_PRICE_CENTS = SAT_HOURLY_RATE_CENTS;
export const TEN_SAT_SESSION_PACKAGE_PRICE_CENTS = SAT_HOURLY_RATE_CENTS * 10;
export const TEST_SAT_HOUR_PRICE_CENTS = 100;
export const TEST_SAT_HOUR_DURATION_HOURS = 1;

export const ACCEPTED_SAT_CATALOG = [
  {
    slug: TEST_SAT_HOUR_SLUG,
    name: "test",
    description: "Temporary $1 test product that grants 1 SAT hour.",
    durationHours: TEST_SAT_HOUR_DURATION_HOURS,
    totalPriceCents: TEST_SAT_HOUR_PRICE_CENTS,
    effectiveHourlyRateCents: TEST_SAT_HOUR_PRICE_CENTS,
  },
  {
    slug: SINGLE_SAT_SESSION_SLUG,
    name: "Single SAT Session",
    description:
      "One prepaid 60-minute SAT tutoring credit. Book any open hour with our SAT tutors.",
    durationHours: 1,
    totalPriceCents: SINGLE_SAT_SESSION_PRICE_CENTS,
    effectiveHourlyRateCents: SAT_HOURLY_RATE_CENTS,
  },
  {
    slug: TEN_SAT_SESSION_PACKAGE_SLUG,
    name: "Ten SAT Session Package",
    description:
      "Ten prepaid 60-minute SAT tutoring credits at $130/hour. Use them anytime on our SAT tutors’ available calendar.",
    durationHours: 10,
    totalPriceCents: TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
    effectiveHourlyRateCents: SAT_HOURLY_RATE_CENTS,
  },
] as const;

export const ACCEPTED_SAT_CATALOG_SLUGS = new Set(
  ACCEPTED_SAT_CATALOG.map((product) => product.slug),
);

export function isAcceptedSatCatalogProduct(product: {
  slug: string;
  active: boolean;
  durationHours: number;
  totalPriceCents: number;
}): boolean {
  const expected = ACCEPTED_SAT_CATALOG.find((item) => item.slug === product.slug);
  return Boolean(
    expected &&
      product.active &&
      Number(product.durationHours) === expected.durationHours &&
      Number(product.totalPriceCents) === expected.totalPriceCents,
  );
}
