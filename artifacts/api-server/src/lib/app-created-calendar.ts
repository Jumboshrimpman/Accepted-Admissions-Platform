// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  createSecondaryGoogleCalendar,
  getGoogleCalendar,
  GoogleCalendarRequestError,
  grantedScopesIncludeRequired,
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  isGoogleCalendarNotFound,
} from "./google-calendar.ts";

export const ACCEPTED_ADMISSIONS_CALENDAR_SUMMARY = "Accepted Admissions Sessions";
export const PRIMARY_CALENDAR_ID = "primary";

export { GOOGLE_CALENDAR_APP_CREATED_SCOPE };

/** Null or blank scopes are legacy grants issued before calendar.app.created. */
export function grantLacksAppCreatedCalendar(grantedScopes: string | null | undefined): boolean {
  if (grantedScopes == null || !grantedScopes.trim()) return true;
  return !grantedScopesIncludeRequired(grantedScopes, [GOOGLE_CALENDAR_APP_CREATED_SCOPE]);
}

/**
 * A stored refresh token that cannot manage the app calendar needs the existing
 * reconnect UX. Callers must not clear or revoke the grant.
 * Omitting both fields leaves older health checks unchanged.
 */
export function calendarGrantNeedsReconnect(input: {
  hasRefreshToken: boolean;
  grantedScopes?: string | null;
  appCalendarId?: string | null;
}): boolean {
  if (!input.hasRefreshToken) return false;
  if (input.grantedScopes === undefined && input.appCalendarId === undefined) return false;
  if (grantLacksAppCreatedCalendar(input.grantedScopes ?? null)) return true;
  return !input.appCalendarId?.trim();
}

/** Old session rows have no provider calendar id and live on primary. */
export function sessionEventCalendarId(stored: string | null | undefined): string {
  const trimmed = stored?.trim();
  return trimmed || PRIMARY_CALENDAR_ID;
}

/** Free/busy stays on the tutor's primary calendar and adds the app calendar. */
export function availabilityCalendarIds(appCalendarId: string | null | undefined): string[] {
  const ids = [PRIMARY_CALENDAR_ID];
  const app = appCalendarId?.trim();
  if (app && app.toLowerCase() !== PRIMARY_CALENDAR_ID) ids.push(app);
  return ids;
}

export function isLegacyCalendarWriteDenied(error: unknown): boolean {
  return (
    error instanceof GoogleCalendarRequestError &&
    (error.status === 403 || error.status === 404)
  );
}

export type StoredCalendarWriteResult<T> =
  | { status: "updated"; value: T }
  | { status: "manual" };

/**
 * Update or cancel on the stored calendar. A 403/404 on primary does not throw:
 * the event has to be edited by hand. Other calendars still surface the error.
 */
export async function runStoredCalendarWrite<T>(input: {
  calendarId: string | null | undefined;
  sessionId: string;
  write: () => Promise<T>;
  onManualEdit: (sessionId: string) => Promise<void>;
  /** Clears the stored app calendar id so the tutor is shown as needing reconnect. */
  onAppCalendarMissing?: () => Promise<void>;
  /** Present when the write can check whether the tutor deleted the secondary calendar. */
  accessToken?: string;
  log: (fields: {
    event: "calendar.legacy_event_unwritable";
    sessionId: string;
    status: number;
  }) => void;
}): Promise<StoredCalendarWriteResult<T>> {
  const calendarId = sessionEventCalendarId(input.calendarId);
  const manual = async (status: number, appCalendarDeleted = false) => {
    input.log({
      event: "calendar.legacy_event_unwritable",
      sessionId: input.sessionId,
      status,
    });
    await input.onManualEdit(input.sessionId);
    if (appCalendarDeleted) await input.onAppCalendarMissing?.();
    return { status: "manual" as const };
  };
  const storedAppCalendarDeleted = async (): Promise<boolean> => {
    if (calendarId === PRIMARY_CALENDAR_ID || !input.accessToken) return false;
    try {
      const calendar = await getGoogleCalendar(input.accessToken, calendarId);
      return !calendar.id;
    } catch (error) {
      if (isGoogleCalendarNotFound(error)) return true;
      throw error;
    }
  };
  const writeMissing = (value: T): boolean =>
    Boolean(
      value &&
        typeof value === "object" &&
        "missing" in value &&
        (value as { missing?: boolean }).missing === true,
    );
  try {
    const value = await input.write();
    if (writeMissing(value)) {
      if (calendarId === PRIMARY_CALENDAR_ID) return manual(404);
      if (await storedAppCalendarDeleted()) return manual(404, true);
    }
    return { status: "updated", value };
  } catch (error) {
    if (calendarId === PRIMARY_CALENDAR_ID && isLegacyCalendarWriteDenied(error)) {
      const status = error instanceof GoogleCalendarRequestError ? error.status : 0;
      return manual(status);
    }
    if (
      calendarId !== PRIMARY_CALENDAR_ID &&
      isGoogleCalendarNotFound(error) &&
      (await storedAppCalendarDeleted())
    ) {
      return manual(404, true);
    }
    throw error;
  }
}

/** Reuse the stored secondary calendar, or create "Accepted Admissions Sessions". */
export async function ensureAcceptedAdmissionsCalendar(
  accessToken: string,
  existingCalendarId?: string | null,
): Promise<string> {
  const existing = existingCalendarId?.trim();
  if (existing && existing.toLowerCase() !== PRIMARY_CALENDAR_ID) {
    try {
      const calendar = await getGoogleCalendar(accessToken, existing);
      if (calendar.id) return calendar.id;
    } catch (error) {
      if (!isGoogleCalendarNotFound(error)) throw error;
    }
  }
  const created = await createSecondaryGoogleCalendar(
    accessToken,
    ACCEPTED_ADMISSIONS_CALENDAR_SUMMARY,
  );
  if (!created.id?.trim()) {
    throw new GoogleCalendarRequestError(502, "calendar_id_missing", "Google did not return a calendar id");
  }
  return created.id;
}
