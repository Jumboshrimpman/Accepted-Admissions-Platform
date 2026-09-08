export const IN_SESSION_HOMEWORK_COMPLETION_TITLE = "In-session homework completion";

export type WrongAnswerCandidate = {
  correct: boolean;
};

export function filterWrongAnswersOnly<T extends WrongAnswerCandidate>(items: readonly T[]): T[] {
  return items.filter((item) => item.correct === false);
}

export function tutorWrongAnswersHref(attemptId: string): string {
  return `/tutor/attempts/${attemptId}?wrongAnswersOnly=1`;
}

export function wantsWrongAnswersOnly(search: string | null | undefined): boolean {
  const params = new URLSearchParams(search?.startsWith("?") ? search.slice(1) : search ?? "");
  const value = params.get("wrongAnswersOnly");
  return value === "1" || value === "true";
}

export type AttemptWrongAnswers = {
  attemptId: string;
  assignmentId: string;
  assignmentTitle: string;
  sessionId: string | null;
  totalCount: number;
  wrongCount: number;
  items: Array<{
    questionId: string;
    correct: boolean;
    skill: string;
    prompt: string;
  }>;
};
