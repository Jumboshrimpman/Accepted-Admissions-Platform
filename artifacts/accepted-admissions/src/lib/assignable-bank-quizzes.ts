export const BANK_QUIZ_EMPTY_STATE =
  "Create a quiz in Curriculum bank (no session) first.";

export type BankQuizCandidate = {
  id: string;
  courseId: string;
  sessionId: string | null;
  title: string;
  status: string;
  deliveryPhase: string;
  questionCount: number;
};

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isReusableBankQuiz(item: BankQuizCandidate): boolean {
  return (
    item.sessionId == null &&
    item.status !== "archived" &&
    item.deliveryPhase === "before_session"
  );
}

export function bankQuizOptionLabel(
  item: Pick<BankQuizCandidate, "title" | "questionCount">,
): string {
  return `${item.title} · ${item.questionCount} questions`;
}

export function assignableBankQuizzes(
  assignments: BankQuizCandidate[],
  session: { id: string; courseId: string },
): BankQuizCandidate[] {
  const alreadyAssignedTitles = new Set(
    assignments
      .filter(
        (item) =>
          item.sessionId === session.id &&
          item.status !== "archived" &&
          item.deliveryPhase === "before_session",
      )
      .map((item) => normalizeTitle(item.title)),
  );
  const seen = new Set<string>();
  const result: BankQuizCandidate[] = [];
  for (const item of assignments) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.courseId !== session.courseId) continue;
    if (!isReusableBankQuiz(item)) continue;
    if (alreadyAssignedTitles.has(normalizeTitle(item.title))) continue;
    result.push(item);
  }
  return result;
}
