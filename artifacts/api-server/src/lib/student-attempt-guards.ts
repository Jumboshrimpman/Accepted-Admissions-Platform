export function isRecordedAnswer(value: string | null | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function countRecordedAnswers(
  responses: Array<{ finalAnswer?: string | null } | null | undefined>,
): number {
  return responses.filter((response) => isRecordedAnswer(response?.finalAnswer)).length;
}

export function emptyAttemptSubmitError(answeredCount: number): string | null {
  if (answeredCount > 0) return null;
  return "Cannot submit with no answers recorded. An empty attempt is not saved as completed.";
}

export function canFinalizeAttemptResult(answeredCount: number): boolean {
  return answeredCount >= 1;
}

/** Expired/submitted attempts only become a finished result when at least one answer exists. */
export function shouldFinalizeExpiredAttempt(input: {
  hasResult: boolean;
  answeredCount: number;
}): boolean {
  if (input.hasResult) return false;
  return canFinalizeAttemptResult(input.answeredCount);
}

export function countsTowardAttemptLimit(input: {
  status: string;
  hasResult: boolean;
}): boolean {
  return (
    (input.status === "submitted" || input.status === "expired") &&
    input.hasResult
  );
}

export function isResumableIncompleteAttempt(input: {
  status: string;
  hasResult: boolean;
}): boolean {
  if (input.status === "active" || input.status === "paused") return true;
  return (
    (input.status === "expired" || input.status === "submitted") &&
    !input.hasResult
  );
}

export function isBrokenEmptyAttempt(input: {
  status: string;
  answeredCount: number;
}): boolean {
  return (
    (input.status === "submitted" || input.status === "expired") &&
    input.answeredCount < 1
  );
}

/** True when this attempt must not freeze or replace the quiz's question rows. */
export function attemptHasRecordedWork(input: {
  hasResult: boolean;
  score: number | null;
  answeredCount: number;
}): boolean {
  return input.hasResult || input.score != null || input.answeredCount > 0;
}

/**
 * Submitted/expired with nothing recorded is the empty-attempt dead end.
 * Reopen it. A stored result or any answered item stays as history.
 */
export function shouldReopenBrokenEmptyAttempt(input: {
  status: string;
  hasResult: boolean;
  score: number | null;
  answeredCount: number;
}): boolean {
  if (attemptHasRecordedWork(input)) return false;
  return isBrokenEmptyAttempt({
    status: input.status,
    answeredCount: input.answeredCount,
  });
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
