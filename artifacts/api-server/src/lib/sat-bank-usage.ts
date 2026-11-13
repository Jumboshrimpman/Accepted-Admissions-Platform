export { satBankUsageCountsAsSeen } from "./sat-set-difficulty.ts";
import { loadSeenStudentQuestions } from "./student-question-usage.ts";

/**
 * Bank questions a student has already been given.
 * Archived assignments with no attempts do not count.
 * `ignoreAssignmentIds` drops rows that are about to be replaced, so a retried
 * assign for the same session does not treat its own pre-work as seen.
 *
 * Also returns question ids and normalized-content fingerprints so assign
 * paths can enforce the per-student no-repeat rule, including standalone
 * quizzes and session-local clones that do not share a linked bank row.
 */
export async function loadSeenSatBankUsage(
  studentUserId: string,
  ignoreAssignmentIds: readonly string[],
): Promise<{
  sourceKeys: Set<string>;
  practiceTests: Set<number>;
  questionIds: Set<string>;
  fingerprints: Set<string>;
}> {
  const seen = await loadSeenStudentQuestions(studentUserId, ignoreAssignmentIds);
  return {
    sourceKeys: seen.sourceKeys,
    practiceTests: seen.practiceTests,
    questionIds: seen.questionIds,
    fingerprints: seen.fingerprints,
  };
}
