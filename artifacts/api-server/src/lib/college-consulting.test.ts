import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { remainingCreditHoursForProduct } from "./credit-hours.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ACCEPTED_SAT_CATALOG,
  SAT_HOURLY_RATE_CENTS,
  SINGLE_SAT_SESSION_PRICE_CENTS,
  TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
} from "./sat-catalog.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { sharedMeetOverlapPairs } from "./shared-meet-conflict.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  COLLEGE_CONSULTING_NIKA_SLUG,
  COLLEGE_CONSULTING_PRODUCTS,
  COLLEGE_CONSULTING_SLUGS,
  COLLEGE_CONSULTING_VICTORIA_SLUG,
  COLLEGE_CONSULTING_XAVIER_SLUG,
  NEEL_DHARNI_USER_ID,
  NIKA_HOURLY_RATE_CENTS,
  VICTORIA_BIOGRAPHY,
  VICTORIA_BOOKING_TAGLINE,
  VICTORIA_DISPLAY_NAME,
  VICTORIA_HOURLY_RATE_CENTS,
  VICTORIA_INTENDED_EMAIL,
  VICTORIA_PLACEHOLDER_EMAIL,
  nikaConsultingAssignmentUserId,
  portalAccessRevoked,
  victoriaConsultingAssignmentUserId,
  VICTORIA_USER_ID,
  XAVIER_NEEL_HOURLY_RATE_CENTS,
  checkoutAudienceForSlug,
  clientMayBuyConsultingProduct,
  consultingSlugIsSatCatalogProduct,
  consultingTutorCredits,
  decidePlaceholderLink,
} from "./college-consulting.ts";

test("College Consulting prices are per tutor and SAT catalog stays $130", () => {
  assert.equal(NIKA_HOURLY_RATE_CENTS, 13_000);
  assert.equal(VICTORIA_HOURLY_RATE_CENTS, 13_000);
  assert.equal(XAVIER_NEEL_HOURLY_RATE_CENTS, 20_000);
  assert.equal(SAT_HOURLY_RATE_CENTS, 13_000);
  assert.equal(SINGLE_SAT_SESSION_PRICE_CENTS, 13_000);
  assert.equal(TEN_SAT_SESSION_PACKAGE_PRICE_CENTS, 130_000);
  assert.deepEqual(
    COLLEGE_CONSULTING_PRODUCTS.map((product) => [product.slug, product.hourlyRateCents]),
    [
      [COLLEGE_CONSULTING_NIKA_SLUG, 13_000],
      [COLLEGE_CONSULTING_XAVIER_SLUG, 20_000],
      [COLLEGE_CONSULTING_VICTORIA_SLUG, 13_000],
    ],
  );
  const satSlugs = new Set<string>(ACCEPTED_SAT_CATALOG.map((product) => product.slug));
  for (const slug of COLLEGE_CONSULTING_SLUGS) {
    assert.equal(satSlugs.has(slug), false);
    assert.equal(consultingSlugIsSatCatalogProduct(slug), false);
  }
  assert.equal(
    ACCEPTED_SAT_CATALOG.find((product) => product.slug === "single-sat-session")?.totalPriceCents,
    13_000,
  );
});

test("only Neel can buy consulting hours, and a Nika hour does not pay for Xavier", () => {
  assert.equal(clientMayBuyConsultingProduct(NEEL_DHARNI_USER_ID, COLLEGE_CONSULTING_XAVIER_SLUG), true);
  assert.equal(clientMayBuyConsultingProduct(NEEL_DHARNI_USER_ID, COLLEGE_CONSULTING_NIKA_SLUG), true);
  assert.equal(clientMayBuyConsultingProduct(NEEL_DHARNI_USER_ID, COLLEGE_CONSULTING_VICTORIA_SLUG), true);
  assert.equal(clientMayBuyConsultingProduct("other-student", COLLEGE_CONSULTING_XAVIER_SLUG), false);
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, "single-sat-session"), "forbidden");
  assert.equal(checkoutAudienceForSlug("michelle", COLLEGE_CONSULTING_XAVIER_SLUG), "forbidden");
  assert.equal(checkoutAudienceForSlug("michelle", "single-sat-session"), "sat");
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, COLLEGE_CONSULTING_XAVIER_SLUG), "consulting");

  const entries = [
    { entryType: "original", hours: 2, productId: "nika-product" },
    { entryType: "debit", hours: 1, productId: "nika-product" },
    { entryType: "original", hours: 1, productId: "victoria-product" },
  ];
  assert.equal(remainingCreditHoursForProduct(entries, "nika-product"), 1);
  assert.equal(remainingCreditHoursForProduct(entries, "victoria-product"), 1);
  assert.equal(remainingCreditHoursForProduct(entries, "xavier-product"), 0);
  const credits = consultingTutorCredits({
    entries,
    products: [
      { id: "nika-product", slug: COLLEGE_CONSULTING_NIKA_SLUG },
      { id: "xavier-product", slug: COLLEGE_CONSULTING_XAVIER_SLUG },
      { id: "victoria-product", slug: COLLEGE_CONSULTING_VICTORIA_SLUG },
    ],
    calendars: { nika: true, xavier: true, victoria: false },
  });
  assert.equal(credits.find((credit) => credit.tutorKey === "xavier")?.prepaidHours, 0);
  assert.equal(credits.find((credit) => credit.tutorKey === "xavier")?.hourlyRateCents, 20_000);
  assert.equal(credits.find((credit) => credit.tutorKey === "nika")?.prepaidHours, 1);
  assert.equal(credits.find((credit) => credit.tutorKey === "victoria")?.calendarConnected, false);
  assert.equal(credits.find((credit) => credit.tutorKey === "victoria")?.hourlyRateCents, 13_000);
});

test("placeholder links stop for administrators and do not provision Victoria's real email", () => {
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: NEEL_DHARNI_USER_ID,
      existingUser: {
        id: "sama-user",
        role: "administrator",
        clerkUserId: "user_admin",
      },
      activeGrantUserId: null,
      grantClerkUserId: null,
      grantRoleCategory: null,
      allowedGrantRoles: ["student"],
      envRoleCategories: [],
      requireKnownClerkId: true,
      clerkIdOwnerUserId: null,
    }),
    { action: "stop", reason: "existing_user_administrator" },
  );
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: NEEL_DHARNI_USER_ID,
      existingUser: null,
      activeGrantUserId: null,
      grantClerkUserId: null,
      grantRoleCategory: null,
      allowedGrantRoles: ["student"],
      envRoleCategories: ["administrator"],
      requireKnownClerkId: true,
      clerkIdOwnerUserId: null,
    }),
    { action: "stop", reason: "environment_administrator" },
  );
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: NEEL_DHARNI_USER_ID,
      existingUser: null,
      activeGrantUserId: null,
      grantClerkUserId: null,
      grantRoleCategory: null,
      allowedGrantRoles: ["student"],
      envRoleCategories: [],
      requireKnownClerkId: true,
      clerkIdOwnerUserId: null,
    }),
    { action: "stop", reason: "identity_not_verified" },
  );
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: VICTORIA_USER_ID,
      existingUser: null,
      activeGrantUserId: null,
      grantClerkUserId: null,
      grantRoleCategory: null,
      allowedGrantRoles: ["tutor"],
      envRoleCategories: [],
      requireKnownClerkId: false,
      clerkIdOwnerUserId: null,
    }).action,
    "link",
  );
  assert.equal(VICTORIA_PLACEHOLDER_EMAIL, "samakubba@icloud.com");
  assert.equal(VICTORIA_INTENDED_EMAIL, "victoriawije7@gmail.com");
  assert.notEqual(VICTORIA_PLACEHOLDER_EMAIL, VICTORIA_INTENDED_EMAIL);
});

test("shared room overlaps keep a stable key and ignore a different room", () => {
  const start = new Date("2026-11-02T15:00:00.000Z");
  const pairs = sharedMeetOverlapPairs([
    {
      id: "b",
      title: "Neel with Xavier",
      dateTime: start,
      durationMinutes: 60,
      subject: "College Consulting",
      courseMeetUrl: null,
    },
    {
      id: "a",
      title: "Taito IELTS",
      dateTime: new Date(start.getTime() + 15 * 60_000),
      durationMinutes: 60,
      term: "Spring 2027",
      subject: "IELTS",
      courseMeetUrl: null,
    },
    {
      id: "c",
      title: "Elsewhere",
      dateTime: start,
      durationMinutes: 60,
      term: "Spring 2027",
      subject: "IELTS",
      courseMeetUrl: "https://meet.google.com/other-room",
    },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]?.leftSessionId, "a");
  assert.equal(pairs[0]?.rightSessionId, "b");
  assert.match(pairs[0]!.overlapKey, /^a:b:/);
});

test("provisioning and the migration do not send email or create Clerk users", async () => {
  const provision = await readFile(
    fileURLToPath(new URL("./college-consulting-provision.ts", import.meta.url)),
    "utf8",
  );
  const migration = await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0045_college_consulting_neel_nika.sql", import.meta.url)),
    "utf8",
  );
  for (const source of [provision, migration]) {
    assert.equal(/createUser|createGoogleEvent|resend|sendEmail|sendInvite|clerkClient/i.test(source), false);
  }
  assert.match(provision, /No Clerk invitation/);
  assert.equal(provision.includes(VICTORIA_INTENDED_EMAIL), false);
  assert.match(provision, /photoUrl: VICTORIA_PHOTO_URL/);
  assert.match(provision, /tagline: VICTORIA_BOOKING_TAGLINE/);
  assert.match(provision, /biography: VICTORIA_BIOGRAPHY/);
  assert.match(provision, /NIKA_BOOKING_TAGLINE/);
  assert.match(provision, /XAVIER_BOOKING_TAGLINE/);
  assert.equal(VICTORIA_DISPLAY_NAME, "Victoria Wijerathnayapa");
  assert.equal(
    VICTORIA_BOOKING_TAGLINE,
    "Harvard Neuroscience & Education '25, Instructional Design, Youth Mentor",
  );
  assert.equal(
    VICTORIA_BIOGRAPHY,
    "Victoria Wijerathnayapa graduated from Harvard in 2025 in Neuroscience and Education, after also being admitted to Brown and Yale. She makes learning engaging through evidence-based strategies, and has mentored students with the Japan-America Academic Center in Boston since 2023 and taught 500+ English lessons to international students. She is now an Operations & Business Development Associate at Todaydream.",
  );
  assert.doesNotMatch(VICTORIA_BIOGRAPHY, /Ringle|DreAmbassador|Institute of Politics/);
  assert.equal(provision.includes(VICTORIA_BIOGRAPHY), false);
  const rates = await readFile(
    fileURLToPath(new URL("./college-consulting.ts", import.meta.url)),
    "utf8",
  );
  assert.match(rates, /VICTORIA_INTENDED_EMAIL = "victoriawije7@gmail.com"/);
  assert.equal(migration.includes("INSERT INTO \"users\""), false);
  assert.equal(migration.includes("INSERT INTO \"portal_access_grants\""), false);
  assert.equal(provision.includes("english_tutor"), false);
  assert.equal(provision.includes("revokedAt: null"), false);
  assert.equal(provision.includes(".update(satProductsTable)"), false);
  assert.match(provision, /onConflictDoNothing/);
  assert.match(provision, /pg_advisory_xact_lock\(hashtext\(\$\{PROVISION_LOCK_KEY\}\)\)/);
  assert.match(provision, /portalAccessRevoked\(grant\)/);
  assert.match(provision, /portalAccessRevoked\(profile\)/);
  assert.equal(portalAccessRevoked({ active: true, revokedAt: null }), false);
  assert.equal(portalAccessRevoked({ active: false, revokedAt: null }), true);
  assert.equal(portalAccessRevoked({ active: true, revokedAt: new Date() }), true);
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const index = await readFile(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");
  assert.equal(platform.includes("ensureCollegeConsultingProvision("), false);
  assert.match(index, /ensureCollegeConsultingProvision\(\)/);
  assert.match(provision, /const tutorEmails = \[CANONICAL_XAVIER_EMAIL\]/);
  assert.equal(/tutorEmails = \[[^\]]*NIKA_CONSULTING_EMAIL/.test(provision), false);
  assert.match(provision, /victoria\.linked && victoria\.userId \? \[victoria\.userId\] : \[\]/);
  assert.match(provision, /if \(nika\.bookable && nikaAssignmentUserId\)/);
  assert.match(provision, /lower\(\$\{column\}\)/);
});

test("revoked Nika and stopped Victoria get no College Consulting membership or assignment", () => {
  const revokedGrant = { active: false, revokedAt: new Date("2026-01-01T00:00:00.000Z") };
  const activeGrant = { active: true, revokedAt: null };
  const nika = { id: "nika-user", role: "tutor" };
  assert.equal(
    nikaConsultingAssignmentUserId({
      user: nika,
      grant: revokedGrant,
      profile: { active: true },
    }),
    null,
  );
  assert.equal(
    nikaConsultingAssignmentUserId({
      user: nika,
      grant: { active: true, revokedAt: new Date("2026-02-01T00:00:00.000Z") },
      profile: { active: true },
    }),
    null,
  );
  assert.equal(
    nikaConsultingAssignmentUserId({
      user: nika,
      grant: activeGrant,
      profile: { active: false },
    }),
    null,
  );
  assert.equal(victoriaConsultingAssignmentUserId(false, "icloud-owner"), null);
  assert.equal(victoriaConsultingAssignmentUserId(false, "a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63"), null);
  const tutorIds = [
    "xavier-user",
    ...(victoriaConsultingAssignmentUserId(false, "icloud-owner") ? ["icloud-owner"] : []),
  ];
  const nikaAssignmentUserId = nikaConsultingAssignmentUserId({
    user: nika,
    grant: revokedGrant,
    profile: { active: false },
  });
  if (nikaAssignmentUserId) tutorIds.push(nikaAssignmentUserId);
  assert.deepEqual(tutorIds, ["xavier-user"]);
  assert.equal(
    nikaConsultingAssignmentUserId({
      user: nika,
      grant: activeGrant,
      profile: { active: true },
    }),
    "nika-user",
  );
  assert.equal(
    victoriaConsultingAssignmentUserId(true, "a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63"),
    "a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63",
  );
});
