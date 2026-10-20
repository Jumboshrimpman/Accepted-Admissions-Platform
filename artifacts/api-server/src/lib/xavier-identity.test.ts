import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
  XAVIER_PROFILE_EMAIL,
  chooseXavierProfileToKeep,
  isXavierProfileEmail,
  RETIRED_XAVIER_CLERK_USER_ID,
  isCanonicalXavierEmail,
  isRetiredXavierClerkUserId,
  isRetiredXavierEmail,
  isRetiredXavierIdentity,
  isSupersededAccessGrant,
  retiredXavierClerkMarker,
  xavierEmailSpellings,
} =
  // @ts-expect-error Native Node test execution requires the source extension.
  await import("./xavier-identity.ts");

test("treats the Production typo Clerk id as retired", () => {
  assert.equal(isRetiredXavierClerkUserId(RETIRED_XAVIER_CLERK_USER_ID), true);
  assert.equal(
    isRetiredXavierClerkUserId(retiredXavierClerkMarker(RETIRED_XAVIER_CLERK_USER_ID)),
    true,
  );
  assert.equal(isRetiredXavierClerkUserId(CANONICAL_XAVIER_CLERK_USER_ID), false);
  assert.equal(isRetiredXavierClerkUserId(undefined), false);
});

test("treats misspelled and historical Xavier emails as retired", () => {
  assert.equal(isRetiredXavierEmail("Xavier.RMZ6@gmail.com"), true);
  assert.equal(isRetiredXavierEmail("xsfam6@gmail.com"), true);
  assert.equal(
    isRetiredXavierEmail("retired+xavier.rmz6@retired.accepted.local"),
    true,
  );
  assert.equal(isRetiredXavierEmail(CANONICAL_XAVIER_EMAIL), false);
  assert.equal(isXavierProfileEmail(" Xavier.RMZ6@gmail.com "), true);
  assert.equal(isRetiredXavierEmail(XAVIER_PROFILE_EMAIL), true);
  assert.equal(XAVIER_PROFILE_EMAIL, "xavier.rmz6@gmail.com");
  assert.equal(isCanonicalXavierEmail(" Xaver.RMZ6@Gmail.com "), true);
});

test("retired identity is clerk-or-email", () => {
  assert.equal(
    isRetiredXavierIdentity(RETIRED_XAVIER_CLERK_USER_ID, CANONICAL_XAVIER_EMAIL),
    true,
  );
  assert.equal(
    isRetiredXavierIdentity(CANONICAL_XAVIER_CLERK_USER_ID, "xavier.rmz6@gmail.com"),
    true,
  );
  assert.equal(
    isRetiredXavierIdentity(CANONICAL_XAVIER_CLERK_USER_ID, CANONICAL_XAVIER_EMAIL),
    false,
  );
});

test("shares Production Xavier ids with the SAT capability-session seed", async () => {
  const source = await readFile(
    new URL("./xavier-sat-capability-session.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, new RegExp(`XAVIER_TUTOR_EMAIL = "${CANONICAL_XAVIER_EMAIL}"`));
  assert.match(
    source,
    new RegExp(`XAVIER_CANONICAL_CLERK_USER_ID =\\s*"${CANONICAL_XAVIER_CLERK_USER_ID}"`),
  );
  assert.match(
    source,
    new RegExp(`XAVIER_DUPLICATE_CLERK_USER_ID =\\s*"${RETIRED_XAVIER_CLERK_USER_ID}"`),
  );
});

test("hides only inactive superseded grants", () => {
  assert.equal(
    isSupersededAccessGrant({
      active: false,
      notes: "SUPERSEDED: duplicate Xavier Clerk user.",
      clerkUserId: RETIRED_XAVIER_CLERK_USER_ID,
      email: "xavier.rmz6@gmail.com",
    }),
    true,
  );
  assert.equal(
    isSupersededAccessGrant({
      active: true,
      notes: "SUPERSEDED: should not hide an accidentally restored grant",
      clerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
      email: CANONICAL_XAVIER_EMAIL,
    }),
    false,
  );
});

test("either Xavier email spelling resolves to the same pair", () => {
  assert.deepEqual(xavierEmailSpellings(CANONICAL_XAVIER_EMAIL), [
    CANONICAL_XAVIER_EMAIL,
    XAVIER_PROFILE_EMAIL,
  ]);
  assert.deepEqual(xavierEmailSpellings(XAVIER_PROFILE_EMAIL), [
    CANONICAL_XAVIER_EMAIL,
    XAVIER_PROFILE_EMAIL,
  ]);
  assert.deepEqual(xavierEmailSpellings("xaver.rmz6@fixture.invalid"), [
    "xaver.rmz6@fixture.invalid",
    "xavier.rmz6@fixture.invalid",
  ]);
  assert.deepEqual(xavierEmailSpellings("other@example.invalid"), ["other@example.invalid"]);
});

test("duplicate Xavier keep-choice prefers a photo, then rules, then the oldest row", () => {
  const original = {
    id: "20000000-0000-4000-8000-000000000001",
    photoUrl: "/media/team/xavier-morales.jpg",
    createdAt: "2024-01-01T00:00:00Z",
    availabilityRuleCount: 1,
  };
  const blank = {
    id: "05575f9d-a83c-45f5-ad37-e9c10adc58b6",
    photoUrl: null,
    createdAt: "2026-10-19T03:13:00Z",
    availabilityRuleCount: 0,
  };
  assert.equal(chooseXavierProfileToKeep([blank, original])?.id, original.id);
  assert.equal(chooseXavierProfileToKeep([original, blank])?.id, original.id);
  const ruled = { ...blank, id: "30000000-0000-4000-8000-000000000003", availabilityRuleCount: 2 };
  const newerBlank = { ...blank, createdAt: "2026-10-20T00:00:00Z" };
  assert.equal(chooseXavierProfileToKeep([newerBlank, ruled])?.id, ruled.id);
  const older = { ...blank, id: "10000000-0000-4000-8000-000000000004", createdAt: "2023-01-01T00:00:00Z" };
  assert.equal(chooseXavierProfileToKeep([blank, older])?.id, older.id);
});
