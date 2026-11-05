/**
 * Spam checks for the public /client-request form. No third-party captcha:
 * a hidden honeypot field plus server-side sanity checks on what a real
 * parent or student would type.
 */

/**
 * Hidden form field. People never see it; simple bots fill every input.
 * A nonsense name so browsers and password managers do not autofill it.
 */
export const CLIENT_REQUEST_HONEYPOT_FIELD = "hp_zx7q";

/** Planned test dates may be up to this many days in the past (a recent sitting). */
export const CLIENT_REQUEST_TEST_DATE_MAX_PAST_DAYS = 365;
/** ...and up to this many years ahead. */
export const CLIENT_REQUEST_TEST_DATE_MAX_FUTURE_YEARS = 3;

export const CLIENT_REQUEST_SHORT_FIELD_MAX = 200;
export const CLIENT_REQUEST_LONG_FIELD_MAX = 5000;
const SHORT_FIELD_MAX = CLIENT_REQUEST_SHORT_FIELD_MAX;
const LONG_FIELD_MAX = CLIENT_REQUEST_LONG_FIELD_MAX;
const LONG_FIELDS = new Set(["goals", "schedulingAvailability"]);
const CHECKED_FIELDS = [
  "guardianName",
  "studentName",
  "email",
  "phone",
  "gradeOrGraduationYear",
  "currentSchool",
  "serviceRequested",
  "currentSatTotal",
  "currentReadingWriting",
  "currentMath",
  "targetSatScore",
  "plannedTestDate",
  "goals",
  "schedulingAvailability",
  "referralSource",
] as const;

export type ClientRequestSpamVerdict =
  | { kind: "ok" }
  /** Respond as if it worked, but save nothing and send nothing. */
  | { kind: "honeypot" }
  /** Respond 400 with this message. */
  | { kind: "invalid"; error: string };

function text(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  return typeof value === "string" ? value.trim() : "";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses YYYY-MM-DD as a UTC calendar date; null when it is not a real date. */
export function parseClientRequestDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function scoreOutOfRange(value: string, min: number, max: number): boolean {
  // Only a bare number is range-checked. Free text such as "1350 (Oct 2025)",
  // "ACT 31", or "PSAT 160" is accepted (the length cap still applies).
  if (!/^\d+$/.test(value)) return false;
  const n = Number(value);
  return n < min || n > max;
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Allowed planned test dates as YYYY-MM-DD keys (inclusive). The form's
 * date input uses the same min/max, so its earliest date always passes.
 */
export function clientRequestTestDateBounds(now: Date = new Date()): { min: string; max: string } {
  const min = new Date(now.getTime() - CLIENT_REQUEST_TEST_DATE_MAX_PAST_DAYS * DAY_MS);
  const max = new Date(
    Date.UTC(
      now.getUTCFullYear() + CLIENT_REQUEST_TEST_DATE_MAX_FUTURE_YEARS,
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );
  return { min: utcDateKey(min), max: utcDateKey(max) };
}

export function clientRequestSpamVerdict(
  body: Record<string, unknown>,
  now: Date = new Date(),
): ClientRequestSpamVerdict {
  const trap = body[CLIENT_REQUEST_HONEYPOT_FIELD];
  if (trap != null && trap !== "" && trap !== false) return { kind: "honeypot" };

  for (const field of CHECKED_FIELDS) {
    const max = LONG_FIELDS.has(field) ? LONG_FIELD_MAX : SHORT_FIELD_MAX;
    if (text(body, field).length > max) {
      return { kind: "invalid", error: "One of the answers is too long. Shorten it and try again." };
    }
  }

  const testDate = text(body, "plannedTestDate");
  if (testDate) {
    const parsed = parseClientRequestDate(testDate);
    const bounds = clientRequestTestDateBounds(now);
    if (!parsed || testDate < bounds.min || testDate > bounds.max) {
      return {
        kind: "invalid",
        error: "Enter a planned test date within the next few years, or leave it blank.",
      };
    }
  }

  const grade = text(body, "gradeOrGraduationYear");
  const years = grade.match(/\b(1[89]\d{2}|2\d{3})\b/g) ?? [];
  const thisYear = now.getUTCFullYear();
  if (years.some((raw) => Number(raw) < thisYear - 40 || Number(raw) > thisYear + 15)) {
    return { kind: "invalid", error: "Enter the student's grade or graduation year." };
  }

  if (
    scoreOutOfRange(text(body, "currentSatTotal"), 400, 1600) ||
    scoreOutOfRange(text(body, "targetSatScore"), 400, 1600) ||
    scoreOutOfRange(text(body, "currentReadingWriting"), 200, 800) ||
    scoreOutOfRange(text(body, "currentMath"), 200, 800)
  ) {
    return {
      kind: "invalid",
      error: "SAT scores are 400-1600 in total and 200-800 per section. Fix the score or leave it blank.",
    };
  }

  const names = [text(body, "guardianName"), text(body, "studentName")];
  if (names.some((name) => name && (!/\p{L}/u.test(name) || /https?:\/\/|www\./i.test(name)))) {
    return { kind: "invalid", error: "Enter a real name for the parent or client and the student." };
  }

  return { kind: "ok" };
}
