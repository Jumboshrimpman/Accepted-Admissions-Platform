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

/** Admin inventory: every before-session copy on the meeting, including archived resets. */
export function sessionHomeworkInventory<T extends BankQuizCandidate>(
  assignments: T[],
  session: { id: string },
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of assignments) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.sessionId !== session.id) continue;
    if (item.deliveryPhase !== "before_session") continue;
    result.push(item);
  }
  return result.sort((left, right) => {
    const statusScore = (status: string) =>
      status === "published" ? 2 : status === "archived" ? 0 : 1;
    const statusDelta = statusScore(right.status) - statusScore(left.status);
    if (statusDelta !== 0) return statusDelta;
    return right.questionCount - left.questionCount;
  });
}

function isStatusDiagnostic(item: { title: string; questionCount: number }): boolean {
  const title = item.title.trim().toLowerCase();
  if (title.includes("full-length sat diagnostic")) return true;
  if (title.includes("full sat practice diagnostic")) return true;
  return title.includes("diagnostic") && item.questionCount >= 80;
}

/**
 * Student/tutor Homework status & results: hide archived leftovers, one row per id,
 * and one current full-length diagnostic.
 */
export function sessionStatusHomework<
  T extends {
    id?: string;
    assignmentId?: string;
    title: string;
    status: string;
    questionCount?: number;
  },
>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const id = item.assignmentId ?? item.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (item.status === "archived") continue;
    unique.push(item);
  }
  const diagnostics = unique.filter((item) =>
    isStatusDiagnostic({ title: item.title, questionCount: item.questionCount ?? 0 }),
  );
  if (diagnostics.length <= 1) return unique;
  const keeper = [...diagnostics].sort((left, right) => {
    return (right.questionCount ?? 0) - (left.questionCount ?? 0);
  })[0];
  const keeperId = keeper?.assignmentId ?? keeper?.id;
  return unique.filter((item) => {
    const isDiagnostic = isStatusDiagnostic({
      title: item.title,
      questionCount: item.questionCount ?? 0,
    });
    return !isDiagnostic || (item.assignmentId ?? item.id) === keeperId;
  });
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
