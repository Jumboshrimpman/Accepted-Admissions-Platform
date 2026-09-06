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

export function isCollaborativeSessionPractice(deliveryPhase?: string | null): boolean {
  return deliveryPhase === "during_session";
}

export const EMPTY_SUBMIT_MESSAGE =
  "Submit is blocked until at least one question has an answer. An empty attempt is not saved as completed.";

export const COLLABORATIVE_PRACTICE_COPY =
  "Work through this problem together. Discuss, choose an answer, and record the outcome — this is teaching practice, not a timed quiz.";
