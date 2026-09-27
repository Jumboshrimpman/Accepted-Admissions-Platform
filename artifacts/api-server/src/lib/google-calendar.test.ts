import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import * as googleCalendar from "./google-calendar.ts";

const {
  CANONICAL_GOOGLE_CALENDAR_REDIRECT_URI,
  calendarBusyFailureAction,
  calendarCredentialFailureAction,
  calendarFailureAfterRefreshAction,
  calendarOAuthProbeOutcome,
  callGoogleCalendarRecovering,
  classifyGoogleTokenRefreshFailure,
  googleAccessTokenNeedsRefresh,
  GOOGLE_ACCESS_TOKEN_REFRESH_SKEW_MS,
  isGoogleTokenRefreshAuthFailure,
  listGoogleBusyWindowsRecovering,
  preserveGoogleRefreshToken,
  resolveGoogleCalendarAccessToken,
  calendarConnectProbeFailure,
  calendarOAuthReturnHref,
  calendarOAuthStateFailureMessage,
  classifyGoogleCalendarRequestFailure,
  googleCalendarEventWritePath,
  classifyGoogleProviderError,
  classifyGoogleTokenExchangeFailure,
  createCalendarOAuthState,
  decryptCalendarToken,
  encryptCalendarToken,
  getGoogleCalendarConfig,
  GOOGLE_CALENDAR_DATA_SCOPES,
  GOOGLE_CALENDAR_SCOPES,
  GoogleCalendarRequestError,
  grantedScopesIncludeRequired,
  isGoogleCalendarAuthFailure,
  googleAccountMatchesPortalEmails,
  googleCalendarAuthorizationUrl,
  googleCalendarCompletionHtml,
  inspectCalendarOAuthState,
  isGoogleEmailVerified,
  isPlatformInternalCalendarHost,
  normalizeGoogleCalendarEnvValue,
  publicOriginFromForwardedHeaders,
  readCalendarCallbackQuery,
  readCalendarOAuthState,
  readGoogleIdentityClaims,
  redirectMismatchMessage,
  resolveGoogleCalendarRedirectUri,
  resolveOAuthRedirectUriForRequest,
  safeCalendarReturnTo,
} = googleCalendar;

process.env.SESSION_SECRET = "booking-test-session-secret";

test("event writes notify attendees the same way create does", () => {
  assert.match(
    googleCalendarEventWritePath("primary"),
    /\/calendars\/primary\/events\?sendUpdates=all$/,
  );
  assert.match(
    googleCalendarEventWritePath("primary", "evt-1"),
    /\/calendars\/primary\/events\/evt-1\?sendUpdates=all$/,
  );
});

test("requests the configured least-privilege Google Calendar scopes", () => {
  assert.deepEqual(GOOGLE_CALENDAR_SCOPES, [
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.events",
  ]);
  assert.deepEqual(GOOGLE_CALENDAR_DATA_SCOPES, [
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.events",
  ]);
  assert.equal(
    JSON.stringify(GOOGLE_CALENDAR_SCOPES).includes("calendar.events.freebusy"),
    false,
  );
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
  assert.equal(
    publicOriginFromForwardedHeaders(
      {
        host: "accepted-admissions-platform-production.up.railway.app",
        forwardedHost: "accepted-admissions-platform-production.up.railway.app",
        forwardedProto: "https",
      },
      {
        NODE_ENV: "production",
        APP_ORIGIN: "https://app.acceptedadmissions.org",
      },
    ),
    "https://app.acceptedadmissions.org",
  );
});

test("Railway and Vercel hosts are never sent to Google when a public callback exists", () => {
  assert.equal(isPlatformInternalCalendarHost("accepted-admissions-platform-production.up.railway.app"), true);
  assert.equal(
    resolveOAuthRedirectUriForRequest(
      "https://accepted-admissions-platform-production.up.railway.app",
      {
        NODE_ENV: "production",
        APP_ORIGIN: "https://app.acceptedadmissions.org",
        GOOGLE_CALENDAR_REDIRECT_URI: CANONICAL_GOOGLE_CALENDAR_REDIRECT_URI,
      },
    ),
    CANONICAL_GOOGLE_CALENDAR_REDIRECT_URI,
  );
  assert.equal(
    resolveOAuthRedirectUriForRequest(
      "https://accepted-admissions-platform-production.up.railway.app",
      {
        NODE_ENV: "production",
        APP_ORIGIN: "https://stale.vercel.app",
        GOOGLE_CALENDAR_REDIRECT_URI: "https://stale.vercel.app/api/calendar/oauth/callback",
      },
    ),
    CANONICAL_GOOGLE_CALENDAR_REDIRECT_URI,
  );
});

test("callback query is recovered from the raw URL when req.query is empty", () => {
  assert.deepEqual(
    readCalendarCallbackQuery({
      query: {},
      originalUrl:
        "/api/calendar/oauth/callback?code=auth-code&state=signed-state&error=access_denied",
    }),
    {
      state: "signed-state",
      code: "auth-code",
      error: "access_denied",
      errorDescription: undefined,
      source: "url",
      keys: ["code", "state", "error"],
    },
  );
  assert.equal(normalizeGoogleCalendarEnvValue('  "client-id"  '), "client-id");
});

test("invalid OAuth state reasons are named instead of collapsed to a generic failure", () => {
  const empty = inspectCalendarOAuthState("");
  const invalid = inspectCalendarOAuthState("not-a-valid-state");
  assert.equal(empty.ok, false);
  assert.equal(invalid.ok, false);
  if (!empty.ok) assert.equal(empty.reason, "malformed");
  if (!invalid.ok) assert.equal(invalid.reason, "malformed");
  assert.equal(calendarOAuthStateFailureMessage("hmac").message.includes("signature mismatch"), true);
  assert.equal(
    redirectMismatchMessage(),
    `Google rejected the return URL. In Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client, Authorized redirect URIs must include exactly: ${CANONICAL_GOOGLE_CALENDAR_REDIRECT_URI}`,
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
  assert.equal(parsed.searchParams.get("access_type"), "offline");
  assert.equal(parsed.searchParams.get("include_granted_scopes"), "true");
  assert.equal(parsed.searchParams.get("prompt"), "consent select_account");
  assert.equal(
    parsed.searchParams.get("scope"),
    "openid email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events",
  );
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
    classifyGoogleTokenExchangeFailure(401, JSON.stringify({ error: "invalid_client" })).outcome,
    "misconfigured",
  );
  assert.match(
    classifyGoogleTokenExchangeFailure(400, JSON.stringify({ error: "unauthorized_client" })).message,
    /unauthorized_client/,
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

test("granted Google scopes accept userinfo.email aliases and require calendar data scopes", () => {
  assert.equal(
    grantedScopesIncludeRequired(
      "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events",
    ),
    true,
  );
  assert.equal(
    grantedScopesIncludeRequired(
      "openid email https://www.googleapis.com/auth/calendar.events.owned",
    ),
    false,
  );
  assert.equal(
    grantedScopesIncludeRequired(
      "openid email https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.events.owned",
    ),
    false,
  );
});

test("freeBusy auth errors refresh before any disconnect; transient errors stay connected", () => {
  const insufficient = classifyGoogleCalendarRequestFailure(
    403,
    JSON.stringify({
      error: {
        code: 403,
        message: "Request had insufficient authentication scopes.",
        status: "PERMISSION_DENIED",
        details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
      },
    }),
  );
  assert.equal(insufficient instanceof GoogleCalendarRequestError, true);
  assert.equal(isGoogleCalendarAuthFailure(insufficient), true);
  assert.equal(calendarBusyFailureAction(insufficient), "refresh");
  assert.equal(calendarFailureAfterRefreshAction(insufficient), "unavailable");
  assert.equal(calendarConnectProbeFailure(insufficient).outcome, "rejected");

  const unauthorized = classifyGoogleCalendarRequestFailure(401, "{}");
  assert.equal(calendarBusyFailureAction(unauthorized), "refresh");
  assert.equal(calendarCredentialFailureAction(unauthorized), "unavailable");
  assert.equal(calendarFailureAfterRefreshAction(unauthorized), "unavailable");

  const rateLimited = classifyGoogleCalendarRequestFailure(
    403,
    JSON.stringify({
      error: {
        errors: [{ reason: "rateLimitExceeded", message: "Rate Limit Exceeded" }],
        code: 403,
        message: "Rate Limit Exceeded",
      },
    }),
  );
  assert.equal(isGoogleCalendarAuthFailure(rateLimited), false);
  assert.equal(calendarBusyFailureAction(rateLimited), "unavailable");
  assert.equal(calendarFailureAfterRefreshAction(rateLimited), "unavailable");

  const unavailable = classifyGoogleCalendarRequestFailure(503, "{}");
  assert.equal(isGoogleCalendarAuthFailure(unavailable), false);
  assert.equal(calendarBusyFailureAction(unavailable), "unavailable");
  assert.equal(calendarConnectProbeFailure(unavailable).outcome, "unavailable");
  assert.equal(calendarBusyFailureAction(new Error("network down")), "unavailable");
  assert.equal(calendarFailureAfterRefreshAction(new Error("network down")), "unavailable");
});

test("token refresh 5xx stays connected; invalid_grant disconnects", () => {
  const unavailable = classifyGoogleTokenRefreshFailure(503, "{}");
  assert.equal(unavailable.outcome, "unavailable");
  assert.equal(calendarCredentialFailureAction(unavailable), "unavailable");
  assert.equal(isGoogleTokenRefreshAuthFailure(unavailable), false);

  const revoked = classifyGoogleTokenRefreshFailure(
    400,
    JSON.stringify({ error: "invalid_grant" }),
  );
  assert.equal(revoked.outcome, "expired");
  assert.equal(calendarCredentialFailureAction(revoked), "disconnect");
  assert.equal(isGoogleTokenRefreshAuthFailure(revoked), true);

  assert.equal(
    calendarCredentialFailureAction(new Error("Google token refresh failed (503)")),
    "unavailable",
  );
  assert.equal(
    calendarCredentialFailureAction(new Error("Google token refresh failed (401)")),
    "unavailable",
  );
  const invalidClient = classifyGoogleTokenRefreshFailure(
    401,
    JSON.stringify({ error: "invalid_client" }),
  );
  assert.equal(invalidClient.outcome, "unavailable");
  assert.equal(calendarCredentialFailureAction(invalidClient), "unavailable");
  const revokedDescription = classifyGoogleTokenRefreshFailure(
    400,
    JSON.stringify({ error_description: "Token has been expired or revoked." }),
  );
  assert.equal(revokedDescription.outcome, "expired");
  assert.equal(calendarCredentialFailureAction(revokedDescription), "disconnect");
});

test("missing Google Calendar events are treated as already cancelled", () => {
  assert.equal(
    googleCalendar.isGoogleCalendarNotFound(
      new googleCalendar.GoogleCalendarRequestError(404, "notFound", "Not Found"),
    ),
    true,
  );
  assert.equal(
    googleCalendar.isGoogleCalendarNotFound(
      new googleCalendar.GoogleCalendarRequestError(410, "gone", "Gone"),
    ),
    false,
  );
});

test("access tokens refresh before expiry and when expiry was never stored", () => {
  const now = new Date("2026-09-27T16:00:00.000Z");
  assert.equal(googleAccessTokenNeedsRefresh(null, now), true);
  assert.equal(
    googleAccessTokenNeedsRefresh(new Date(now.getTime() + GOOGLE_ACCESS_TOKEN_REFRESH_SKEW_MS), now),
    true,
  );
  assert.equal(
    googleAccessTokenNeedsRefresh(
      new Date(now.getTime() + GOOGLE_ACCESS_TOKEN_REFRESH_SKEW_MS + 1_000),
      now,
    ),
    false,
  );
  assert.equal(
    googleAccessTokenNeedsRefresh(new Date(now.getTime() - 1_000), now),
    true,
  );
});

test("preserve refresh_token when Google omits it from a token response", () => {
  assert.equal(preserveGoogleRefreshToken("stored-refresh", undefined), "stored-refresh");
  assert.equal(preserveGoogleRefreshToken("stored-refresh", ""), "stored-refresh");
  assert.equal(preserveGoogleRefreshToken("stored-refresh", "   "), "stored-refresh");
  assert.equal(preserveGoogleRefreshToken("stored-refresh", "rotated-refresh"), "rotated-refresh");
  assert.equal(preserveGoogleRefreshToken(null, undefined), null);
});

async function withGoogleOAuthFetch(
  fetchImpl: typeof fetch,
  run: () => Promise<void>,
) {
  const previous = {
    id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirect: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    nodeEnv: process.env.NODE_ENV,
    fetch: globalThis.fetch,
  };
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_CALENDAR_REDIRECT_URI =
    "https://app.example.com/api/calendar/oauth/callback";
  process.env.NODE_ENV = "test";
  globalThis.fetch = fetchImpl;
  try {
    await run();
  } finally {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = previous.id;
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previous.secret;
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = previous.redirect;
    process.env.NODE_ENV = previous.nodeEnv;
    globalThis.fetch = previous.fetch;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("unexpired access token is reused without calling Google", async () => {
  await withGoogleOAuthFetch(async () => {
    throw new Error("token endpoint should not be called");
  }, async () => {
    const resolved = await resolveGoogleCalendarAccessToken({
      accessToken: "still-valid",
      refreshToken: "stored-refresh",
      accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    });
    assert.deepEqual(resolved, {
      ok: true,
      accessToken: "still-valid",
      refreshed: false,
    });
  });
});

test("refresh success keeps the stored refresh token when Google omits a new one", async () => {
  await withGoogleOAuthFetch(async (input, init) => {
    assert.equal(String(input), "https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init?.body ?? ""));
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "stored-refresh");
    return jsonResponse(200, { access_token: "fresh-access", expires_in: 3600 });
  }, async () => {
    const refreshed = await googleCalendar.refreshGoogleAccessToken("stored-refresh");
    assert.equal(refreshed.accessToken, "fresh-access");
    assert.equal(refreshed.expiresIn, 3600);
    assert.equal(refreshed.refreshToken, undefined);
    assert.equal(
      preserveGoogleRefreshToken("stored-refresh", refreshed.refreshToken),
      "stored-refresh",
    );
    const now = new Date("2026-09-27T16:00:00.000Z");
    const resolved = await resolveGoogleCalendarAccessToken(
      {
        accessToken: "expired-access",
        refreshToken: "stored-refresh",
        accessTokenExpiresAt: new Date("2026-09-27T15:00:00.000Z"),
      },
      now,
    );
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.accessToken, "fresh-access");
      assert.equal(resolved.refreshed, true);
      assert.equal(resolved.rotatedRefreshToken, undefined);
    }
  });
});

test("refresh failure invalid_grant disconnects; token endpoint 5xx stays connected", async () => {
  await withGoogleOAuthFetch(async () => {
    return jsonResponse(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
  }, async () => {
    await assert.rejects(
      () => googleCalendar.refreshGoogleAccessToken("revoked-refresh"),
      (error: unknown) => {
        assert.equal(error instanceof googleCalendar.CalendarOAuthError, true);
        assert.equal(calendarCredentialFailureAction(error), "disconnect");
        return true;
      },
    );
    const resolved = await resolveGoogleCalendarAccessToken({
      accessToken: "expired-access",
      refreshToken: "revoked-refresh",
      accessTokenExpiresAt: new Date("2026-09-27T15:00:00.000Z"),
    });
    assert.deepEqual(resolved, { ok: false, action: "disconnect", reason: "refresh_rejected" });
  });

  await withGoogleOAuthFetch(async () => jsonResponse(503, {}), async () => {
    const resolved = await resolveGoogleCalendarAccessToken({
      accessToken: "expired-access",
      refreshToken: "stored-refresh",
      accessTokenExpiresAt: new Date("2026-09-27T15:00:00.000Z"),
    });
    assert.deepEqual(resolved, { ok: false, action: "unavailable", reason: "refresh_unavailable" });
  });
});

test("freeBusy 401 refreshes a valid grant and does not disconnect", async () => {
  const calls: string[] = [];
  await withGoogleOAuthFetch(async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init?.body ?? ""));
      assert.equal(body.get("refresh_token"), "stored-refresh");
      return jsonResponse(200, { access_token: "fresh-access", expires_in: 3600 });
    }
    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization === "Bearer expired-access") {
      return jsonResponse(401, { error: { code: 401, message: "Invalid Credentials", status: "UNAUTHENTICATED" } });
    }
    assert.equal(authorization, "Bearer fresh-access");
    return jsonResponse(200, {
      calendars: { primary: { busy: [{ start: "2026-09-28T15:00:00.000Z", end: "2026-09-28T16:00:00.000Z" }] } },
    });
  }, async () => {
    const read = await listGoogleBusyWindowsRecovering({
      accessToken: "expired-access",
      refreshToken: "stored-refresh",
      calendarId: "primary",
      timeMin: new Date("2026-09-28T00:00:00.000Z"),
      timeMax: new Date("2026-09-29T00:00:00.000Z"),
    });
    assert.equal(read.ok, true);
    if (read.ok) {
      assert.equal(read.refreshed, true);
      assert.equal(read.accessToken, "fresh-access");
      assert.equal(read.rotatedRefreshToken, undefined);
      assert.deepEqual(read.busy, [
        { start: "2026-09-28T15:00:00.000Z", end: "2026-09-28T16:00:00.000Z" },
      ]);
    }
    assert.equal(calls.filter((url) => url.includes("/token")).length, 1);
  });
});

test("freeBusy 401 followed by invalid_grant disconnects; a 503 does not", async () => {
  await withGoogleOAuthFetch(async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return jsonResponse(400, { error: "invalid_grant" });
    }
    return jsonResponse(401, {});
  }, async () => {
    const read = await listGoogleBusyWindowsRecovering({
      accessToken: "expired-access",
      refreshToken: "revoked-refresh",
      calendarId: "primary",
      timeMin: new Date("2026-09-28T00:00:00.000Z"),
      timeMax: new Date("2026-09-29T00:00:00.000Z"),
    });
    assert.deepEqual(read, { ok: false, action: "disconnect", reason: "refresh_rejected" });
  });

  let tokenCalls = 0;
  await withGoogleOAuthFetch(async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") tokenCalls += 1;
    return jsonResponse(503, {});
  }, async () => {
    const read = await listGoogleBusyWindowsRecovering({
      accessToken: "still-valid",
      refreshToken: "stored-refresh",
      calendarId: "primary",
      timeMin: new Date("2026-09-28T00:00:00.000Z"),
      timeMax: new Date("2026-09-29T00:00:00.000Z"),
    });
    assert.deepEqual(read, { ok: false, action: "unavailable", reason: "freebusy_transient" });
    assert.equal(tokenCalls, 0);
  });
});

test("rotated refresh tokens are kept and an omitted refresh token is not dropped", async () => {
  await withGoogleOAuthFetch(async () => {
    return jsonResponse(200, {
      access_token: "fresh-access",
      expires_in: 3600,
      refresh_token: "rotated-refresh",
    });
  }, async () => {
    const resolved = await resolveGoogleCalendarAccessToken(
      {
        accessToken: "expired-access",
        refreshToken: "stored-refresh",
        accessTokenExpiresAt: new Date(0),
      },
      new Date("2026-09-27T16:00:00.000Z"),
    );
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.rotatedRefreshToken, "rotated-refresh");
      assert.equal(
        preserveGoogleRefreshToken("stored-refresh", resolved.rotatedRefreshToken),
        "rotated-refresh",
      );
    }
  });
});

test("token near expiry refreshes successfully and does not disconnect", async () => {
  const now = new Date("2026-09-27T16:00:00.000Z");
  const calls: string[] = [];
  await withGoogleOAuthFetch(async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init?.body ?? ""));
      assert.equal(body.get("refresh_token"), "stored-refresh");
      return jsonResponse(200, { access_token: "fresh-access", expires_in: 3600 });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fresh-access");
    return jsonResponse(200, { id: "event-1" });
  }, async () => {
    const result = await callGoogleCalendarRecovering({
      accessToken: "about-to-expire",
      refreshToken: "stored-refresh",
      accessTokenExpiresAt: new Date(now.getTime() + 30_000),
      now,
      call: async (token) => ({ wroteWith: token }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.refreshed, true);
      assert.equal(result.accessToken, "fresh-access");
      assert.equal(result.rotatedRefreshToken, undefined);
      assert.deepEqual(result.value, { wroteWith: "fresh-access" });
    }
    assert.equal(calls.filter((url) => url.includes("/token")).length, 1);
  });
});

test("freeBusy 401 after a successful refresh stays connected", async () => {
  let freeBusyCalls = 0;
  await withGoogleOAuthFetch(async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return jsonResponse(200, { access_token: "fresh-access", expires_in: 3600 });
    }
    freeBusyCalls += 1;
    return jsonResponse(401, { error: { code: 401, status: "UNAUTHENTICATED" } });
  }, async () => {
    const read = await listGoogleBusyWindowsRecovering({
      accessToken: "expired-access",
      refreshToken: "stored-refresh",
      calendarId: "primary",
      timeMin: new Date("2026-09-28T00:00:00.000Z"),
      timeMax: new Date("2026-09-29T00:00:00.000Z"),
    });
    assert.equal(freeBusyCalls, 2);
    assert.deepEqual(read, {
      ok: false,
      action: "unavailable",
      reason: "freebusy_auth_after_refresh",
    });
    assert.equal(
      calendarOAuthProbeOutcome({ ok: false, action: "unavailable", reason: "freebusy_auth_after_refresh" }),
      "rejected",
    );
  });
});

test("booking writes refresh once on 401 and do not clear a good grant", async () => {
  let writes = 0;
  await withGoogleOAuthFetch(async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return jsonResponse(200, { access_token: "fresh-access", expires_in: 3600 });
    }
    return jsonResponse(401, {});
  }, async () => {
    const result = await callGoogleCalendarRecovering({
      accessToken: "stale-access",
      refreshToken: "stored-refresh",
      accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
      call: async (token) => {
        writes += 1;
        if (token !== "fresh-access") {
          throw classifyGoogleCalendarRequestFailure(401, "{}");
        }
        return { id: "event-1" };
      },
    });
    assert.equal(writes, 2);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.refreshed, true);
      assert.equal(result.value.id, "event-1");
      assert.equal(result.rotatedRefreshToken, undefined);
    }
  });
});

test("missing refresh token on a calendar auth failure is the reconnect case", async () => {
  await withGoogleOAuthFetch(async () => jsonResponse(401, {}), async () => {
    const read = await listGoogleBusyWindowsRecovering({
      accessToken: "expired-access",
      refreshToken: "  ",
      calendarId: "primary",
      timeMin: new Date("2026-09-28T00:00:00.000Z"),
      timeMax: new Date("2026-09-29T00:00:00.000Z"),
    });
    assert.deepEqual(read, {
      ok: false,
      action: "disconnect",
      reason: "freebusy_auth_without_refresh_token",
    });
  });
});

test("oauth probe keeps the stored grant unless refresh returns invalid_grant", () => {
  assert.equal(calendarOAuthProbeOutcome({ ok: true }), "connected");
  assert.equal(
    calendarOAuthProbeOutcome({ ok: false, action: "unavailable", reason: "calendar_transient" }),
    "connected",
  );
  assert.equal(
    calendarOAuthProbeOutcome({ ok: false, action: "unavailable", reason: "refresh_unavailable" }),
    "connected",
  );
  assert.equal(
    calendarOAuthProbeOutcome({
      ok: false,
      action: "unavailable",
      reason: "calendar_auth_after_refresh",
    }),
    "rejected",
  );
  assert.equal(
    calendarOAuthProbeOutcome({ ok: false, action: "disconnect", reason: "refresh_rejected" }),
    "reconnect",
  );
});
