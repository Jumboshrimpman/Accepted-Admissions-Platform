export type AvailabilityWindow = { start: string; end: string };
export type AvailabilityRule = {
  timezone: string;
  weeklyHours: Record<string, AvailabilityWindow[]>;
  bookingNoticeMinutes: number;
  bufferMinutes: number;
  blackoutDates: string[];
};

/** SAT self-serve booking uses America/New_York local civil time. */
export const SAT_BOOKING_TIMEZONE = "America/New_York";
/** First bookable local start (inclusive). */
export const SAT_BOOKING_WINDOW_START = "07:00";
/** Last bookable local end (exclusive of a new start). 60-minute slots run 07:00–20:00. */
export const SAT_BOOKING_WINDOW_END = "21:00";
const SAT_BOOKING_WEEKDAYS = ["1", "2", "3", "4", "5"] as const;
const XAVIER_BOOKING_DAYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

function weeklyHoursForDays(
  days: readonly string[],
): Record<string, AvailabilityWindow[]> {
  return Object.fromEntries(
    days.map((day) => [
      day,
      [{ start: SAT_BOOKING_WINDOW_START, end: SAT_BOOKING_WINDOW_END }],
    ]),
  );
}

/** Eunice and other SAT tutors: Mon–Fri 07:00–21:00 ET. */
export const SAT_BOOKING_WEEKLY_HOURS = weeklyHoursForDays(SAT_BOOKING_WEEKDAYS);

/** Xavier: every civil day Sun–Sat 07:00–21:00 ET. */
export const XAVIER_BOOKING_WEEKLY_HOURS = weeklyHoursForDays(XAVIER_BOOKING_DAYS);

export function satTutorWeeklyHours(
  tutorName: string,
): Record<string, AvailabilityWindow[]> {
  return tutorName === "Xavier Morales"
    ? XAVIER_BOOKING_WEEKLY_HOURS
    : SAT_BOOKING_WEEKLY_HOURS;
}

export type BusyWindow = { start: string; end: string };

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function dateKey(parts: Pick<LocalParts, "year" | "month" | "day">): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function utcDateForKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function zonedDateTimeToUtc(dateKeyValue: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKeyValue.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const observed = localParts(guess, timeZone);
  const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
  const requestedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess.getTime() - (observedAsUtc - requestedAsUtc));
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function overlapsBusyWindow(
  start: Date,
  end: Date,
  windows: BusyWindow[],
  bufferMinutes = 0,
): boolean {
  const bufferedStart = start.getTime() - bufferMinutes * 60_000;
  const bufferedEnd = end.getTime() + bufferMinutes * 60_000;
  return windows.some((window) => {
    const busyStart = Date.parse(window.start);
    const busyEnd = Date.parse(window.end);
    return bufferedStart < busyEnd && bufferedEnd > busyStart;
  });
}

export function generateAvailableSlots(
  rule: AvailabilityRule,
  from: Date,
  to: Date,
  durationMinutes: number,
  busyWindows: BusyWindow[],
  bookedWindows: BusyWindow[],
  now = new Date(),
): string[] {
  if (durationMinutes <= 0 || from >= to) return [];
  const first = localParts(from, rule.timezone);
  const last = localParts(new Date(to.getTime() - 1), rule.timezone);
  const slots: string[] = [];
  const minimumStart = new Date(now.getTime() + rule.bookingNoticeMinutes * 60_000);
  const allBusy = [...busyWindows, ...bookedWindows];
  for (
    let cursor = utcDateForKey(dateKey(first));
    cursor <= utcDateForKey(dateKey(last));
    cursor = addDays(cursor, 1)
  ) {
    const key = cursor.toISOString().slice(0, 10);
    if (rule.blackoutDates.includes(key)) continue;
    const windows = rule.weeklyHours[String(cursor.getUTCDay())] ?? [];
    for (const window of windows) {
      for (let startMinutes = minutes(window.start); startMinutes + durationMinutes <= minutes(window.end); startMinutes += durationMinutes) {
        const start = zonedDateTimeToUtc(key, `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`, rule.timezone);
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        if (start < from || end > to || start < minimumStart) continue;
        if (overlapsBusyWindow(start, end, allBusy, rule.bufferMinutes)) continue;
        slots.push(start.toISOString());
      }
    }
  }
  return slots;
}

export function calendarEventPayload(
  title: string,
  start: Date,
  durationMinutes: number,
  timeZone: string,
  attendeeEmail: string,
  location?: string,
) {
  return {
    summary: title,
    description: "Accepted Admissions tutoring session",
    ...(location ? { location } : {}),
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: new Date(start.getTime() + durationMinutes * 60_000).toISOString(), timeZone },
    attendees: [{ email: attendeeEmail }],
  };
}