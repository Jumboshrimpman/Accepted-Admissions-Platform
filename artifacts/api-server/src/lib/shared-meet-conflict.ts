// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEETING_URL, isFall2026Term, meetingUrlForTerm } from "./session-schedule.ts";

/** Advisory-lock key so two different tutor/student pairs cannot both claim the shared room. */
export const SHARED_FALL_MEET_LOCK_KEY = "shared-meet:rih-iayt-okb";

export const SHARED_MEET_CONFLICT_MESSAGE =
  "That time overlaps another session using the shared Google Meet room. Choose a different slot.";

export function normalizeMeetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${host}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/** Half-open overlap: adjacent end==start is allowed. */
export function sessionsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

/**
 * The product assigns https://meet.google.com/rih-iayt-okb to:
 * - every Fall 2026 curriculum session (`meetingUrlForTerm`)
 * - any course whose stored Meet URL is that room
 * - SAT self-serve bookings (booking API always stamps this Meet)
 */
export function sessionClaimsSharedFallMeet(session: {
  term?: string | null;
  courseMeetUrl?: string | null;
  subject?: string | null;
}): boolean {
  if (isFall2026Term(session.term)) return true;
  if (meetingUrlForTerm(session.term, session.courseMeetUrl) === SHARED_FALL_MEETING_URL) {
    return true;
  }
  if (
    normalizeMeetUrl(session.courseMeetUrl) ===
    normalizeMeetUrl(SHARED_FALL_MEETING_URL)
  ) {
    return true;
  }
  const subject = session.subject?.trim().toLowerCase() ?? "";
  return subject === "sat" || subject.startsWith("sat ");
}

export function sharedMeetOccupancyWindows(
  sessions: Array<{
    dateTime: Date;
    durationMinutes: number;
    term?: string | null;
    courseMeetUrl?: string | null;
    subject?: string | null;
  }>,
): Array<{ start: string; end: string }> {
  return sessions
    .filter((session) => sessionClaimsSharedFallMeet(session))
    .map((session) => ({
      start: session.dateTime.toISOString(),
      end: new Date(
        session.dateTime.getTime() + session.durationMinutes * 60_000,
      ).toISOString(),
    }));
}
