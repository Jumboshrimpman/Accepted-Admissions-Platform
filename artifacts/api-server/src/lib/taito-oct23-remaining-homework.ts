import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
  responsesTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger.ts";
import { isRecordedAnswer } from "./student-attempt-guards.ts";
import { TAITO_STUDENT_EMAIL } from "./session-schedule.ts";

/** Taito's expired Oct 23 in-session attempt. Its stored result stays as history. */
export const OCT23_REMAINING_SOURCE_ATTEMPT_ID = "e38f62db-f088-435c-aa84-4c5480707f59";
export const OCT23_REMAINING_ASSIGNMENT_PREFIX = "84c9dea1";
export const OCT23_REMAINING_TITLE = "Oct 23 In-Session Practice — Remaining Questions";
export const OCT23_REMAINING_TIME_LIMIT_MINUTES = 60;
export const OCT23_REMAINING_MAX_ATTEMPTS = 2;

const INSTRUCTIONS =
  "Finish the Oct 23 in-session questions that did not get a final answer. Your original result stays on record. This homework is timed.";

export type TaitoOct23RemainingResult = {
  action: "created" | "unchanged" | "skipped";
  reason: string | null;
  remaining: number;
  linked: number;
  created: boolean;
};

type QuestionLink = { questionId: string; position: number };
type AttemptResponse = { questionId: string; finalAnswer: string | null };

export function unansweredQuestionIds(
  questions: readonly QuestionLink[],
  responses: readonly AttemptResponse[],
): string[] {
  const answered = new Set(
    responses
      .filter((response) => isRecordedAnswer(response.finalAnswer))
      .map((response) => response.questionId),
  );
  return [...questions]
    .sort((left, right) => left.position - right.position)
    .map((question) => question.questionId)
    .filter((questionId) => !answered.has(questionId));
}

function skipped(reason: string, remaining = 0): TaitoOct23RemainingResult {
  return { action: "skipped", reason, remaining, linked: 0, created: false };
}

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

async function attemptCount(assignmentId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(attemptsTable)
    .where(eq(attemptsTable.assignmentId, assignmentId));
  return Number(count ?? 0);
}

async function linkedQuestionIds(assignmentId: string): Promise<string[]> {
  const rows = await db
    .select({ questionId: assignmentQuestionsTable.questionId })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentQuestionsTable.position));
  return rows.map((row) => row.questionId);
}

async function replaceLinks(assignmentId: string, questionIds: readonly string[]): Promise<void> {
  await db
    .delete(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  for (const [index, questionId] of questionIds.entries()) {
    await db.insert(assignmentQuestionsTable).values({
      assignmentId,
      questionId,
      position: index,
      predictionFirst: false,
    });
  }
}

/**
 * Homework for the questions Taito never answered on the Oct 23 in-session attempt.
 * Links the existing question rows. Does not email, and does not rewrite that attempt.
 */
export async function ensureTaitoOct23RemainingHomework(options?: {
  attemptId?: string;
  assignmentIdPrefix?: string;
  studentEmail?: string;
}): Promise<TaitoOct23RemainingResult> {
  const attemptId = options?.attemptId ?? OCT23_REMAINING_SOURCE_ATTEMPT_ID;
  const assignmentIdPrefix = (
    options?.assignmentIdPrefix ?? OCT23_REMAINING_ASSIGNMENT_PREFIX
  ).toLowerCase();
  const studentEmail = normalizeEmail(options?.studentEmail ?? TAITO_STUDENT_EMAIL);

  const [attempt] = await db
    .select({
      id: attemptsTable.id,
      assignmentId: attemptsTable.assignmentId,
      userId: attemptsTable.userId,
    })
    .from(attemptsTable)
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt) {
    const result = skipped("attempt_missing");
    logger.info(result, "Taito Oct 23 remaining homework skipped");
    return result;
  }

  const [source] = await db
    .select({
      id: assignmentsTable.id,
      courseId: assignmentsTable.courseId,
      subject: assignmentsTable.subject,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, attempt.assignmentId))
    .limit(1);
  if (!source || !source.id.toLowerCase().startsWith(assignmentIdPrefix)) {
    const result = skipped("assignment_mismatch");
    logger.info(result, "Taito Oct 23 remaining homework skipped");
    return result;
  }

  const [student] = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, attempt.userId))
    .limit(1);
  if (!student || student.role !== "student" || normalizeEmail(student.email) !== studentEmail) {
    const result = skipped("student_mismatch");
    logger.info(result, "Taito Oct 23 remaining homework skipped");
    return result;
  }

  const questions = await db
    .select({
      questionId: assignmentQuestionsTable.questionId,
      position: assignmentQuestionsTable.position,
    })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, source.id))
    .orderBy(asc(assignmentQuestionsTable.position));
  const responses = await db
    .select({
      questionId: responsesTable.questionId,
      finalAnswer: responsesTable.finalAnswer,
    })
    .from(responsesTable)
    .where(eq(responsesTable.attemptId, attempt.id));
  const remainingIds = unansweredQuestionIds(questions, responses);

  const existing = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.title, OCT23_REMAINING_TITLE),
        eq(assignmentsTable.assignedStudentUserId, student.id),
        ne(assignmentsTable.status, "archived"),
      ),
    );
  if (existing.length > 1) {
    const result = skipped("duplicate", remainingIds.length);
    logger.info(result, "Taito Oct 23 remaining homework skipped");
    return result;
  }

  const already = existing[0];
  if (already) {
    const linked = await linkedQuestionIds(already.id);
    const started = (await attemptCount(already.id)) > 0;
    if (!started && remainingIds.length > 0 && linked.join() !== remainingIds.join()) {
      await replaceLinks(already.id, remainingIds);
    }
    const result: TaitoOct23RemainingResult = {
      action: "unchanged",
      reason: started ? "attempt_exists" : null,
      remaining: remainingIds.length,
      linked: started ? linked.length : remainingIds.length > 0 ? remainingIds.length : linked.length,
      created: false,
    };
    logger.info(result, "Taito Oct 23 remaining homework ready");
    return result;
  }

  if (remainingIds.length === 0) {
    const result = skipped("none_remaining");
    logger.info(result, "Taito Oct 23 remaining homework skipped");
    return result;
  }

  const [created] = await db
    .insert(assignmentsTable)
    .values({
      courseId: source.courseId,
      sessionId: null,
      assignedStudentUserId: student.id,
      deliveryPhase: "before_session",
      title: OCT23_REMAINING_TITLE,
      subject: source.subject,
      instructions: INSTRUCTIONS,
      status: "published",
      timeLimitMinutes: OCT23_REMAINING_TIME_LIMIT_MINUTES,
      maxAttempts: OCT23_REMAINING_MAX_ATTEMPTS,
    })
    .returning({ id: assignmentsTable.id });
  if (!created) {
    const result = skipped("insert_failed", remainingIds.length);
    logger.info(result, "Taito Oct 23 remaining homework skipped");
    return result;
  }
  await replaceLinks(created.id, remainingIds);
  const result: TaitoOct23RemainingResult = {
    action: "created",
    reason: null,
    remaining: remainingIds.length,
    linked: remainingIds.length,
    created: true,
  };
  logger.info(result, "Taito Oct 23 remaining homework ready");
  return result;
}
