// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { zonedDateTimeToUtc } from "./booking.ts";

export const TAITO_SESSION_TIMEZONE = "Asia/Tokyo";
export const TAITO_SESSION_TIME = "21:00";
export const TAITO_STUDENT_DISPLAY_NAME = "Taito";
export const TAITO_STUDENT_EMAIL = "taito0525@gmail.com";
export const EUNICE_TUTOR_EMAIL = "eunice_chon@berkeley.edu";
export const NIKA_TUTOR_EMAIL = "nika.raiffe@gmail.com";
export const SHARED_FALL_MEETING_URL = "https://meet.google.com/rih-iayt-okb";

export function isFall2026Term(term: string | null | undefined): boolean {
  return term?.trim().toLowerCase() === "fall 2026";
}

export function meetingUrlForTerm(
  term: string | null | undefined,
  fallback: string | null = null,
): string | null {
  return isFall2026Term(term) ? SHARED_FALL_MEETING_URL : fallback;
}

export const TAITO_FIRST_SAT_DATE_KEY = "2026-10-02";

export const TAITO_FALL_2026_SESSIONS = [
  { dateKey: TAITO_FIRST_SAT_DATE_KEY, subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-10-09", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-10-16", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-10-23", subject: "IELTS", tutorName: "Nika Raiffe", tutorEmail: NIKA_TUTOR_EMAIL },
  { dateKey: "2026-10-30", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-11-06", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-11-13", subject: "IELTS", tutorName: "Nika Raiffe", tutorEmail: NIKA_TUTOR_EMAIL },
  { dateKey: "2026-11-20", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-11-27", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-12-04", subject: "IELTS", tutorName: "Nika Raiffe", tutorEmail: NIKA_TUTOR_EMAIL },
  { dateKey: "2026-12-11", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
  { dateKey: "2026-12-18", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: EUNICE_TUTOR_EMAIL },
] as const;

export function taitoSessionDateTime(dateKey: string): Date {
  return zonedDateTimeToUtc(dateKey, TAITO_SESSION_TIME, TAITO_SESSION_TIMEZONE);
}

export function isTaitoFirstSatSession(session: {
  dateTime: Date;
  subject: string;
}): boolean {
  return (
    normalizedSessionSubject(session.subject) === "SAT" &&
    session.dateTime.getTime() === taitoSessionDateTime(TAITO_FIRST_SAT_DATE_KEY).getTime()
  );
}

export function isTaitoFallSession(session: {
  dateTime: Date;
  subject: string;
}): boolean {
  const dateKey = session.dateTime.toISOString().slice(0, 10);
  return TAITO_FALL_2026_SESSIONS.some(
    (scheduled) =>
      scheduled.dateKey === dateKey && scheduled.subject === session.subject,
  );
}

function participantFirstName(
  displayName: string | null | undefined,
  fallback: string,
): string {
  return displayName?.trim().split(/\s+/)[0] || fallback;
}

export function normalizedSessionSubject(subject: string): string {
  const normalized = subject.trim();
  const lower = normalized.toLowerCase();
  if (lower.startsWith("sat")) return "SAT";
  if (lower.startsWith("ielts") || lower.startsWith("english")) return "English";
  return normalized || "Tutoring";
}

export function sessionTitle(
  clientName: string | null | undefined,
  subject: string,
  tutorName: string | null | undefined,
): string {
  const client = participantFirstName(clientName, "Client");
  const tutor = participantFirstName(tutorName, "Tutor");
  return `${client}’s ${normalizedSessionSubject(subject)} Session with ${tutor}`;
}

/** Taito pays outside the platform; Michelle and other SAT clients use Stripe + credits. */
export function selfServeSatBookingForEmail(
  email: string | null | undefined,
): boolean {
  return email?.trim().toLowerCase() !== TAITO_STUDENT_EMAIL;
}

export function isGoogleCalendarEventUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return (
      (host === "calendar.google.com" ||
        host === "www.google.com" ||
        host.endsWith(".google.com")) &&
      (host.includes("calendar") ||
        path.includes("/calendar") ||
        parsed.searchParams.has("eid"))
    );
  } catch {
    return false;
  }
}

export function googleCalendarDayUrl(dateTime: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dateTime);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `https://calendar.google.com/calendar/r/day?date=${value("year")}${value("month")}${value("day")}`;
}

/** Public calendar deep-link only — never provider event IDs. */
export function calendarEventUrlForSession(session: {
  dateTime: Date;
  timezone: string;
  providerEventUrl?: string | null;
}): string {
  if (isGoogleCalendarEventUrl(session.providerEventUrl)) {
    return session.providerEventUrl!;
  }
  return googleCalendarDayUrl(session.dateTime, session.timezone);
}