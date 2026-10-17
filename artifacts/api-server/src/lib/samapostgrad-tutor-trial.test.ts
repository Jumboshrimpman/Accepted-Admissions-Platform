import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bookingIntentFromBody } from "./booking-checkout.ts";
import {
  COLLEGE_CONSULTING_COURSE_ID,
  COLLEGE_CONSULTING_NIKA_SLUG,
  EUNICE_CONSULTING_EMAIL,
  NIKA_CONSULTING_EMAIL,
  SAMA_POSTGRAD_TEST_CLERK_USER_ID,
  SAMA_POSTGRAD_TEST_EMAIL,
  VICTORIA_USER_ID,
  checkoutAudienceForSlug,
  clientMayBuyConsultingProduct,
  isSamaPostgradTestStudent,
  samaCollegeConsultingBooking,
} from "./college-consulting.ts";
import { CANONICAL_XAVIER_EMAIL } from "./xavier-identity.ts";

const capabilitySource = await readFile(
  fileURLToPath(new URL("./xavier-sat-capability-session.ts", import.meta.url)),
  "utf8",
);

const migrationSql = (
  await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0067_samapostgrad_tutor_trial.sql", import.meta.url)),
    "utf8",
  )
).replace(/^--.*$/gm, "");

const journal = JSON.parse(
  await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url)),
    "utf8",
  ),
) as { entries: Array<{ tag: string; when: number }> };

const sama = {
  email: SAMA_POSTGRAD_TEST_EMAIL,
  clerkUserId: SAMA_POSTGRAD_TEST_CLERK_USER_ID,
};

test("samapostgrad membership migration is idempotent and scoped to her Clerk id", () => {
  assert.match(capabilitySource, new RegExp(`SAMA_TEST_CLIENT_EMAIL = "${SAMA_POSTGRAD_TEST_EMAIL}"`));
  assert.match(
    capabilitySource,
    new RegExp(`SAMA_TEST_CLIENT_CLERK_USER_ID =\\s*"${SAMA_POSTGRAD_TEST_CLERK_USER_ID}"`),
  );
  assert.match(migrationSql, /INSERT INTO "course_memberships"/);
  assert.match(migrationSql, /INSERT INTO "tutor_assignments"/);
  assert.equal(migrationSql.includes("UPDATE"), false);
  assert.equal(/notify/i.test(migrationSql), false);
  assert.match(migrationSql, new RegExp(SAMA_POSTGRAD_TEST_CLERK_USER_ID));
  assert.match(migrationSql, /lower\(student\."email"\) = 'samapostgrad@gmail.com'/);
  assert.match(migrationSql, new RegExp(COLLEGE_CONSULTING_COURSE_ID));
  assert.match(migrationSql, new RegExp(VICTORIA_USER_ID));
  assert.match(migrationSql, new RegExp(NIKA_CONSULTING_EMAIL));
  assert.match(migrationSql, new RegExp(CANONICAL_XAVIER_EMAIL));
  assert.match(migrationSql, new RegExp(EUNICE_CONSULTING_EMAIL));
  assert.equal((migrationSql.match(/ON CONFLICT DO NOTHING/g) ?? []).length, 2);
  const entry = journal.entries.find((item) => item.tag === "0067_samapostgrad_tutor_trial");
  const essayGap = 1_792_700_000_000;
  const neelEmail = journal.entries.find((item) => item.tag === "0065_neel_account_email");
  assert.equal(entry?.when, 1_792_690_000_000);
  assert.ok(neelEmail && entry && entry.when > neelEmail.when);
  assert.ok(entry && entry.when < essayGap);
});

test("samapostgrad can buy consulting and SAT, and consulting is request-scoped", () => {
  assert.equal(isSamaPostgradTestStudent(sama), true);
  assert.equal(isSamaPostgradTestStudent({ email: "other@example.com" }), false);
  assert.equal(clientMayBuyConsultingProduct("other-student", COLLEGE_CONSULTING_NIKA_SLUG, sama), true);
  assert.equal(clientMayBuyConsultingProduct("other-student", COLLEGE_CONSULTING_NIKA_SLUG), false);
  assert.equal(checkoutAudienceForSlug("other-student", COLLEGE_CONSULTING_NIKA_SLUG, sama), "consulting");
  assert.equal(checkoutAudienceForSlug("other-student", "sat-nika-60", sama), "sat");
  assert.equal(checkoutAudienceForSlug("other-student", COLLEGE_CONSULTING_NIKA_SLUG), "forbidden");
  assert.equal(samaCollegeConsultingBooking(sama, "College Consulting"), true);
  assert.equal(samaCollegeConsultingBooking(sama, "college-consulting"), true);
  assert.equal(samaCollegeConsultingBooking(sama, "SAT"), false);
  assert.equal(samaCollegeConsultingBooking({ email: "sophia@example.com" }, "College Consulting"), false);

  const consulting = bookingIntentFromBody({
    tutorProfileId: "tutor-nika",
    startTime: "2026-11-02T15:00:00.000Z",
    durationMinutes: 60,
    subject: "College Consulting",
  });
  assert.equal(consulting.present && "intent" in consulting && consulting.intent.service, "college-consulting");
  const sat = bookingIntentFromBody({
    tutorProfileId: "tutor-nika",
    startTime: "2026-11-02T15:00:00.000Z",
    durationMinutes: 60,
  });
  assert.equal(sat.present && "intent" in sat && sat.intent.service, undefined);
});
