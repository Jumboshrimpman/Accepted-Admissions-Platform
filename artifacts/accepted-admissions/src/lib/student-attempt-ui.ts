/** Student homework/diagnostic taking never uses Prediction First. */
export const STUDENT_PREDICTION_ENABLED = false;

export function studentSeesPredictionStep(_predictionFirst?: boolean): boolean {
  return STUDENT_PREDICTION_ENABLED;
}

export function studentCanSeeAnswerChoices(): boolean {
  return true;
}

export function isAnsweredValue(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function isQuestionFeedbackRevealed(response: {
  revealed?: boolean;
  correct?: boolean | null;
} | undefined): boolean {
  return Boolean(response?.revealed) && response?.correct !== undefined && response?.correct !== null;
}

export function answeredQuestionCount(
  responses: Record<string, { finalAnswer?: string | null } | undefined>,
): number {
  return Object.values(responses).filter((response) => isAnsweredValue(response?.finalAnswer)).length;
}

export function canSubmitStudentAttempt(input: {
  viewer?: boolean;
  answeredCount: number;
  pending?: boolean;
}): { ok: boolean; reason: "ok" | "viewer" | "pending" | "empty" } {
  if (input.viewer) return { ok: false, reason: "viewer" };
  if (input.pending) return { ok: false, reason: "pending" };
  if (input.answeredCount < 1) return { ok: false, reason: "empty" };
  return { ok: true, reason: "ok" };
}

export function shouldAutoSubmitOnExpiry(answeredCount: number): boolean {
  return answeredCount > 0;
}

export function studentSeesFinishedResult(input: {
  status?: string | null;
  hasResult: boolean;
  resultError?: boolean;
}): boolean {
  if (input.status !== "submitted" && input.status !== "expired") return false;
  if (input.resultError || !input.hasResult) return false;
  return true;
}

export const IN_SESSION_HOMEWORK_COMPLETION_TITLE = "In-session homework completion";

export function isInSessionHomeworkCompletion(input: {
  deliveryPhase?: string | null;
  title?: string | null;
}): boolean {
  return (
    input.deliveryPhase === "during_session" &&
    (input.title ?? "").trim() === IN_SESSION_HOMEWORK_COMPLETION_TITLE
  );
}

export function isCollaborativeSessionPractice(
  deliveryPhase?: string | null,
  title?: string | null,
): boolean {
  if (deliveryPhase !== "during_session") return false;
  return !isInSessionHomeworkCompletion({ deliveryPhase, title });
}

export function allowsPartialInSessionSubmit(input: {
  deliveryPhase?: string | null;
  title?: string | null;
}): boolean {
  return isInSessionHomeworkCompletion(input);
}

/** Immediate Check answer is only for live session work, never timed pre-work/diagnostics. */
export function allowsInSessionPerQuestionFeedback(input: {
  deliveryPhase?: string | null;
}): boolean {
  return input.deliveryPhase === "during_session";
}

export const EMPTY_SUBMIT_MESSAGE =
  "Submit is blocked until at least one question has an answer. An empty attempt is not saved as completed.";

export const COLLABORATIVE_PRACTICE_COPY =
  "Work through this problem together. Open any item, discuss it, choose an answer, and record the outcome — teaching practice, not a timed quiz.";

export const IN_SESSION_PARTIAL_SUBMIT_COPY =
  "This in-session homework set is at most 15 questions. You can submit for results without answering every question.";

export const IN_SESSION_PER_QUESTION_FEEDBACK_COPY =
  "Check each question as you go for correct/incorrect and the official explanation. Submit the quiz when you are finished so the session attempt is recorded.";

export const IN_SESSION_PRACTICE_CHECK_COPY =
  "Check an answer to see whether it is correct and read the official explanation. Finish practice when the session work is done so the attempt is recorded.";

export function isInProgressAttemptStatus(status?: string | null): boolean {
  return status === "active" || status === "paused";
}

export function normalizeQuestionIndex(
  index: unknown,
  questionCount = Number.POSITIVE_INFINITY,
): number {
  const raw = typeof index === "number" && Number.isFinite(index) ? Math.floor(index) : 0;
  const safe = Math.max(0, raw);
  const count =
    typeof questionCount === "number" && Number.isFinite(questionCount)
      ? Math.floor(questionCount)
      : Number.POSITIVE_INFINITY;
  if (count <= 0) return 0;
  return Math.min(safe, count - 1);
}

export function studentAssignmentActionLabel(
  status?: string | null,
  duringSession = false,
): string {
  if (duringSession) {
    if (status === "submitted" || status === "expired") return "Review practice";
    if (isInProgressAttemptStatus(status)) return "Resume";
    return "Practice together";
  }
  if (status === "submitted" || status === "expired") return "Review answers";
  if (isInProgressAttemptStatus(status)) return "Resume";
  return "Start pre-work";
}

export function studentAssignmentHref(
  assignmentId: string,
  status?: string | null,
): string {
  const path = `/portal/assignments/${assignmentId}`;
  return isInProgressAttemptStatus(status) ? `${path}?resume=1` : path;
}

export function wantsResumeAttempt(search?: string | null): boolean {
  if (!search) return false;
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("resume") === "1";
}
