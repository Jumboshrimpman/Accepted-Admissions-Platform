import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import * as googleCalendar from "./google-calendar.ts";

const {
  calendarOAuthReturnHref,
  classifyGoogleProviderError,
  classifyGoogleTokenExchangeFailure,
  createCalendarOAuthState,
  decryptCalendarToken,
  encryptCalendarToken,
  getGoogleCalendarConfig,
  GOOGLE_CALENDAR_SCOPES,
  googleAccountMatchesPortalEmails,
  googleCalendarAuthorizationUrl,
  googleCalendarCompletionHtml,
  isGoogleEmailVerified,
  publicOriginFromForwardedHeaders,
  readCalendarOAuthState,
  readGoogleIdentityClaims,
  resolveGoogleCalendarRedirectUri,
  resolveOAuthRedirectUriForRequest,
  safeCalendarReturnTo,
} = googleCalendar;

process.env.SESSION_SECRET = "booking-test-session-secret";

test("requests the configured least-privilege Google Calendar scopes", () => {
  assert.deepEqual(GOOGLE_CALENDAR_SCOPES, [
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.events.freebusy",
    "https://www.googleapis.com/auth/calendar.events.owned",
  ]);
});

test("OAuth state is signed and scoped to the tutor profile, return path, and callback", () => {
  const state = createCalendarOAuthState("tutor-profile-xavier", "app-user-xavier", {
    returnTo: "/tutor",
    redirectUri: "https://app.example.com/api/calendar/oauth/callback",
  });
  assert.deepEqual(readCalendarOAuthState(state), {
    tutorProfileId: "tutor-profile-xavier",
    appUserId: "app-user-xavier",
    returnTo: "/tutor",
    redirectUri: "https://app.example.com/api/calendar/oauth/callback",
  });

  const [payload, signature] = state.split(".");
  assert.equal(readCalendarOAuthState(`${payload}.tampered`), null);
  assert.equal(readCalendarOAuthState(`tampered.${signature}`), null);
});

test("legacy dotted OAuth state still resolves the tutor and app user", () => {
  const payload = `tutor-profile-xavier.app-user-xavier.${Date.now() + 60_000}.nonce`;
  const key = createHash("sha256").update("booking-test-session-secret").digest();
  const signature = createHmac("sha256", key).update(payload).digest();
  const state = `${Buffer.from(payload).toString("base64url")}.${Buffer.from(signature).toString("base64url")}`;
  assert.deepEqual(readCalendarOAuthState(state), {
    tutorProfileId: "tutor-profile-xavier",
    appUserId: "app-user-xavier",
    returnTo: "/tutor",
    redirectUri: "",
  });
});

test("calendar tokens round-trip through authenticated encryption", () => {
  const encrypted = encryptCalendarToken("google-access-token");
  assert.notEqual(encrypted, "google-access-token");
  assert.equal(decryptCalendarToken(encrypted), "google-access-token");
});

test("calendar completion page notifies the opener, broadcasts, and returns to the dashboard", () => {
  const html = googleCalendarCompletionHtml({
    returnTo: "/tutor",
    redirectUri: "https://app.example.com/api/calendar/oauth/callback",
  });
  assert.match(html, /Google Calendar connected/);
  assert.match(html, /accepted-admissions:calendar-connected/);
  assert.match(html, /outcome: "connected"/);
  assert.match(html, /message: "/);
  assert.match(html, /new BroadcastChannel/);
  assert.match(html, /accepted-admissions:calendar-connection/);
  assert.match(html, /connectionChannel\.postMessage\(connectionResult\)/);
  assert.match(html, /setTimeout\(\(\) => connectionChannel\.close\(\), 750\)/);
  assert.match(html, /Return to dashboard/);
  assert.match(html, /https:\/\/app\.example\.com\/tutor\?calendar=connected/);
  assert.match(html, /window\.location\.replace\(returnHref\)/);
  assert.match(html, /window\.close/);
});

test("calendar completion page renders a safe rejected-authorization message", () => {
  const html = googleCalendarCompletionHtml({
    success: false,
    outcome: "cancelled",
    message: 'Google account "<script>alert(1)</script>" was not accepted.',
    returnTo: "/tutor",
    redirectUri: "https://app.example.com/api/calendar/oauth/callback",
  });
  assert.match(html, /Google Calendar connection not completed/);
  assert.match(html, /accepted-admissions:calendar-connection-failed/);
  assert.match(html, /outcome: "cancelled"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /calendar=error&amp;reason=cancelled/);
  assert.match(html, /calendar=error\\u0026reason=cancelled/);
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

test("request-origin callback is preferred over a stale APP_ORIGIN", () => {
  assert.equal(
    resolveOAuthRedirectUriForRequest("https://app.acceptedadmissions.org", {
      NODE_ENV: "production",
      APP_ORIGIN: "https://stale.vercel.app",
      GOOGLE_CALENDAR_REDIRECT_URI: "https://stale.vercel.app/api/calendar/oauth/callback",
    }),
    "https://app.acceptedadmissions.org/api/calendar/oauth/callback",
  );
  assert.equal(
    publicOriginFromForwardedHeaders({
      host: "accepted-admissions-platform-production.up.railway.app",
      forwardedHost: "app.acceptedadmissions.org",
      forwardedProto: "https",
    }),
    "https://app.acceptedadmissions.org",
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
  const authorizationUrl = googleCalendarAuthorizationUrl("tutor-1", "user-1", {
    loginHint: "xaver.rmz6@gmail.com",
    returnTo: "/tutor",
    redirectUri: "https://app.acceptedadmissions.org/api/calendar/oauth/callback",
  });
  const parsed = new URL(authorizationUrl);
  assert.equal(
    parsed.searchParams.get("redirect_uri"),
    "https://app.acceptedadmissions.org/api/calendar/oauth/callback",
  );
  assert.equal(parsed.searchParams.get("login_hint"), "xaver.rmz6@gmail.com");
  process.env.GOOGLE_CALENDAR_CLIENT_ID = previous.id;
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previous.secret;
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = previous.redirect;
  process.env.APP_ORIGIN = previous.origin;
  process.env.NODE_ENV = previous.nodeEnv;
});

test("Google identity accepts string or boolean email_verified", () => {
  assert.equal(isGoogleEmailVerified("true"), true);
  assert.equal(isGoogleEmailVerified(true), true);
  assert.equal(isGoogleEmailVerified("false"), false);
  assert.equal(isGoogleEmailVerified(false), false);
  assert.deepEqual(
    readGoogleIdentityClaims({
      iss: "https://accounts.google.com",
      sub: "google-sub",
      email: "xaver.rmz6@gmail.com",
      email_verified: true,
    }),
    { googleAccountId: "google-sub", email: "xaver.rmz6@gmail.com" },
  );
  assert.equal(
    readGoogleIdentityClaims({
      iss: "https://accounts.google.com",
      sub: "google-sub",
      email: "xaver.rmz6@gmail.com",
      email_verified: "true",
    })?.email,
    "xaver.rmz6@gmail.com",
  );
  assert.equal(
    readGoogleIdentityClaims({
      iss: "https://accounts.google.com",
      sub: "google-sub",
      email: "xaver.rmz6@gmail.com",
      email_verified: false,
    }),
    null,
  );
});

test("Google account may match either the tutor profile or portal user email", () => {
  assert.equal(
    googleAccountMatchesPortalEmails("Xaver.rmz6@gmail.com", [
      "xsfam6@gmail.com",
      "xaver.rmz6@gmail.com",
    ]),
    true,
  );
  assert.equal(
    googleAccountMatchesPortalEmails("other@gmail.com", ["xaver.rmz6@gmail.com"]),
    false,
  );
});

test("classifies cancelled, rejected, and redirect-mismatch Google failures", () => {
  assert.equal(classifyGoogleProviderError("access_denied").outcome, "cancelled");
  assert.equal(classifyGoogleProviderError("admin_policy_enforced").outcome, "rejected");
  assert.equal(
    classifyGoogleTokenExchangeFailure(
      400,
      JSON.stringify({ error: "redirect_uri_mismatch" }),
    ).outcome,
    "redirect_mismatch",
  );
  assert.equal(
    classifyGoogleTokenExchangeFailure(400, JSON.stringify({ error: "invalid_grant" })).outcome,
    "expired",
  );
  assert.equal(
    classifyGoogleTokenExchangeFailure(503, "{}").outcome,
    "unavailable",
  );
  assert.equal(safeCalendarReturnTo("/evil"), "/tutor");
  assert.equal(safeCalendarReturnTo("/tutor"), "/tutor");
  assert.equal(
    calendarOAuthReturnHref(
      "/tutor",
      "https://app.acceptedadmissions.org/api/calendar/oauth/callback",
      "redirect_mismatch",
      false,
    ),
    "https://app.acceptedadmissions.org/tutor?calendar=error&reason=redirect_mismatch",
  );
});
