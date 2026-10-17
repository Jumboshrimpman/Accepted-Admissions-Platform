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
  COLLEGE_CONSULTING_LENGTH_PRODUCTS,
  COLLEGE_CONSULTING_EUNICE_SLUG,
  COLLEGE_CONSULTING_NIKA_SLUG,
  COLLEGE_CONSULTING_PRODUCTS,
  COLLEGE_CONSULTING_SLUGS,
  COLLEGE_CONSULTING_VICTORIA_SLUG,
  COLLEGE_CONSULTING_XAVIER_SLUG,
  EUNICE_HOURLY_RATE_CENTS,
  NEEL_DHARNI_USER_ID,
  NIKA_CONSULTING_BIOGRAPHY,
  NIKA_CONSULTING_PHOTO_URL,
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
  collegeConsultingTutorKeyForProfile,
  clientPortalTutorTitle,
  consultingPreviewTutors,
  consultingSlugIsSatCatalogProduct,
  consultingCatalogAlignment,
  consultingTutorBiography,
  consultingTutorCredits,
  consultingTutorDisplayName,
  consultingTutorPhotoUrl,
  stripeCatalogProductIdempotencyKey,
  decidePlaceholderLink,
  isNeelDharniUser,
  isNikaTemporaryViewEmail,
  NEEL_DISPLAY_NAME,
  NIKA_TEMPORARY_VIEW_EMAIL,
  nikaTemporaryViewDecision,
  nikaTemporaryViewEmail,
  syntheticNeelPreviewUser,
  temporaryTutorViewAllowsMethod,
} from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isRetiredXavierEmail } from "./xavier-identity.ts";

test("College Consulting prices are per tutor and SAT catalog stays $130", () => {
  assert.equal(NIKA_HOURLY_RATE_CENTS, 10_000);
  assert.equal(VICTORIA_HOURLY_RATE_CENTS, 13_000);
  assert.equal(XAVIER_NEEL_HOURLY_RATE_CENTS, 20_000);
  assert.equal(SAT_HOURLY_RATE_CENTS, 13_000);
  assert.equal(SINGLE_SAT_SESSION_PRICE_CENTS, 13_000);
  assert.equal(TEN_SAT_SESSION_PACKAGE_PRICE_CENTS, 130_000);
  assert.deepEqual(
    COLLEGE_CONSULTING_PRODUCTS.map((product) => [product.slug, product.hourlyRateCents]),
    [
      [COLLEGE_CONSULTING_NIKA_SLUG, 10_000],
      [COLLEGE_CONSULTING_XAVIER_SLUG, 20_000],
      [COLLEGE_CONSULTING_VICTORIA_SLUG, 13_000],
      [COLLEGE_CONSULTING_EUNICE_SLUG, 13_000],
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
  const nikaCharge = consultingCatalogAlignment({
    slug: COLLEGE_CONSULTING_NIKA_SLUG,
    name: "College Consulting hour with Nika Raiffe",
    description: "One prepaid 60-minute College Consulting credit with Nika Raiffe at $130/hour.",
    totalPriceCents: 13_000,
    stripePriceId: "price_old_130",
  });
  assert.equal(nikaCharge?.totalPriceCents, 10_000);
  assert.equal(nikaCharge?.clearStripeIds, true);
  assert.match(nikaCharge?.name ?? "", /with Nika$/);
  assert.doesNotMatch(nikaCharge?.description ?? "", /Raiffe/);
  assert.equal(
    consultingCatalogAlignment({
      slug: COLLEGE_CONSULTING_NIKA_SLUG,
      name: "College Consulting hour with Nika",
      description: "One prepaid 60-minute College Consulting credit with Nika at $100/hour.",
      totalPriceCents: 10_000,
      stripePriceId: "price_100",
    }),
    null,
  );
  const victoriaLabel = consultingCatalogAlignment({
    slug: COLLEGE_CONSULTING_VICTORIA_SLUG,
    name: "College Consulting hour with Victoria Wijerathnayapa",
    description: "old",
    totalPriceCents: 13_000,
    stripePriceId: "price_victoria_130",
  });
  assert.equal(victoriaLabel?.totalPriceCents, 13_000);
  assert.equal(victoriaLabel?.clearStripeIds, true);
  assert.doesNotMatch(victoriaLabel?.name ?? "", /Wijerathnayapa/);
  assert.equal(
    consultingCatalogAlignment({
      slug: "single-sat-session",
      name: "Single SAT Session",
      description: "Michelle's hour with Xavier",
      totalPriceCents: 13_000,
      stripePriceId: "price_sat",
    }),
    null,
  );
  assert.equal(
    consultingCatalogAlignment({
      slug: COLLEGE_CONSULTING_XAVIER_SLUG,
      name: "College Consulting hour with Xavier Morales",
      description:
        "One prepaid 60-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.",
      totalPriceCents: 20_000,
      stripePriceId: "price_xavier",
    }),
    null,
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
  assert.equal(credits.find((credit) => credit.tutorKey === "nika")?.hourlyRateCents, 10_000);
  assert.equal(credits.find((credit) => credit.tutorKey === "nika")?.name, "Nika");
  assert.equal(consultingTutorDisplayName("victoria"), "Victoria");
  assert.equal(consultingTutorDisplayName("xavier"), "Xavier");
  assert.equal(consultingTutorDisplayName("eunice"), "Eunice");
  assert.equal(EUNICE_HOURLY_RATE_CENTS, 13_000);
  assert.equal(credits.find((credit) => credit.tutorKey === "victoria")?.calendarConnected, false);
  assert.equal(credits.find((credit) => credit.tutorKey === "victoria")?.hourlyRateCents, 13_000);

  const lengthBySlug = new Map(
    COLLEGE_CONSULTING_LENGTH_PRODUCTS.map((product) => [product.slug, product]),
  );
  assert.equal(lengthBySlug.get("college-consulting-nika-90")?.totalPriceCents, 15_000);
  assert.equal(lengthBySlug.get("college-consulting-nika-120")?.totalPriceCents, 20_000);
  assert.equal(lengthBySlug.get("college-consulting-victoria-90")?.totalPriceCents, 19_500);
  assert.equal(lengthBySlug.get("college-consulting-victoria-120")?.totalPriceCents, 26_000);
  assert.equal(lengthBySlug.get("college-consulting-xavier-90")?.totalPriceCents, 30_000);
  assert.equal(lengthBySlug.get("college-consulting-xavier-120")?.totalPriceCents, 40_000);
  assert.equal(lengthBySlug.get("college-consulting-eunice-90")?.totalPriceCents, 19_500);
  assert.equal(lengthBySlug.get("college-consulting-eunice-120")?.totalPriceCents, 26_000);
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, "sat-eunice-60"), "forbidden");
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, "sat-xavier-90"), "forbidden");
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, COLLEGE_CONSULTING_EUNICE_SLUG), "consulting");
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, "college-consulting-eunice-90"), "consulting");
  assert.equal(checkoutAudienceForSlug("bf530aa6-faaa-43df-b3cf-140026f3313e", "sat-eunice-60"), "sat");
  assert.equal(
    checkoutAudienceForSlug("bf530aa6-faaa-43df-b3cf-140026f3313e", COLLEGE_CONSULTING_EUNICE_SLUG),
    "forbidden",
  );
  assert.equal(
    collegeConsultingTutorKeyForProfile({
      name: "Xavier Morales",
      email: "studio@example.com",
    }),
    "xavier",
  );
  assert.equal(
    collegeConsultingTutorKeyForProfile({
      name: "Xavier Morales",
      email: "xsfam6@gmail.com",
    }),
    null,
  );
  assert.equal(
    collegeConsultingTutorKeyForProfile({
      name: "Eunice Chon",
      email: "eunice_chon@berkeley.edu",
    }),
    "eunice",
  );
  assert.equal(consultingTutorBiography("eunice").includes("Chon"), false);
  assert.equal(
    consultingCatalogAlignment({
      slug: "college-consulting-nika-90",
      name: "College Consulting 1.5 hours with Nika",
      description: "One prepaid 90-minute College Consulting credit with Nika at $100/hour.",
      totalPriceCents: 15_000,
      stripePriceId: "price_nika_90",
    }),
    null,
  );
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, "college-consulting-nika-90"), "consulting");
  assert.equal(checkoutAudienceForSlug("michelle", "college-consulting-nika-120"), "forbidden");
  const pooled = consultingTutorCredits({
    entries: [
      { entryType: "original", hours: 1, productId: "nika-product" },
      { entryType: "original", hours: 2, productId: "nika-120" },
      { entryType: "debit", hours: 1, productId: "nika-product" },
    ],
    products: [
      { id: "nika-product", slug: COLLEGE_CONSULTING_NIKA_SLUG },
      { id: "nika-120", slug: "college-consulting-nika-120" },
    ],
    calendars: { nika: true, xavier: false, victoria: false },
  });
  assert.equal(pooled.find((credit) => credit.tutorKey === "nika")?.prepaidHours, 2);
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

test("placeholder emails link without a known Clerk id and stop when another user owns the email", () => {
  const created = decidePlaceholderLink({
    targetUserId: NEEL_DHARNI_USER_ID,
    existingUser: null,
    activeGrantUserId: null,
    grantClerkUserId: null,
    grantRoleCategory: null,
    allowedGrantRoles: ["student"],
    envRoleCategories: [],
    requireKnownClerkId: false,
    clerkIdOwnerUserId: null,
  });
  assert.equal(created.action, "link");
  if (created.action === "link") assert.equal(created.mode, "create");

  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: NEEL_DHARNI_USER_ID,
      existingUser: {
        id: "existing-student",
        role: "student",
        clerkUserId: "user_selfsignup",
      },
      activeGrantUserId: "existing-student",
      grantClerkUserId: "user_selfsignup",
      grantRoleCategory: "student",
      allowedGrantRoles: ["student"],
      envRoleCategories: [],
      requireKnownClerkId: false,
      clerkIdOwnerUserId: "existing-student",
    }),
    { action: "stop", reason: "email_owned_by_other_user" },
  );
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: VICTORIA_USER_ID,
      existingUser: {
        id: "icloud-user",
        role: "viewer",
        clerkUserId: "pending:samakubba@icloud.com",
      },
      activeGrantUserId: null,
      grantClerkUserId: null,
      grantRoleCategory: null,
      allowedGrantRoles: ["tutor"],
      envRoleCategories: [],
      requireKnownClerkId: false,
      clerkIdOwnerUserId: null,
    }),
    { action: "stop", reason: "email_owned_by_other_user" },
  );
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: NEEL_DHARNI_USER_ID,
      existingUser: { id: "admin-row", role: "administrator", clerkUserId: "user_admin" },
      activeGrantUserId: null,
      grantClerkUserId: null,
      grantRoleCategory: null,
      allowedGrantRoles: ["student"],
      envRoleCategories: [],
      requireKnownClerkId: false,
      clerkIdOwnerUserId: null,
    }),
    { action: "stop", reason: "existing_user_administrator" },
  );
  assert.equal(isNeelDharniUser(NEEL_DHARNI_USER_ID), true);
  assert.equal(isNeelDharniUser("existing-student"), false);
});

test("sat and english tutor grants stay compatible only for a tutor placeholder", () => {
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: NEEL_DHARNI_USER_ID,
      existingUser: null,
      activeGrantUserId: null,
      grantClerkUserId: "user_neel",
      grantRoleCategory: "sat_tutor",
      allowedGrantRoles: ["student"],
      envRoleCategories: [],
      requireKnownClerkId: false,
      clerkIdOwnerUserId: null,
    }),
    { action: "stop", reason: "grant_role_conflict" },
  );
  assert.equal(
    decidePlaceholderLink({
      targetUserId: VICTORIA_USER_ID,
      existingUser: null,
      activeGrantUserId: null,
      grantClerkUserId: "user_victoria",
      grantRoleCategory: "english_tutor",
      allowedGrantRoles: ["tutor"],
      envRoleCategories: [],
      requireKnownClerkId: false,
      clerkIdOwnerUserId: null,
    }).action,
    "link",
  );
  assert.deepEqual(
    decidePlaceholderLink({
      targetUserId: NEEL_DHARNI_USER_ID,
      existingUser: null,
      activeGrantUserId: null,
      grantClerkUserId: null,
      grantRoleCategory: null,
      allowedGrantRoles: ["student"],
      envRoleCategories: ["sat_tutor"],
      requireKnownClerkId: false,
      clerkIdOwnerUserId: null,
    }),
    { action: "stop", reason: "grant_role_conflict" },
  );
});

test("xsfam6 views Nika without becoming a user or an administrator", () => {
  const previousEmail = process.env.TEMP_NIKA_VIEW_EMAIL;
  const previousUntil = process.env.TEMP_NIKA_VIEW_UNTIL;
  delete process.env.TEMP_NIKA_VIEW_EMAIL;
  delete process.env.TEMP_NIKA_VIEW_UNTIL;
  const nika = { id: "nika-user", role: "tutor" };
  try {
  assert.deepEqual(
    nikaTemporaryViewDecision({
      email: "XSFAM6@gmail.com",
      envRoleCategories: [],
      signedInUserRole: null,
      nikaUser: nika,
      nikaGrantActive: true,
    }),
    { action: "view", userId: "nika-user" },
  );
  assert.equal(
    nikaTemporaryViewDecision({
      email: NIKA_TEMPORARY_VIEW_EMAIL,
      envRoleCategories: ["administrator"],
      signedInUserRole: null,
      nikaUser: nika,
      nikaGrantActive: true,
    }).action,
    "ignore",
  );
  assert.equal(
    nikaTemporaryViewDecision({
      email: NIKA_TEMPORARY_VIEW_EMAIL,
      envRoleCategories: [],
      signedInUserRole: "administrator",
      nikaUser: nika,
      nikaGrantActive: true,
    }).action,
    "ignore",
  );
  assert.equal(
    nikaTemporaryViewDecision({
      email: NIKA_TEMPORARY_VIEW_EMAIL,
      envRoleCategories: [],
      signedInUserRole: null,
      nikaUser: nika,
      nikaGrantActive: false,
    }).action,
    "ignore",
  );
  assert.equal(
    nikaTemporaryViewDecision({
      email: "nika.raiffe@gmail.com",
      envRoleCategories: [],
      signedInUserRole: null,
      nikaUser: nika,
      nikaGrantActive: true,
    }).action,
    "ignore",
  );
  assert.equal(isRetiredXavierEmail(NIKA_TEMPORARY_VIEW_EMAIL), true);
  assert.equal(nikaTemporaryViewEmail(), NIKA_TEMPORARY_VIEW_EMAIL);
  for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
    assert.equal(temporaryTutorViewAllowsMethod(method), false);
  }
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(temporaryTutorViewAllowsMethod(method), true);
  }
  process.env.TEMP_NIKA_VIEW_EMAIL = "off";
  assert.equal(nikaTemporaryViewEmail(), null);
  assert.equal(isNikaTemporaryViewEmail("xsfam6@gmail.com"), false);
  assert.equal(
    nikaTemporaryViewDecision({
      email: NIKA_TEMPORARY_VIEW_EMAIL,
      envRoleCategories: [],
      signedInUserRole: null,
      nikaUser: nika,
      nikaGrantActive: true,
    }).action,
    "ignore",
  );
  process.env.TEMP_NIKA_VIEW_EMAIL = "xsfam6@gmail.com";
  process.env.TEMP_NIKA_VIEW_UNTIL = "2020-01-01T00:00:00.000Z";
  assert.equal(nikaTemporaryViewEmail(), null);
  process.env.TEMP_NIKA_VIEW_UNTIL = "2099-01-01T00:00:00.000Z";
  assert.equal(nikaTemporaryViewEmail(), NIKA_TEMPORARY_VIEW_EMAIL);
  } finally {
    if (previousEmail === undefined) delete process.env.TEMP_NIKA_VIEW_EMAIL;
    else process.env.TEMP_NIKA_VIEW_EMAIL = previousEmail;
    if (previousUntil === undefined) delete process.env.TEMP_NIKA_VIEW_UNTIL;
    else process.env.TEMP_NIKA_VIEW_UNTIL = previousUntil;
  }
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
  const rateMigration = await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0055_nika_college_consulting_100.sql", import.meta.url)),
    "utf8",
  );
  assert.match(rateMigration, /stripe_product_id/);
  assert.match(rateMigration, /stripe_price_id/);
  assert.match(rateMigration, /College Consulting hour with Nika/);
  assert.doesNotMatch(rateMigration, /Nika Raiffe/);
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
    "Victoria graduated from Harvard in 2025 in Neuroscience and Education, after also being admitted to Brown and Yale. She makes learning engaging through evidence-based strategies, and has mentored students with the Japan-America Academic Center in Boston since 2023 and taught 500+ English lessons to international students. She is now an Operations & Business Development Associate at Todaydream.",
  );
  assert.doesNotMatch(VICTORIA_BIOGRAPHY, /Wijerathnayapa|Ringle|DreAmbassador|Institute of Politics/);
  assert.match(NIKA_CONSULTING_BIOGRAPHY, /^Nika is a senior/);
  assert.doesNotMatch(NIKA_CONSULTING_BIOGRAPHY, /Raiffe/);
  assert.equal(NIKA_CONSULTING_PHOTO_URL, "/media/team/nika.png");
  assert.equal(consultingTutorBiography("nika"), NIKA_CONSULTING_BIOGRAPHY);
  assert.equal(consultingTutorPhotoUrl("nika", "/media/team/nika-raiffe.png"), "/media/team/nika.png");
  assert.equal(consultingTutorPhotoUrl("victoria", "/media/team/victoria.jpg"), "/media/team/victoria.jpg");
  const sameCatalog = stripeCatalogProductIdempotencyKey({
    id: "prod-nika",
    name: "College Consulting hour with Nika",
    description: "One prepaid 60-minute College Consulting credit with Nika at $100/hour.",
    totalPriceCents: 10_000,
  });
  const renamedCatalog = stripeCatalogProductIdempotencyKey({
    id: "prod-nika",
    name: "College Consulting hour with Nika Raiffe",
    description: "One prepaid 60-minute College Consulting credit with Nika Raiffe at $130/hour.",
    totalPriceCents: 13_000,
  });
  assert.match(sameCatalog, /prod-nika-10000-/);
  assert.notEqual(sameCatalog, renamedCatalog);
  assert.equal(sameCatalog, stripeCatalogProductIdempotencyKey({
    id: "prod-nika",
    name: "College Consulting hour with Nika",
    description: "One prepaid 60-minute College Consulting credit with Nika at $100/hour.",
    totalPriceCents: 10_000,
  }));
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
  assert.match(provision, /consultingCatalogAlignment/);
  assert.match(provision, /\.update\(satProductsTable\)/);
  assert.match(provision, /clearStripeIds/);
  assert.match(provision, /stripeProductId: null, stripePriceId: null/);
  assert.match(provision, /VICTORIA_FULL_NAME_BIOGRAPHY/);
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
  const checkout = platform.slice(
    platform.indexOf('"/payments/checkout"'),
    platform.indexOf('"/admin/products/:productId"'),
  );
  const forbiddenAt = checkout.indexOf('audience === "forbidden"');
  const catalogWriteAt = checkout.indexOf("consultingCatalogAlignment");
  assert.ok(forbiddenAt >= 0 && catalogWriteAt > forbiddenAt);
  assert.match(checkout, /stripeProductId: null, stripePriceId: null/);
  const consultingList = platform.slice(
    platform.indexOf("async function consultingTutorList"),
    platform.indexOf("async function unresolvedSharedMeetOverlaps"),
  );
  assert.match(consultingList, /consultingTutorBiography/);
  assert.match(consultingList, /clientPortalTutorTitle\(tutor\)/);
  assert.match(consultingList, /consultingTutorPhotoUrl/);
  assert.match(consultingList, /subjects: \[COLLEGE_CONSULTING_SUBJECT\]/);
  assert.match(consultingList, /bookable: connected/);
  assert.match(platform, /SAT_BOOKING_CLOSED/);
  assert.match(platform, /This account books College Consulting only/);
  assert.match(provision, /EUNICE_CONSULTING_EMAIL/);
  const rosterMigration = await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0064_neel_consulting_roster.sql", import.meta.url)),
    "utf8",
  );
  assert.match(rosterMigration, /college-consulting-eunice-hour/);
  assert.match(rosterMigration, /19500/);
  assert.match(rosterMigration, /26000/);
  assert.match(rosterMigration, /college-consulting-xavier-hour/);
  assert.match(rosterMigration, /20000/);
  assert.match(rosterMigration, /30000/);
  assert.match(rosterMigration, /40000/);
  assert.match(rosterMigration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.match(rosterMigration, /xavier\.rmz6@gmail\.com/);
  assert.match(rosterMigration, /xsfam6@gmail\.com/);
  assert.match(provision, /isRetiredXavierEmail\(profile\.email\)/);
  assert.match(rosterMigration, /booking_notice_minutes" = 240/);
  assert.match(rosterMigration, /"booking_eligible" = true/);
  assert.equal(rosterMigration.includes('"subjects"'), false);
  assert.equal(provision.includes("ensureConsultingSubject"), false);
  assert.match(provision, /ensureConsultingBookable/);
  assert.match(platform, /toLowerCase\(\) !== "college consulting"/);
  assert.equal(rosterMigration.includes("INSERT INTO \"users\""), false);
  assert.equal(rosterMigration.includes("Nika Raiffe"), false);
  assert.match(index, /ensureCollegeConsultingProvision\(\)/);
  assert.match(provision, /const tutorEmails = \[CANONICAL_XAVIER_EMAIL\]/);
  assert.equal(/tutorEmails = \[[^\]]*NIKA_CONSULTING_EMAIL/.test(provision), false);
  assert.match(provision, /victoria\.linked && victoria\.userId \? \[victoria\.userId\] : \[\]/);
  assert.match(provision, /if \(nika\.bookable && nikaAssignmentUserId\)/);
  assert.match(provision, /lower\(\$\{column\}\)/);
  assert.equal(provision.includes("requireKnownClerkId: true"), false);
  assert.equal(provision.includes("rememberNeelClientUserId"), false);
  assert.equal(provision.includes('"adopt"'), false);
  assert.match(provision, /else if \(!grant\.userId\)/);
  assert.match(provision, /if \(profile\.userId && profile\.userId !== userId\) return;/);
  assert.equal(/profile\.userId !== VICTORIA_USER_ID/.test(provision), false);
  assert.match(provision, /victoria\.userId === VICTORIA_USER_ID/);
  assert.match(provision, /neelUserId: NEEL_DHARNI_USER_ID/);
  assert.match(provision, /victoriaUserId: VICTORIA_USER_ID/);
  assert.match(provision, /neelEmailOwner: neel\.emailOwner/);
  assert.match(provision, /email_owned_by_other_user/);
  assert.equal(provision.includes("xsfam6@gmail.com"), false);
  assert.equal(provision.includes("NIKA_TEMPORARY_VIEW_EMAIL"), false);
  assert.match(platform, /temporaryTutorAlias/);
  assert.match(platform, /nikaTemporaryViewDecision/);
  assert.match(platform, /temporaryTutorViewAllowsMethod/);
  assert.match(platform, /rejectTemporaryTutorCalendarChange/);
  assert.equal(platform.includes("email: NIKA_TEMPORARY_VIEW_EMAIL"), false);
  assert.match(platform, /Do not write her email, Clerk id/);
  assert.match(platform, /keepProvisionedPlaceholderDisplayName/);
  const aliasStart = platform.indexOf("if (!configured && isNikaTemporaryViewEmail");
  const aliasEnd = platform.indexOf("if (!configured) {", aliasStart);
  const aliasSlice = platform.slice(aliasStart, aliasEnd);
  assert.equal(aliasSlice.includes("recordSuccessfulLogin"), false);
  assert.match(aliasSlice, /TEMPORARY_TUTOR_VIEW/);
  assert.match(aliasSlice, /access\.temporary_tutor_view/);
  assert.match(aliasSlice, /actorUserId: null/);
  assert.match(aliasSlice, /status\(403\)/);
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

test("Neel admin preview lists Nika, Victoria, and Xavier without a live calendar", async () => {
  const tutors = consultingPreviewTutors({
    profiles: [
      {
        id: "victoria-profile",
        userId: "a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63",
        email: "samakubba@icloud.com",
        name: "Victoria Wijerathnayapa",
        title: "College Consulting Tutor",
        tagline: "",
        biography: "",
        photoUrl: "",
        active: false,
        calendarStatus: "disconnected",
      },
    ],
    prepaidHours: { nika: 2 },
  });
  assert.deepEqual(
    tutors.map((tutor) => tutor.tutorKey),
    ["nika", "victoria", "xavier", "eunice"],
  );
  assert.equal(tutors[0]?.id, "preview-nika");
  assert.equal(tutors[0]?.prepaidHours, 2);
  assert.equal(tutors[0]?.hourlyRateCents, 10_000);
  assert.equal(tutors[0]?.name, "Nika");
  assert.equal(tutors[1]?.name, "Victoria");
  assert.equal(tutors[2]?.name, "Xavier");
  assert.equal(tutors[3]?.name, "Eunice");
  assert.equal(tutors[3]?.title, consultingTutorBiography("eunice"));
  assert.equal(tutors[0]?.title, "College Consulting Tutor");
  assert.equal(tutors[1]?.title, "College Consulting Tutor");
  assert.equal(tutors[2]?.title, "College Consulting Tutor");
  assert.equal(
    clientPortalTutorTitle({ name: "Eunice Chon", title: "Scholarship Tutor" }),
    consultingTutorBiography("eunice"),
  );
  assert.equal(
    clientPortalTutorTitle({ name: "Xavier Morales", title: "SAT & Math Tutor" }),
    "SAT & Math Tutor",
  );
  assert.equal(tutors[3]?.hourlyRateCents, 13_000);
  assert.equal(tutors[3]?.calendarConnected, false);
  assert.match(tutors[0]?.tagline ?? "", /Columbia/);
  assert.equal(tutors[1]?.id, "victoria-profile");
  assert.equal(tutors[1]?.tagline, VICTORIA_BOOKING_TAGLINE);
  assert.equal(tutors[0]?.biography, NIKA_CONSULTING_BIOGRAPHY);
  assert.equal(tutors[0]?.photoUrl, "/media/team/nika.png");
  assert.doesNotMatch(tutors[0]?.biography ?? "", /Raiffe/);
  assert.equal(tutors[1]?.biography, VICTORIA_BIOGRAPHY);
  assert.doesNotMatch(tutors[1]?.biography ?? "", /Wijerathnayapa/);
  assert.equal(tutors[1]?.calendarConnected, false);
  assert.equal(tutors[2]?.hourlyRateCents, 20_000);
  assert.match(tutors[2]?.biography ?? "", /Jane Street Capital/);
  assert.equal(tutors.some((tutor) => tutor.name === "Eunice Chon"), false);

  const byEligibility = consultingPreviewTutors({
    profiles: [
      {
        id: "nika-ineligible",
        email: "nika.raiffe@gmail.com",
        name: "Nika Raiffe",
        biography:
          "Nika Raiffe is a senior studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris.",
        photoUrl: "/media/team/nika-raiffe.png",
        active: true,
        bookingEligible: false,
        calendarStatus: "connected",
      },
      {
        id: "xavier-bookable",
        email: "xaver.rmz6@gmail.com",
        name: "Xavier Morales",
        active: true,
        bookingEligible: true,
        calendarStatus: "connected",
      },
    ],
  });
  assert.equal(byEligibility[0]?.calendarConnected, false);
  assert.equal(byEligibility[0]?.biography, NIKA_CONSULTING_BIOGRAPHY);
  assert.equal(byEligibility[0]?.photoUrl, "/media/team/nika.png");
  assert.equal(byEligibility[2]?.calendarConnected, true);
  const fromPortalCredits = consultingPreviewTutors({
    profiles: [
      {
        id: "nika-ineligible",
        email: "nika.raiffe@gmail.com",
        name: "Nika Raiffe",
        active: true,
        bookingEligible: false,
        calendarStatus: "connected",
      },
    ],
    calendars: { nika: false, victoria: true },
  });
  assert.equal(fromPortalCredits[0]?.calendarConnected, false);
  assert.equal(fromPortalCredits[1]?.calendarConnected, true);

  const synthetic = syntheticNeelPreviewUser();
  assert.equal(synthetic.id, NEEL_DHARNI_USER_ID);
  assert.equal(synthetic.displayName, NEEL_DISPLAY_NAME);
  assert.equal(synthetic.role, "student");

  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const start = platform.indexOf("Neel preview is read-only and does not call Google Calendar.");
  const end = platform.indexOf("slotsForTutor", start);
  const slice = platform.slice(start, end);
  assert.ok(start > 0);
  assert.equal(slice.includes("slotsForTutor"), false);
  assert.match(slice, /consultingPreviewTutors/);
  assert.match(slice, /calendars\[tutorKey\] = tutor\.calendarConnected === true/);
  assert.match(platform, /if \(!occupant\) client = syntheticNeelPreviewUser\(\)/);
  assert.match(platform, /Do not insert a user, grant, or email/);
  assert.equal(/createGoogleEvent|resend|sendEmail|sendInvite/.test(slice), false);
});
