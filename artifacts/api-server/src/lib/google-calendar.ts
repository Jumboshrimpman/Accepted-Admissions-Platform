import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
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

export function createCalendarOAuthState(tutorProfileId: string): string {
  const payload = `${tutorProfileId}.${Date.now() + 10 * 60 * 1000}`;
  const signature = createHmac("sha256", signingKey()).update(payload).digest();
  return `${base64Url(payload)}.${base64Url(signature)}`;
}

export function readCalendarOAuthState(state: string): { tutorProfileId: string } | null {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  const payload = fromBase64Url(encodedPayload).toString("utf8");
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  const received = fromBase64Url(encodedSignature);
  if (received.length !== expected.length || !received.equals(expected)) return null;
  const [tutorProfileId, expiresAt] = payload.split(".");
  if (!tutorProfileId || !expiresAt || Number(expiresAt) < Date.now()) return null;
  return { tutorProfileId };
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

export function googleCalendarAuthorizationUrl(tutorProfileId: string): string {
  const config = getGoogleCalendarConfig();
  if (!config) throw new Error("Google Calendar OAuth is not configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state: createCalendarOAuthState(tutorProfileId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
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
  };
  if (!data.access_token) throw new Error("Google token response did not include an access token");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
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