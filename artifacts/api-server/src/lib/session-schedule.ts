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

/** SAT meetings on Taito's first Fall date (exact 9 PM JST slot or same UTC day). */
export function isOctober2FallSatSession(session: {
  dateTime: Date;
  subject: string;
}): boolean {
  if (normalizedSessionSubject(session.subject) !== "SAT") return false;
  if (isTaitoFirstSatSession(session)) return true;
  return session.dateTime.toISOString().slice(0, 10) === TAITO_FIRST_SAT_DATE_KEY;
}

export function sessionNeedsVisibilityRestore(session: {
  status: string;
  bookingStatus: string;
}): boolean {
  return session.status === "archived" || session.bookingStatus === "cancelled";
}

export function sessionVisibilityRestoreFields() {
  return {
    status: "published" as const,
    bookingStatus: "confirmed" as const,
    cancelledAt: null,
    cancellationReason: null,
  };
}

export function sessionBookingCancelFields(
  bookingStatus: string,
  existing?: {
    cancelledAt: Date | null;
    cancellationReason: string | null;
  },
) {
  if (bookingStatus === "cancelled") {
    return {
      cancelledAt: existing?.cancelledAt ?? new Date(),
      cancellationReason: existing?.cancellationReason ?? null,
    };
  }
  return {
    cancelledAt: null,
    cancellationReason: null,
  };
}

/** Oct 2 diagnostic meeting: prefer Sama (test client) + Xavier (temp tutor), else Taito + Eunice. */
export function resolveOctober2SessionPeople(input: {
  samaUserId?: string | null;
  taitoUserId?: string | null;
  xavierUserId?: string | null;
  euniceUserId?: string | null;
  existingClientUserId?: string | null;
  existingTutorUserId?: string | null;
}): { clientUserId: string | null; tutorUserId: string | null } {
  const clientUserId =
    input.samaUserId ?? input.taitoUserId ?? input.existingClientUserId ?? null;
  const existingTutor = input.existingTutorUserId ?? null;
  const keepExistingTutor =
    Boolean(existingTutor) &&
    (existingTutor === input.xavierUserId || existingTutor === input.euniceUserId);
  const tutorUserId = keepExistingTutor
    ? existingTutor
    : (input.xavierUserId ?? input.euniceUserId ?? existingTutor);
  return { clientUserId, tutorUserId };
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

/** SAT buy/book is student/client commerce. Tutor and admin chrome never advertise it. */
export function selfServeSatBookingForAccount(args: {
  role: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  if (args.role !== "student" && args.role !== "viewer") return false;
  return selfServeSatBookingForEmail(args.email);
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