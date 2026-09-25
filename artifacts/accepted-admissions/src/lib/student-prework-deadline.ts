import {
  resolveClientDisplayTimezone,
  sessionTimezoneLabel,
} from "./session-display.ts";

export type PreworkDeadlineAssignment = {
  deliveryPhase?: string | null;
  deadline?: string | Date | null;
  latestAttemptStatus?: string | null;
};

export type PreworkDeadlineSession = {
  dateTime: string | Date;
  timezone: string;
};

export type PreworkDueSource = "session_start" | "assignment_deadline";

function asDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPart(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

/** Student-local deadline, e.g. "Friday, October 2, 2026 at 9:00 PM JST". */
export function formatStudentDueInstant(
  value: string | Date,
  timezone: string,
): string {
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
  return `${date} at ${time} ${sessionTimezoneLabel(timezone)}`;
}

/**
 * Pre-work is due before the linked session starts.
 * An earlier stored assignment deadline still wins. A later stored deadline
 * does not push the due time past the session.
 */
export function resolveStudentPreworkDue(input: {
  assignment: PreworkDeadlineAssignment;
  session?: PreworkDeadlineSession | null;
}): { at: Date; source: PreworkDueSource } | null {
  if (input.assignment.deliveryPhase === "during_session") return null;
  const explicit = asDate(input.assignment.deadline);
  const sessionStart = input.session ? asDate(input.session.dateTime) : null;
  if (
    sessionStart &&
    (!explicit || explicit.getTime() >= sessionStart.getTime())
  ) {
    return { at: sessionStart, source: "session_start" };
  }
  if (explicit) return { at: explicit, source: "assignment_deadline" };
  return null;
}

export function preworkStillNeedsDeadline(
  assignment: PreworkDeadlineAssignment,
  pastSessionDay = false,
): boolean {
  if (assignment.deliveryPhase === "during_session") return false;
  if (pastSessionDay) return false;
  const status = assignment.latestAttemptStatus;
  if (status === "submitted" || status === "expired") return false;
  return true;
}

/**
 * Label for unfinished before-session work.
 * Completed quizzes and in-session practice return null.
 */
export function studentPreworkDeadlineCopy(input: {
  assignment: PreworkDeadlineAssignment;
  session?: PreworkDeadlineSession | null;
  pastSessionDay?: boolean;
  clientTimezone?: string | null;
}): string | null {
  if (!preworkStillNeedsDeadline(input.assignment, input.pastSessionDay))
    return null;
  const due = resolveStudentPreworkDue(input);
  if (!due) return null;
  const timezone = resolveClientDisplayTimezone(
    input.clientTimezone,
    input.session?.timezone,
  );
  const when = formatStudentDueInstant(due.at, timezone);
  if (due.source === "session_start") return `Due before your session: ${when}`;
  return `Due before ${when}`;
}
