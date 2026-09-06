import test from "node:test";
import assert from "node:assert/strict";

const {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
  RETIRED_XAVIER_CLERK_USER_ID,
  isCanonicalXavierEmail,
  isRetiredXavierClerkUserId,
  isRetiredXavierEmail,
  isRetiredXavierIdentity,
  isSupersededAccessGrant,
  retiredXavierClerkMarker,
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
  const seed =
    // @ts-expect-error Native Node test execution requires the source extension.
    await import("./xavier-sat-capability-session.ts");
  assert.equal(seed.XAVIER_TUTOR_EMAIL, CANONICAL_XAVIER_EMAIL);
  assert.equal(seed.XAVIER_CANONICAL_CLERK_USER_ID, CANONICAL_XAVIER_CLERK_USER_ID);
  assert.equal(seed.XAVIER_DUPLICATE_CLERK_USER_ID, RETIRED_XAVIER_CLERK_USER_ID);
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
