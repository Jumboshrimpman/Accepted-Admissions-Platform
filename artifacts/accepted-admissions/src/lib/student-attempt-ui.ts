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

const ATTEMPT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAttemptUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && ATTEMPT_UUID.test(value);
}

/**
 * The result route is only for a submitted or expired attempt.
 * An empty id becomes `/api/attempts//result`, which proxies collapse to
 * `/api/attempts/result` and the server then treats "result" as the attempt id.
 */
export function shouldRequestAttemptResult(
  attemptId: string | null | undefined,
  status: string | null | undefined,
): boolean {
  if (!isAttemptUuid(attemptId)) return false;
  return status === "submitted" || status === "expired";
}

/** Submitted or expired with no score and no answers. The quiz itself is still open. */
export function isBrokenEmptyClientAttempt(input: {
  status?: string | null;
  hasResult: boolean;
  responses?: Array<{ finalAnswer?: string | null }> | null;
}): boolean {
  if (input.hasResult) return false;
  if (input.status !== "submitted" && input.status !== "expired") return false;
  return answeredQuestionCount(
    Object.fromEntries(
      (input.responses ?? []).map((response, index) => [
        String(index),
        { finalAnswer: response.finalAnswer },
      ]),
    ),
  ) < 1;
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

export function inSessionPracticeHref(
  assignmentId: string | null | undefined,
  status?: string | null,
): string | null {
  const id = assignmentId?.trim() ?? "";
  if (!id) return null;
  return studentAssignmentHref(id, status);
}

/**
 * Prefer the practice quiz generated from homework results.
 * A generic during-session bank on the same session must not win the link.
 */
export function resolveInSessionPracticeLink(input: {
  duringAssignmentId?: string | null;
  attachedQuestionCount?: number | null;
  assignments?: ReadonlyArray<{
    id: string;
    deliveryPhase?: string | null;
    questionCount?: number | null;
    latestAttemptStatus?: string | null;
  }>;
}): { assignmentId: string; attemptStatus: string | null } | null {
  const generatedId = input.duringAssignmentId?.trim() ?? "";
  const generatedCount = input.attachedQuestionCount ?? 0;
  if (generatedId && generatedCount > 0) {
    const match = input.assignments?.find((item) => item.id === generatedId);
    return {
      assignmentId: generatedId,
      attemptStatus: match?.latestAttemptStatus ?? null,
    };
  }
  const fallback = input.assignments?.find(
    (item) => item.deliveryPhase === "during_session" && (item.questionCount ?? 0) > 0,
  );
  if (!fallback) return null;
  return {
    assignmentId: fallback.id,
    attemptStatus: fallback.latestAttemptStatus ?? null,
  };
}

export function wantsResumeAttempt(search?: string | null): boolean {
  if (!search) return false;
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("resume") === "1";
}

export type PauseResponseDraft = {
  questionId: string;
  finalAnswer: string | null;
  flagged: boolean;
};

/** Answers to send with pause so hiding the quiz cannot drop a selection that has not autosaved yet. */
export function quizResponsesForPause(
  local: Record<string, { finalAnswer?: string | null; flagged?: boolean } | undefined>,
): PauseResponseDraft[] {
  const drafts: PauseResponseDraft[] = [];
  for (const [questionId, response] of Object.entries(local)) {
    if (!response) continue;
    const trimmed = response.finalAnswer?.trim() ?? "";
    const flagged = Boolean(response.flagged);
    if (!trimmed && !flagged) continue;
    drafts.push({
      questionId,
      finalAnswer: trimmed || null,
      flagged,
    });
  }
  return drafts;
}

export const QUIZ_PAUSE_EXIT_LABEL = "Pause / Save & exit";

/**
 * The attempt clock advances only while status is active. Remaining time is
 * timeLimit minus those active seconds, so a paused attempt does not burn
 * time while the student is away.
 *
 * "Pause / Save & exit" stores answers (including typed free-response text
 * and flagged-for-later marks) and the current question, sets the attempt to
 * paused, and returns to the dashboard. The attempt stays in progress and is
 * not submitted or graded.
 *
 * Closing the tab or leaving the page sends the same pause with
 * navigator.sendBeacon, falling back to fetch keepalive, so the clock stops
 * even when the page is going away. A tab switch also pauses, then resumes
 * when the tab is visible again, so a quick switch does not leave the quiz.
 * If the browser dies before that request is delivered, time can still run
 * until the next successful pause.
 */
export type QuizTimerLeaveEvent = "pause-click" | "pagehide" | "unmount" | "hidden" | "visible";

export function quizTimerLeaveAction(input: {
  event: QuizTimerLeaveEvent;
  viewer: boolean;
  status: string | null | undefined;
  intentionalExit: boolean;
  autoPaused: boolean;
}): "pause" | "resume" | "none" {
  if (input.viewer) return "none";
  if (input.event === "pause-click" || input.event === "pagehide" || input.event === "unmount") {
    return input.status === "active" ? "pause" : "none";
  }
  if (input.event === "hidden") {
    if (input.intentionalExit || input.autoPaused || input.status !== "active") return "none";
    return "pause";
  }
  if (input.intentionalExit || !input.autoPaused || input.status !== "paused") return "none";
  return "resume";
}
