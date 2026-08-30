import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { createCalendarOAuthState, decryptCalendarToken, encryptCalendarToken, readCalendarOAuthState } from "./google-calendar.ts";

process.env.SESSION_SECRET = "booking-test-session-secret";

test("OAuth state is signed and scoped to the tutor profile and initiating app user", () => {
  const state = createCalendarOAuthState("tutor-profile-xavier", "app-user-xavier");
  assert.deepEqual(readCalendarOAuthState(state), {
    tutorProfileId: "tutor-profile-xavier",
    appUserId: "app-user-xavier",
  });

  const [payload, signature] = state.split(".");
  assert.equal(readCalendarOAuthState(`${payload}.tampered`), null);
  assert.equal(readCalendarOAuthState(`tampered.${signature}`), null);
});

test("calendar tokens round-trip through authenticated encryption", () => {
  const encrypted = encryptCalendarToken("google-access-token");
  assert.notEqual(encrypted, "google-access-token");
  assert.equal(decryptCalendarToken(encrypted), "google-access-token");
});