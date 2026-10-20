export const TAITO_ENGLISH_PACKET_DATE_KEYS = ["2026-10-23", "2026-11-13", "2026-12-04"] as const;

export const NIKA_PACKET_TUTOR_EMAIL = "nika.raiffe@gmail.com";

function dateKeyInZone(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const key = `${value("year")}-${value("month")}-${value("day")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

export function isTaitoEnglishPacketSession(session: {
  dateTime: Date | string;
  timezone?: string | null;
  subject?: string | null;
  studentName?: string | null;
}): boolean {
  const subject = (session.subject ?? "").trim().toLowerCase();
  if (!subject.startsWith("ielts") && !subject.startsWith("english")) return false;
  const date = session.dateTime instanceof Date ? session.dateTime : new Date(session.dateTime);
  if (Number.isNaN(date.getTime())) return false;
  const keys = [
    dateKeyInZone(date, session.timezone || "Asia/Tokyo"),
    dateKeyInZone(date, "Asia/Tokyo"),
    date.toISOString().slice(0, 10),
  ].filter((key): key is string => Boolean(key));
  if (!TAITO_ENGLISH_PACKET_DATE_KEYS.some((dateKey) => keys.includes(dateKey))) return false;
  const student = session.studentName?.trim().toLowerCase() ?? "";
  if (student && !student.startsWith("taito")) return false;
  return true;
}

/** Nika and administrators only. Students, viewers, and other tutors are excluded. */
export function viewerMayDownloadEnglishPacket(viewer: {
  role?: string | null;
  email?: string | null;
}): boolean {
  if (viewer.role === "administrator") return true;
  if (viewer.role !== "tutor") return false;
  return viewer.email?.trim().toLowerCase() === NIKA_PACKET_TUTOR_EMAIL;
}
