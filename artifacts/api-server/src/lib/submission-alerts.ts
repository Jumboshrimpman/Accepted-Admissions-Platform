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
  html: string;
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

  const reviewUrl = `${QUIZ_SUBMISSION_PORTAL_BASE_URL}/tutor/attempts/${input.attemptId}`;
  return {
    subject: `Quiz submitted: ${studentName} — ${truncateQuizTitle(assignmentTitle)}`,
    text: lines.join("\n"),
    html: quizSubmissionAlertHtml({
      studentName,
      studentEmail,
      quizTitle: assignmentTitle,
      subject,
      scoreLabel: scoreLine(percent, correctCount, totalCount),
      sessionLabel: sessionLine(input.sessionDateTime, input.sessionTimezone).replace(/^Session: /, ""),
      reviewUrl,
    }),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Staff email. Same card as the student reminder, with the review link only in the button. */
export function quizSubmissionAlertHtml(input: {
  studentName: string;
  studentEmail: string;
  quizTitle: string;
  subject: string;
  scoreLabel: string;
  sessionLabel: string;
  reviewUrl: string;
}): string {
  const student = escapeHtml(input.studentName);
  const quiz = escapeHtml(input.quizTitle);
  const meta = [escapeHtml(input.subject), escapeHtml(input.studentEmail)].filter(Boolean).join(" &middot; ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>A student submitted a quiz</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f2ed;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${student} submitted a quiz.</div>
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
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#1e3448;">A student submitted a quiz.</p>
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#33414f;">
                  <strong style="color:#1e3448;">${student}</strong> finished this one. It is waiting in the review queue.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="font-size:16px;line-height:1.45;color:#1e3448;font-weight:600;">${quiz}</div>
                      ${meta ? `<div style="margin-top:6px;font-size:14px;color:#6b7784;">${meta}</div>` : ""}
                      <div style="margin-top:12px;font-size:14px;line-height:1.5;color:#33414f;">${escapeHtml(input.scoreLabel)}</div>
                      <div style="margin-top:6px;font-size:14px;line-height:1.5;color:#33414f;">${escapeHtml(input.sessionLabel)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 32px 32px;">
                <a href="${escapeHtml(input.reviewUrl)}" style="display:inline-block;background:#1e3448;color:#f6f2e9;text-decoration:none;font-size:16px;font-weight:600;padding:14px 26px;border-radius:8px;">Review the submission</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
