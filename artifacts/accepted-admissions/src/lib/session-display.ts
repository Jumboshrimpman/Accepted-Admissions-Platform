export type DisplaySession = {
  dateTime: string | Date;
  timezone: string;
  durationMinutes?: number | null;
  subject?: string;
  title?: string;
  student?: { name: string } | null;
};

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function partsFor(
  value: string | Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).formatToParts(
    asDate(value),
  );
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function sessionDateKey(session: Pick<DisplaySession, "dateTime" | "timezone">): string {
  const parts = partsFor(session.dateTime, session.timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

export function formatSessionDate(
  session: Pick<DisplaySession, "dateTime" | "timezone">,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: session.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(asDate(session.dateTime));
}

function formatSessionTime(
  value: string | Date,
  timezone: string,
): { hour: string; minute: string; period: string } {
  const parts = partsFor(value, timezone, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  });
  return {
    hour: partValue(parts, "hour"),
    minute: partValue(parts, "minute"),
    period: partValue(parts, "dayPeriod"),
  };
}

export function sessionTimezoneLabel(timezone: string): string {
  return timezone === "Asia/Tokyo" ? "JST" : timezone;
}

export function formatSessionTimeRange(
  session: Pick<DisplaySession, "dateTime" | "timezone" | "durationMinutes">,
): string {
  const start = asDate(session.dateTime);
  const end = new Date(
    start.getTime() + (session.durationMinutes ?? 60) * 60_000,
  );
  const startTime = formatSessionTime(start, session.timezone);
  const endTime = formatSessionTime(end, session.timezone);
  const samePeriod = startTime.period === endTime.period;
  const left = `${startTime.hour}:${startTime.minute}`;
  const right = `${endTime.hour}:${endTime.minute}`;
  const range = samePeriod
    ? `${left}–${right} ${endTime.period}`
    : `${left} ${startTime.period}–${right} ${endTime.period}`;
  return `${range} ${sessionTimezoneLabel(session.timezone)}`;
}

export function formatSessionDateTime(
  session: Pick<DisplaySession, "dateTime" | "timezone" | "durationMinutes">,
): string {
  return `${formatSessionDate(session)} · ${formatSessionTimeRange(session)}`;
}

export function sessionSubjectLabel(subject: string): string {
  return subject.trim().toUpperCase() === "IELTS" ? "English" : subject;
}

export function displaySessionTitle(title: string, subject: string): string {
  if (sessionSubjectLabel(subject) !== "English" || !title.startsWith("IELTS")) {
    return title;
  }
  return `English${title.slice("IELTS".length)}`;
}

export function sessionStudentLabel(
  session: Pick<DisplaySession, "dateTime" | "timezone" | "subject" | "student">,
): string {
  if (session.student?.name) return session.student.name;
  const dateKey = sessionDateKey(session);
  const isApprovedFallDate = [
    "2026-10-02",
    "2026-10-09",
    "2026-10-16",
    "2026-10-23",
    "2026-10-30",
    "2026-11-06",
    "2026-11-13",
    "2026-11-20",
    "2026-11-27",
    "2026-12-04",
    "2026-12-11",
    "2026-12-18",
  ].includes(dateKey);
  return isApprovedFallDate &&
    (session.subject?.trim().toUpperCase() === "SAT" ||
      session.subject?.trim().toUpperCase() === "IELTS")
    ? "Taito"
    : "Student to be confirmed";
}