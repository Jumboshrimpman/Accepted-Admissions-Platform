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

export const SOPHIA_SLEIMAN_EMAIL = "sophiasleiman13@gmail.com";

/** True only for Taito's dedicated rih room. */
export function isTaitoSharedMeetUrl(url: string | null | undefined): boolean {
  return googleMeetUrl(url) === SHARED_FALL_MEETING_URL;
}

/**
 * A Meet URL that may be stored as a student's dedicated room.
 * Taito's rih room is never persisted for anyone else.
 */
export function persistableDedicatedMeetUrl(
  url: string | null | undefined,
): string | null {
  const meet = googleMeetUrl(url);
  if (!meet || isTaitoSharedMeetUrl(meet)) return null;
  return meet;
}

export function sophiaSleimanMeetUrl(input: {
  clientUserId?: string | null;
  clientEmail?: string | null;
}): string | null {
  const email = input.clientEmail?.trim().toLowerCase() ?? "";
  if (input.clientUserId === SOPHIA_SLEIMAN_SAT_USER_ID || email === SOPHIA_SLEIMAN_EMAIL) {
    return googleMeetUrl(SOPHIA_SLEIMAN_MEET_URL);
  }
  return null;
}

/**
 * Meet room attached to a new booking invite.
 * Michelle → ase, Sophia S → xqq, Sophia Lamas → ase, Taito → rih.
 * Neel uses a previously persisted hangoutLink, or null so Google can
 * create a fresh Meet. Nobody else is booked into Taito's rih room.
 */
export function pinnedBookingMeetUrl(input: {
  tutorName?: string | null;
  tutorEmail?: string | null;
  clientUserId?: string | null;
  clientEmail?: string | null;
  dedicatedMeetUrl?: string | null;
}): string | null {
  const email = input.clientEmail?.trim().toLowerCase() ?? "";
  if (email === TAITO_STUDENT_EMAIL) return SHARED_FALL_MEETING_URL;
  if (isMichelleMakaremSessionClient(input)) {
    return michelleMakaremMeetUrl(input);
  }
  const sophiaLamas = sophiaLamasMeetUrl(input);
  if (sophiaLamas) return sophiaLamas;
  const sophiaS = sophiaSleimanMeetUrl(input);
  if (sophiaS) return sophiaS;
  return persistableDedicatedMeetUrl(input.dedicatedMeetUrl);
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
  dedicatedMeetUrl?: string | null;
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
 * Taito's Fall sessions stay on rih. Other students never fall back to that
 * room: session.meetUrl and providerEventUrl that are rih are ignored,
 * then a non-shared course link, then Sophia S's dedicated room.
 */
export function resolveSessionMeetingUrl(input: SessionMeetingInput): string | null {
  if (taitoKeepsSharedRoom(input)) return SHARED_FALL_MEETING_URL;
  const override = persistableDedicatedMeetUrl(input.meetUrl);
  if (override) return override;
  const provider = persistableDedicatedMeetUrl(input.providerEventUrl);
  if (provider) return provider;
  const course = persistableDedicatedMeetUrl(input.courseMeetUrl);
  if (course) return course;
  return sophiaSleimanMeetUrl(input);
}

/**
 * Portal Join link.
 * Taito is always rih. An explicit session.meet_url wins next so an existing
 * event whose button could not be moved (e.g. Nov 22) can match the calendar.
 * New Michelle, Sophia S, and Sophia Lamas bookings persist their dedicated
 * rooms, so the portal stays on ase/xqq even if Google attaches rih.
 * Neel uses a persisted hangoutLink, never rih.
 */
export function studentFacingMeetingUrl(input: SessionMeetingInput): string | null {
  if (taitoKeepsSharedRoom(input)) return SHARED_FALL_MEETING_URL;
  const explicitMeetUrl = googleMeetUrl(input.meetUrl);
  return (
    explicitMeetUrl ??
    michelleMakaremMeetUrl({
      clientUserId: input.clientUserId,
      clientEmail: input.clientEmail,
    }) ??
    sophiaLamasMeetUrl({
      tutorName: input.tutorName,
      tutorEmail: input.tutorEmail,
    }) ??
    sophiaSleimanMeetUrl(input) ??
    neelNikaMeetUrl({
      clientUserId: input.clientUserId,
      tutorName: input.tutorName,
      tutorEmail: input.tutorEmail,
      dedicatedMeetUrl: input.dedicatedMeetUrl,
    }) ??
    persistableDedicatedMeetUrl(input.dedicatedMeetUrl) ??
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
