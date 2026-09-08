export type SessionHomeworkCandidate = {
  deliveryPhase?: string | null;
  status?: string | null;
};

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
