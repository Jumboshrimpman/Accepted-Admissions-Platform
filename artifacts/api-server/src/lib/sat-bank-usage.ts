import { eq, inArray, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  bankQuestionsTable,
  db,
  remediationRetriesTable,
  sessionsTable,
} from "@workspace/db";
import {
  coercePracticeTestNumber,
  satBankUsageCountsAsSeen,
} from "./sat-set-difficulty.ts";

/**
 * Bank questions a student has already been given.
 * Archived assignments with no attempts do not count.
 * `ignoreAssignmentIds` drops rows that are about to be replaced, so a retried
 * assign for the same session does not treat its own pre-work as seen.
 */
export async function loadSeenSatBankUsage(
  studentUserId: string,
  ignoreAssignmentIds: readonly string[],
): Promise<{ sourceKeys: Set<string>; practiceTests: Set<number> }> {
  const ignore = new Set(ignoreAssignmentIds);
  const rows = await db
    .select({
      sourceKey: bankQuestionsTable.sourceKey,
      practiceTestNumber: bankQuestionsTable.practiceTestNumber,
      assignmentId: assignmentQuestionsTable.assignmentId,
      status: assignmentsTable.status,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignmentQuestionsTable.assignmentId))
    .innerJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(eq(sessionsTable.clientUserId, studentUserId));
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
  const sourceKeys = new Set<string>();
  const practiceTests = new Set<number>();
  for (const row of rows) {
    if (ignore.has(row.assignmentId)) continue;
    const attemptCount = attemptsByAssignment.get(row.assignmentId) ?? 0;
    if (!satBankUsageCountsAsSeen(row.status, attemptCount)) continue;
    sourceKeys.add(row.sourceKey);
    const testNumber = coercePracticeTestNumber(row.practiceTestNumber);
    if (testNumber != null) practiceTests.add(testNumber);
  }
  const retries = await db
    .select({
      sourceKey: bankQuestionsTable.sourceKey,
      practiceTestNumber: bankQuestionsTable.practiceTestNumber,
    })
    .from(remediationRetriesTable)
    .innerJoin(sessionsTable, eq(sessionsTable.id, remediationRetriesTable.sessionId))
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.id, remediationRetriesTable.retryBankQuestionId),
    )
    .where(eq(sessionsTable.clientUserId, studentUserId));
  for (const row of retries) {
    if (!row.sourceKey) continue;
    sourceKeys.add(row.sourceKey);
    const testNumber = coercePracticeTestNumber(row.practiceTestNumber);
    if (testNumber != null) practiceTests.add(testNumber);
  }
  return { sourceKeys, practiceTests };
}
