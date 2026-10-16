// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { ADMIN_INBOX_EMAIL } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import type { GoogleCalendarAttendee } from "./google-calendar.ts";

/** Do not patch an event that starts this soon. Google would still be a write on a live session. */
export const ADMIN_ATTENDEE_BACKFILL_GUARD_MS = 60 * 60 * 1000;

export type AdminAttendeeBackfillSession = {
  sessionId: string;
  title: string;
  start: Date;
  tutorUserId: string | null;
  providerEventId: string;
};

export type AdminAttendeeBackfillReport = {
  dryRun: boolean;
  missing: Array<{
    sessionId: string;
    title: string;
    start: string;
    tutorUserId: string | null;
  }>;
  refused: Array<{
    sessionId: string;
    title: string;
    start: string;
    reason: "starts_within_60_minutes";
  }>;
  patched: string[];
  alreadyPresent: number;
  skipped: Array<{ sessionId: string; reason: string }>;
};

export function eventWithinAdminBackfillGuard(
  start: Date,
  now: Date,
  guardMs = ADMIN_ATTENDEE_BACKFILL_GUARD_MS,
): boolean {
  return start.getTime() - now.getTime() <= guardMs;
}

export function googleEventHasAdminAttendee(
  attendees: readonly { email?: string | null }[] | null | undefined,
): boolean {
  return (attendees ?? []).some(
    (attendee) => attendee.email?.trim().toLowerCase() === ADMIN_INBOX_EMAIL,
  );
}

/**
 * Keep every existing guest object, including RSVP, name, and optional.
 * Google's attendees PATCH replaces the whole list.
 */
export function attendeesIncludingAdmin<T extends GoogleCalendarAttendee>(
  attendees: readonly T[] | null | undefined,
): Array<T | { email: string }> {
  const existing = [...(attendees ?? [])];
  if (googleEventHasAdminAttendee(existing)) return existing;
  return [...existing, { email: ADMIN_INBOX_EMAIL }];
}

/**
 * Lists upcoming events missing admin@, or patches them.
 * The patch callback only accepts sendUpdates "none" so this path cannot notify guests.
 * It does not run on its own; an administrator must POST the backfill route.
 */
export async function backfillAdminCalendarAttendees<T extends GoogleCalendarAttendee>(input: {
  dryRun: boolean;
  now?: Date;
  sessions: readonly AdminAttendeeBackfillSession[];
  readAttendees: (
    session: AdminAttendeeBackfillSession,
  ) => Promise<readonly T[] | null>;
  patchAttendees: (
    session: AdminAttendeeBackfillSession,
    attendees: ReadonlyArray<T | { email: string }>,
    sendUpdates: "none",
  ) => Promise<void>;
}): Promise<AdminAttendeeBackfillReport> {
  const now = input.now ?? new Date();
  const report: AdminAttendeeBackfillReport = {
    dryRun: input.dryRun,
    missing: [],
    refused: [],
    patched: [],
    alreadyPresent: 0,
    skipped: [],
  };
  for (const session of input.sessions) {
    let attendees: readonly T[] | null;
    try {
      attendees = await input.readAttendees(session);
    } catch {
      report.skipped.push({ sessionId: session.sessionId, reason: "calendar_read_failed" });
      continue;
    }
    if (!attendees) {
      report.skipped.push({ sessionId: session.sessionId, reason: "event_unreadable" });
      continue;
    }
    if (googleEventHasAdminAttendee(attendees)) {
      report.alreadyPresent += 1;
      continue;
    }
    if (eventWithinAdminBackfillGuard(session.start, now)) {
      report.refused.push({
        sessionId: session.sessionId,
        title: session.title,
        start: session.start.toISOString(),
        reason: "starts_within_60_minutes",
      });
      continue;
    }
    const nextAttendees = attendeesIncludingAdmin(attendees);
    report.missing.push({
      sessionId: session.sessionId,
      title: session.title,
      start: session.start.toISOString(),
      tutorUserId: session.tutorUserId,
    });
    if (input.dryRun) continue;
    try {
      await input.patchAttendees(session, nextAttendees, "none");
      report.patched.push(session.sessionId);
    } catch {
      report.skipped.push({ sessionId: session.sessionId, reason: "patch_failed" });
    }
  }
  return report;
}
