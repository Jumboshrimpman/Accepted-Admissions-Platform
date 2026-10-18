// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  adminAttendeeEmailsForPair,
  mergeCalendarAttendees,
  type CalendarInviteParty,
} from "./calendar-pair-attendees.ts";

export type { CalendarInviteParty };

/** Portal bookings. 30, 150, and 180 stay rejected. */
export const BOOKABLE_PORTAL_DURATIONS = [60, 90, 120] as const;

/** New tutors, and every tutor except Nika. */
export const DEFAULT_BOOKING_NOTICE_MINUTES = 4 * 60;
/** Nika Raiffe. Clients cannot book her inside this window. */
export const NIKA_BOOKING_NOTICE_MINUTES = 8 * 60;

export function bookingNoticeMinutesForTutor(name: string): number {
  return name === "Nika Raiffe" ? NIKA_BOOKING_NOTICE_MINUTES : DEFAULT_BOOKING_NOTICE_MINUTES;
}

export function isBookablePortalDuration(minutes: number): boolean {
  return minutes === 60 || minutes === 90 || minutes === 120;
}

export type AvailabilityWindow = { start: string; end: string };
export type AvailabilityRule = {
  timezone: string;
  weeklyHours: Record<string, AvailabilityWindow[]>;
  /**
   * Civil dates in the tutor's timezone. A present key replaces weekly hours
   * for that date. An empty list means the tutor is not bookable that day.
   * Inside the earliest-to-latest listed dates, a missing key is closed too.
   * Dates outside that span keep the weekly hours.
   */
  dateHours?: Record<string, AvailabilityWindow[]>;
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

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CIVIL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Admin date overrides. Keys are YYYY-MM-DD. Windows are HH:MM, start before end. */
export function parseDateHours(
  value: unknown,
): { ok: true; dateHours: Record<string, AvailabilityWindow[]> } | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "dateHours must be an object of dates." };
  }
  const dateHours: Record<string, AvailabilityWindow[]> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 366) return { ok: false, error: "Too many dates." };
  for (const [key, windows] of entries) {
    const match = CIVIL_DATE.exec(key);
    if (!match) return { ok: false, error: `Invalid date ${key}.` };
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      return { ok: false, error: `Invalid date ${key}.` };
    }
    if (!Array.isArray(windows)) return { ok: false, error: `Hours for ${key} must be a list.` };
    if (windows.length > 12) return { ok: false, error: `Too many windows on ${key}.` };
    const parsed: AvailabilityWindow[] = [];
    for (const window of windows) {
      if (!window || typeof window !== "object") {
        return { ok: false, error: `Invalid window on ${key}.` };
      }
      const start = (window as { start?: unknown }).start;
      const end = (window as { end?: unknown }).end;
      if (
        typeof start !== "string" ||
        !CIVIL_TIME.test(start) ||
        typeof end !== "string" ||
        !CIVIL_TIME.test(end)
      ) {
        return { ok: false, error: `Windows on ${key} use 24-hour HH:MM.` };
      }
      if (minutes(start) >= minutes(end)) {
        return { ok: false, error: `Window on ${key} must end after it starts.` };
      }
      parsed.push({ start, end });
    }
    dateHours[key] = parsed;
  }
  return { ok: true, dateHours };
}

function listedDateHoursSpan(
  dateHours: Record<string, AvailabilityWindow[]> | undefined,
): { start: string; end: string } | null {
  if (!dateHours) return null;
  const keys = Object.keys(dateHours).filter((key) => CIVIL_DATE.test(key)).sort();
  const start = keys[0];
  const end = keys[keys.length - 1];
  if (!start || !end) return null;
  return { start, end };
}

function windowsForDate(rule: AvailabilityRule, key: string, weekday: string): AvailabilityWindow[] {
  if (rule.dateHours && Object.prototype.hasOwnProperty.call(rule.dateHours, key)) {
    return rule.dateHours[key] ?? [];
  }
  const span = listedDateHoursSpan(rule.dateHours);
  if (span && key >= span.start && key <= span.end) return [];
  return rule.weeklyHours[weekday] ?? [];
}

export function civilDateKey(date: Date, timeZone: string): string {
  return dateKey(localParts(date, timeZone));
}

/** A civil date with at least one fixed window. Empty and missing dates are not fixed openings. */
export function fixedDateHoursOpen(
  dateHours: Record<string, AvailabilityWindow[]> | null | undefined,
  timeZone: string,
  date: Date,
): boolean {
  const key = civilDateKey(date, timeZone);
  if (!dateHours || !Object.prototype.hasOwnProperty.call(dateHours, key)) return false;
  return (dateHours[key] ?? []).length > 0;
}

export function dateHoursIncludeOpenWindow(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some(
    (windows) => Array.isArray(windows) && windows.length > 0,
  );
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
  roomWindows: BusyWindow[] = [],
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
    const windows = windowsForDate(rule, key, String(cursor.getUTCDay()));
    for (const window of windows) {
      for (let startMinutes = minutes(window.start); startMinutes + durationMinutes <= minutes(window.end); startMinutes += durationMinutes) {
        const start = zonedDateTimeToUtc(key, `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`, rule.timezone);
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        if (start < from || end > to || start < minimumStart) continue;
        const fixedDate = Boolean(
          rule.dateHours && Object.prototype.hasOwnProperty.call(rule.dateHours, key),
        );
        const blocking = fixedDate ? bookedWindows : allBusy;
        if (overlapsBusyWindow(start, end, blocking, rule.bufferMinutes)) continue;
        // The shared room has no buffer: the next session may start when the previous one ends.
        if (overlapsBusyWindow(start, end, roomWindows, 0)) continue;
        slots.push(start.toISOString());
      }
    }
  }
  return slots;
}

/** Guest on her own Accepted Admissions calendar. Other consulting tutors stay off the invite. */
export const NIKA_CALENDAR_INVITE_EMAIL = "nika.raiffe@gmail.com";

type CalendarInviteInput = string | null | undefined | { tutorEmail?: string | null };

function readCalendarInviteInputs(inputs: CalendarInviteInput[]): {
  subjects: Array<string | null | undefined>;
  tutorEmail?: string | null;
} {
  const subjects: Array<string | null | undefined> = [];
  let tutorEmail: string | null | undefined;
  for (const input of inputs) {
    if (input && typeof input === "object") tutorEmail = input.tutorEmail;
    else subjects.push(input);
  }
  return { subjects, tutorEmail };
}

export function isNikaCollegeConsultingInvite(
  subjects: Array<string | null | undefined>,
  tutorEmail?: string | null,
): boolean {
  const consulting = subjects.some(
    (subject) => subject?.trim().toLowerCase() === "college consulting",
  );
  return consulting && tutorEmail?.trim().toLowerCase() === NIKA_CALENDAR_INVITE_EMAIL;
}

/** True only for Nika's College Consulting sessions. SAT and other consulting tutors stay off. */
export function calendarInviteIncludesTutor(...inputs: CalendarInviteInput[]): boolean {
  const { subjects, tutorEmail } = readCalendarInviteInputs(inputs);
  return isNikaCollegeConsultingInvite(subjects, tutorEmail);
}

/**
 * Guest list for a booking invite.
 * On the tutor's own Google account the tutor is the organizer, so only Nika's
 * consulting sessions add her. On any other account, including admin@, every
 * tutor is added from the tutor profile email.
 */
export function tutorAttendeeForOrganizer(input: {
  organizerIsTutor: boolean;
  tutorEmail?: string | null;
  subjects: Array<string | null | undefined>;
}): { inviteTutor: boolean; tutorEmail: string | null } {
  const tutorEmail = input.tutorEmail?.trim() || null;
  if (!input.organizerIsTutor) {
    return { inviteTutor: Boolean(tutorEmail), tutorEmail };
  }
  return {
    inviteTutor: calendarInviteIncludesTutor(...input.subjects, { tutorEmail }),
    tutorEmail,
  };
}

export const MISSING_CALENDAR_INVITE_TITLE = "No Google Calendar invite was sent";

/** In-app admin copy when a fixed-window session is confirmed without a Google event. */
export function missingCalendarInviteMessage(args: {
  studentName: string;
  sessionTitle: string;
  startIso: string;
  meetingUrl: string;
}): string {
  return `${args.studentName} booked ${args.sessionTitle} at ${args.startIso}. The session is confirmed. Meet: ${args.meetingUrl}. Google Calendar was not updated, so no invite went to the student, the tutor, or admin@acceptedadmissions.org.`;
}

export function calendarEventPayload(
  title: string,
  start: Date,
  durationMinutes: number,
  timeZone: string,
  attendeeEmail: string,
  location?: string,
  parties?: {
    student?: CalendarInviteParty | null;
    tutor?: CalendarInviteParty | null;
    /** College Consulting adds the tutor. On her own calendar she is the organizer; Google still accepts her as an attendee. */
    inviteTutor?: boolean;
    description?: string;
  } | null,
) {
  const existing = attendeeEmail.trim() ? [{ email: attendeeEmail }] : [];
  const tutorEmail = parties?.inviteTutor ? parties.tutor?.email?.trim() ?? "" : "";
  if (tutorEmail) existing.push({ email: tutorEmail });
  const extras = adminAttendeeEmailsForPair(parties?.student, parties?.tutor);
  const attendees = mergeCalendarAttendees(existing, extras);
  const description = parties?.description?.trim() || "Accepted Admissions tutoring session";
  return {
    summary: title,
    description,
    ...(location ? { location } : {}),
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: new Date(start.getTime() + durationMinutes * 60_000).toISOString(), timeZone },
    attendees: attendees.length > 0 ? attendees : [{ email: attendeeEmail }],
  };
}

/** Calendar invite used by booking create, reschedule, and admin session updates. */
export function bookingCalendarEventPayload(args: {
  title: string;
  start: Date;
  durationMinutes: number;
  timeZone: string;
  attendeeEmail: string;
  location?: string;
  description?: string;
  student: CalendarInviteParty | null;
  tutor: CalendarInviteParty | null;
  inviteTutor?: boolean;
}) {
  return calendarEventPayload(
    args.title,
    args.start,
    args.durationMinutes,
    args.timeZone,
    args.attendeeEmail,
    args.location,
    {
      student: args.student,
      tutor: args.tutor,
      inviteTutor: args.inviteTutor,
      description: args.description,
    },
  );
}
