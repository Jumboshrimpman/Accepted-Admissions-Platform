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
