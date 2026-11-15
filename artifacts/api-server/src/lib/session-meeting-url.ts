// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isSophiaLamasTutorProfile } from "./admin-calendar-fallback.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { neelNikaMeetUrl } from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isMichelleMakaremUser, SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SHARED_FALL_MEETING_URL,
  TAITO_STUDENT_EMAIL,
  isFall2026Term,
  isTaitoFallSession,
} from "./session-schedule.ts";

/** Sophia Sleiman's Google Meet room. Never Taito's shared Fall room. */
export const SOPHIA_SLEIMAN_MEET_URL = "https://meet.google.com/xqq-zivk-ewx";

/**
 * Michelle Makarem's dedicated Google Meet room. Used for her sessions with
 * any tutor, including Sophia Lamas. Never Sophia Sleiman's room and never
 * the shared Fall room.
 */
export const MICHELLE_MAKAREM_MEET_URL = "https://meet.google.com/ase-tqtz-ywj";

/** Same room as Michelle's dedicated Meet. Kept as an alias for existing call sites. */
export const SOPHIA_LAMAS_MEET_URL = MICHELLE_MAKAREM_MEET_URL;

export function isMichelleMakaremSessionClient(input: {
  clientUserId?: string | null;
  clientEmail?: string | null;
}): boolean {
  if (input.clientUserId === MICHELLE_MAKAREM_USER_ID) return true;
  return isMichelleMakaremUser({ email: input.clientEmail });
}

/** Join link for Michelle Makarem's sessions with any tutor. */
export function michelleMakaremMeetUrl(input: {
  clientUserId?: string | null;
  clientEmail?: string | null;
}): string | null {
  if (!isMichelleMakaremSessionClient(input)) return null;
  return googleMeetUrl(MICHELLE_MAKAREM_MEET_URL);
}

/** Join link for sessions with Sophia Lamas as the tutor. */
export function sophiaLamasMeetUrl(input: {
  tutorName?: string | null;
  tutorEmail?: string | null;
}): string | null {
  if (!isSophiaLamasTutorProfile({ name: input.tutorName, portalEmail: input.tutorEmail })) {
    return null;
  }
  return googleMeetUrl(SOPHIA_LAMAS_MEET_URL);
}

/**
 * Meet room attached to a booking invite.
 * Michelle Makarem uses her dedicated room with any tutor.
 * Sophia Lamas uses that same room (Michelle is currently the only client
 * who can book her). Every other tutor on this path keeps the shared Fall room.
 */
export function pinnedBookingMeetUrl(input: {
  tutorName?: string | null;
  tutorEmail?: string | null;
  clientUserId?: string | null;
  clientEmail?: string | null;
}): string | null {
  if (isMichelleMakaremSessionClient(input)) {
    return michelleMakaremMeetUrl(input);
  }
  if (isSophiaLamasTutorProfile({ name: input.tutorName, portalEmail: input.tutorEmail })) {
    return sophiaLamasMeetUrl(input);
  }
  return SHARED_FALL_MEETING_URL;
}

export type SessionMeetingInput = {
  meetUrl?: string | null;
  providerEventUrl?: string | null;
  courseMeetUrl?: string | null;
  term?: string | null;
  clientEmail?: string | null;
  clientUserId?: string | null;
  dateTime?: Date | null;
  subject?: string | null;
  timezone?: string | null;
  tutorName?: string | null;
  tutorEmail?: string | null;
};

/** https://meet.google.com/<code> only. Calendar htmlLinks are not join links. */
export function googleMeetUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "meet.google.com") return null;
    const code = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!code || code.includes("/")) return null;
    return `https://meet.google.com/${code}`;
  } catch {
    return null;
  }
}

export function normalizeAdminMeetUrl(
  value: string | null | undefined,
): { ok: true; meetUrl: string | null | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, meetUrl: undefined };
  if (value === null || value.trim() === "") return { ok: true, meetUrl: null };
  const meet = googleMeetUrl(value);
  if (!meet) return { ok: false };
  return { ok: true, meetUrl: meet };
}

function taitoKeepsSharedRoom(input: SessionMeetingInput): boolean {
  const email = input.clientEmail?.trim().toLowerCase() ?? "";
  if (email && email !== TAITO_STUDENT_EMAIL) return false;
  if (!email && input.clientUserId) return false;
  if (
    input.dateTime &&
    input.subject &&
    isTaitoFallSession({
      dateTime: input.dateTime,
      subject: input.subject,
      timezone: input.timezone,
      email: input.clientEmail,
      clientUserId: input.clientUserId,
    })
  ) {
    return true;
  }
  return email === TAITO_STUDENT_EMAIL && isFall2026Term(input.term);
}

/**
 * Join link for one session.
 * session.meetUrl, then a meet.google.com providerEventUrl, then a course Meet
 * link that is not the shared Fall room. The shared room is the final fallback
 * for every course that uses it, and for Taito's Fall sessions. Sophia's own
 * room is applied before that fallback.
 */
export function resolveSessionMeetingUrl(input: SessionMeetingInput): string | null {
  if (taitoKeepsSharedRoom(input)) return SHARED_FALL_MEETING_URL;
  const override = googleMeetUrl(input.meetUrl);
  if (override) return override;
  const provider = googleMeetUrl(input.providerEventUrl);
  if (provider) return provider;
  const course = googleMeetUrl(input.courseMeetUrl);
  if (course && course !== SHARED_FALL_MEETING_URL) return course;
  if (input.clientUserId === SOPHIA_SLEIMAN_SAT_USER_ID) return SOPHIA_SLEIMAN_MEET_URL;
  if (course === SHARED_FALL_MEETING_URL) return SHARED_FALL_MEETING_URL;
  return null;
}

export function studentFacingMeetingUrl(input: SessionMeetingInput): string | null {
  return (
    neelNikaMeetUrl({
      clientUserId: input.clientUserId,
      tutorName: input.tutorName,
      tutorEmail: input.tutorEmail,
    }) ??
    michelleMakaremMeetUrl({
      clientUserId: input.clientUserId,
      clientEmail: input.clientEmail,
    }) ??
    sophiaLamasMeetUrl({
      tutorName: input.tutorName,
      tutorEmail: input.tutorEmail,
    }) ??
    resolveSessionMeetingUrl(input)
  );
}

export type CoursePageJoinSession = {
  dateTime: Date;
  meetingUrl: string | null;
  bookingStatus?: string | null;
  durationMinutes?: number | null;
};

/**
 * Course-page "Join Meet" URL: the viewer's next (or in-progress) session
 * resolved join link. Hidden when there is no such session.
 */
export function coursePageJoinMeetUrl(
  sessions: readonly CoursePageJoinSession[],
  now: Date,
): string | null {
  const upcoming = sessions
    .filter((session) => {
      if (session.bookingStatus === "cancelled") return false;
      const start = session.dateTime.getTime();
      const durationMs = Math.max(0, Number(session.durationMinutes ?? 0)) * 60_000;
      return start + durationMs > now.getTime() || start >= now.getTime();
    })
    .sort((left, right) => left.dateTime.getTime() - right.dateTime.getTime());
  return upcoming[0]?.meetingUrl ?? null;
}

export type MeetingSession = {
  id: string;
  courseId: string;
  clientUserId?: string | null;
  meetUrl?: string | null;
  providerEventUrl?: string | null;
  dateTime: Date;
  subject: string;
  timezone: string;
  tutorName?: string | null;
  tutorEmail?: string | null;
};

export type MeetingContext = {
  courses: Map<string, { meetUrl: string | null; term: string | null }>;
  emails: Map<string, string>;
};

export function meetingUrlFromContext(
  session: MeetingSession,
  context: MeetingContext,
  tutor?: { name?: string | null; email?: string | null },
): string | null {
  const course = context.courses.get(session.courseId);
  return studentFacingMeetingUrl({
    meetUrl: session.meetUrl,
    providerEventUrl: session.providerEventUrl,
    courseMeetUrl: course?.meetUrl,
    term: course?.term,
    clientUserId: session.clientUserId,
    clientEmail: session.clientUserId ? context.emails.get(session.clientUserId) : null,
    dateTime: session.dateTime,
    subject: session.subject,
    timezone: session.timezone,
    tutorName: tutor?.name ?? session.tutorName,
    tutorEmail: tutor?.email ?? session.tutorEmail,
  });
}
