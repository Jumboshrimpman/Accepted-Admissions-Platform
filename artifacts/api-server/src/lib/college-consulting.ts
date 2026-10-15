// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SAT_HOURLY_RATE_CENTS, isAcceptedSatCatalogProduct } from "./sat-catalog.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { CANONICAL_XAVIER_EMAIL } from "./xavier-identity.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { remainingCreditHoursForProduct } from "./credit-hours.ts";

/** Stable client id. Bookings stay on this id when the login email changes. */
export const NEEL_DHARNI_USER_ID = "6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19";
export const NEEL_DISPLAY_NAME = "Neel Dharni";
/** Temporary login. Not an invitation target. Swap users.email and the grant later. */
export const NEEL_PLACEHOLDER_EMAIL = "samakubba@gmail.com";

export const COLLEGE_CONSULTING_COURSE_ID = "c3b8e1a4-7d2f-4b6a-8e15-9a0c4d7e2f31";
export const COLLEGE_CONSULTING_SUBJECT = "College Consulting";
export const COLLEGE_CONSULTING_TERM = "Ongoing";

export const NIKA_CONSULTING_NAME = "Nika Raiffe";
export const NIKA_CONSULTING_EMAIL = "nika.raiffe@gmail.com";

/** Stable tutor id. The login email can change without touching sessions. */
export const VICTORIA_USER_ID = "a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63";
/** Display name. Pronouns are she/her. */
export const VICTORIA_DISPLAY_NAME = "Victoria Wijerathnayapa";
/** Name used before the full name was known. Startup replaces only this placeholder. */
export const VICTORIA_PLACEHOLDER_DISPLAY_NAME = "Victoria";
/** Temporary tutor login so the tutor portal and Google Calendar can be tested. */
export const VICTORIA_PLACEHOLDER_EMAIL = "samakubba@icloud.com";
/**
 * Future login. Recorded only. Do not provision a grant, user, or Clerk identity
 * for this address, and do not send mail to it.
 */
export const VICTORIA_INTENDED_EMAIL = "victoriawije7@gmail.com";
/** First-party portrait, same /media/team path as Nika and Xavier. Not a public-team roster entry. */
export const VICTORIA_PHOTO_URL = "/media/team/victoria.jpg";
export const VICTORIA_PHOTO_ALT_TEXT = "Victoria Wijerathnayapa, College Consulting Tutor";
export const VICTORIA_BOOKING_TAGLINE =
  "Harvard Neuroscience & Education '25, Instructional Design, Youth Mentor";
export const VICTORIA_BIOGRAPHY =
  "Victoria Wijerathnayapa graduated from Harvard in 2025 with a degree in Neuroscience and a focus on Education. She is passionate about making learning engaging, inclusive, and impactful through evidence-based strategies, bridging scientific research and instructional design. Since 2023 she has been a Youth Mentor with the Japan-America Academic Center in Boston, and she taught 500+ personalized English lessons to 400+ international students and professionals through Ringle. At Harvard she served on the Institute of Politics Policy Program's Education Team, researching evidence-based graduation requirements, and helped Boston-area high school students lead their own civic engagement initiatives. She is currently an Operations & Business Development Associate at Todaydream, where she onboards and mentors its DreAmbassador professionals.";

export const COLLEGE_CONSULTING_NIKA_SLUG = "college-consulting-nika-hour";
export const COLLEGE_CONSULTING_XAVIER_SLUG = "college-consulting-xavier-hour";
export const COLLEGE_CONSULTING_VICTORIA_SLUG = "college-consulting-victoria-hour";

export const NIKA_HOURLY_RATE_CENTS = SAT_HOURLY_RATE_CENTS;
export const XAVIER_NEEL_HOURLY_RATE_CENTS = 20_000;
export const VICTORIA_HOURLY_RATE_CENTS = SAT_HOURLY_RATE_CENTS;

export const COLLEGE_CONSULTING_PRODUCTS = [
  {
    tutorKey: "nika",
    slug: COLLEGE_CONSULTING_NIKA_SLUG,
    tutorName: NIKA_CONSULTING_NAME,
    name: "College Consulting hour with Nika Raiffe",
    description:
      "One prepaid 60-minute College Consulting credit with Nika Raiffe at $130/hour.",
    hourlyRateCents: NIKA_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "xavier",
    slug: COLLEGE_CONSULTING_XAVIER_SLUG,
    tutorName: "Xavier Morales",
    name: "College Consulting hour with Xavier Morales",
    description:
      "One prepaid 60-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.",
    hourlyRateCents: XAVIER_NEEL_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "victoria",
    slug: COLLEGE_CONSULTING_VICTORIA_SLUG,
    tutorName: VICTORIA_DISPLAY_NAME,
    name: "College Consulting hour with Victoria Wijerathnayapa",
    description:
      "One prepaid 60-minute College Consulting credit with Victoria Wijerathnayapa at $130/hour. Booking opens after her Google Calendar is connected.",
    hourlyRateCents: VICTORIA_HOURLY_RATE_CENTS,
  },
] as const;

export type CollegeConsultingTutorKey = (typeof COLLEGE_CONSULTING_PRODUCTS)[number]["tutorKey"];

export const COLLEGE_CONSULTING_SLUGS = COLLEGE_CONSULTING_PRODUCTS.map(
  (product) => product.slug,
);

const CONSULTING_SLUG_SET = new Set<string>(COLLEGE_CONSULTING_SLUGS);

export function isProductionClerkUserId(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return trimmed.startsWith("user_");
}

export function isNeelDharniUser(userId: string | null | undefined): boolean {
  return userId === NEEL_DHARNI_USER_ID;
}

export function isCollegeConsultingSlug(slug: string | null | undefined): boolean {
  return Boolean(slug && CONSULTING_SLUG_SET.has(slug));
}

export function collegeConsultingProductBySlug(slug: string) {
  return COLLEGE_CONSULTING_PRODUCTS.find((product) => product.slug === slug) ?? null;
}

export function collegeConsultingProductForTutorKey(tutorKey: CollegeConsultingTutorKey) {
  return COLLEGE_CONSULTING_PRODUCTS.find((product) => product.tutorKey === tutorKey) ?? null;
}

export function normalizeConsultingEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

export function collegeConsultingTutorKeyForProfile(profile: {
  name?: string | null;
  email?: string | null;
  userId?: string | null;
}): CollegeConsultingTutorKey | null {
  const email = normalizeConsultingEmail(profile.email);
  if (email === NIKA_CONSULTING_EMAIL) return "nika";
  if (email === normalizeConsultingEmail(CANONICAL_XAVIER_EMAIL)) return "xavier";
  if (profile.userId === VICTORIA_USER_ID) return "victoria";
  if (email === VICTORIA_PLACEHOLDER_EMAIL || email === VICTORIA_INTENDED_EMAIL) {
    return "victoria";
  }
  return null;
}

export type PlaceholderLinkStopReason =
  | "environment_administrator"
  | "existing_user_administrator"
  | "email_owned_by_other_user"
  | "grant_points_at_other_user"
  | "grant_role_conflict"
  | "clerk_id_owned_by_other_user"
  | "identity_not_verified";

export type PlaceholderLinkDecision =
  | { action: "link"; clerkUserId: string; mode: "existing" | "create" }
  | { action: "stop"; reason: PlaceholderLinkStopReason };

/**
 * Refuse to attach a placeholder login when it would overwrite an administrator
 * or someone else's user. Neel requires a known production Clerk id. Victoria's
 * temporary tutor login may be created with a pending id when the email is free.
 */
export function decidePlaceholderLink(input: {
  targetUserId: string;
  existingUser: { id: string; role: string; clerkUserId: string } | null;
  activeGrantUserId: string | null;
  grantClerkUserId: string | null;
  grantRoleCategory: string | null;
  allowedGrantRoles: readonly string[];
  envRoleCategories: readonly string[];
  requireKnownClerkId: boolean;
  clerkIdOwnerUserId: string | null;
}): PlaceholderLinkDecision {
  if (input.envRoleCategories.includes("administrator")) {
    return { action: "stop", reason: "environment_administrator" };
  }
  if (input.existingUser?.role === "administrator") {
    return { action: "stop", reason: "existing_user_administrator" };
  }
  if (input.existingUser && input.existingUser.id !== input.targetUserId) {
    return { action: "stop", reason: "email_owned_by_other_user" };
  }
  if (input.activeGrantUserId && input.activeGrantUserId !== input.targetUserId) {
    return { action: "stop", reason: "grant_points_at_other_user" };
  }
  if (
    input.grantRoleCategory &&
    !input.allowedGrantRoles.includes(input.grantRoleCategory)
  ) {
    return { action: "stop", reason: "grant_role_conflict" };
  }
  if (input.existingUser && input.existingUser.id === input.targetUserId) {
    return {
      action: "link",
      clerkUserId: input.existingUser.clerkUserId,
      mode: "existing",
    };
  }
  const known = [input.grantClerkUserId].find((id) => isProductionClerkUserId(id));
  if (input.clerkIdOwnerUserId && input.clerkIdOwnerUserId !== input.targetUserId) {
    return { action: "stop", reason: "clerk_id_owned_by_other_user" };
  }
  if (!known) {
    if (input.requireKnownClerkId) {
      return { action: "stop", reason: "identity_not_verified" };
    }
    return { action: "link", clerkUserId: "", mode: "create" };
  }
  return { action: "link", clerkUserId: known, mode: "create" };
}

export function clientMayBuyConsultingProduct(
  userId: string | null | undefined,
  slug: string,
): boolean {
  return isNeelDharniUser(userId) && isCollegeConsultingSlug(slug);
}

/** Neel buys consulting hours only. Everyone else keeps the SAT catalog. */
export function checkoutAudienceForSlug(
  userId: string | null | undefined,
  slug: string,
): "consulting" | "sat" | "forbidden" {
  if (isCollegeConsultingSlug(slug)) {
    return isNeelDharniUser(userId) ? "consulting" : "forbidden";
  }
  if (isNeelDharniUser(userId)) return "forbidden";
  return "sat";
}

export function consultingRateCentsForTutorKey(
  tutorKey: CollegeConsultingTutorKey,
): number {
  return collegeConsultingProductForTutorKey(tutorKey)!.hourlyRateCents;
}

export type ConsultingTutorCredit = {
  tutorKey: CollegeConsultingTutorKey;
  name: string;
  hourlyRateCents: number;
  prepaidHours: number;
  productSlug: string;
  calendarConnected: boolean;
};

export function consultingTutorCredits(input: {
  entries: Array<{ entryType: string; hours: unknown; productId?: string | null }>;
  products: Array<{ id: string; slug: string }>;
  calendars: Partial<Record<CollegeConsultingTutorKey, boolean>>;
}): ConsultingTutorCredit[] {
  return COLLEGE_CONSULTING_PRODUCTS.map((product) => {
    const row = input.products.find((item) => item.slug === product.slug);
    return {
      tutorKey: product.tutorKey,
      name: product.tutorName,
      hourlyRateCents: product.hourlyRateCents,
      prepaidHours: row
        ? remainingCreditHoursForProduct(input.entries, row.id)
        : 0,
      productSlug: product.slug,
      calendarConnected: input.calendars[product.tutorKey] === true,
    };
  });
}

/** SAT catalog acceptance must ignore consulting slugs and keep Xavier's SAT price. */
export function consultingSlugIsSatCatalogProduct(slug: string): boolean {
  return isAcceptedSatCatalogProduct({
    slug,
    active: true,
    durationHours: 1,
    totalPriceCents: collegeConsultingProductBySlug(slug)?.hourlyRateCents ?? 0,
  });
}
