import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { createCalendarOAuthState, decryptCalendarToken, encryptCalendarToken, GOOGLE_CALENDAR_SCOPES, googleCalendarCompletionHtml, readCalendarOAuthState } from "./google-calendar.ts";

process.env.SESSION_SECRET = "booking-test-session-secret";

test("requests the configured least-privilege Google Calendar scopes", () => {
  assert.deepEqual(GOOGLE_CALENDAR_SCOPES, [
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.events.freebusy",
    "https://www.googleapis.com/auth/calendar.events.owned",
  ]);
});

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

test("calendar completion page notifies and closes the authorization window", () => {
  const html = googleCalendarCompletionHtml();
  assert.match(html, /Google Calendar connected/);
  assert.match(html, /accepted-admissions:calendar-connected/);
  assert.match(html, /window\.close/);
});

test("calendar completion page renders a safe rejected-authorization message", () => {
  const html = googleCalendarCompletionHtml({
    success: false,
    message: 'Google account "<script>alert(1)</script>" was not accepted.',
  });
  assert.match(html, /Google Calendar connection not completed/);
  assert.match(html, /accepted-admissions:calendar-connection-failed/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
