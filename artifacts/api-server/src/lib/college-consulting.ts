import { createHash } from "node:crypto";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SAT_HOURLY_RATE_CENTS, isAcceptedSatCatalogProduct } from "./sat-catalog.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CANONICAL_XAVIER_EMAIL,
  XAVIER_PROFILE_EMAIL,
  CANONICAL_XAVIER_NAME,
  isRetiredXavierEmail,
} from "./xavier-identity.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { remainingCreditHoursForProducts } from "./credit-hours.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  APPROVED_PUBLIC_TEAM_PORTRAITS,
  EUNICE_PUBLIC_BIOGRAPHY,
  NIKA_BOOKING_TAGLINE,
  XAVIER_BOOKING_TAGLINE,
  XAVIER_PUBLIC_BIOGRAPHY,
} from "./public-team-roster.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isNikaTutorProfile } from "./admin-calendar-fallback.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NEEL_NIKA_MEET_URL } from "./session-schedule.ts";

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
 * Tutor login. Migration 0069 stores this on her user, grant, and tutor profile.
 * She is matched by email when she signs in. Do not email this address and do
 * not create a Clerk user for it.
 */
export const VICTORIA_INTENDED_EMAIL = "victoriawije7@gmail.com";
/** First-party portrait, same /media/team path as Nika and Xavier. Not a public-team roster entry. */
export const VICTORIA_PHOTO_URL = "/media/team/victoria.jpg";
export const VICTORIA_PHOTO_ALT_TEXT = "Victoria Wijerathnayapa, College Consulting Tutor";
export const VICTORIA_BOOKING_TAGLINE =
  "Harvard Neuroscience & Education '25, Instructional Design, Youth Mentor";
/** Consulting card copy. First name only. The public team roster is a separate bio. */
export const NIKA_CONSULTING_BIOGRAPHY =
  "Nika is a senior studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She is currently a summer business analyst in the Goldman Sachs Business Intelligence Group. She previously worked at Columbia's Irving Medical Center as a Research Intern on Relational Health.";
/** Consulting portrait. The public roster keeps /media/team/nika-raiffe.png. */
export const NIKA_CONSULTING_PHOTO_URL = "/media/team/nika.png";

export const VICTORIA_BIOGRAPHY =
  "Victoria graduated from Harvard in 2025 in Neuroscience and Education, after also being admitted to Brown and Yale. She makes learning engaging through evidence-based strategies, and has mentored students with the Japan-America Academic Center in Boston since 2023 and taught 500+ English lessons to international students. She is now an Operations & Business Development Associate at Todaydream.";
/** Consulting bio before the surname was removed. Startup replaces only this exact text. */
export const VICTORIA_FULL_NAME_BIOGRAPHY =
  "Victoria Wijerathnayapa graduated from Harvard in 2025 in Neuroscience and Education, after also being admitted to Brown and Yale. She makes learning engaging through evidence-based strategies, and has mentored students with the Japan-America Academic Center in Boston since 2023 and taught 500+ English lessons to international students. She is now an Operations & Business Development Associate at Todaydream.";
/** Previous site bio. Startup replaces only this exact text. */
export const VICTORIA_PREVIOUS_BIOGRAPHY =
  "Victoria Wijerathnayapa graduated from Harvard in 2025 with a degree in Neuroscience and a focus on Education. She is passionate about making learning engaging, inclusive, and impactful through evidence-based strategies, bridging scientific research and instructional design. Since 2023 she has been a Youth Mentor with the Japan-America Academic Center in Boston, and she taught 500+ personalized English lessons to 400+ international students and professionals through Ringle. At Harvard she served on the Institute of Politics Policy Program's Education Team, researching evidence-based graduation requirements, and helped Boston-area high school students lead their own civic engagement initiatives. She is currently an Operations & Business Development Associate at Todaydream, where she onboards and mentors its DreAmbassador professionals.";

export const COLLEGE_CONSULTING_NIKA_SLUG = "college-consulting-nika-hour";
export const COLLEGE_CONSULTING_XAVIER_SLUG = "college-consulting-xavier-hour";
export const COLLEGE_CONSULTING_VICTORIA_SLUG = "college-consulting-victoria-hour";
export const COLLEGE_CONSULTING_EUNICE_SLUG = "college-consulting-eunice-hour";

export const EUNICE_CONSULTING_NAME = "Eunice Chon";
export const EUNICE_CONSULTING_EMAIL = "eunice_chon@berkeley.edu";

/** Neel's College Consulting rate. Michelle's SAT hours with Xavier stay on the SAT catalog. */
export const NIKA_HOURLY_RATE_CENTS = 10_000;
export const XAVIER_NEEL_HOURLY_RATE_CENTS = 20_000;
export const VICTORIA_HOURLY_RATE_CENTS = SAT_HOURLY_RATE_CENTS;
/** Same hourly rate as Eunice's SAT hours. 1.5h is $195 and 2h is $260. */
export const EUNICE_HOURLY_RATE_CENTS = SAT_HOURLY_RATE_CENTS;

export const COLLEGE_CONSULTING_PRODUCTS = [
  {
    tutorKey: "nika",
    slug: COLLEGE_CONSULTING_NIKA_SLUG,
    tutorName: NIKA_CONSULTING_NAME,
    name: "College Consulting hour with Nika",
    description:
      "One prepaid 60-minute College Consulting credit with Nika at $100/hour.",
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
    name: "College Consulting hour with Victoria",
    description:
      "One prepaid 60-minute College Consulting credit with Victoria at $130/hour. Booking opens after her Google Calendar is connected.",
    hourlyRateCents: VICTORIA_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "eunice",
    slug: COLLEGE_CONSULTING_EUNICE_SLUG,
    tutorName: EUNICE_CONSULTING_NAME,
    name: "College Consulting hour with Eunice",
    description: "One prepaid 60-minute College Consulting credit with Eunice at $130/hour.",
    hourlyRateCents: EUNICE_HOURLY_RATE_CENTS,
  },
] as const;

export type CollegeConsultingTutorKey = (typeof COLLEGE_CONSULTING_PRODUCTS)[number]["tutorKey"];

/** 1.5h and 2h credits at the same hourly rate. The 1-hour rows stay unchanged. */
export const COLLEGE_CONSULTING_LENGTH_PRODUCTS: ReadonlyArray<{
  tutorKey: CollegeConsultingTutorKey;
  slug: string;
  name: string;
  description: string;
  durationHours: number;
  totalPriceCents: number;
  hourlyRateCents: number;
}> = [
  {
    tutorKey: "nika",
    slug: "college-consulting-nika-90",
    name: "College Consulting 1.5 hours with Nika",
    description: "One prepaid 90-minute College Consulting credit with Nika at $100/hour.",
    durationHours: 1.5,
    totalPriceCents: Math.round(NIKA_HOURLY_RATE_CENTS * 1.5),
    hourlyRateCents: NIKA_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "nika",
    slug: "college-consulting-nika-120",
    name: "College Consulting 2 hours with Nika",
    description: "One prepaid 120-minute College Consulting credit with Nika at $100/hour.",
    durationHours: 2,
    totalPriceCents: NIKA_HOURLY_RATE_CENTS * 2,
    hourlyRateCents: NIKA_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "victoria",
    slug: "college-consulting-victoria-90",
    name: "College Consulting 1.5 hours with Victoria",
    description: "One prepaid 90-minute College Consulting credit with Victoria at $130/hour.",
    durationHours: 1.5,
    totalPriceCents: Math.round(VICTORIA_HOURLY_RATE_CENTS * 1.5),
    hourlyRateCents: VICTORIA_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "victoria",
    slug: "college-consulting-victoria-120",
    name: "College Consulting 2 hours with Victoria",
    description: "One prepaid 120-minute College Consulting credit with Victoria at $130/hour.",
    durationHours: 2,
    totalPriceCents: VICTORIA_HOURLY_RATE_CENTS * 2,
    hourlyRateCents: VICTORIA_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "xavier",
    slug: "college-consulting-xavier-90",
    name: "College Consulting 1.5 hours with Xavier Morales",
    description:
      "One prepaid 90-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.",
    durationHours: 1.5,
    totalPriceCents: Math.round(XAVIER_NEEL_HOURLY_RATE_CENTS * 1.5),
    hourlyRateCents: XAVIER_NEEL_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "xavier",
    slug: "college-consulting-xavier-120",
    name: "College Consulting 2 hours with Xavier Morales",
    description:
      "One prepaid 120-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.",
    durationHours: 2,
    totalPriceCents: XAVIER_NEEL_HOURLY_RATE_CENTS * 2,
    hourlyRateCents: XAVIER_NEEL_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "eunice",
    slug: "college-consulting-eunice-90",
    name: "College Consulting 1.5 hours with Eunice",
    description: "One prepaid 90-minute College Consulting credit with Eunice at $130/hour.",
    durationHours: 1.5,
    totalPriceCents: Math.round(EUNICE_HOURLY_RATE_CENTS * 1.5),
    hourlyRateCents: EUNICE_HOURLY_RATE_CENTS,
  },
  {
    tutorKey: "eunice",
    slug: "college-consulting-eunice-120",
    name: "College Consulting 2 hours with Eunice",
    description: "One prepaid 120-minute College Consulting credit with Eunice at $130/hour.",
    durationHours: 2,
    totalPriceCents: EUNICE_HOURLY_RATE_CENTS * 2,
    hourlyRateCents: EUNICE_HOURLY_RATE_CENTS,
  },
];

export const COLLEGE_CONSULTING_SLUGS = [
  ...COLLEGE_CONSULTING_PRODUCTS.map((product) => product.slug),
  ...COLLEGE_CONSULTING_LENGTH_PRODUCTS.map((product) => product.slug),
];

export function consultingSlugsForTutorKey(tutorKey: CollegeConsultingTutorKey): string[] {
  return [
    collegeConsultingProductForTutorKey(tutorKey)?.slug,
    ...COLLEGE_CONSULTING_LENGTH_PRODUCTS.filter((product) => product.tutorKey === tutorKey).map(
      (product) => product.slug,
    ),
  ].filter((slug): slug is string => Boolean(slug));
}

const CONSULTING_SLUG_SET = new Set<string>(COLLEGE_CONSULTING_SLUGS);

export function isProductionClerkUserId(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return trimmed.startsWith("user_");
}

/**
 * Temporary view of Nika's tutor portal. This is not a second user row:
 * users.email and users.clerk_user_id stay on nika.raiffe@gmail.com.
 * xsfam6@gmail.com remains a retired Xavier address for every other path.
 *
 * TEMP_NIKA_VIEW_EMAIL unset uses the default address. Set it to off or
 * disabled to remove the view without a code change. TEMP_NIKA_VIEW_UNTIL
 * is an ISO timestamp; after that instant the view is off.
 */
export const NIKA_TEMPORARY_VIEW_EMAIL = "xsfam6@gmail.com";

const TEMP_NIKA_VIEW_DISABLED = new Set(["", "off", "disabled", "none", "false"]);

export function isNeelDharniUser(userId: string | null | undefined): boolean {
  return userId === NEEL_DHARNI_USER_ID;
}

/** Neel booking Nika. Other students, and Neel with anyone else, stay on their own Meet. */
export function neelNikaMeetUrl(input: {
  clientUserId?: string | null;
  tutorName?: string | null;
  tutorEmail?: string | null;
}): string | null {
  if (!isNeelDharniUser(input.clientUserId)) return null;
  if (!isNikaTutorProfile({ name: input.tutorName, portalEmail: input.tutorEmail })) return null;
  return NEEL_NIKA_MEET_URL;
}

/**
 * Sama's test student. The Clerk id matches the Xavier capability seed.
 * Email or Clerk id is enough in code. The membership migration requires both.
 */
export const SAMA_POSTGRAD_TEST_EMAIL = "samapostgrad@gmail.com";
export const SAMA_POSTGRAD_TEST_CLERK_USER_ID = "user_3IxQY4GUjQGp9wT1WXzbyCVH67G";

export function isSamaPostgradTestStudent(
  user: { clerkUserId?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.clerkUserId === SAMA_POSTGRAD_TEST_CLERK_USER_ID) return true;
  return normalizeConsultingEmail(user.email) === SAMA_POSTGRAD_TEST_EMAIL;
}

export function collegeConsultingServiceRequested(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === COLLEGE_CONSULTING_SUBJECT.toLowerCase() || normalized === "college-consulting";
}

/** Sama can book consulting only when the request names that service. SAT stays available. */
export function samaCollegeConsultingBooking(
  user: { clerkUserId?: string | null; email?: string | null } | null | undefined,
  requested: unknown,
): boolean {
  return isSamaPostgradTestStudent(user) && collegeConsultingServiceRequested(requested);
}

/**
 * Signed-in College Consulting dashboard. Neel is always on it.
 * Sama's test student matches by Clerk id or email and does not become Neel.
 */
export function collegeConsultingDashboardEnabled(input: {
  userId?: string | null;
  email?: string | null;
  clerkUserId?: string | null;
}): boolean {
  return (
    isNeelDharniUser(input.userId) ||
    isSamaPostgradTestStudent({
      email: input.email,
      clerkUserId: input.clerkUserId,
    })
  );
}

/** Consulting dashboards count consulting products only. SAT dashboards exclude them. */
export function ledgerEntriesForConsultingDashboard<T extends { productId?: string | null }>(
  entries: readonly T[],
  consultingProductIds: ReadonlySet<string>,
  consultingDashboard: boolean,
): T[] {
  return entries.filter((entry) => {
    const consulting = Boolean(entry.productId && consultingProductIds.has(entry.productId));
    return consultingDashboard
      ? consulting
      : !entry.productId || !consultingProductIds.has(entry.productId);
  });
}

/** Keep provisioned client names when Clerk attaches on first sign-in. */
export function keepProvisionedPlaceholderDisplayName(
  name: string | null | undefined,
): boolean {
  const trimmed = name?.trim() ?? "";
  return (
    trimmed === NEEL_DISPLAY_NAME ||
    trimmed === VICTORIA_DISPLAY_NAME ||
    trimmed === VICTORIA_PLACEHOLDER_DISPLAY_NAME
  );
}

export function nikaTemporaryViewEmail(now: Date = new Date()): string | null {
  const until = process.env.TEMP_NIKA_VIEW_UNTIL?.trim();
  if (until) {
    const end = Date.parse(until);
    if (Number.isNaN(end) || now.getTime() > end) return null;
  }
  const configured = process.env.TEMP_NIKA_VIEW_EMAIL;
  if (configured === undefined) return NIKA_TEMPORARY_VIEW_EMAIL;
  const normalized = normalizeConsultingEmail(configured);
  if (TEMP_NIKA_VIEW_DISABLED.has(normalized)) return null;
  return normalized;
}

export function isNikaTemporaryViewEmail(email: string | null | undefined): boolean {
  const allowed = nikaTemporaryViewEmail();
  if (!allowed) return false;
  return normalizeConsultingEmail(email) === allowed;
}

/** Alias sessions may read the tutor portal. Writes stay forbidden. */
export function temporaryTutorViewAllowsMethod(method: string | null | undefined): boolean {
  const normalized = method?.trim().toUpperCase() ?? "";
  return normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS";
}

/**
 * Map the temporary Gmail onto Nika's existing tutor user.
 * Administrators stay administrators. A missing or revoked Nika grant does not
 * create one. Callers must not write Nika's email, Clerk id, or calendar token.
 */
export function nikaTemporaryViewDecision(input: {
  email?: string | null;
  envRoleCategories: readonly string[];
  signedInUserRole?: string | null;
  nikaUser: { id: string; role: string } | null;
  nikaGrantActive: boolean;
}): { action: "view"; userId: string } | { action: "ignore" } {
  if (!isNikaTemporaryViewEmail(input.email)) return { action: "ignore" };
  if (input.envRoleCategories.includes("administrator")) return { action: "ignore" };
  if (input.signedInUserRole === "administrator") return { action: "ignore" };
  if (!input.nikaUser || input.nikaUser.role !== "tutor") return { action: "ignore" };
  if (!input.nikaGrantActive) return { action: "ignore" };
  return { action: "view", userId: input.nikaUser.id };
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
  const name = profile.name?.trim() ?? "";
  if (email === NIKA_CONSULTING_EMAIL) return "nika";
  if (
    email === normalizeConsultingEmail(CANONICAL_XAVIER_EMAIL) ||
    email === normalizeConsultingEmail(XAVIER_PROFILE_EMAIL)
  ) {
    return "xavier";
  }
  if (name === CANONICAL_XAVIER_NAME && !isRetiredXavierEmail(email)) return "xavier";
  if (email === normalizeConsultingEmail(EUNICE_CONSULTING_EMAIL) || name === EUNICE_CONSULTING_NAME) {
    return "eunice";
  }
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
  | "identity_not_verified"
  | "access_revoked";

/** True when an administrator has turned this grant or profile off. */
export function portalAccessRevoked(
  record: {
    active?: boolean | null;
    revokedAt?: Date | string | null;
  } | null | undefined,
): boolean {
  if (!record) return false;
  if (record.active === false) return true;
  return record.revokedAt != null && record.revokedAt !== "";
}

export type NikaConsultingSkipReason =
  | "administrator"
  | "missing_user"
  | "missing_grant"
  | "grant_revoked"
  | "missing_profile"
  | "profile_inactive";

/** Null when Nika may receive a College Consulting membership and Neel assignment. */
export function nikaConsultingSkipReason(input: {
  environmentAdministrator?: boolean;
  user: { id: string; role: string } | null;
  grant: { active?: boolean | null; revokedAt?: Date | string | null } | null;
  profile: { active?: boolean | null } | null;
}): NikaConsultingSkipReason | null {
  if (input.environmentAdministrator || input.user?.role === "administrator") return "administrator";
  if (!input.user) return "missing_user";
  if (!input.grant) return "missing_grant";
  if (portalAccessRevoked(input.grant)) return "grant_revoked";
  if (!input.profile) return "missing_profile";
  if (portalAccessRevoked(input.profile)) return "profile_inactive";
  return null;
}

/** User id to add, or null when the grant or profile is revoked or missing. */
export function nikaConsultingAssignmentUserId(input: {
  environmentAdministrator?: boolean;
  user: { id: string; role: string } | null;
  grant: { active?: boolean | null; revokedAt?: Date | string | null } | null;
  profile: { active?: boolean | null } | null;
}): string | null {
  if (nikaConsultingSkipReason(input)) return null;
  return input.user!.id;
}

/** Stopped or unlinked Victoria, including another owner of the placeholder email, gets no tutor row. */
export function victoriaConsultingAssignmentUserId(
  linked: boolean,
  userId: string | null,
): string | null {
  return linked && userId ? userId : null;
}

export type PlaceholderLinkDecision =
  | { action: "link"; clerkUserId: string; mode: "existing" | "create" }
  | { action: "stop"; reason: PlaceholderLinkStopReason };

function placeholderEnvStop(
  envRoleCategories: readonly string[],
  allowedGrantRoles: readonly string[],
): PlaceholderLinkStopReason | null {
  if (envRoleCategories.includes("administrator")) return "environment_administrator";
  for (const role of envRoleCategories) {
    const grantRole =
      role === "sat_tutor" || role === "english_tutor" ? "tutor" : role;
    if (!allowedGrantRoles.includes(grantRole)) return "grant_role_conflict";
  }
  return null;
}

/**
 * Refuse to attach a placeholder login when it would overwrite an administrator
 * or someone else's user. A free email is created with a pending Clerk id and
 * matched on first sign-in. Another owner of the email stops the link.
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
  const envStop = placeholderEnvStop(
    input.envRoleCategories,
    input.allowedGrantRoles,
  );
  if (envStop) return { action: "stop", reason: envStop };
  if (input.existingUser?.role === "administrator") {
    return { action: "stop", reason: "existing_user_administrator" };
  }
  if (input.grantRoleCategory === "administrator") {
    return { action: "stop", reason: "grant_role_conflict" };
  }
  if (input.existingUser && input.existingUser.id !== input.targetUserId) {
    return { action: "stop", reason: "email_owned_by_other_user" };
  }
  if (input.activeGrantUserId && input.activeGrantUserId !== input.targetUserId) {
    return { action: "stop", reason: "grant_points_at_other_user" };
  }
  const tutorGrantCompatible =
    input.allowedGrantRoles.includes("tutor") &&
    (input.grantRoleCategory === "sat_tutor" || input.grantRoleCategory === "english_tutor");
  if (
    input.grantRoleCategory &&
    !input.allowedGrantRoles.includes(input.grantRoleCategory) &&
    !tutorGrantCompatible
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
  identity?: { clerkUserId?: string | null; email?: string | null } | null,
): boolean {
  const allowed = isNeelDharniUser(userId) || isSamaPostgradTestStudent(identity);
  return allowed && isCollegeConsultingSlug(slug);
}

/**
 * Neel buys consulting hours only. Sama's test student can buy either catalog.
 * Everyone else keeps the SAT catalog.
 */
export function checkoutAudienceForSlug(
  userId: string | null | undefined,
  slug: string,
  identity?: { clerkUserId?: string | null; email?: string | null } | null,
): "consulting" | "sat" | "forbidden" {
  const sama = isSamaPostgradTestStudent(identity);
  if (isCollegeConsultingSlug(slug)) {
    return isNeelDharniUser(userId) || sama ? "consulting" : "forbidden";
  }
  if (isNeelDharniUser(userId)) return "forbidden";
  return "sat";
}

export function consultingRateCentsForTutorKey(
  tutorKey: CollegeConsultingTutorKey,
): number {
  return collegeConsultingProductForTutorKey(tutorKey)!.hourlyRateCents;
}

/**
 * The line under a tutor's name on client booking cards.
 * Eunice's card uses her published bio. Other tutors keep their stored title.
 */
export function clientPortalTutorTitle(profile: {
  name?: string | null;
  email?: string | null;
  userId?: string | null;
  title?: string | null;
}): string {
  if (collegeConsultingTutorKeyForProfile(profile) === "eunice") return EUNICE_PUBLIC_BIOGRAPHY;
  return profile.title?.trim() ?? "";
}

/** Consulting page bio. Nika's public roster biography stays on the team page. */
export function consultingTutorBiography(tutorKey: CollegeConsultingTutorKey): string {
  if (tutorKey === "nika") return NIKA_CONSULTING_BIOGRAPHY;
  if (tutorKey === "victoria") return VICTORIA_BIOGRAPHY;
  if (tutorKey === "eunice") return EUNICE_PUBLIC_BIOGRAPHY;
  return XAVIER_PUBLIC_BIOGRAPHY;
}

/** Nika's consulting photo has no surname in the path. Victoria's file stays as it is. */
export function consultingTutorPhotoUrl(
  tutorKey: CollegeConsultingTutorKey,
  storedPhotoUrl?: string | null,
): string {
  if (tutorKey === "nika") return NIKA_CONSULTING_PHOTO_URL;
  const stored = storedPhotoUrl?.trim() ?? "";
  if (stored) return stored;
  if (tutorKey === "victoria") return VICTORIA_PHOTO_URL;
  if (tutorKey === "eunice") return APPROVED_PUBLIC_TEAM_PORTRAITS["Eunice Chon"];
  return APPROVED_PUBLIC_TEAM_PORTRAITS["Xavier Morales"];
}

/** Credits-page label. Consulting cards use the first name. */
export function consultingTutorDisplayName(tutorKey: CollegeConsultingTutorKey): string {
  if (tutorKey === "nika") return "Nika";
  if (tutorKey === "victoria") return "Victoria";
  if (tutorKey === "eunice") return "Eunice";
  return "Xavier";
}

export type ConsultingCatalogAlignment = {
  name: string;
  description: string;
  totalPriceCents: number;
  effectiveHourlyRateCents: number;
  /**
   * Name, description, or price differ, so the stored Stripe Product and Price
   * must be recreated. Mirrors the admin product edit.
   */
  clearStripeIds: boolean;
};

/**
 * Catalog charge for checkout. Null when the stored row already matches.
 * SAT products, including Michelle's $130 Xavier hour, are not consulting slugs.
 */
export function consultingCatalogAlignment(product: {
  slug: string;
  name?: string | null;
  description?: string | null;
  totalPriceCents: number;
  stripePriceId?: string | null;
}): ConsultingCatalogAlignment | null {
  const catalog = collegeConsultingProductBySlug(product.slug);
  if (!catalog) return null;
  const priceChanged = Number(product.totalPriceCents) !== catalog.hourlyRateCents;
  const nameChanged = (product.name ?? "") !== catalog.name;
  const descriptionChanged = (product.description ?? "") !== catalog.description;
  if (!priceChanged && !nameChanged && !descriptionChanged) return null;
  return {
    name: catalog.name,
    description: catalog.description,
    totalPriceCents: catalog.hourlyRateCents,
    effectiveHourlyRateCents: catalog.hourlyRateCents,
    clearStripeIds: true,
  };
}

/** Stripe rejects a reused idempotency key when the product body changes inside 24h. */
export function stripeCatalogProductIdempotencyKey(product: {
  id: string;
  name: string;
  description: string;
  totalPriceCents: number;
}): string {
  const content = createHash("sha256")
    .update(`${product.totalPriceCents}\n${product.name}\n${product.description}`)
    .digest("hex")
    .slice(0, 24);
  return `accepted-admissions-product-${product.id}-${product.totalPriceCents}-${content}`;
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
    const slugs = new Set(consultingSlugsForTutorKey(product.tutorKey));
    const productIds = input.products
      .filter((item) => slugs.has(item.slug))
      .map((item) => item.id);
    return {
      tutorKey: product.tutorKey,
      name: consultingTutorDisplayName(product.tutorKey),
      hourlyRateCents: product.hourlyRateCents,
      prepaidHours: remainingCreditHoursForProducts(input.entries, productIds),
      productSlug: product.slug,
      calendarConnected: input.calendars[product.tutorKey] === true,
    };
  });
}

export type ConsultingPreviewTutor = {
  tutorKey: CollegeConsultingTutorKey;
  id: string;
  name: string;
  title: string;
  tagline: string;
  biography: string;
  photoUrl: string | null;
  hourlyRateCents: number;
  prepaidHours: number;
  calendarConnected: boolean;
};

const CONSULTING_PREVIEW_ORDER: CollegeConsultingTutorKey[] = [
  "nika",
  "victoria",
  "xavier",
  "eunice",
];

const CONSULTING_PREVIEW_FALLBACKS: Record<
  CollegeConsultingTutorKey,
  { name: string; title: string; tagline: string; biography: string; photoUrl: string }
> = {
  nika: {
    name: NIKA_CONSULTING_NAME,
    title: "College Consulting Tutor",
    tagline: NIKA_BOOKING_TAGLINE,
    biography: NIKA_CONSULTING_BIOGRAPHY,
    photoUrl: NIKA_CONSULTING_PHOTO_URL,
  },
  victoria: {
    name: VICTORIA_DISPLAY_NAME,
    title: "College Consulting Tutor",
    tagline: VICTORIA_BOOKING_TAGLINE,
    biography: VICTORIA_BIOGRAPHY,
    photoUrl: VICTORIA_PHOTO_URL,
  },
  xavier: {
    name: "Xavier Morales",
    title: "College Consulting Tutor",
    tagline: XAVIER_BOOKING_TAGLINE,
    biography: XAVIER_PUBLIC_BIOGRAPHY,
    photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Xavier Morales"],
  },
  eunice: {
    name: EUNICE_CONSULTING_NAME,
    title: "College Consulting Tutor",
    tagline: "",
    biography: EUNICE_PUBLIC_BIOGRAPHY,
    photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Eunice Chon"],
  },
};

function filledPreviewText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || fallback;
}

/**
 * Read-only College Consulting cards for Neel's admin preview.
 * Missing or inactive profiles still appear. Nika and Victoria use consulting bios.
 * This does not read Google Calendar or create a user.
 */
export function consultingPreviewTutors(input: {
  profiles: Array<{
    id: string;
    userId?: string | null;
    email?: string | null;
    name?: string | null;
    title?: string | null;
    tagline?: string | null;
    biography?: string | null;
    photoUrl?: string | null;
    active?: boolean | null;
    bookingEligible?: boolean | null;
    calendarStatus?: string | null;
  }>;
  prepaidHours?: Partial<Record<CollegeConsultingTutorKey, number>>;
  calendars?: Partial<Record<CollegeConsultingTutorKey, boolean>>;
}): ConsultingPreviewTutor[] {
  return CONSULTING_PREVIEW_ORDER.map((tutorKey) => {
    const fallback = CONSULTING_PREVIEW_FALLBACKS[tutorKey];
    const matches = input.profiles.filter(
      (profile) => collegeConsultingTutorKeyForProfile(profile) === tutorKey,
    );
    const profile = matches.find((item) => item.active !== false) ?? matches[0];
    const bookable = matches.filter((item) => item.bookingEligible === true);
    const bookableCalendar = bookable.find((item) => item.calendarStatus === "connected") ?? bookable[0];
    const product = collegeConsultingProductForTutorKey(tutorKey);
    if (!product) {
      throw new Error(`Missing College Consulting product for ${tutorKey}`);
    }
    return {
      tutorKey,
      id: profile?.id ?? `preview-${tutorKey}`,
      name: consultingTutorDisplayName(tutorKey),
      title: clientPortalTutorTitle({
        name: profile?.name ?? fallback.name,
        email: profile?.email,
        userId: profile?.userId,
        title: filledPreviewText(profile?.title, fallback.title),
      }),
      tagline: filledPreviewText(profile?.tagline, fallback.tagline),
      biography:
        tutorKey === "xavier"
          ? filledPreviewText(profile?.biography, consultingTutorBiography(tutorKey))
          : consultingTutorBiography(tutorKey),
      photoUrl: consultingTutorPhotoUrl(tutorKey, profile?.photoUrl),
      hourlyRateCents: product.hourlyRateCents,
      prepaidHours: input.prepaidHours?.[tutorKey] ?? 0,
      calendarConnected: input.calendars
        ? input.calendars[tutorKey] === true
        : bookableCalendar?.calendarStatus === "connected",
    };
  });
}

/** In-memory student used only to render Neel's preview when no users row exists. */
export function syntheticNeelPreviewUser(now: Date = new Date()) {
  return {
    id: NEEL_DHARNI_USER_ID,
    clerkUserId: `pending:${NEEL_PLACEHOLDER_EMAIL}`,
    email: NEEL_PLACEHOLDER_EMAIL,
    displayName: NEEL_DISPLAY_NAME,
    title: null,
    avatarUrl: null,
    stripeCustomerId: null,
    role: "student" as const,
    timezone: "America/New_York",
    timezoneSource: "default",
    createdAt: now,
    updatedAt: now,
  };
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
