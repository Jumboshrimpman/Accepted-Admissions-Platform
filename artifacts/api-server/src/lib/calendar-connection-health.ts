// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { calendarGrantNeedsReconnect } from "./app-created-calendar.ts";

export type CalendarHealthBadge =
  | "healthy"
  | "needs_attention"
  | "needs_reconnect"
  | "not_connected";

export const UNKNOWN_GOOGLE_ACCOUNT_LABEL = "Unknown (reconnect to record)";
export const CALENDAR_CONNECTION_TEST_COOLDOWN_MS = 45_000;
export const CALENDAR_FREEBUSY_HEALTH_FRESH_MS = 60_000;
/** Warn once a Testing-mode refresh grant is this old. Google expires those grants at 7 days. */
export const TESTING_MODE_TOKEN_WARNING_MS = 6 * 24 * 60 * 60 * 1000;
export const TESTING_MODE_TOKEN_LIFETIME_DAYS = 7;
export const TESTING_MODE_EXPIRY_WARNING =
  "Google Calendar grants from an OAuth consent screen in Testing mode expire after 7 days. This token is at least 6 days old and the last error matches that expiry. Reconnect this tutor.";

export type CalendarConnectionHealth = {
  tutorProfileId: string;
  name: string;
  portalEmail: string;
  connectionStatus: "connected" | "disconnected";
  badge: CalendarHealthBadge;
  googleAccountMasked: string | null;
  calendarIdMasked: string | null;
  hasRefreshToken: boolean;
  lastTokenRefreshAt: string | null;
  lastFreeBusyAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  bookable: boolean;
  hasUpcomingBookableTime: boolean;
  estimatedTokenAgeDays: number | null;
  testingModeExpiryWarning: string | null;
};

const FEATURED_TUTOR_NAMES = [
  "xavier morales",
  "victoria wijerathnayapa",
  "eunice chon",
  "nika raiffe",
];

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  invalid_grant: "Google revoked the calendar grant. Reconnect is required.",
  credential_failure: "Google rejected the stored calendar grant. Reconnect is required.",
  freebusy_auth_without_refresh_token: "No refresh token is stored. Reconnect is required.",
  not_connected: "Google Calendar is not connected.",
  CALENDAR_DISCONNECTED: "Google Calendar is disconnected. Reconnect is required.",
  CALENDAR_UNAVAILABLE: "Google Calendar is temporarily unavailable.",
  calendar_check_failed: "The free/busy check failed.",
};

export function compareTutorConnectionOrder(leftName: string, rightName: string): number {
  const left = FEATURED_TUTOR_NAMES.indexOf(leftName.trim().toLowerCase());
  const right = FEATURED_TUTOR_NAMES.indexOf(rightName.trim().toLowerCase());
  if (left !== -1 || right !== -1) {
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  }
  return leftName.localeCompare(rightName);
}

export function maskSensitiveCalendarValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "primary") return "primary";
  const at = trimmed.indexOf("@");
  if (at > 0) {
    return `${trimmed.slice(0, 1)}***@${trimmed.slice(at + 1)}`;
  }
  if (trimmed.length <= 6) return "••••";
  return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
}

export function safeCalendarErrorMessage(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) return null;
  if (/ya29\.|bearer\s+|refresh_token|access_token|eyJ[a-z0-9_-]{8,}/i.test(trimmed)) {
    return "Calendar check failed.";
  }
  return (SAFE_ERROR_MESSAGES[trimmed] ?? trimmed).slice(0, 180);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function hasUpcomingBookableTime(input: {
  active?: boolean | null;
  bookingEligible?: boolean | null;
  weeklyHours?: Record<string, unknown> | null;
}): boolean {
  if (input.active === false || input.bookingEligible !== true) return false;
  const hours = input.weeklyHours ?? {};
  return Object.values(hours).some((windows) => Array.isArray(windows) && windows.length > 0);
}

function freeBusySucceeded(value: Date | string | null | undefined): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const trimmed = value.trim();
  return trimmed.length > 0 && !Number.isNaN(new Date(trimmed).getTime());
}

export function calendarHealthBadge(input: {
  hasRefreshToken: boolean;
  connectedAt?: Date | string | null;
  lastError?: string | null;
  lastFreeBusyAt?: Date | string | null;
  grantedScopes?: string | null;
  appCalendarId?: string | null;
}): CalendarHealthBadge {
  const error = input.lastError?.trim() ?? "";
  // A refresh token that just completed free/busy is a working grant. Missing
  // calendar.app.created or an app calendar id must not override that on the
  // Connections page. Those grants still show primary and have no last error.
  const workingGrant = input.hasRefreshToken && !error && freeBusySucceeded(input.lastFreeBusyAt);
  if (
    !workingGrant &&
    calendarGrantNeedsReconnect({
      hasRefreshToken: input.hasRefreshToken,
      grantedScopes: input.grantedScopes,
      appCalendarId: input.appCalendarId,
    })
  ) {
    return "needs_reconnect";
  }
  if (input.hasRefreshToken) return error ? "needs_attention" : "healthy";
  const previouslyConnected = Boolean(input.connectedAt);
  const reconnectError = /reconnect|revoked|invalid_grant|disconnected/i.test(error);
  if (previouslyConnected || reconnectError) return "needs_reconnect";
  return "not_connected";
}

export function calendarConnectionTestAdmission(input: {
  tutorProfileId: string;
  now: number;
  lastStartedAt?: number;
  inFlight: boolean;
  cooldownMs?: number;
}): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const cooldownMs = input.cooldownMs ?? CALENDAR_CONNECTION_TEST_COOLDOWN_MS;
  if (!input.tutorProfileId.trim()) {
    return { allowed: false, retryAfterSeconds: Math.ceil(cooldownMs / 1000) };
  }
  if (input.inFlight) {
    return { allowed: false, retryAfterSeconds: Math.ceil(cooldownMs / 1000) };
  }
  if (input.lastStartedAt != null && input.now - input.lastStartedAt < cooldownMs) {
    const remainingMs = cooldownMs - (input.now - input.lastStartedAt);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }
  return { allowed: true };
}

export function estimatedTokenAgeMs(
  connectedAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!connectedAt) return null;
  const issued = connectedAt instanceof Date ? connectedAt : new Date(connectedAt);
  const issuedMs = issued.getTime();
  if (Number.isNaN(issuedMs)) return null;
  return Math.max(0, now.getTime() - issuedMs);
}

export function estimatedTokenAgeDays(
  connectedAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  const ageMs = estimatedTokenAgeMs(connectedAt, now);
  if (ageMs == null) return null;
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

/** invalid_grant after about a week is the Testing-mode refresh-token expiry, not a deploy. */
export function errorPointsToTestingMode(error: string | null | undefined): boolean {
  const value = error?.trim().toLowerCase() ?? "";
  if (!value) return false;
  return (
    value.includes("invalid_grant") ||
    value.includes("expired or revoked") ||
    value.includes("revoked the calendar grant") ||
    value.includes("testing mode")
  );
}

export function testingModeExpiryWarning(input: {
  connectedAt?: Date | string | null;
  lastError?: string | null;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const ageMs = estimatedTokenAgeMs(input.connectedAt, now);
  if (ageMs == null || ageMs < TESTING_MODE_TOKEN_WARNING_MS) return null;
  if (!errorPointsToTestingMode(input.lastError)) return null;
  return TESTING_MODE_EXPIRY_WARNING;
}

export function preserveRevokedCalendarTestReason(
  existing: string | null | undefined,
  next: string | null,
): string | null {
  const current = existing?.trim() ?? "";
  if (current && /revoked|invalid_grant/i.test(current)) return current;
  return next;
}

export function calendarConnectionTestRetryMessage(retryAfterSeconds: number): string {
  return `Wait ${retryAfterSeconds} seconds before testing this calendar again.`;
}

export function shouldWriteCalendarFreeBusySuccess(input: {
  lastFreeBusyAt?: Date | string | null;
  lastError?: string | null;
  now: number;
  freshMs?: number;
}): boolean {
  if (input.lastError?.trim()) return true;
  if (input.lastFreeBusyAt == null || input.lastFreeBusyAt === "") return true;
  const at =
    input.lastFreeBusyAt instanceof Date
      ? input.lastFreeBusyAt.getTime()
      : new Date(input.lastFreeBusyAt).getTime();
  if (Number.isNaN(at)) return true;
  return input.now - at >= (input.freshMs ?? CALENDAR_FREEBUSY_HEALTH_FRESH_MS);
}

type CalendarFreeBusyHealthWrite = (input: {
  tutorProfileId: string;
  ok: boolean;
  reason?: string | null;
  checkedAt?: Date;
}) => Promise<void>;

type CalendarHealthWarn = (
  fields: { event: "calendar.health_write_failed"; tutorProfileId: string },
  message: string,
) => void;

export function recordCalendarFreeBusyInBackground(input: {
  tutorProfileId: string;
  ok: boolean;
  reason?: string | null;
  checkedAt: Date;
  record: CalendarFreeBusyHealthWrite;
  warn: CalendarHealthWarn;
}): void {
  void Promise.resolve()
    .then(() =>
      input.record({
        tutorProfileId: input.tutorProfileId,
        ok: input.ok,
        reason: input.reason,
        checkedAt: input.checkedAt,
      }),
    )
    .catch(() => {
      try {
        input.warn(
          { event: "calendar.health_write_failed", tutorProfileId: input.tutorProfileId },
          "health write failed",
        );
      } catch {
        // A log failure must not surface on the booking path.
      }
    });
}

function bookingFailureCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (!("code" in error) || typeof error.code !== "string") return null;
  if (!("status" in error) || typeof error.status !== "number") return null;
  return error.code;
}

export async function readTutorBusyWindows<T>(input: {
  tutorProfileId: string;
  connection: {
    lastFreeBusyAt?: Date | string | null;
    lastError?: string | null;
  };
  checkedAt?: Date;
  listBusy: () => Promise<T>;
  record: CalendarFreeBusyHealthWrite;
  warn: CalendarHealthWarn;
}): Promise<{ disconnected: false; busyWindows: T } | { disconnected: true }> {
  const checkedAt = input.checkedAt ?? new Date();
  try {
    const busyWindows = await input.listBusy();
    if (
      shouldWriteCalendarFreeBusySuccess({
        lastFreeBusyAt: input.connection.lastFreeBusyAt,
        lastError: input.connection.lastError,
        now: checkedAt.getTime(),
      })
    ) {
      recordCalendarFreeBusyInBackground({
        tutorProfileId: input.tutorProfileId,
        ok: true,
        checkedAt,
        record: input.record,
        warn: input.warn,
      });
    }
    return { disconnected: false, busyWindows };
  } catch (error) {
    const code = bookingFailureCode(error);
    recordCalendarFreeBusyInBackground({
      tutorProfileId: input.tutorProfileId,
      ok: false,
      reason: code ?? "calendar_check_failed",
      checkedAt,
      record: input.record,
      warn: input.warn,
    });
    if (code === "CALENDAR_DISCONNECTED") return { disconnected: true };
    throw error;
  }
}

function googleAccountRecorded(input: {
  hasRefreshToken: boolean;
  connectionStatus?: string | null;
  calendarId?: string | null;
  connectedAt?: Date | string | null;
  lastTokenRefreshAt?: Date | string | null;
  lastFreeBusyAt?: Date | string | null;
}): boolean {
  return (
    input.hasRefreshToken ||
    input.connectionStatus === "connected" ||
    Boolean(input.calendarId?.trim()) ||
    Boolean(input.connectedAt) ||
    Boolean(input.lastTokenRefreshAt) ||
    Boolean(input.lastFreeBusyAt)
  );
}

export function buildCalendarConnectionHealth(input: {
  tutorProfileId: string;
  name: string;
  portalEmail: string;
  active?: boolean | null;
  bookingEligible?: boolean | null;
  weeklyHours?: Record<string, unknown> | null;
  connectionStatus?: string | null;
  hasRefreshToken: boolean;
  googleAccountEmail?: string | null;
  calendarId?: string | null;
  grantedScopes?: string | null;
  appCalendarId?: string | null;
  connectedAt?: Date | string | null;
  lastTokenRefreshAt?: Date | string | null;
  lastFreeBusyAt?: Date | string | null;
  lastError?: string | null;
  lastErrorAt?: Date | string | null;
  now?: Date;
}): CalendarConnectionHealth {
  const now = input.now ?? new Date();
  const bookable = input.active !== false && input.bookingEligible === true;
  const row: CalendarConnectionHealth = {
    tutorProfileId: input.tutorProfileId,
    name: input.name,
    portalEmail: input.portalEmail,
    connectionStatus: input.hasRefreshToken ? "connected" : "disconnected",
    badge: calendarHealthBadge(input),
    googleAccountMasked:
      maskSensitiveCalendarValue(input.googleAccountEmail) ??
      (googleAccountRecorded(input) ? UNKNOWN_GOOGLE_ACCOUNT_LABEL : null),
    calendarIdMasked: maskSensitiveCalendarValue(input.calendarId),
    hasRefreshToken: input.hasRefreshToken,
    lastTokenRefreshAt: iso(input.lastTokenRefreshAt),
    lastFreeBusyAt: iso(input.lastFreeBusyAt),
    lastError: safeCalendarErrorMessage(input.lastError),
    lastErrorAt: iso(input.lastErrorAt),
    bookable,
    hasUpcomingBookableTime: hasUpcomingBookableTime(input),
    estimatedTokenAgeDays: estimatedTokenAgeDays(input.connectedAt, now),
    testingModeExpiryWarning: testingModeExpiryWarning({
      connectedAt: input.connectedAt,
      lastError: input.lastError,
      now,
    }),
  };
  return row;
}

export function calendarReconnectAlerts(
  rows: readonly CalendarConnectionHealth[],
): CalendarConnectionHealth[] {
  return rows.filter((row) => row.badge === "needs_reconnect" && row.hasUpcomingBookableTime);
}
