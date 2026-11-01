/**
 * Copy and send rules for the student pre-work reminder.
 *
 * Pure: no database and no network. Due times follow the same rules as
 * `artifacts/accepted-admissions/src/lib/student-prework-deadline.ts`
 * (`resolveStudentPreworkDue`, `formatStudentDueInstant`). The API package
 * cannot import that frontend module, so the matching helpers live here.
 */

export const PREWORK_REMINDER_WINDOW_HOURS = 24;
export const PREWORK_REMINDER_PORTAL_BASE_URL = "https://app.acceptedadmissions.org";

const TIMEZONE_SHORT_LABELS: Record<string, string> = {
  "Asia/Dubai": "GST",
  "Asia/Tokyo": "JST",
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Los_Angeles": "PT",
  "Europe/London": "UK",
  UTC: "UTC",
};

export type PreworkReminderDueSource = "session_start" | "assignment_deadline";

export type PreworkReminderEmailInput = {
  studentName: string;
  assignmentTitle: string;
  subject: string;
  sessionDateTime: Date | string | null;
  sessionTimezone: string | null;
  clientTimezone: string | null;
  dueAt: Date | string | null;
  dueSource: PreworkReminderDueSource | null;
  assignmentId: string;
  questionCount: number | null;
};

export type PreworkReminderEmail = {
  subject: string;
  text: string;
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidIanaTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function optionalTimezone(stored?: string | null): string | undefined {
  const preferred = stored?.trim();
  return preferred && isValidIanaTimeZone(preferred) ? preferred : undefined;
}

/** Student zone, then the session zone, then UTC. Same order as the portal. */
export function preworkReminderTimezone(
  clientTimezone?: string | null,
  sessionTimezone?: string | null,
): string {
  return optionalTimezone(clientTimezone) ?? optionalTimezone(sessionTimezone) ?? "UTC";
}

function timezoneLabel(timezone: string): string {
  const trimmed = timezone.trim();
  return TIMEZONE_SHORT_LABELS[trimmed] ?? trimmed;
}

function formatPart(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

/** Student-local instant, e.g. "Friday, October 2, 2026 at 9:00 PM JST". */
export function formatPreworkInstant(value: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(asDate(value) ?? new Date(value));
  const date = `${formatPart(parts, "weekday")}, ${formatPart(parts, "month")} ${formatPart(parts, "day")}, ${formatPart(parts, "year")}`;
  const time = `${formatPart(parts, "hour")}:${formatPart(parts, "minute")} ${formatPart(parts, "dayPeriod")}`;
  return `${date} at ${time} ${timezoneLabel(timezone)}`;
}

/**
 * Pre-work is due before the linked session starts.
 * An earlier stored deadline still wins. A later stored deadline
 * does not push the due time past the session.
 */
export function resolvePreworkReminderDue(input: {
  deliveryPhase?: string | null;
  deadline?: string | Date | null;
  sessionDateTime?: string | Date | null;
}): { at: Date; source: PreworkReminderDueSource } | null {
  if (input.deliveryPhase === "during_session") return null;
  const explicit = asDate(input.deadline);
  const sessionStart = asDate(input.sessionDateTime);
  if (sessionStart && (!explicit || explicit.getTime() >= sessionStart.getTime())) {
    return { at: sessionStart, source: "session_start" };
  }
  if (explicit) return { at: explicit, source: "assignment_deadline" };
  return null;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstName(displayName: string | null | undefined): string {
  return cleanText(displayName).split(/\s+/)[0] || "there";
}

function truncateTitle(title: string | null | undefined, max = 70): string {
  const text = cleanText(title);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** The student address, or null for anyone else and for a blank email. */
export function preworkReminderRecipient(input: {
  role?: string | null;
  email?: string | null;
}): string | null {
  if (input.role !== "student") return null;
  const email = input.email?.trim() ?? "";
  return email.length > 0 ? email : null;
}

export function preworkReminderEmail(input: PreworkReminderEmailInput): PreworkReminderEmail {
  const zone = preworkReminderTimezone(input.clientTimezone, input.sessionTimezone);
  const quiz = cleanText(input.assignmentTitle) || "your pre-work";
  const subjectLine = truncateTitle(input.subject) || "your session";
  const sessionWhen = input.sessionDateTime
    ? formatPreworkInstant(input.sessionDateTime, zone)
    : null;
  const dueWhen = input.dueAt ? formatPreworkInstant(input.dueAt, zone) : null;
  const dueSentence =
    dueWhen == null
      ? null
      : input.dueSource === "assignment_deadline"
        ? `It is due before ${dueWhen}.`
        : `It is due before your session: ${dueWhen}.`;
  const questions =
    input.questionCount != null && input.questionCount > 0
      ? ` (${input.questionCount} question${input.questionCount === 1 ? "" : "s"})`
      : "";
  const link = `${PREWORK_REMINDER_PORTAL_BASE_URL}/portal/assignments/${input.assignmentId}`;
  const lines = [
    `Hi ${firstName(input.studentName)},`,
    "",
    sessionWhen
      ? `Your ${subjectLine} session is ${sessionWhen}. You still have a bit of recommended pre-work you have not started.`
      : `You still have a bit of recommended pre-work you have not started before your ${subjectLine} session.`,
    "",
    `${quiz}${questions}.`,
    dueSentence,
    "",
    "Whenever you have a few minutes, you can open it here:",
    link,
  ].filter((line): line is string => line != null);
  return {
    subject: `Before your session: ${truncateTitle(quiz)}`,
    text: lines.join("\n"),
  };
}

/**
 * Whether this student should get a reminder for this assignment.
 * Already-started work, in-session work, cancelled sessions, and sessions
 * outside the reminder window are all no.
 */
export function shouldSendPreworkReminder(input: {
  role?: string | null;
  hasStarted: boolean;
  latestAttemptStatus?: string | null;
  deliveryPhase?: string | null;
  sessionCancelled: boolean;
  hoursUntilSession: number;
}): boolean {
  if (input.role !== "student") return false;
  if (input.hasStarted) return false;
  const status = input.latestAttemptStatus?.trim().toLowerCase() ?? "";
  if (status === "submitted" || status === "expired") return false;
  if (input.deliveryPhase !== "before_session") return false;
  if (input.sessionCancelled) return false;
  if (!Number.isFinite(input.hoursUntilSession)) return false;
  if (input.hoursUntilSession < 0) return false;
  if (input.hoursUntilSession > PREWORK_REMINDER_WINDOW_HOURS) return false;
  return true;
}
