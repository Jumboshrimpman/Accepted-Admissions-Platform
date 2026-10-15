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

function subjectClaimsSharedRoom(subject: string | null | undefined): boolean {
  const normalized = subject?.trim().toLowerCase() ?? "";
  return (
    normalized === "sat" ||
    normalized.startsWith("sat ") ||
    normalized === "college consulting"
  );
}

/**
 * https://meet.google.com/rih-iayt-okb is the default room.
 * A session occupies it when:
 * - its course or session Meet URL is that room
 * - the term is Fall 2026 or the subject is SAT or College Consulting
 *   (those bookings always use this room)
 * - no different Meet URL is stored (a null URL is this room, not an empty room)
 * An explicit different Meet URL does not occupy it unless the term or subject
 * above forces the shared room.
 */
export function sessionClaimsSharedFallMeet(session: {
  term?: string | null;
  courseMeetUrl?: string | null;
  meetingUrl?: string | null;
  subject?: string | null;
}): boolean {
  const shared = normalizeMeetUrl(SHARED_FALL_MEETING_URL);
  const courseUrl = normalizeMeetUrl(session.courseMeetUrl);
  const meetingUrl = normalizeMeetUrl(session.meetingUrl);
  if (courseUrl === shared || meetingUrl === shared) return true;
  if (isFall2026Term(session.term)) return true;
  if (meetingUrlForTerm(session.term, session.courseMeetUrl) === SHARED_FALL_MEETING_URL) {
    return true;
  }
  if (subjectClaimsSharedRoom(session.subject)) return true;
  return !courseUrl && !meetingUrl;
}

export function sharedMeetOverlapKey(
  leftId: string,
  rightId: string,
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): string {
  const [firstId, secondId] = [leftId, rightId].sort();
  const overlapStart = new Date(
    Math.max(leftStart.getTime(), rightStart.getTime()),
  ).toISOString();
  const overlapEnd = new Date(
    Math.min(leftEnd.getTime(), rightEnd.getTime()),
  ).toISOString();
  return `${firstId}:${secondId}:${overlapStart}:${overlapEnd}`;
}

export type SharedMeetOverlapSession = {
  id: string;
  title: string;
  dateTime: Date;
  durationMinutes: number;
  term?: string | null;
  courseMeetUrl?: string | null;
  meetingUrl?: string | null;
  subject?: string | null;
};

export type SharedMeetOverlapPair = {
  overlapKey: string;
  leftSessionId: string;
  rightSessionId: string;
  leftTitle: string;
  rightTitle: string;
  start: string;
  end: string;
};

/** Live pairs of sessions that both occupy the shared room at the same time. */
export function sharedMeetOverlapPairs(
  sessions: readonly SharedMeetOverlapSession[],
): SharedMeetOverlapPair[] {
  const claiming = sessions.filter((session) => sessionClaimsSharedFallMeet(session));
  const pairs: SharedMeetOverlapPair[] = [];
  for (let index = 0; index < claiming.length; index += 1) {
    const left = claiming[index]!;
    const leftEnd = new Date(left.dateTime.getTime() + left.durationMinutes * 60_000);
    for (let next = index + 1; next < claiming.length; next += 1) {
      const right = claiming[next]!;
      const rightEnd = new Date(right.dateTime.getTime() + right.durationMinutes * 60_000);
      if (!sessionsOverlap(left.dateTime, leftEnd, right.dateTime, rightEnd)) continue;
      const [first, second] =
        left.id < right.id ? [left, right] : [right, left];
      const firstEnd = new Date(first.dateTime.getTime() + first.durationMinutes * 60_000);
      const secondEnd = new Date(second.dateTime.getTime() + second.durationMinutes * 60_000);
      pairs.push({
        overlapKey: sharedMeetOverlapKey(
          first.id,
          second.id,
          first.dateTime,
          firstEnd,
          second.dateTime,
          secondEnd,
        ),
        leftSessionId: first.id,
        rightSessionId: second.id,
        leftTitle: first.title,
        rightTitle: second.title,
        start: new Date(
          Math.max(first.dateTime.getTime(), second.dateTime.getTime()),
        ).toISOString(),
        end: new Date(Math.min(firstEnd.getTime(), secondEnd.getTime())).toISOString(),
      });
    }
  }
  return pairs;
}

/** Pairs whose sessions have not ended. Historical overlaps stay off the admin banner. */
export function upcomingSharedMeetOverlapPairs(
  sessions: readonly SharedMeetOverlapSession[],
  now: Date = new Date(),
): SharedMeetOverlapPair[] {
  const upcoming = sessions.filter((session) => {
    const end = session.dateTime.getTime() + session.durationMinutes * 60_000;
    return end > now.getTime();
  });
  return sharedMeetOverlapPairs(upcoming);
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
