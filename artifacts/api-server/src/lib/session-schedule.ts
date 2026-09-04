// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { zonedDateTimeToUtc } from "./booking.ts";

export const TAITO_SESSION_TIMEZONE = "Asia/Tokyo";
export const TAITO_SESSION_TIME = "21:00";
export const TAITO_STUDENT_DISPLAY_NAME = "Taito";
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

export const TAITO_FALL_2026_SESSIONS = [
  { dateKey: "2026-10-02", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-10-09", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-10-16", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-10-23", subject: "IELTS", tutorName: "Nika Raiffe", tutorEmail: "nika.raiffe@gmail.com" },
  { dateKey: "2026-10-30", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-11-06", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-11-13", subject: "IELTS", tutorName: "Nika Raiffe", tutorEmail: "nika.raiffe@gmail.com" },
  { dateKey: "2026-11-20", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-11-27", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-12-04", subject: "IELTS", tutorName: "Nika Raiffe", tutorEmail: "nika.raiffe@gmail.com" },
  { dateKey: "2026-12-11", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
  { dateKey: "2026-12-18", subject: "SAT", tutorName: "Eunice Chon", tutorEmail: "eunice_chon@berkeley.edu" },
] as const;

export function taitoSessionDateTime(dateKey: string): Date {
  return zonedDateTimeToUtc(dateKey, TAITO_SESSION_TIME, TAITO_SESSION_TIMEZONE);
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