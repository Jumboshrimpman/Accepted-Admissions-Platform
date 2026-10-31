// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { neelNikaMeetUrl } from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SHARED_FALL_MEETING_URL,
  TAITO_STUDENT_EMAIL,
  isFall2026Term,
  isTaitoFallSession,
} from "./session-schedule.ts";

/** Sophia Sleiman's Google Meet room. Never Taito's shared Fall room. */
export const SOPHIA_SLEIMAN_MEET_URL = "https://meet.google.com/xqq-zivk-ewx";

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
 * session.meetUrl, then a meet.google.com providerEventUrl, then the course
 * Meet link. The shared Fall room is only Taito's last resort.
 */
export function resolveSessionMeetingUrl(input: SessionMeetingInput): string | null {
  if (taitoKeepsSharedRoom(input)) return SHARED_FALL_MEETING_URL;
  const override = googleMeetUrl(input.meetUrl);
  if (override) return override;
  const provider = googleMeetUrl(input.providerEventUrl);
  if (provider && provider !== SHARED_FALL_MEETING_URL) return provider;
  if (provider && input.clientUserId !== SOPHIA_SLEIMAN_SAT_USER_ID) return provider;
  const course = googleMeetUrl(input.courseMeetUrl);
  if (course && course !== SHARED_FALL_MEETING_URL) return course;
  if (input.clientUserId === SOPHIA_SLEIMAN_SAT_USER_ID) return SOPHIA_SLEIMAN_MEET_URL;
  if (course === SHARED_FALL_MEETING_URL) return null;
  return null;
}

export function studentFacingMeetingUrl(input: SessionMeetingInput): string | null {
  return (
    neelNikaMeetUrl({
      clientUserId: input.clientUserId,
      tutorName: input.tutorName,
      tutorEmail: input.tutorEmail,
    }) ?? resolveSessionMeetingUrl(input)
  );
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
