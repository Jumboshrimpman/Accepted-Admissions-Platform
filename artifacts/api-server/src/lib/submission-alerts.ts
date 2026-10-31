/**
 * Copy for the tutor alert that goes out when a student submits a quiz.
 *
 * Pure: no database, no network, no clock. The submit handler in
 * `routes/platform.ts` resolves the recipients and does the writes; this module
 * only decides what the email says and who is allowed to receive one.
 */

export const QUIZ_SUBMISSION_PORTAL_BASE_URL = "https://app.acceptedadmissions.org";

/** The portal default when a session has no stored zone. */
export const QUIZ_SUBMISSION_FALLBACK_TIMEZONE = "America/New_York";

export const QUIZ_SUBMISSION_NOTIFICATION_KIND = "quiz_submission";

export type QuizSubmissionAlertEmailInput = {
  studentName: string;
  studentEmail: string;
  assignmentTitle: string;
  subject: string;
  questionCount: number | null;
  scorePercent: number | null;
  correctCount: number | null;
  totalCount: number | null;
  sessionDateTime: Date | null;
  /** The session's stored timezone. Falls back to the portal default. */
  sessionTimezone?: string | null;
  attemptId: string;
  assignmentId: string;
};

export type QuizSubmissionAlertEmail = {
  subject: string;
  text: string;
};

/**
 * Only staff see a submission alert. A student or viewer who somehow ends up on
 * an assignment can never be emailed the staff-facing copy.
 */
export function canReceiveQuizSubmissionAlert(role: string | null | undefined): boolean {
  return role === "tutor" || role === "administrator";
}

/** The single address the email goes to, or null when there is nobody to send to. */
export function quizSubmissionAlertRecipient(input: {
  role?: string | null;
  email?: string | null;
}): string | null {
  if (!canReceiveQuizSubmissionAlert(input.role)) return null;
  const email = input.email?.trim() ?? "";
  return email.length > 0 ? email : null;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Trim a title to something that still reads in a subject line. */
export function truncateQuizTitle(title: string | null | undefined, max = 70): string {
  const text = cleanText(title);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** A whole-number percent, or null when the quiz has no score to report. */
export function wholePercent(scorePercent: number | null | undefined): number | null {
  if (scorePercent === null || scorePercent === undefined) return null;
  if (!Number.isFinite(scorePercent)) return null;
  return Math.round(scorePercent);
}

function scoreLine(percent: number | null, correctCount: number | null, totalCount: number | null): string {
  if (percent === null) return "Score: unavailable";
  if (correctCount !== null && totalCount !== null) {
    return `Score: ${percent}% (${correctCount} of ${totalCount} correct)`;
  }
  return `Score: ${percent}%`;
}

function sessionLine(dateTime: Date | null, timezone: string | null | undefined): string {
  if (!dateTime || Number.isNaN(dateTime.getTime())) return "Session: not scheduled";
  const zone = cleanText(timezone) || QUIZ_SUBMISSION_FALLBACK_TIMEZONE;
  const format = (timeZone: string): string =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(dateTime);
  let label: string;
  try {
    label = format(zone);
  } catch {
    label = format("UTC");
  }
  return `Session: ${label} (${zone})`;
}

export function quizSubmissionAlertEmail(
  input: QuizSubmissionAlertEmailInput,
): QuizSubmissionAlertEmail {
  const studentName = cleanText(input.studentName) || "Student";
  const studentEmail = cleanText(input.studentEmail);
  const assignmentTitle = cleanText(input.assignmentTitle) || "Quiz";
  const subject = cleanText(input.subject);
  const percent = wholePercent(input.scorePercent);
  const correctCount =
    input.correctCount === null || !Number.isFinite(input.correctCount) ? null : input.correctCount;
  const totalCount =
    input.totalCount === null || !Number.isFinite(input.totalCount) ? null : input.totalCount;

  const lines = [
    "A student submitted a quiz.",
    "",
    studentEmail ? `Student: ${studentName} <${studentEmail}>` : `Student: ${studentName}`,
    `Quiz: ${assignmentTitle}`,
  ];
  if (subject) lines.push(`Subject: ${subject}`);
  lines.push(scoreLine(percent, correctCount, totalCount));
  if (input.questionCount !== null && Number.isFinite(input.questionCount)) {
    lines.push(`Questions: ${input.questionCount}`);
  }
  lines.push(sessionLine(input.sessionDateTime, input.sessionTimezone));
  lines.push(`Attempt: ${input.attemptId}`);
  lines.push(`Assignment: ${input.assignmentId}`);
  lines.push("");
  lines.push("The submission is in the portal review queue.");
  lines.push(`${QUIZ_SUBMISSION_PORTAL_BASE_URL}/tutor/attempts/${input.attemptId}`);

  return {
    subject: `Quiz submitted: ${studentName} — ${truncateQuizTitle(assignmentTitle)}`,
    text: lines.join("\n"),
  };
}

/** In-app notification title. Names the student and quiz so a second email in the same session is not deduped away. */
export function quizSubmissionNotificationTitle(input: {
  studentName: string;
  assignmentTitle: string;
}): string {
  const studentName = cleanText(input.studentName) || "Student";
  const assignmentTitle = cleanText(input.assignmentTitle) || "Quiz";
  return truncateQuizTitle(`Quiz submitted: ${studentName} — ${assignmentTitle}`, 120);
}

export function quizSubmissionNotificationMessage(input: {
  studentName: string;
  assignmentTitle: string;
  scorePercent: number | null;
}): string {
  const studentName = cleanText(input.studentName) || "Student";
  const assignmentTitle = cleanText(input.assignmentTitle) || "Quiz";
  const percent = wholePercent(input.scorePercent);
  const score = percent === null ? "score unavailable" : `${percent}%`;
  return `${studentName} submitted ${assignmentTitle} — ${score}`;
}
