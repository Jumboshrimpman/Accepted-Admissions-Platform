/** Prepaid SAT catalog sold on authenticated portal Checkout. Prices are owned by Drizzle migrations. */

export const SINGLE_SAT_SESSION_SLUG = "single-sat-session";
export const TEN_SAT_SESSION_PACKAGE_SLUG = "ten-sat-session-package";
/** Retired $1 payment-test SKU. Kept only so listings and checkout can exclude it. */
export const RETIRED_TEST_SAT_HOUR_SLUG = "test-sat-hour";

export const SAT_HOURLY_RATE_CENTS = 13_000;
export const SINGLE_SAT_SESSION_PRICE_CENTS = SAT_HOURLY_RATE_CENTS;
export const TEN_SAT_SESSION_PACKAGE_PRICE_CENTS = SAT_HOURLY_RATE_CENTS * 10;

export const ACCEPTED_SAT_CATALOG = [
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

export function isRetiredSatTestProduct(slug: string): boolean {
  return slug === RETIRED_TEST_SAT_HOUR_SLUG;
}

export function isAcceptedSatCatalogProduct(product: {
  slug: string;
  active: boolean;
  durationHours: number;
  totalPriceCents: number;
}): boolean {
  if (isRetiredSatTestProduct(product.slug)) return false;
  const expected = ACCEPTED_SAT_CATALOG.find((item) => item.slug === product.slug);
  return Boolean(
    expected &&
      product.active &&
      Number(product.durationHours) === expected.durationHours &&
      Number(product.totalPriceCents) === expected.totalPriceCents,
  );
}
