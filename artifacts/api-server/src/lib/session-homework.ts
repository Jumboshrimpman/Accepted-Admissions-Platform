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

export function hydrateMistakePrompts<T extends { questionId: string; prompt?: string | null }>(
  mistakes: readonly T[],
  promptsByQuestionId: Map<string, string>,
): Array<T & { prompt: string }> {
  return mistakes.map((item) => ({
    ...item,
    prompt: item.prompt?.trim() || promptsByQuestionId.get(item.questionId) || "",
  }));
}
