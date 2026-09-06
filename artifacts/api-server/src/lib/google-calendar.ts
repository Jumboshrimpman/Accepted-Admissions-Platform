import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
];

export const CALENDAR_RETURN_TO_PATHS = ["/tutor", "/portal", "/admin"] as const;

export type CalendarOAuthOutcome =
  | "connected"
  | "cancelled"
  | "rejected"
  | "failed"
  | "misconfigured"
  | "redirect_mismatch"
  | "unavailable"
  | "expired";

export type CalendarOAuthState = {
  tutorProfileId: string;
  appUserId: string;
  returnTo: string;
  redirectUri: string;
};

export type GoogleCalendarConnectionStatus =
  | "connected"
  | "disconnected"
  | "unavailable";

export class CalendarOAuthError extends Error {
  readonly outcome: CalendarOAuthOutcome;

  constructor(outcome: CalendarOAuthOutcome, message: string) {
    super(message);
    this.name = "CalendarOAuthError";
    this.outcome = outcome;
  }
}

export function normalizeGoogleCalendarStatus(
  value: string | null | undefined,
): GoogleCalendarConnectionStatus {
  if (value === "connected") return "connected";
  if (value === "unavailable") return "unavailable";
  return "disconnected";
}

type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleBusyWindow = {
  start: string;
  end: string;
};

export type GoogleCalendarEvent = {
  id?: string;
  htmlLink?: string;
};

function signingKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured for calendar OAuth");
  return createHash("sha256").update(secret).digest();
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function firstHeaderValue(value?: string | null): string | undefined {
  const part = value?.split(",")[0]?.trim();
  return part || undefined;
}

export function escapeCalendarHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeCalendarJsString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function safeCalendarReturnTo(
  value: string | undefined,
  fallback: (typeof CALENDAR_RETURN_TO_PATHS)[number] = "/tutor",
): (typeof CALENDAR_RETURN_TO_PATHS)[number] {
  return CALENDAR_RETURN_TO_PATHS.includes(value as (typeof CALENDAR_RETURN_TO_PATHS)[number])
    ? (value as (typeof CALENDAR_RETURN_TO_PATHS)[number])
    : fallback;
}

export function isGoogleEmailVerified(value: unknown): boolean {
  return value === true || value === "true";
}

export function googleAccountMatchesPortalEmails(
  googleEmail: string,
  portalEmails: Array<string | null | undefined>,
): boolean {
  const needle = googleEmail.trim().toLowerCase();
  return portalEmails.some((email) => email?.trim().toLowerCase() === needle);
}

export function publicOriginFromForwardedHeaders(input: {
  host?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  protocol?: string | null;
}): string | null {
  const host = firstHeaderValue(input.forwardedHost) || input.host?.trim();
  if (!host) return null;
  const proto = firstHeaderValue(input.forwardedProto) || input.protocol || "https";
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null;
  }
}

export function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri = resolveGoogleCalendarRedirectUri();
  if (!redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Resolve the OAuth callback URL from env; production requires HTTPS. */
export function resolveGoogleCalendarRedirectUri(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (explicit) {
    if (!isAcceptableCalendarRedirectUri(explicit, env)) return null;
    return explicit.replace(/\/$/, "");
  }
  const origin = env.APP_ORIGIN?.trim().replace(/\/$/, "");
  if (!origin) return null;
  const derived = `${origin}/api/calendar/oauth/callback`;
  if (!isAcceptableCalendarRedirectUri(derived, env)) return null;
  return derived;
}

/**
 * Prefer the browser-facing origin so Google's redirect matches the tab that
 * started Connect. Falls back to GOOGLE_CALENDAR_REDIRECT_URI / APP_ORIGIN.
 */
export function resolveOAuthRedirectUriForRequest(
  requestOrigin: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (requestOrigin) {
    const derived = `${requestOrigin.replace(/\/$/, "")}/api/calendar/oauth/callback`;
    if (isAcceptableCalendarRedirectUri(derived, env)) return derived;
  }
  return resolveGoogleCalendarRedirectUri(env);
}

export function isAcceptableCalendarRedirectUri(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") return false;
  if (!parsed.pathname.includes("/api/calendar/oauth/callback")) return false;
  return true;
}

export function createCalendarOAuthState(
  tutorProfileId: string,
  appUserId: string,
  options: { returnTo?: string; redirectUri?: string } = {},
): string {
  const payload = JSON.stringify({
    tutorProfileId,
    appUserId,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: base64Url(randomBytes(16)),
    returnTo: safeCalendarReturnTo(options.returnTo),
    redirectUri: options.redirectUri ?? "",
  });
  const signature = createHmac("sha256", signingKey()).update(payload).digest();
  return `${base64Url(payload)}.${base64Url(signature)}`;
}

function parseCalendarOAuthPayload(payload: string): {
  tutorProfileId: string;
  appUserId: string;
  exp: number;
  nonce: string;
  returnTo: string;
  redirectUri: string;
} | null {
  if (payload.startsWith("{")) {
    try {
      const parsed = JSON.parse(payload) as {
        tutorProfileId?: unknown;
        appUserId?: unknown;
        exp?: unknown;
        nonce?: unknown;
        returnTo?: unknown;
        redirectUri?: unknown;
      };
      if (
        typeof parsed.tutorProfileId !== "string" ||
        typeof parsed.appUserId !== "string" ||
        typeof parsed.exp !== "number" ||
        typeof parsed.nonce !== "string"
      ) {
        return null;
      }
      return {
        tutorProfileId: parsed.tutorProfileId,
        appUserId: parsed.appUserId,
        exp: parsed.exp,
        nonce: parsed.nonce,
        returnTo: safeCalendarReturnTo(
          typeof parsed.returnTo === "string" ? parsed.returnTo : undefined,
        ),
        redirectUri: typeof parsed.redirectUri === "string" ? parsed.redirectUri : "",
      };
    } catch {
      return null;
    }
  }
  const [tutorProfileId, appUserId, expiresAt, nonce] = payload.split(".");
  if (!tutorProfileId || !appUserId || !expiresAt || !nonce) return null;
  return {
    tutorProfileId,
    appUserId,
    exp: Number(expiresAt),
    nonce,
    returnTo: "/tutor",
    redirectUri: "",
  };
}

export function readCalendarOAuthState(state: string): CalendarOAuthState | null {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  const payload = fromBase64Url(encodedPayload).toString("utf8");
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  const received = fromBase64Url(encodedSignature);
  if (received.length !== expected.length || !received.equals(expected)) return null;
  const parsed = parseCalendarOAuthPayload(payload);
  if (!parsed || !parsed.nonce || Number.isNaN(parsed.exp) || parsed.exp < Date.now()) {
    return null;
  }
  if (parsed.redirectUri && !isAcceptableCalendarRedirectUri(parsed.redirectUri)) {
    return null;
  }
  return {
    tutorProfileId: parsed.tutorProfileId,
    appUserId: parsed.appUserId,
    returnTo: parsed.returnTo,
    redirectUri: parsed.redirectUri,
  };
}

export function encryptCalendarToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", signingKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${base64Url(iv)}.${base64Url(cipher.getAuthTag())}.${base64Url(encrypted)}`;
}

export function decryptCalendarToken(value: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted calendar token");
  const decipher = createDecipheriv("aes-256-gcm", signingKey(), fromBase64Url(ivValue));
  decipher.setAuthTag(fromBase64Url(tagValue));
  return Buffer.concat([decipher.update(fromBase64Url(encryptedValue)), decipher.final()]).toString(
    "utf8",
  );
}

export function googleCalendarAuthorizationUrl(
  tutorProfileId: string,
  appUserId: string,
  options: { loginHint?: string; returnTo?: string; redirectUri?: string } = {},
): string {
  const config = getGoogleCalendarConfig();
  if (!config) {
    throw new CalendarOAuthError(
      "misconfigured",
      "Google Calendar is not configured for this workspace.",
    );
  }
  const redirectUri = options.redirectUri ?? config.redirectUri;
  if (!isAcceptableCalendarRedirectUri(redirectUri)) {
    throw new CalendarOAuthError(
      "misconfigured",
      "Google Calendar is not configured for this workspace.",
    );
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state: createCalendarOAuthState(tutorProfileId, appUserId, {
      returnTo: options.returnTo,
      redirectUri,
    }),
  });
  if (options.loginHint) params.set("login_hint", options.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function classifyGoogleProviderError(
  error: string,
  _description?: string,
): { outcome: CalendarOAuthOutcome; message: string } {
  const code = error.trim().toLowerCase();
  if (code === "access_denied") {
    return {
      outcome: "cancelled",
      message: "You cancelled Google authorization. No calendar changes were made.",
    };
  }
  if (code === "admin_policy_enforced" || code === "unauthorized_client") {
    return {
      outcome: "rejected",
      message: "Google rejected authorization for this account.",
    };
  }
  if (code.includes("redirect_uri")) {
    return {
      outcome: "redirect_mismatch",
      message:
        "Google rejected the return URL. An administrator must allowlist the exact Calendar callback URL in Google Cloud Console.",
    };
  }
  return {
    outcome: "failed",
    message: "Google Calendar authorization failed. Close this window and try again.",
  };
}

export function classifyGoogleTokenExchangeFailure(
  status: number,
  body: string,
): CalendarOAuthError {
  let parsed: { error?: string; error_description?: string } = {};
  try {
    parsed = JSON.parse(body) as { error?: string; error_description?: string };
  } catch {
    parsed = {};
  }
  const haystack = `${parsed.error ?? ""} ${parsed.error_description ?? ""}`.toLowerCase();
  if (haystack.includes("redirect_uri")) {
    return new CalendarOAuthError(
      "redirect_mismatch",
      "Google rejected the return URL. An administrator must allowlist the exact Calendar callback URL in Google Cloud Console.",
    );
  }
  if (haystack.includes("invalid_grant")) {
    return new CalendarOAuthError(
      "expired",
      "This authorization code expired or was already used. Start Connect again from the dashboard.",
    );
  }
  if (status === 401 || status === 403) {
    return new CalendarOAuthError(
      "rejected",
      "Google rejected authorization for this account.",
    );
  }
  if (status >= 500) {
    return new CalendarOAuthError(
      "unavailable",
      "Google Calendar is temporarily unavailable. Try again in a few minutes.",
    );
  }
  return new CalendarOAuthError(
    "failed",
    "Google Calendar authorization failed. Close this window and try again.",
  );
}

export function calendarOAuthReturnHref(
  returnTo: string | undefined,
  redirectUri: string | undefined,
  outcome: CalendarOAuthOutcome,
  success: boolean,
): string {
  const path = safeCalendarReturnTo(returnTo);
  let origin = "";
  if (redirectUri) {
    try {
      origin = new URL(redirectUri).origin;
    } catch {
      origin = "";
    }
  }
  const query = success
    ? "calendar=connected"
    : `calendar=error&reason=${encodeURIComponent(outcome)}`;
  return `${origin}${path}?${query}`;
}

export function googleCalendarCompletionHtml(options: {
  success?: boolean;
  message?: string;
  outcome?: CalendarOAuthOutcome;
  returnTo?: string;
  redirectUri?: string;
} = {}): string {
  const success = options.success ?? true;
  const outcome = options.outcome ?? (success ? "connected" : "failed");
  const title = success
    ? "Google Calendar connected"
    : "Google Calendar connection failed";
  const heading = success
    ? "Google Calendar connected"
    : "Google Calendar connection not completed";
  const message =
    options.message ??
    (success
      ? "You can close this window and return to Accepted Admissions."
      : "No calendar changes were made. Close this window and try again.");
  const escapedMessage = escapeCalendarHtml(message);
  const jsMessage = escapeCalendarJsString(message);
  const jsOutcome = escapeCalendarJsString(outcome);
  const returnHref = calendarOAuthReturnHref(
    options.returnTo,
    options.redirectUri,
    outcome,
    success,
  );
  const escapedReturnHref = escapeCalendarHtml(returnHref);
  const jsReturnHref = escapeCalendarJsString(returnHref);
  const accent = success ? "#047857" : "#b42318";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #172033; font-family: ui-sans-serif, system-ui, sans-serif; }
      main { width: min(28rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #dbe3ef; border-radius: 1rem; background: white; box-shadow: 0 1rem 3rem rgba(23, 32, 51, 0.08); text-align: center; }
      h1 { margin: 0; font-size: 1.5rem; }
      p { margin: 0.75rem 0 0; color: #526078; line-height: 1.6; }
      .status { color: ${accent}; font-weight: 600; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; margin-top: 1.25rem; }
      button, .return { border: 0; border-radius: 999px; padding: 0.7rem 1.1rem; background: #172033; color: white; font: inherit; cursor: pointer; text-decoration: none; display: inline-block; }
      .return { background: #047857; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p class="status">${escapedMessage}</p>
      <div class="actions">
        <a class="return" href="${escapedReturnHref}">Return to dashboard</a>
        <button type="button" onclick="window.close()">Close window</button>
      </div>
    </main>
    <script>
      const connectionResult = {
        type: "accepted-admissions:calendar-${success ? "connected" : "connection-failed"}",
        outcome: "${jsOutcome}",
        message: "${jsMessage}",
      };
      const returnHref = "${jsReturnHref}";
      const hasOpener = Boolean(window.opener && !window.opener.closed);
      if (hasOpener) {
        window.opener.postMessage(connectionResult, window.location.origin);
      }
      if ("BroadcastChannel" in window) {
        const connectionChannel = new BroadcastChannel(
          "accepted-admissions:calendar-connection"
        );
        connectionChannel.postMessage(connectionResult);
        window.setTimeout(() => connectionChannel.close(), 750);
      }
      if (hasOpener) {
        ${success ? "window.setTimeout(() => window.close(), 350);" : ""}
      } else {
        window.setTimeout(() => { window.location.replace(returnHref); }, ${success ? "400" : "1600"});
      }
    </script>
  </body>
</html>`;
}

export function readGoogleIdentityClaims(identity: {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: unknown;
}): { googleAccountId: string; email: string } | null {
  if (
    !identity.sub ||
    !identity.email ||
    !["accounts.google.com", "https://accounts.google.com"].includes(identity.iss ?? "") ||
    !isGoogleEmailVerified(identity.email_verified)
  ) {
    return null;
  }
  return { googleAccountId: identity.sub, email: identity.email };
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri?: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  googleAccountId: string;
  email: string;
}> {
  const config = getGoogleCalendarConfig();
  if (!config) {
    throw new CalendarOAuthError(
      "misconfigured",
      "Google Calendar is not configured for this workspace.",
    );
  }
  const exchangeRedirectUri = redirectUri || config.redirectUri;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: exchangeRedirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw classifyGoogleTokenExchangeFailure(response.status, body);
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };
  if (!data.access_token) {
    throw new CalendarOAuthError(
      "failed",
      "Google Calendar authorization failed. Close this window and try again.",
    );
  }
  if (!data.id_token) {
    throw new CalendarOAuthError(
      "failed",
      "Google Calendar authorization failed. Close this window and try again.",
    );
  }
  const identityResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(data.id_token)}`,
  );
  if (!identityResponse.ok) {
    throw new CalendarOAuthError(
      identityResponse.status >= 500 ? "unavailable" : "failed",
      identityResponse.status >= 500
        ? "Google Calendar is temporarily unavailable. Try again in a few minutes."
        : "Google Calendar authorization failed. Close this window and try again.",
    );
  }
  const identity = (await identityResponse.json()) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: unknown;
  };
  const claims = readGoogleIdentityClaims(identity);
  if (!claims || identity.aud !== config.clientId) {
    throw new CalendarOAuthError(
      "rejected",
      "Google rejected authorization for this account.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    googleAccountId: claims.googleAccountId,
    email: claims.email,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn?: number;
}> {
  const config = getGoogleCalendarConfig();
  if (!config) throw new Error("Google Calendar OAuth is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google refresh response did not include an access token");
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export async function googleCalendarRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw new Error(`Google Calendar request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listGoogleBusyWindows(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleBusyWindow[]> {
  const data = await googleCalendarRequest<{
    calendars?: Record<string, { busy?: GoogleBusyWindow[] }>;
  }>(accessToken, "/calendar/v3/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  return data.calendars?.[calendarId]?.busy ?? [];
}

export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: Record<string, unknown>,
): Promise<GoogleCalendarEvent> {
  return googleCalendarRequest<GoogleCalendarEvent>(
    accessToken,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    { method: "POST", body: JSON.stringify(event) },
  );
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await googleCalendarRequest<void>(
    accessToken,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Record<string, unknown>,
): Promise<GoogleCalendarEvent> {
  return googleCalendarRequest<GoogleCalendarEvent>(
    accessToken,
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(event) },
  );
}
