export const BANK_QUIZ_EMPTY_STATE =
  "Create a quiz in the Quizzes workspace (no session) first.";

export const ASSIGNABLE_BANK_QUIZ_STATUSES = ["published", "draft"] as const;

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

export function isAssignableBankQuizStatus(status: string): boolean {
  return (ASSIGNABLE_BANK_QUIZ_STATUSES as readonly string[]).includes(status);
}

export function isReusableBankQuiz(item: BankQuizCandidate): boolean {
  return (
    item.sessionId == null &&
    isAssignableBankQuizStatus(item.status) &&
    item.status !== "archived" &&
    item.deliveryPhase === "before_session"
  );
}

export function bankQuizOptionLabel(
  item: Pick<BankQuizCandidate, "title" | "questionCount">,
): string {
  return `${item.title} · ${item.questionCount} questions`;
}

export function sessionPreworkQuizzes<T extends BankQuizCandidate>(
  assignments: T[],
  session: { id: string },
): T[] {
  return assignments.filter(
    (item) =>
      item.sessionId === session.id &&
      item.deliveryPhase === "before_session" &&
      item.status !== "archived",
  );
}

export function assignableBankQuizzes(
  assignments: BankQuizCandidate[],
  session: { id: string; courseId: string },
  options: { includeAssignedTitles?: boolean } = {},
): BankQuizCandidate[] {
  // Title-only dedupe: AdminAssignment / clone payload has no sourceAssignmentId
  // (assignments table stores no clone lineage). Renaming a session copy lets the
  // same bank quiz be offered again for that session. Replace-pre-work passes
  // includeAssignedTitles after the previous session copy is archived.
  const alreadyAssignedTitles = new Set(
    sessionPreworkQuizzes(assignments, session).map((item) => normalizeTitle(item.title)),
  );
  const seen = new Set<string>();
  const result: BankQuizCandidate[] = [];
  for (const item of assignments) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.courseId !== session.courseId) continue;
    if (!isReusableBankQuiz(item)) continue;
    if (!options.includeAssignedTitles && alreadyAssignedTitles.has(normalizeTitle(item.title))) {
      continue;
    }
    result.push(item);
  }
  return result;
}
