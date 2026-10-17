/**
 * Per-tutor SAT catalog. Stored prices are the standard rates.
 * Michelle Makarem's Xavier rate is computed per request and is never written
 * back onto the product row or its Stripe price id.
 *
 * Existing prepaid hours stay on their original ledger rows. Untagged debits
 * and the shared $130 slugs form a legacy pool. That pool can book Eunice,
 * Victoria, and — for Michelle only — Xavier. New purchases are tagged to one
 * tutor and book only that tutor. Xavier's $200 hours never come from the
 * legacy $130 pool.
 *
 * Nika's SAT rows are $130/hour. The shared SAT catalog shows every standard
 * tutor to every self-serve client, so Nika is limited to Sophia Sleiman and
 * Michelle Makarem. Her hours do not accept the legacy pool and do not book
 * another tutor. Neel's College Consulting prices are a separate catalog.
 */

import {
  MICHELLE_MAKAREM_CLERK_USER_ID,
  MICHELLE_MAKAREM_EMAIL,
} from "./calendar-pair-attendees.ts";
import { ACCEPTED_SAT_CATALOG_SLUGS } from "./sat-catalog.ts";
import {
  remainingCreditHours,
  remainingCreditHoursForProducts,
  roundCreditHours,
} from "./credit-hours.ts";

export const SAT_TUTOR_KEYS = ["eunice", "victoria", "xavier", "nika"] as const;
export type SatTutorKey = (typeof SAT_TUTOR_KEYS)[number];

/** Sophia Sleiman. Nika's SAT portal is limited to this user id and Michelle. */
export const SOPHIA_SLEIMAN_SAT_USER_ID = "bf530aa6-faaa-43df-b3cf-140026f3313e";

export const MICHELLE_XAVIER_SAT_HOURLY_CENTS = 13_000;

const SAT_TUTORS = [
  { key: "eunice" as const, firstName: "Eunice", fullName: "Eunice Chon", hourlyCents: 13_000 },
  {
    key: "victoria" as const,
    firstName: "Victoria",
    fullName: "Victoria Wijerathnayapa",
    hourlyCents: 13_000,
  },
  { key: "xavier" as const, firstName: "Xavier", fullName: "Xavier Morales", hourlyCents: 20_000 },
  { key: "nika" as const, firstName: "Nika", fullName: "Nika Raiffe", hourlyCents: 13_000 },
];

const SAT_LENGTHS = [
  { suffix: "60", durationHours: 1, label: "1 hour", minutesLabel: "60-minute" },
  { suffix: "90", durationHours: 1.5, label: "1.5 hours", minutesLabel: "90-minute" },
  { suffix: "120", durationHours: 2, label: "2 hours", minutesLabel: "120-minute" },
] as const;

export type SatTutorProductSpec = {
  slug: string;
  tutorKey: SatTutorKey;
  firstName: string;
  fullName: string;
  name: string;
  description: string;
  durationHours: number;
  totalPriceCents: number;
  effectiveHourlyRateCents: number;
};

function priceForHourly(hourlyCents: number, durationHours: number): number {
  if (durationHours === 1.5) return Math.round(hourlyCents * 1.5);
  return Math.round(hourlyCents * durationHours);
}

function descriptionFor(
  firstName: string,
  minutesLabel: string,
  hourlyCents: number,
): string {
  return `One prepaid ${minutesLabel} SAT tutoring credit with ${firstName} at $${hourlyCents / 100}/hour.`;
}

export const SAT_TUTOR_PRODUCTS: SatTutorProductSpec[] = SAT_TUTORS.flatMap((tutor) =>
  SAT_LENGTHS.map((length) => ({
    slug: `sat-${tutor.key}-${length.suffix}`,
    tutorKey: tutor.key,
    firstName: tutor.firstName,
    fullName: tutor.fullName,
    name: `SAT ${length.label} with ${tutor.firstName}`,
    description: descriptionFor(tutor.firstName, length.minutesLabel, tutor.hourlyCents),
    durationHours: length.durationHours,
    totalPriceCents: priceForHourly(tutor.hourlyCents, length.durationHours),
    effectiveHourlyRateCents: tutor.hourlyCents,
  })),
);

export const SAT_TUTOR_PRODUCT_SLUGS = SAT_TUTOR_PRODUCTS.map((product) => product.slug);

const PRODUCT_BY_SLUG = new Map(SAT_TUTOR_PRODUCTS.map((product) => [product.slug, product]));

export type MichelleIdentity = {
  clerkUserId?: string | null;
  email?: string | null;
};

export function isMichelleMakaremUser(user: MichelleIdentity | null | undefined): boolean {
  if (!user) return false;
  if (user.clerkUserId === MICHELLE_MAKAREM_CLERK_USER_ID) return true;
  const email = user.email?.trim().toLowerCase() ?? "";
  return email === MICHELLE_MAKAREM_EMAIL;
}

export type SatTutorViewer = MichelleIdentity & { id?: string | null };

/**
 * Eunice, Victoria, and Xavier stay on the shared SAT roster.
 * Nika is bookable only for Sophia Sleiman and Michelle Makarem.
 */
export function canBookSatTutor(
  tutorKey: SatTutorKey,
  user: SatTutorViewer | null | undefined,
): boolean {
  if (tutorKey !== "nika") return true;
  if (!user) return false;
  if (user.id === SOPHIA_SLEIMAN_SAT_USER_ID) return true;
  return isMichelleMakaremUser(user);
}

export function satTutorKeyForSlug(slug: string): SatTutorKey | null {
  return PRODUCT_BY_SLUG.get(slug)?.tutorKey ?? null;
}

export function satTutorKeyForName(name: string | null | undefined): SatTutorKey | null {
  const normalized = name?.trim().toLowerCase() ?? "";
  return SAT_TUTORS.find((tutor) => tutor.fullName.toLowerCase() === normalized)?.key ?? null;
}

export function satTutorHourSlug(tutorKey: SatTutorKey): string {
  return `sat-${tutorKey}-60`;
}

export function satTutorProductSortKey(slug: string): number {
  const product = PRODUCT_BY_SLUG.get(slug);
  if (!product) return 1_000;
  return SAT_TUTOR_KEYS.indexOf(product.tutorKey) * 10 + product.durationHours;
}

export function isLegacySharedSatSlug(slug: string): boolean {
  return ACCEPTED_SAT_CATALOG_SLUGS.has(slug);
}

export function isStandardSatTutorProduct(product: {
  slug: string;
  active: boolean;
  durationHours: number;
  totalPriceCents: number;
}): boolean {
  const expected = PRODUCT_BY_SLUG.get(product.slug);
  return Boolean(
    expected &&
      product.active &&
      Number(product.durationHours) === expected.durationHours &&
      Number(product.totalPriceCents) === expected.totalPriceCents,
  );
}

export function displayedSatHourlyCents(
  tutorKey: SatTutorKey,
  user: MichelleIdentity | null | undefined,
): number {
  if (tutorKey === "xavier" && isMichelleMakaremUser(user)) return MICHELLE_XAVIER_SAT_HOURLY_CENTS;
  return SAT_TUTORS.find((tutor) => tutor.key === tutorKey)!.hourlyCents;
}

export function displayedSatPriceCents(
  product: { slug: string; durationHours: number; totalPriceCents: number },
  user: MichelleIdentity | null | undefined,
): number {
  const spec = PRODUCT_BY_SLUG.get(product.slug);
  if (!spec) return Number(product.totalPriceCents);
  return priceForHourly(displayedSatHourlyCents(spec.tutorKey, user), Number(product.durationHours));
}

export function displayedSatDescription(
  product: { slug: string; description: string; durationHours: number },
  user: MichelleIdentity | null | undefined,
): string {
  const spec = PRODUCT_BY_SLUG.get(product.slug);
  if (!spec) return product.description;
  const hourly = displayedSatHourlyCents(spec.tutorKey, user);
  if (hourly === spec.effectiveHourlyRateCents) return product.description;
  const length = SAT_LENGTHS.find((item) => item.durationHours === Number(product.durationHours));
  return descriptionFor(spec.firstName, length?.minutesLabel ?? "SAT", hourly);
}

/** Eunice and Victoria always accept the legacy $130 pool. Xavier does only for Michelle. Nika never does. */
export function allowsLegacySatPool(
  tutorKey: SatTutorKey,
  user: MichelleIdentity | null | undefined,
): boolean {
  if (tutorKey === "nika") return false;
  if (tutorKey === "eunice" || tutorKey === "victoria") return true;
  return isMichelleMakaremUser(user);
}

export type SatLedgerEntry = {
  entryType: string;
  hours: unknown;
  productId?: string | null;
};

export function legacySatHours(
  entries: readonly SatLedgerEntry[],
  legacyProductIds: readonly string[],
): number {
  const ids = new Set(legacyProductIds);
  return remainingCreditHours(
    entries.filter((entry) => !entry.productId || ids.has(entry.productId)),
  );
}

export function satSpendableHours(
  entries: readonly SatLedgerEntry[],
  args: {
    tutorProductIds: readonly string[];
    legacyProductIds: readonly string[];
    allowLegacy: boolean;
  },
): number {
  const tutorHours = remainingCreditHoursForProducts(entries, args.tutorProductIds);
  if (!args.allowLegacy) return tutorHours;
  return roundCreditHours(tutorHours + legacySatHours(entries, args.legacyProductIds));
}

export type SatDebit = { productId: string | null; hours: number };

export function satDebitPlan(
  entries: readonly SatLedgerEntry[],
  args: {
    requiredHours: number;
    tutorProductIds: readonly string[];
    legacyProductIds: readonly string[];
    tutorHourProductId: string | null;
    allowLegacy: boolean;
  },
): { ok: true; debits: SatDebit[] } | { ok: false } {
  const required = roundCreditHours(args.requiredHours);
  if (required <= 0) return { ok: false };
  const tutorHours = remainingCreditHoursForProducts(entries, args.tutorProductIds);
  const legacyHours = args.allowLegacy ? legacySatHours(entries, args.legacyProductIds) : 0;
  if (roundCreditHours(tutorHours + legacyHours) + 1e-9 < required) return { ok: false };
  const fromTutor = roundCreditHours(Math.min(tutorHours, required));
  const fromLegacy = roundCreditHours(required - fromTutor);
  const debits: SatDebit[] = [];
  if (fromTutor > 0) {
    if (!args.tutorHourProductId) return { ok: false };
    debits.push({ productId: args.tutorHourProductId, hours: fromTutor });
  }
  if (fromLegacy > 0) debits.push({ productId: null, hours: fromLegacy });
  if (debits.length === 0) return { ok: false };
  return { ok: true, debits };
}

export type AdminSatPreviewOffer = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  durationHours: number;
  durationMinutes: 60;
};

/** Administrator preview is locked to 60-minute offers. Prices follow the viewed client. */
export function previewOffersFromSatTutorProducts(
  products: Array<{
    slug: string;
    name: string;
    description: string;
    active: boolean;
    durationHours: number;
    totalPriceCents: number;
  }>,
  user: MichelleIdentity | null | undefined,
): AdminSatPreviewOffer[] {
  return products
    .filter((product) => {
      const tutorKey = satTutorKeyForSlug(product.slug);
      return Boolean(
        tutorKey &&
          canBookSatTutor(tutorKey, user) &&
          isStandardSatTutorProduct(product) &&
          Number(product.durationHours) === 1,
      );
    })
    .slice()
    .sort((left, right) => satTutorProductSortKey(left.slug) - satTutorProductSortKey(right.slug))
    .map((product) => ({
      slug: product.slug,
      name: product.name,
      description: displayedSatDescription(product, user),
      priceCents: displayedSatPriceCents(product, user),
      durationHours: 1,
      durationMinutes: 60 as const,
    }));
}
