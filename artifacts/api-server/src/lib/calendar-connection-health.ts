export type CalendarHealthBadge =
  | "healthy"
  | "needs_attention"
  | "needs_reconnect"
  | "not_connected";

export const UNKNOWN_GOOGLE_ACCOUNT_LABEL = "Unknown (reconnect to record)";
export const CALENDAR_CONNECTION_TEST_COOLDOWN_MS = 45_000;

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

export function calendarHealthBadge(input: {
  hasRefreshToken: boolean;
  connectedAt?: Date | string | null;
  lastError?: string | null;
}): CalendarHealthBadge {
  const error = input.lastError?.trim() ?? "";
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

export function preserveRevokedCalendarTestReason(
  existing: string | null | undefined,
  next: string | null,
): string | null {
  const current = existing?.trim() ?? "";
  if (current && /revoked|invalid_grant/i.test(current)) return current;
  return next;
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
  connectedAt?: Date | string | null;
  lastTokenRefreshAt?: Date | string | null;
  lastFreeBusyAt?: Date | string | null;
  lastError?: string | null;
  lastErrorAt?: Date | string | null;
}): CalendarConnectionHealth {
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
  };
  return row;
}

export function calendarReconnectAlerts(
  rows: readonly CalendarConnectionHealth[],
): CalendarConnectionHealth[] {
  return rows.filter((row) => row.badge === "needs_reconnect" && row.hasUpcomingBookableTime);
}
