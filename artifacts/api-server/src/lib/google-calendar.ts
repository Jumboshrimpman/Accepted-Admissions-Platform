import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
];

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

export function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function createCalendarOAuthState(tutorProfileId: string, appUserId: string): string {
  const payload = `${tutorProfileId}.${appUserId}.${Date.now() + 10 * 60 * 1000}.${base64Url(randomBytes(16))}`;
  const signature = createHmac("sha256", signingKey()).update(payload).digest();
  return `${base64Url(payload)}.${base64Url(signature)}`;
}

export function readCalendarOAuthState(
  state: string,
): { tutorProfileId: string; appUserId: string } | null {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  const payload = fromBase64Url(encodedPayload).toString("utf8");
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  const received = fromBase64Url(encodedSignature);
  if (received.length !== expected.length || !received.equals(expected)) return null;
  const [tutorProfileId, appUserId, expiresAt, nonce] = payload.split(".");
  if (!tutorProfileId || !appUserId || !expiresAt || !nonce || Number(expiresAt) < Date.now()) {
    return null;
  }
  return { tutorProfileId, appUserId };
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
  loginHint?: string,
): string {
  const config = getGoogleCalendarConfig();
  if (!config) throw new Error("Google Calendar OAuth is not configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state: createCalendarOAuthState(tutorProfileId, appUserId),
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function googleCalendarCompletionHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google Calendar connected</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #172033; font-family: ui-sans-serif, system-ui, sans-serif; }
      main { width: min(28rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #dbe3ef; border-radius: 1rem; background: white; box-shadow: 0 1rem 3rem rgba(23, 32, 51, 0.08); text-align: center; }
      h1 { margin: 0; font-size: 1.5rem; }
      p { margin: 0.75rem 0 0; color: #526078; line-height: 1.6; }
      button { margin-top: 1.25rem; border: 0; border-radius: 999px; padding: 0.7rem 1.1rem; background: #172033; color: white; font: inherit; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <h1>Google Calendar connected</h1>
      <p>You can close this window and return to Accepted Admissions.</p>
      <button type="button" onclick="window.close()">Close window</button>
    </main>
    <script>
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: "accepted-admissions:calendar-connected" },
          window.location.origin
        );
        window.setTimeout(() => window.close(), 350);
      }
    </script>
  </body>
</html>`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  googleAccountId: string;
  email: string;
}> {
  const config = getGoogleCalendarConfig();
  if (!config) throw new Error("Google Calendar OAuth is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };
  if (!data.access_token) throw new Error("Google token response did not include an access token");
  if (!data.id_token) throw new Error("Google token response did not include an identity token");
  const identityResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(data.id_token)}`,
  );
  if (!identityResponse.ok) {
    throw new Error(`Google identity verification failed (${identityResponse.status})`);
  }
  const identity = (await identityResponse.json()) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: string;
  };
  if (
    identity.aud !== config.clientId ||
    !["accounts.google.com", "https://accounts.google.com"].includes(identity.iss ?? "") ||
    !identity.sub ||
    !identity.email ||
    identity.email_verified !== "true"
  ) {
    throw new Error("Google identity response was invalid");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    googleAccountId: identity.sub,
    email: identity.email,
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