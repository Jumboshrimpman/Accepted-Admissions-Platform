export const QUESTION_ALREADY_ON_QUIZ_MESSAGE =
  "This question is already on another quiz. A question can only belong to one quiz.";

export type QuestionAssignmentLink = {
  assignmentId: string;
  sessionId: string | null;
  title: string;
};

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Session clones may share questions with their bank quiz. A second bank quiz may not. */
export function questionCanAttachToAssignment(
  existing: QuestionAssignmentLink[],
  target: QuestionAssignmentLink,
): boolean {
  return existing.every((item) => {
    if (item.assignmentId === target.assignmentId) return true;
    const sameTitle = normalizeTitle(item.title) === normalizeTitle(target.title);
    const cloneLineage = item.sessionId != null || target.sessionId != null;
    return sameTitle && cloneLineage;
  });
}
