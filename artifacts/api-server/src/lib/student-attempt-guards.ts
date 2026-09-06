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

export function isBrokenEmptyAttempt(input: {
  status: string;
  answeredCount: number;
}): boolean {
  return (
    (input.status === "submitted" || input.status === "expired") &&
    input.answeredCount < 1
  );
}
