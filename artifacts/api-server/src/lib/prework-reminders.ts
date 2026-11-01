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
  html: string;
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

function stripSessionTail(title: string): string {
  return title.replace(/\s+[—–-]\s+.*$/u, "").trim();
}

function hasQuestionCount(label: string): boolean {
  return /\(?\b\d+\s+questions?\b\)?/i.test(label);
}

function identifiesQuiz(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  return !/^(your\s+)?(pre-work|quiz|homework)$/.test(normalized);
}

/** Expand a leading "SAT" to "SAT Math" when that is the subject tag. */
function withSubjectTag(name: string, subjectTag: string): string {
  const tag = cleanText(subjectTag);
  if (!tag) return name;
  if (name.toLowerCase().includes(tag.toLowerCase())) return name;
  const nameWords = name.split(/\s+/);
  const tagWords = tag.split(/\s+/);
  let shared = 0;
  while (
    shared < tagWords.length &&
    shared < nameWords.length &&
    nameWords[shared]!.toLowerCase() === tagWords[shared]!.toLowerCase()
  ) {
    shared += 1;
  }
  if (shared > 0 && shared < tagWords.length) {
    return [...tagWords, ...nameWords.slice(shared)].join(" ");
  }
  return `${tag} ${name}`;
}

function hasSessionTail(title: string): boolean {
  return /\s+[—–-]\s+/.test(title);
}

function genericNoun(remainder: string): string {
  const normalized = remainder.trim().toLowerCase();
  if (normalized === "quiz" || normalized === "the quiz") return "quiz";
  if (normalized === "homework") return "homework";
  return "pre-work";
}

/**
 * Inbox quiz name. Drops the staff session tail and a repeated question count,
 * and keeps the subject tag so the message still says which session it is.
 * A generic remainder never falls back to the raw title, because that title
 * still contains the client and tutor names.
 */
function quizName(assignmentTitle: string | null | undefined, subjectTag?: string | null): string {
  const full = cleanText(assignmentTitle);
  const stripped = stripSessionTail(full)
    .replace(/\s*\(\s*\d+\s+questions?\s*\)\s*$/i, "")
    .replace(/\s+[—–-]\s+\d+\s+questions?\s*$/i, "")
    .trim();
  if (!identifiesQuiz(stripped)) {
    if (!full || hasSessionTail(full)) {
      const tag = cleanText(subjectTag);
      const noun = genericNoun(stripped);
      return tag ? `${tag} ${noun}` : `SAT ${noun}`;
    }
    return full;
  }
  return withSubjectTag(stripped, subjectTag ?? "");
}

/**
 * Student-facing quiz label. Strips ` — Michelle's SAT Session with Xavier`
 * and does not add a second question count when the title already has one.
 */
export function preworkReminderQuizLabel(
  assignmentTitle: string | null | undefined,
  questionCount: number | null,
): string {
  const stripped = stripSessionTail(cleanText(assignmentTitle));
  if (!stripped) return "your pre-work";
  if (hasQuestionCount(stripped)) return stripped;
  if (questionCount != null && Number.isFinite(questionCount) && questionCount > 0) {
    const noun = questionCount === 1 ? "question" : "questions";
    return `${stripped} — ${questionCount} ${noun}`;
  }
  return stripped;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function preworkReminderHtml(input: {
  studentName: string;
  quizTitle: string;
  subject: string;
  sessionLabel: string;
  dueLabel: string;
  questions: number | null;
  openUrl: string;
}): string {
  const first = escapeHtml(input.studentName.trim().split(/\s+/)[0] || "there");
  const quiz = escapeHtml(input.quizTitle);
  const count =
    input.questions && input.questions > 0
      ? `${input.questions} question${input.questions === 1 ? "" : "s"}`
      : "";
  const metaLine = [escapeHtml(input.subject), count].filter(Boolean).join(" &middot; ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your pre-work before your session</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f2ed;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your session is ${escapeHtml(input.sessionLabel)}. Here is the pre-work to look at beforehand.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ed;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

            <tr>
              <td style="background:#1e3448;padding:24px 32px;">
                <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#cfd8e0;font-weight:600;">Accepted Admissions</div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#1e3448;">Hi ${first},</p>
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#33414f;">
                  Your session is <strong style="color:#1e3448;">${escapeHtml(input.sessionLabel)}</strong>. There is a short set of recommended pre-work to look at beforehand.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="font-size:16px;line-height:1.45;color:#1e3448;font-weight:600;">${quiz}</div>
                      ${metaLine ? `<div style="margin-top:6px;font-size:14px;color:#6b7784;">${metaLine}</div>` : ""}
                      <div style="margin-top:12px;font-size:14px;line-height:1.5;color:#33414f;">${escapeHtml(input.dueLabel)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:26px 32px 8px 32px;">
                <a href="${escapeHtml(input.openUrl)}" style="display:inline-block;background:#1e3448;color:#f6f2e9;text-decoration:none;font-size:16px;font-weight:600;padding:14px 26px;border-radius:8px;">Open your pre-work</a>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 32px 32px 32px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#33414f;">
                  Once you open it, it will show up in your portal under Today, so you can pick it back up whenever you have a few minutes.
                </p>
                <p style="margin:20px 0 0 0;font-size:15px;line-height:1.6;color:#33414f;">&mdash; Accepted Admissions</p>
              </td>
            </tr>

            <tr>
              <td style="border-top:1px solid #eae6de;padding:20px 32px 28px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#8b949e;">
                  You are receiving this because you have an upcoming session with Accepted Admissions.
                  Questions? Just reply to this email.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
  const name = quizName(input.assignmentTitle, input.subject);
  const label =
    hasQuestionCount(name) ||
    input.questionCount == null ||
    !Number.isFinite(input.questionCount) ||
    input.questionCount <= 0
      ? name
      : `${name} — ${input.questionCount} ${input.questionCount === 1 ? "question" : "questions"}`;
  const subjectName = truncateTitle(input.subject) || "your session";
  const sessionWhen = input.sessionDateTime
    ? formatPreworkInstant(input.sessionDateTime, zone)
    : null;
  const dueWhen = input.dueAt ? formatPreworkInstant(input.dueAt, zone) : null;
  const dueSentence =
    dueWhen == null
      ? "It is waiting in your portal."
      : input.dueSource === "assignment_deadline"
        ? `It is due before ${dueWhen}.`
        : `It is due before your session: ${dueWhen}.`;
  const link = `${PREWORK_REMINDER_PORTAL_BASE_URL}/portal/assignments/${input.assignmentId}`;
  const lines = [
    `Hi ${firstName(input.studentName)},`,
    "",
    sessionWhen
      ? `Your ${subjectName} session is ${sessionWhen}. You still have a bit of recommended pre-work you have not started.`
      : `You still have a bit of recommended pre-work you have not started before your ${subjectName} session.`,
    "",
    `${label}.`,
    dueSentence,
    "",
    `Open your pre-work: ${link}`,
  ];
  return {
    subject: `Before your session: ${truncateTitle(name)}`,
    text: lines.join("\n"),
    html: preworkReminderHtml({
      studentName: input.studentName,
      quizTitle: name,
      subject: subjectName,
      sessionLabel: sessionWhen ?? "coming up",
      dueLabel: dueSentence,
      questions: input.questionCount,
      openUrl: link,
    }),
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
