// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { grantLacksAppCreatedCalendar } from "./app-created-calendar.ts";

/** Google account that may issue Nika's fixed-window invites while her app calendar is missing. */
export const ADMIN_CALENDAR_ACCOUNT_EMAIL = "admin@acceptedadmissions.org";

export const ADMIN_CALENDAR_FALLBACK_NOTE = "Bookings use admin calendar fallback";

const NIKA_TUTOR_NAME = "Nika Raiffe";
const NIKA_TUTOR_EMAIL = "nika.raiffe@gmail.com";

export function isNikaTutorProfile(input: {
  name?: string | null;
  portalEmail?: string | null;
}): boolean {
  return (
    input.name?.trim() === NIKA_TUTOR_NAME ||
    input.portalEmail?.trim().toLowerCase() === NIKA_TUTOR_EMAIL
  );
}

/**
 * Nika's own Accepted Admissions calendar is not the writer.
 * The connections card and her tutor card say so until that calendar exists again.
 */
export function bookingsUseAdminCalendarFallback(input: {
  name?: string | null;
  portalEmail?: string | null;
  appCalendarId?: string | null;
}): boolean {
  if (!isNikaTutorProfile(input)) return false;
  return !input.appCalendarId?.trim();
}

/**
 * A stored admin grant can create events only on its app-created calendar.
 * calendar.app.created is the event-write scope this app requests.
 */
export function adminCalendarGrantCanWriteEvents(input: {
  googleAccountEmail?: string | null;
  portalEmail?: string | null;
  userEmail?: string | null;
  status?: string | null;
  hasRefreshToken: boolean;
  grantedScopes?: string | null;
  appCalendarId?: string | null;
}): boolean {
  const emails = [input.googleAccountEmail, input.portalEmail, input.userEmail]
    .map((email) => email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));
  if (!emails.includes(ADMIN_CALENDAR_ACCOUNT_EMAIL)) return false;
  if (input.status !== "connected") return false;
  if (!input.hasRefreshToken) return false;
  if (grantLacksAppCreatedCalendar(input.grantedScopes ?? null)) return false;
  if (!input.appCalendarId?.trim()) return false;
  return true;
}

export const MANUAL_CALENDAR_INVITE_KIND = "manual_calendar_invite";

/** Eastern wall time with an ET label, including during daylight saving. */
export function formatSessionInstantEt(start: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(start);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("month")} ${pick("day")}, ${pick("year")}, ${pick("hour")}:${pick("minute")} ${pick("dayPeriod").toUpperCase()} ET`;
}

/**
 * In-app copy when a fixed window is confirmed and nobody can write the invite.
 * Nika's sentence names her and her Gmail even if the stored portal email differs.
 */
export function manualCalendarInviteMessage(args: {
  bookerName: string;
  bookerEmail: string;
  tutorName: string;
  tutorEmail: string;
  start: Date;
  durationMinutes: number;
}): string {
  const nika = isNikaTutorProfile({ name: args.tutorName, portalEmail: args.tutorEmail });
  const tutorLabel = nika ? "Nika" : args.tutorName.trim();
  const tutorEmail = nika ? NIKA_TUTOR_EMAIL : args.tutorEmail.trim();
  return `Send calendar invite manually: ${args.bookerName.trim()} booked ${tutorLabel} ${formatSessionInstantEt(args.start)}, ${args.durationMinutes} minutes. Invite ${args.bookerEmail.trim()}, ${tutorEmail}, ${ADMIN_CALENDAR_ACCOUNT_EMAIL}.`;
}

/** conferenceData Meet link. Google requires conferenceDataVersion=1 on the write. */
export function adminCalendarMeetConference(requestId: string): {
  createRequest: { requestId: string; conferenceSolutionKey: { type: "hangoutsMeet" } };
} {
  return {
    createRequest: {
      requestId,
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  };
}
