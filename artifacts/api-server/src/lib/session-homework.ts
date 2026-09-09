export const IN_SESSION_HOMEWORK_COMPLETION_TITLE = "In-session homework completion";
export const MAX_IN_SESSION_HOMEWORK_QUESTIONS = 15;

export type SessionHomeworkCandidate = {
  deliveryPhase?: string | null;
  status?: string | null;
};

export type WrongAnswerCandidate = {
  correct: boolean;
};

export function wrongAnswersOnly<T extends WrongAnswerCandidate>(items: readonly T[]): T[] {
  return items.filter((item) => item.correct === false);
}

export function isInSessionHomeworkCompletion(input: {
  deliveryPhase?: string | null;
  title?: string | null;
}): boolean {
  return (
    input.deliveryPhase === "during_session" &&
    (input.title ?? "").trim() === IN_SESSION_HOMEWORK_COMPLETION_TITLE
  );
}

/** Immediate Check answer is only for live session work, never timed pre-work/diagnostics. */
export function allowsInSessionPerQuestionFeedback(input: {
  deliveryPhase?: string | null;
}): boolean {
  return input.deliveryPhase === "during_session";
}

/** Prefer unanswered homework items, then the rest of the set, never more than 15. */
export function selectInSessionHomeworkQuestionIds(
  sourceQuestionIds: readonly string[],
  options: {
    unansweredIds?: readonly string[];
    alreadyAttachedIds?: readonly string[];
    maxCount?: number;
  } = {},
): string[] {
  const maxCount = options.maxCount ?? MAX_IN_SESSION_HOMEWORK_QUESTIONS;
  const already = new Set(options.alreadyAttachedIds ?? []);
  const remainingSlots = Math.max(0, maxCount - already.size);
  if (remainingSlots === 0) return [];
  const source = sourceQuestionIds.filter((id) => !already.has(id));
  const unansweredSet = new Set(options.unansweredIds ?? []);
  const unanswered = source.filter((id) => unansweredSet.has(id));
  const rest = source.filter((id) => !unansweredSet.has(id));
  return [...unanswered, ...rest].slice(0, remainingSlots);
}

/** Prefer the live session pre-work copy. Archived replace/remove leftovers must not hide missed items. */
export function selectActivePrework<T extends SessionHomeworkCandidate>(
  assignments: readonly T[],
): T | null {
  return (
    assignments.find(
      (item) => item.deliveryPhase === "before_session" && item.status !== "archived",
    ) ?? null
  );
}

/** Show Clear & redo for live before_session homework that has any attempt, including empty/glitched. */
export function canShowClearHomework(input: {
  deliveryPhase?: string | null;
  assignmentStatus?: string | null;
  attemptId?: string | null;
}): boolean {
  if (input.deliveryPhase === "during_session") return false;
  if (input.assignmentStatus === "archived") return false;
  return Boolean(input.attemptId);
}

export function hydrateMistakePrompts<T extends { questionId: string; prompt?: string | null }>(
  mistakes: readonly T[],
  promptsByQuestionId: Map<string, string>,
): Array<T & { prompt: string }> {
  return mistakes.map((item) => ({
    ...item,
    prompt: item.prompt?.trim() || promptsByQuestionId.get(item.questionId) || "",
  }));
}
