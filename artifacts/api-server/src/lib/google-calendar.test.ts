import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  createCalendarOAuthState,
  decryptCalendarToken,
  encryptCalendarToken,
  getGoogleCalendarConfig,
  GOOGLE_CALENDAR_SCOPES,
  googleCalendarCompletionHtml,
  readCalendarOAuthState,
  resolveGoogleCalendarRedirectUri,
} from "./google-calendar.ts";

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
  assert.match(html, /outcome: "connected"/);
  assert.match(html, /new BroadcastChannel/);
  assert.match(html, /accepted-admissions:calendar-connection/);
  assert.match(html, /connectionChannel\.postMessage\(connectionResult\)/);
  assert.match(html, /window\.close/);
});

test("calendar completion page renders a safe rejected-authorization message", () => {
  const html = googleCalendarCompletionHtml({
    success: false,
    outcome: "cancelled",
    message: 'Google account "<script>alert(1)</script>" was not accepted.',
  });
  assert.match(html, /Google Calendar connection not completed/);
  assert.match(html, /accepted-admissions:calendar-connection-failed/);
  assert.match(html, /outcome: "cancelled"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("production calendar redirect requires HTTPS callback URL", () => {
  assert.equal(
    resolveGoogleCalendarRedirectUri({
      NODE_ENV: "production",
      GOOGLE_CALENDAR_REDIRECT_URI: "https://app.example.com/api/calendar/oauth/callback",
    }),
    "https://app.example.com/api/calendar/oauth/callback",
  );
  assert.equal(
    resolveGoogleCalendarRedirectUri({
      NODE_ENV: "production",
      GOOGLE_CALENDAR_REDIRECT_URI: "http://app.example.com/api/calendar/oauth/callback",
    }),
    null,
  );
  assert.equal(
    resolveGoogleCalendarRedirectUri({
      NODE_ENV: "production",
      APP_ORIGIN: "https://app.example.com",
    }),
    "https://app.example.com/api/calendar/oauth/callback",
  );
  assert.equal(
    resolveGoogleCalendarRedirectUri({
      NODE_ENV: "production",
      APP_ORIGIN: "http://localhost:3000",
    }),
    null,
  );
});

test("getGoogleCalendarConfig uses environment-provided HTTPS redirect", () => {
  const previous = {
    id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirect: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    origin: process.env.APP_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
  };
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_CALENDAR_REDIRECT_URI =
    "https://app.example.com/api/calendar/oauth/callback";
  process.env.NODE_ENV = "production";
  assert.deepEqual(getGoogleCalendarConfig(), {
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://app.example.com/api/calendar/oauth/callback",
  });
  process.env.GOOGLE_CALENDAR_CLIENT_ID = previous.id;
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previous.secret;
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = previous.redirect;
  process.env.APP_ORIGIN = previous.origin;
  process.env.NODE_ENV = previous.nodeEnv;
});
