import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
  responsesTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger.ts";
import { OCT23_REMAINING_HOMEWORK_TITLE } from "./post-session-follow-up.ts";
import { isRecordedAnswer } from "./student-attempt-guards.ts";
import {
  matchesTaitoScheduledDate,
  TAITO_FIRST_ENGLISH_DATE_KEY,
  TAITO_STUDENT_EMAIL,
} from "./session-schedule.ts";

/** Taito's expired Oct 23 in-session attempt. Its stored result stays as history. */
export const OCT23_REMAINING_SOURCE_ATTEMPT_ID = "e38f62db-f088-435c-aa84-4c5480707f59";
export const OCT23_REMAINING_ASSIGNMENT_PREFIX = "84c9dea1";
export const OCT23_REMAINING_TITLE = OCT23_REMAINING_HOMEWORK_TITLE;
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
  sessionLinked: boolean;
};

export type Oct23HomeworkSession = {
  id: string;
  clientUserId: string | null;
  tutorUserId: string | null;
  subject: string;
  dateTime: Date;
  timezone: string | null;
  status?: string | null;
  bookingStatus?: string | null;
  cancelledAt?: Date | null;
};

function isEnglishSubject(subject: string | null | undefined): boolean {
  const value = subject?.trim().toLowerCase() ?? "";
  return value.includes("ielts") || value.includes("english");
}

function sessionIsOpen(session: Oct23HomeworkSession): boolean {
  if (session.cancelledAt) return false;
  const booking = session.bookingStatus?.trim().toLowerCase() ?? "";
  if (booking === "cancelled" || booking === "canceled") return false;
  return (session.status ?? "").trim().toLowerCase() !== "archived";
}

/**
 * Taito's Oct 23 English session. Prefer the in-session set's own session.
 * A later meeting, an SAT meeting, or another student's meeting does not match.
 */
export function pickTaitoOct23HomeworkSession(input: {
  studentUserId: string;
  sourceSessionId?: string | null;
  sessions: readonly Oct23HomeworkSession[];
  now?: Date;
}): Oct23HomeworkSession | null {
  const now = input.now ?? new Date();
  const eligible = input.sessions.filter((session) => {
    if (session.clientUserId !== input.studentUserId) return false;
    if (!sessionIsOpen(session)) return false;
    if (!isEnglishSubject(session.subject)) return false;
    if (session.dateTime.getTime() > now.getTime()) return false;
    return matchesTaitoScheduledDate(
      {
        dateTime: session.dateTime,
        timezone: session.timezone,
        clientUserId: session.clientUserId,
        taitoUserId: input.studentUserId,
      },
      TAITO_FIRST_ENGLISH_DATE_KEY,
    );
  });
  const source = input.sourceSessionId
    ? eligible.find((session) => session.id === input.sourceSessionId)
    : undefined;
  if (source) return source;
  eligible.sort((left, right) => right.dateTime.getTime() - left.dateTime.getTime());
  return eligible[0] ?? null;
}

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
  return { action: "skipped", reason, remaining, linked: 0, created: false, sessionLinked: false };
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
      sessionId: assignmentsTable.sessionId,
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

  const studentSessions = await db
    .select({
      id: sessionsTable.id,
      clientUserId: sessionsTable.clientUserId,
      tutorUserId: sessionsTable.tutorUserId,
      subject: sessionsTable.subject,
      dateTime: sessionsTable.dateTime,
      timezone: sessionsTable.timezone,
      status: sessionsTable.status,
      bookingStatus: sessionsTable.bookingStatus,
      cancelledAt: sessionsTable.cancelledAt,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.clientUserId, student.id));
  const target = pickTaitoOct23HomeworkSession({
    studentUserId: student.id,
    sourceSessionId: source.sessionId,
    sessions: studentSessions,
  });

  const titled = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.title, OCT23_REMAINING_TITLE),
        ne(assignmentsTable.status, "archived"),
      ),
    );
  const mine = titled.filter((row) => row.assignedStudentUserId === student.id);
  const unassignedMasters = titled.filter(
    (row) =>
      row.assignedStudentUserId == null &&
      row.sessionId == null &&
      row.courseId === source.courseId,
  );
  const candidates = [
    ...mine,
    ...unassignedMasters.filter((row) => !mine.some((owned) => owned.id === row.id)),
  ];
  if (candidates.length > 1) {
    const result = skipped("duplicate", remainingIds.length);
    logger.info(result, "Taito Oct 23 remaining homework skipped");
    return result;
  }

  const already = candidates[0];
  if (already) {
    if (already.sessionId && target && already.sessionId !== target.id) {
      const result = skipped("session_conflict", remainingIds.length);
      logger.info(result, "Taito Oct 23 remaining homework skipped");
      return result;
    }
    if (!target) {
      const result: TaitoOct23RemainingResult = {
        action: "unchanged",
        reason: "session_missing",
        remaining: remainingIds.length,
        linked: 0,
        created: false,
        sessionLinked: false,
      };
      logger.info(result, "Taito Oct 23 remaining homework ready");
      return result;
    }
    const linked = await linkedQuestionIds(already.id);
    const started = (await attemptCount(already.id)) > 0;
    if (!started && remainingIds.length > 0 && linked.join() !== remainingIds.join()) {
      await replaceLinks(already.id, remainingIds);
    }
    const limitsDrift =
      !started &&
      (Number(already.timeLimitMinutes) !== OCT23_REMAINING_TIME_LIMIT_MINUTES ||
        Number(already.maxAttempts) !== OCT23_REMAINING_MAX_ATTEMPTS);
    const needsAttachment =
      already.sessionId !== target.id ||
      already.assignedStudentUserId !== student.id ||
      already.assignedTutorUserId !== target.tutorUserId ||
      limitsDrift;
    if (needsAttachment) {
      await db
        .update(assignmentsTable)
        .set({
          sessionId: target.id,
          assignedStudentUserId: student.id,
          assignedTutorUserId: target.tutorUserId,
          deliveryPhase: "before_session",
          subject: source.subject,
          ...(limitsDrift
            ? {
                timeLimitMinutes: OCT23_REMAINING_TIME_LIMIT_MINUTES,
                maxAttempts: OCT23_REMAINING_MAX_ATTEMPTS,
              }
            : {}),
        })
        .where(eq(assignmentsTable.id, already.id));
    }
    const result: TaitoOct23RemainingResult = {
      action: "unchanged",
      reason: started ? "attempt_exists" : null,
      remaining: remainingIds.length,
      linked: started ? linked.length : remainingIds.length > 0 ? remainingIds.length : linked.length,
      created: false,
      sessionLinked: true,
    };
    logger.info(result, "Taito Oct 23 remaining homework ready");
    return result;
  }

  if (!target) {
    const result = skipped("session_missing", remainingIds.length);
    logger.info(result, "Taito Oct 23 remaining homework skipped");
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
      sessionId: target.id,
      assignedStudentUserId: student.id,
      assignedTutorUserId: target.tutorUserId,
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
    sessionLinked: true,
  };
  logger.info(result, "Taito Oct 23 remaining homework ready");
  return result;
}
