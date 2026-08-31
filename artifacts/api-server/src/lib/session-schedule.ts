// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { zonedDateTimeToUtc } from "./booking.ts";

export const TAITO_SESSION_TIMEZONE = "Asia/Tokyo";
export const TAITO_SESSION_TIME = "21:00";

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

export function sessionTitle(subject: string, tutorName: string): string {
  return `${subject} session with ${tutorName}`;
}