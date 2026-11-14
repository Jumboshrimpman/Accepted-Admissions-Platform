import { eq, inArray, or, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  bankQuestionsTable,
  db,
  questionsTable,
  remediationRetriesTable,
  sessionsTable,
} from "@workspace/db";
import {
  coercePracticeTestNumber,
  satBankUsageCountsAsSeen,
} from "./sat-set-difficulty.ts";
import {
  emptySeenStudentQuestions,
  isEmptyQuestionFingerprint,
  questionContentFingerprint,
  type SeenStudentQuestions,
} from "./student-question-fingerprint.ts";

export {
  emptySeenStudentQuestions,
  filterUnseenBankItems,
  isEmptyQuestionFingerprint,
  normalizeQuizText,
  questionContentFingerprint,
  questionIsAlreadyAssignedToStudent,
  type SeenStudentQuestions,
} from "./student-question-fingerprint.ts";

/**
 * Questions a student has already been given, by id, official source key, and
 * normalized wording. Includes session-linked quizzes and standalone quizzes
 * on assigned_student_user_id. Archived assignments with no attempts do not
 * count. `ignoreAssignmentIds` drops rows that are about to be replaced.
 */
export async function loadSeenStudentQuestions(
  studentUserId: string,
  ignoreAssignmentIds: readonly string[] = [],
): Promise<SeenStudentQuestions> {
  const seen = emptySeenStudentQuestions();
  const ignore = new Set(ignoreAssignmentIds);
  const rows = await db
    .select({
      questionId: assignmentQuestionsTable.questionId,
      assignmentId: assignmentQuestionsTable.assignmentId,
      status: assignmentsTable.status,
      prompt: questionsTable.prompt,
      stimulus: questionsTable.stimulus,
      choices: questionsTable.choices,
      sourceKey: bankQuestionsTable.sourceKey,
      practiceTestNumber: bankQuestionsTable.practiceTestNumber,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignmentQuestionsTable.assignmentId))
    .leftJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
    .leftJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(
      or(
        eq(sessionsTable.clientUserId, studentUserId),
        eq(assignmentsTable.assignedStudentUserId, studentUserId),
      ),
    );
  const assignmentIds = [...new Set(rows.map((row) => row.assignmentId))];
  const attemptRows =
    assignmentIds.length === 0
      ? []
      : await db
          .select({
            assignmentId: attemptsTable.assignmentId,
            count: sql<number>`count(*)`,
          })
          .from(attemptsTable)
          .where(inArray(attemptsTable.assignmentId, assignmentIds))
          .groupBy(attemptsTable.assignmentId);
  const attemptsByAssignment = new Map(
    attemptRows.map((row) => [row.assignmentId, Number(row.count ?? 0)]),
  );
  for (const row of rows) {
    if (ignore.has(row.assignmentId)) continue;
    const attemptCount = attemptsByAssignment.get(row.assignmentId) ?? 0;
    if (!satBankUsageCountsAsSeen(row.status, attemptCount)) continue;
    if (row.questionId) seen.questionIds.add(row.questionId);
    if (row.sourceKey) {
      seen.sourceKeys.add(row.sourceKey);
      const testNumber = coercePracticeTestNumber(row.practiceTestNumber);
      if (testNumber != null) seen.practiceTests.add(testNumber);
    }
    const fingerprint = questionContentFingerprint(row);
    if (!isEmptyQuestionFingerprint(fingerprint)) seen.fingerprints.add(fingerprint);
  }
  const retries = await db
    .select({
      sourceKey: bankQuestionsTable.sourceKey,
      practiceTestNumber: bankQuestionsTable.practiceTestNumber,
      retryQuestionId: remediationRetriesTable.retryQuestionId,
    })
    .from(remediationRetriesTable)
    .innerJoin(sessionsTable, eq(sessionsTable.id, remediationRetriesTable.sessionId))
    .leftJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.id, remediationRetriesTable.retryBankQuestionId),
    )
    .where(eq(sessionsTable.clientUserId, studentUserId));
  for (const row of retries) {
    if (row.retryQuestionId) seen.questionIds.add(row.retryQuestionId);
    if (!row.sourceKey) continue;
    seen.sourceKeys.add(row.sourceKey);
    const testNumber = coercePracticeTestNumber(row.practiceTestNumber);
    if (testNumber != null) seen.practiceTests.add(testNumber);
  }
  return seen;
}
