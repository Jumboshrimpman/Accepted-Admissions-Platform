// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { civilDateKey, type AvailabilityWindow } from "./booking.ts";

/**
 * Tutors who may edit their own bookable date windows.
 * Add a tutor profile id to let that tutor use the dashboard editor.
 * Remove an id to hide the editor and reject their GET and PUT with 403.
 * Administrators keep PUT /admin/tutors/:id/date-hours either way.
 */
export const NIKA_TUTOR_PROFILE_ID = "46d7cfee-d0c0-4bad-93e7-d79907301684";

export const SELF_SERVE_AVAILABILITY_TUTOR_IDS: readonly string[] = [NIKA_TUTOR_PROFILE_ID];

/** Dates the tutor may save, counting today. The editor shows a shorter range. */
export const SELF_SERVE_AVAILABILITY_MAX_DAYS = 90;
/** Today plus the following days shown on the tutor dashboard. Eight weeks. */
export const SELF_SERVE_AVAILABILITY_EDITOR_DAYS = 56;

export function tutorMayEditOwnDateHours(tutorProfileId: string | null | undefined): boolean {
  if (!tutorProfileId) return false;
  return SELF_SERVE_AVAILABILITY_TUTOR_IDS.includes(tutorProfileId);
}

export function shiftCivilDate(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function editorDatesFromToday(today: string, days = SELF_SERVE_AVAILABILITY_EDITOR_DAYS): string[] {
  return Array.from({ length: days }, (_, index) => shiftCivilDate(today, index));
}

export function selfServeDateHoursView(input: {
  tutorProfileId: string;
  timezone: string;
  dateHours: Record<string, AvailabilityWindow[]>;
  now?: Date;
}) {
  const today = civilDateKey(input.now ?? new Date(), input.timezone || "America/New_York");
  return {
    tutorProfileId: input.tutorProfileId,
    timezone: input.timezone,
    dateHours: input.dateHours,
    today,
    latestDate: shiftCivilDate(today, SELF_SERVE_AVAILABILITY_MAX_DAYS),
    editorDates: editorDatesFromToday(today),
  };
}

/** Keys in `patch` replace the same keys. Every other saved date stays. */
export function mergeDateHours(
  existing: Record<string, AvailabilityWindow[]>,
  patch: Record<string, AvailabilityWindow[]>,
): Record<string, AvailabilityWindow[]> {
  return { ...existing, ...patch };
}

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

/**
 * Extra checks for a tutor saving her own dates. parseDateHours already
 * requires real dates and a start that is before the end.
 */
export function selfServeDateHoursError(
  dateHours: Record<string, AvailabilityWindow[]>,
  options: { timeZone: string; now?: Date; maxDays?: number },
): string | null {
  const timeZone = options.timeZone.trim() || "America/New_York";
  const today = civilDateKey(options.now ?? new Date(), timeZone);
  const maxDays = options.maxDays ?? SELF_SERVE_AVAILABILITY_MAX_DAYS;
  const latest = shiftCivilDate(today, maxDays);
  for (const [key, windows] of Object.entries(dateHours)) {
    if (key < today) return `Date ${key} is in the past.`;
    if (key > latest) return `Date ${key} is more than ${maxDays} days ahead.`;
    for (const window of windows) {
      if (clockMinutes(window.start) % 15 !== 0 || clockMinutes(window.end) % 15 !== 0) {
        return `Windows on ${key} must start and end on a 15-minute mark.`;
      }
    }
  }
  return null;
}
