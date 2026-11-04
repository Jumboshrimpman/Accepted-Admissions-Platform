/**
 * Spam checks for the public /client-request form. No third-party captcha:
 * a hidden honeypot field plus server-side sanity checks on what a real
 * parent or student would type.
 */

/** Hidden form field. People never see it; simple bots fill every input. */
export const CLIENT_REQUEST_HONEYPOT_FIELD = "website";

/** Planned test dates may be up to this many days in the past (a recent sitting). */
export const CLIENT_REQUEST_TEST_DATE_MAX_PAST_DAYS = 365;
/** ...and up to this many years ahead. */
export const CLIENT_REQUEST_TEST_DATE_MAX_FUTURE_YEARS = 3;

const SHORT_FIELD_MAX = 200;
const LONG_FIELD_MAX = 5000;
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
  if (!value) return false;
  // Free text like "around 1300" or "1250-1300" is allowed; only check every number in it.
  const numbers = value.match(/\d+/g);
  if (!numbers) return false;
  return numbers.some((raw) => {
    const n = Number(raw);
    return n < min || n > max;
  });
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
    const earliest = now.getTime() - CLIENT_REQUEST_TEST_DATE_MAX_PAST_DAYS * DAY_MS;
    const latest = Date.UTC(
      now.getUTCFullYear() + CLIENT_REQUEST_TEST_DATE_MAX_FUTURE_YEARS,
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    if (!parsed || parsed.getTime() < earliest || parsed.getTime() > latest) {
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
