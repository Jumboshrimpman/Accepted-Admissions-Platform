import { and, eq } from "drizzle-orm";
import {
  availabilityRulesTable,
  calendarConnectionsTable,
  db,
  tutorProfilesTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { connectionHasRefreshToken } from "./calendar-persistence.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isRetiredTutorProfile } from "./calendar-profile-match.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  buildCalendarConnectionHealth,
  calendarReconnectAlerts,
  compareTutorConnectionOrder,
  safeCalendarErrorMessage,
  type CalendarConnectionHealth,
} from "./calendar-connection-health.ts";

type HourMap = Record<string, unknown>;

function hourMapHasOpenWindow(hours: HourMap | null | undefined): boolean {
  if (!hours) return false;
  return Object.values(hours).some((windows) => Array.isArray(windows) && windows.length > 0);
}

function asHourMap(value: unknown): HourMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as HourMap;
}

function asRecurringHours(value: unknown): { days?: HourMap | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const days = (value as { days?: unknown }).days;
  if (!days || typeof days !== "object" || Array.isArray(days)) return { days: null };
  return { days: days as HourMap };
}

function availabilityForProfile(
  rules: ReadonlyArray<{
    tutorProfileId: string;
    weeklyHours: unknown;
    dateHours: unknown;
    recurringHours: unknown;
  }>,
  tutorProfileId: string,
): {
  weeklyHours: HourMap;
  dateHours: HourMap;
  recurringHours: { days?: HourMap | null } | null;
} {
  const matches = rules.filter((rule) => rule.tutorProfileId === tutorProfileId);
  const withWindows = matches.find((rule) => {
    const recurring = asRecurringHours(rule.recurringHours);
    return (
      hourMapHasOpenWindow(asHourMap(rule.weeklyHours)) ||
      hourMapHasOpenWindow(asHourMap(rule.dateHours)) ||
      hourMapHasOpenWindow(recurring?.days)
    );
  });
  const rule = withWindows ?? matches[0];
  return {
    weeklyHours: asHourMap(rule?.weeklyHours),
    dateHours: asHourMap(rule?.dateHours),
    recurringHours: rule ? asRecurringHours(rule.recurringHours) : null,
  };
}

export async function listPublicCalendarConnectionHealth(): Promise<CalendarConnectionHealth[]> {
  const [profiles, connections, rules] = await Promise.all([
    db
      .select({
        id: tutorProfilesTable.id,
        name: tutorProfilesTable.name,
        email: tutorProfilesTable.email,
        active: tutorProfilesTable.active,
        bookingEligible: tutorProfilesTable.bookingEligible,
        internalNotes: tutorProfilesTable.internalNotes,
      })
      .from(tutorProfilesTable),
    db
      .select({
        tutorProfileId: calendarConnectionsTable.tutorProfileId,
        status: calendarConnectionsTable.status,
        calendarId: calendarConnectionsTable.calendarId,
        appCalendarId: calendarConnectionsTable.appCalendarId,
        grantedScopes: calendarConnectionsTable.grantedScopes,
        encryptedRefreshToken: calendarConnectionsTable.encryptedRefreshToken,
        connectedAt: calendarConnectionsTable.connectedAt,
        googleAccountEmail: calendarConnectionsTable.googleAccountEmail,
        lastTokenRefreshAt: calendarConnectionsTable.lastTokenRefreshAt,
        lastFreeBusyAt: calendarConnectionsTable.lastFreeBusyAt,
        lastError: calendarConnectionsTable.lastError,
        lastErrorAt: calendarConnectionsTable.lastErrorAt,
      })
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.provider, "google")),
    db
      .select({
        tutorProfileId: availabilityRulesTable.tutorProfileId,
        weeklyHours: availabilityRulesTable.weeklyHours,
        dateHours: availabilityRulesTable.dateHours,
        recurringHours: availabilityRulesTable.recurringHours,
      })
      .from(availabilityRulesTable),
  ]);

  const connectionByProfile = new Map(
    connections.map((connection) => [connection.tutorProfileId, connection]),
  );

  return profiles
    .filter((profile) => !isRetiredTutorProfile(profile))
    .map((profile) => {
      const connection = connectionByProfile.get(profile.id);
      return buildCalendarConnectionHealth({
        tutorProfileId: profile.id,
        name: profile.name,
        portalEmail: profile.email,
        active: profile.active,
        bookingEligible: profile.bookingEligible,
        ...availabilityForProfile(rules, profile.id),
        connectionStatus: connection?.status,
        hasRefreshToken: connection ? connectionHasRefreshToken(connection) : false,
        googleAccountEmail: connection?.googleAccountEmail,
        calendarId: connection?.appCalendarId ?? connection?.calendarId,
        grantedScopes: connection?.grantedScopes,
        appCalendarId: connection?.appCalendarId,
        connectedAt: connection?.connectedAt,
        lastTokenRefreshAt: connection?.lastTokenRefreshAt,
        lastFreeBusyAt: connection?.lastFreeBusyAt,
        lastError: connection?.lastError,
        lastErrorAt: connection?.lastErrorAt,
      });
    })
    .sort((left, right) => compareTutorConnectionOrder(left.name, right.name));
}

export async function publicCalendarConnectionHealth(
  tutorProfileId: string,
): Promise<CalendarConnectionHealth | null> {
  const rows = await listPublicCalendarConnectionHealth();
  return rows.find((row) => row.tutorProfileId === tutorProfileId) ?? null;
}

export async function listCalendarReconnectAlerts(): Promise<
  Array<{
    tutorProfileId: string;
    name: string;
    estimatedTokenAgeDays: number | null;
    testingModeExpiryWarning: string | null;
  }>
> {
  const rows = await listPublicCalendarConnectionHealth();
  return calendarReconnectAlerts(rows).map((row) => ({
    tutorProfileId: row.tutorProfileId,
    name: row.name,
    estimatedTokenAgeDays: row.estimatedTokenAgeDays,
    testingModeExpiryWarning: row.testingModeExpiryWarning,
  }));
}

export async function recordCalendarFreeBusyCheck(input: {
  tutorProfileId: string;
  ok: boolean;
  reason?: string | null;
  checkedAt?: Date;
}): Promise<void> {
  const checkedAt = input.checkedAt ?? new Date();
  const message = input.ok
    ? null
    : (safeCalendarErrorMessage(input.reason) ?? "The free/busy check failed.");
  const changes = input.ok
    ? {
        lastFreeBusyAt: checkedAt,
        lastError: null,
        lastErrorAt: null,
        updatedAt: checkedAt,
      }
    : {
        lastError: message,
        lastErrorAt: checkedAt,
        updatedAt: checkedAt,
      };
  const updated = await db
    .update(calendarConnectionsTable)
    .set(changes)
    .where(
      and(
        eq(calendarConnectionsTable.tutorProfileId, input.tutorProfileId),
        eq(calendarConnectionsTable.provider, "google"),
      ),
    )
    .returning({ id: calendarConnectionsTable.id });
  if (updated.length > 0 || input.ok) return;
  await db
    .insert(calendarConnectionsTable)
    .values({
      tutorProfileId: input.tutorProfileId,
      provider: "google",
      status: "disconnected",
      lastError: message,
      lastErrorAt: checkedAt,
      updatedAt: checkedAt,
    })
    .onConflictDoUpdate({
      target: [calendarConnectionsTable.tutorProfileId, calendarConnectionsTable.provider],
      set: changes,
    });
}
