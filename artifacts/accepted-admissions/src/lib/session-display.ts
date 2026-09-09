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

export function sessionDateTimeLocalValue(
  dateTime: string | Date,
  timezone: string,
): string {
  const parts = partsFor(dateTime, timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");
  const hour = partValue(parts, "hour").padStart(2, "0");
  const minute = partValue(parts, "minute").padStart(2, "0");
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function utcIsoFromSessionLocalValue(localValue: string, timezone: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(localValue);
  if (!match) return new Date(localValue).toISOString();
  const [year, month, day] = match[1]!.split("-").map(Number);
  const [hour, minute] = match[2]!.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const observed = partsFor(guess, timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const num = (type: string) => Number(partValue(observed, type) || 0);
  const observedAsUtc = Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    num("hour"),
    num("minute"),
  );
  const requestedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess.getTime() - (observedAsUtc - requestedAsUtc)).toISOString();
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

export function sessionStartTimeFieldLabel(timezone: string): string {
  const trimmed = timezone.trim();
  return trimmed ? `Start time (${sessionTimezoneLabel(trimmed)})` : "Start time (session timezone)";
}

export function formatAdminBrowserLocalHint(
  dateTime: string | Date,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(asDate(dateTime));
  return `Your local: ${formatted}`;
}

/** Taito Goto / taito0525@gmail.com sessions are always 9–10pm JST. */
export const TAITO_SESSION_TIMEZONE = "Asia/Tokyo";
export const TAITO_SESSION_EMAIL = "taito0525@gmail.com";
export const TAITO_DEFAULT_START_LOCAL = "21:00";

/**
 * Match Taito from the admin clients list by email or by name
 * (`Taito Goto` / `Taito`). Case-insensitive.
 */
export function isTaitoSessionPerson(
  person: { name?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!person) return false;
  const email = person.email?.trim().toLowerCase() ?? "";
  if (email === TAITO_SESSION_EMAIL) return true;
  const name = person.name?.trim().toLowerCase() ?? "";
  return name === "taito goto" || name === "taito";
}

/**
 * Leftover empty / America/New_York defaults are treated as wrong for Taito.
 * Any other explicit IANA zone (including Asia/Tokyo) is left alone on edit.
 */
export function shouldApplyTaitoTimezone(timezone: string | null | undefined): boolean {
  const trimmed = timezone?.trim() ?? "";
  return trimmed.length === 0 || trimmed === "America/New_York";
}

/** Same calendar date (from the reference zone), 21:00 JST — duration 60 → 9–10pm. */
export function taitoCreateSessionSchedule(
  referenceDateTime: string | Date = new Date(),
  referenceTimezone: string = TAITO_SESSION_TIMEZONE,
): { timezone: string; dateTime: string } {
  const dateKey = sessionDateKey({
    dateTime: referenceDateTime,
    timezone: referenceTimezone.trim() || TAITO_SESSION_TIMEZONE,
  });
  return {
    timezone: TAITO_SESSION_TIMEZONE,
    dateTime: utcIsoFromSessionLocalValue(
      `${dateKey}T${TAITO_DEFAULT_START_LOCAL}`,
      TAITO_SESSION_TIMEZONE,
    ),
  };
}

/**
 * Create/new: prefer Asia/Tokyo + 21:00 JST on the draft's current calendar date
 * (so an Eastern afternoon is not rolled into the next JST day).
 * Edit: only replace empty or leftover America/New_York; do not rewrite the
 * stored UTC instant or an intentional timezone.
 */
export function applyTaitoStudentSchedule<
  T extends { dateTime: string; timezone: string },
>(draft: T, student: { name?: string | null; email?: string | null } | null | undefined, mode: "create" | "edit"): T {
  if (!isTaitoSessionPerson(student)) return draft;
  if (mode === "create") {
    return { ...draft, ...taitoCreateSessionSchedule(draft.dateTime, draft.timezone) };
  }
  if (shouldApplyTaitoTimezone(draft.timezone)) {
    return { ...draft, timezone: TAITO_SESSION_TIMEZONE };
  }
  return draft;
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

export function sessionEffectiveEnd(
  session: Pick<DisplaySession, "dateTime" | "durationMinutes">,
): Date {
  const start = asDate(session.dateTime);
  const minutes = Number(session.durationMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return new Date(start.getTime() + minutes * 60_000);
  }
  return start;
}

export function isPastSession(
  session: Pick<DisplaySession, "dateTime" | "durationMinutes">,
  now: Date = new Date(),
): boolean {
  return sessionEffectiveEnd(session).getTime() <= now.getTime();
}

export function canCancelOrRescheduleSession(
  session: Pick<DisplaySession, "dateTime" | "durationMinutes">,
  now: Date = new Date(),
): boolean {
  if (isPastSession(session, now)) return false;
  return asDate(session.dateTime).getTime() > now.getTime();
}

export function sessionScheduleChangeMessage(
  action: "cancel" | "reschedule",
  session: Pick<DisplaySession, "dateTime" | "durationMinutes">,
  now: Date = new Date(),
): string | null {
  if (isPastSession(session, now)) {
    return action === "cancel"
      ? "A past session cannot be cancelled."
      : "A past session cannot be rescheduled.";
  }
  if (asDate(session.dateTime).getTime() <= now.getTime()) {
    return action === "cancel"
      ? "A session that has started cannot be cancelled."
      : "A session that has started cannot be rescheduled.";
  }
  return null;
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

export function disclosedSessions<T>(
  sessions: readonly T[],
  expanded: boolean,
  initialCount = 3,
): readonly T[] {
  return expanded ? sessions : sessions.slice(0, initialCount);
}

export const DEFAULT_VISIBLE_UPCOMING_COUNT = 3;

export type ListedSession = {
  id: string;
  dateTime: string | Date;
  timezone: string;
  durationMinutes?: number | null;
  subject?: string | null;
  title?: string | null;
  meetingUrl?: string | null;
  calendarEventUrl?: string | null;
  status?: string | null;
  bookingStatus?: string | null;
  readiness?: string | null;
  courseId?: string;
  tutor?: { id?: string | null; name?: string | null } | null;
  tutorName?: string | null;
  tutorProfileId?: string | null;
  preparation?: { id?: string; title?: string } | null;
  latestResult?: { analysis?: unknown } | null;
  currentFocus?: string | null;
  nextAction?: string | null;
  hasReport?: boolean | null;
  hasHomework?: boolean | null;
};

function listedSessionTimezone(session: Pick<ListedSession, "timezone">): string {
  return session.timezone?.trim() || "UTC";
}

function listedSessionSubject(session: Pick<ListedSession, "subject">): string {
  return (session.subject ?? "").trim().toUpperCase();
}

function listedSessionTutorKey(session: Pick<ListedSession, "tutor" | "tutorName">): string {
  return (
    session.tutor?.id?.trim() ||
    session.tutor?.name?.trim().toLowerCase() ||
    session.tutorName?.trim().toLowerCase() ||
    ""
  );
}

export function listedSessionMeetingKey(
  session: Pick<ListedSession, "id" | "dateTime" | "timezone" | "subject" | "tutor" | "tutorName">,
): string {
  const dateKey = sessionDateKey({
    dateTime: session.dateTime,
    timezone: listedSessionTimezone(session),
  });
  return `${dateKey}|${listedSessionSubject(session)}|${listedSessionTutorKey(session)}`;
}

function listedSessionScore(session: ListedSession): number {
  let score = 0;
  if (session.preparation) score += 8;
  if (session.latestResult) score += 4;
  if (session.meetingUrl) score += 2;
  if (listedSessionTimezone(session).toLowerCase() === "asia/tokyo") score += 1;
  return score;
}

/** One row per session id, then one row per meeting (same local date + subject + tutor). */
export function uniqueListedSessions<T extends ListedSession>(sessions: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const session of sessions) {
    if (!byId.has(session.id)) byId.set(session.id, session);
  }

  const byMeeting = new Map<string, T>();
  for (const session of byId.values()) {
    const key = listedSessionMeetingKey(session);
    const existing = byMeeting.get(key);
    if (!existing || listedSessionScore(session) > listedSessionScore(existing)) {
      byMeeting.set(key, session);
    }
  }
  return [...byMeeting.values()];
}

export function isUpcomingListedSession(
  session: Pick<ListedSession, "dateTime" | "durationMinutes" | "status" | "readiness">,
  now: Date = new Date(),
): boolean {
  if (session.readiness === "complete") return false;
  if ((session.status ?? "").trim().toLowerCase() === "completed") return false;
  return !isPastSession(session, now);
}

export function collapsedListedSessions<T extends ListedSession>(
  sessions: readonly T[],
  expanded: boolean,
  now: Date = new Date(),
  initialCount = DEFAULT_VISIBLE_UPCOMING_COUNT,
): {
  upcoming: T[];
  past: T[];
  visible: T[];
  hiddenCount: number;
  canToggle: boolean;
} {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const session of sessions) {
    if (isUpcomingListedSession(session, now)) upcoming.push(session);
    else past.push(session);
  }
  const overflow = [...upcoming.slice(initialCount), ...past];
  return {
    upcoming,
    past,
    visible: expanded ? [...upcoming, ...past] : upcoming.slice(0, initialCount),
    hiddenCount: overflow.length,
    canToggle: overflow.length > 0,
  };
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