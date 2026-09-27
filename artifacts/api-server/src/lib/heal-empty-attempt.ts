import { eq } from "drizzle-orm";
import { attemptsTable, db, responsesTable, timerEventsTable } from "@workspace/db";
import {
  countRecordedAnswers,
  shouldReopenBrokenEmptyAttempt,
} from "./student-attempt-guards.ts";

/**
 * A submitted or expired attempt with no answers and no score is not a
 * finished quiz. Put it back in progress with a fresh timer so the student
 * can see and answer the questions.
 */
export async function reopenBrokenEmptyAttempt(attemptId: string): Promise<boolean> {
  const [attempt] = await db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt) return false;
  const responses = await db
    .select({ finalAnswer: responsesTable.finalAnswer })
    .from(responsesTable)
    .where(eq(responsesTable.attemptId, attemptId));
  if (
    !shouldReopenBrokenEmptyAttempt({
      status: attempt.status,
      hasResult: attempt.result != null,
      score: attempt.score,
      answeredCount: countRecordedAnswers(responses),
    })
  ) {
    return false;
  }
  await db.delete(timerEventsTable).where(eq(timerEventsTable.attemptId, attemptId));
  await db
    .update(attemptsTable)
    .set({
      status: "active",
      submittedAt: null,
      score: null,
      result: null,
      analysis: null,
      studentFeedback: null,
      currentQuestionIndex: 0,
    })
    .where(eq(attemptsTable.id, attemptId));
  await db.insert(timerEventsTable).values({ attemptId, type: "started" });
  return true;
}

export async function reopenBrokenEmptyAttemptsForAssignment(
  assignmentId: string,
): Promise<number> {
  const attempts = await db
    .select({ id: attemptsTable.id })
    .from(attemptsTable)
    .where(eq(attemptsTable.assignmentId, assignmentId));
  let reopened = 0;
  for (const attempt of attempts) {
    if (await reopenBrokenEmptyAttempt(attempt.id)) reopened += 1;
  }
  return reopened;
}
