import { and, desc, eq } from "drizzle-orm";
import {
  adminNotificationsTable,
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
  questionReportsTable,
  questionsTable,
  usersTable,
} from "@workspace/db";
import {
  QUESTION_REPORT_ADMIN_EMAIL,
  sendTransactionalEmail,
  type TransactionalEmailResult,
} from "./transactional-email.ts";
import {
  isQuestionReportReason,
  questionReportEmailBody,
  stemSnippetForReport,
  type QuestionReportReason,
} from "./question-report-copy.ts";

export {
  isQuestionReportReason,
  questionReportEmailBody,
  stemSnippetForReport,
  type QuestionReportReason,
} from "./question-report-copy.ts";

export async function createQuestionReport(input: {
  attemptId: string;
  questionId: string;
  studentUserId: string;
  reason: QuestionReportReason;
  note?: string | null;
}): Promise<{
  report: typeof questionReportsTable.$inferSelect;
  emailDelivery: TransactionalEmailResult;
}> {
  const [attempt] = await db
    .select({
      attempt: attemptsTable,
      assignment: assignmentsTable,
      student: usersTable,
    })
    .from(attemptsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
    .where(eq(attemptsTable.id, input.attemptId))
    .limit(1);
  if (!attempt || attempt.attempt.userId !== input.studentUserId) {
    throw Object.assign(new Error("Attempt not found"), { status: 404 });
  }
  const [link] = await db
    .select({
      position: assignmentQuestionsTable.position,
      prompt: questionsTable.prompt,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
    .where(
      and(
        eq(assignmentQuestionsTable.assignmentId, attempt.assignment.id),
        eq(assignmentQuestionsTable.questionId, input.questionId),
      ),
    )
    .limit(1);
  if (!link) {
    throw Object.assign(new Error("Question is not on this assignment"), { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(questionReportsTable)
    .where(
      and(
        eq(questionReportsTable.attemptId, input.attemptId),
        eq(questionReportsTable.questionId, input.questionId),
        eq(questionReportsTable.status, "open"),
      ),
    )
    .limit(1);
  if (existing) {
    return { report: existing, emailDelivery: { status: "skipped", reason: "already reported" } };
  }

  const stemSnippet = stemSnippetForReport(link.prompt);
  const [report] = await db
    .insert(questionReportsTable)
    .values({
      attemptId: input.attemptId,
      assignmentId: attempt.assignment.id,
      questionId: input.questionId,
      questionIndex: Number(link.position ?? 0),
      studentUserId: input.studentUserId,
      reason: input.reason,
      note: input.note?.trim() || null,
      stemSnippet,
      status: "open",
    })
    .returning();

  const administrators = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "administrator"));
  if (administrators.length > 0) {
    await db.insert(adminNotificationsTable).values(
      administrators.map((admin) => ({
        recipientUserId: admin.id,
        kind: "question_report",
        sessionId: attempt.assignment.sessionId,
        title: "Question reported",
        message: `${attempt.student.displayName} reported Q${Number(link.position ?? 0) + 1} on ${attempt.assignment.title}.`,
        status: "unread",
      })),
    );
  }

  const emailDelivery = await sendTransactionalEmail({
    to: QUESTION_REPORT_ADMIN_EMAIL,
    subject: `Question report: ${attempt.assignment.title} Q${Number(link.position ?? 0) + 1}`,
    text: questionReportEmailBody({
      studentName: attempt.student.displayName,
      studentEmail: attempt.student.email,
      assignmentTitle: attempt.assignment.title,
      assignmentId: attempt.assignment.id,
      attemptId: input.attemptId,
      questionId: input.questionId,
      questionIndex: Number(link.position ?? 0),
      reason: input.reason,
      note: input.note,
      stemSnippet,
    }),
  });

  return { report: report!, emailDelivery };
}

export async function listQuestionReports(status?: string) {
  const rows = await db
    .select({
      report: questionReportsTable,
      assignmentTitle: assignmentsTable.title,
      studentName: usersTable.displayName,
      studentEmail: usersTable.email,
    })
    .from(questionReportsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, questionReportsTable.assignmentId))
    .innerJoin(usersTable, eq(usersTable.id, questionReportsTable.studentUserId))
    .orderBy(desc(questionReportsTable.createdAt));
  return rows
    .filter((row) => !status || row.report.status === status)
    .map((row) => ({
      id: row.report.id,
      attemptId: row.report.attemptId,
      assignmentId: row.report.assignmentId,
      assignmentTitle: row.assignmentTitle,
      questionId: row.report.questionId,
      questionIndex: row.report.questionIndex,
      studentUserId: row.report.studentUserId,
      studentName: row.studentName,
      studentEmail: row.studentEmail,
      reason: row.report.reason,
      note: row.report.note,
      stemSnippet: row.report.stemSnippet,
      status: row.report.status,
      createdAt: row.report.createdAt,
    }));
}

export async function updateQuestionReportStatus(
  reportId: string,
  status: "open" | "resolved" | "dismissed",
) {
  const [updated] = await db
    .update(questionReportsTable)
    .set({ status })
    .where(eq(questionReportsTable.id, reportId))
    .returning();
  return updated ?? null;
}

export async function reportedQuestionIdsForAttempt(attemptId: string): Promise<Set<string>> {
  const rows = await db
    .select({ questionId: questionReportsTable.questionId })
    .from(questionReportsTable)
    .where(eq(questionReportsTable.attemptId, attemptId));
  return new Set(rows.map((row) => row.questionId));
}
