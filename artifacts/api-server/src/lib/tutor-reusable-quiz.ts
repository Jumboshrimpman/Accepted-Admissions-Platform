import {
  assignmentQuestionsTable,
  assignmentsTable,
  auditLogsTable,
  bankQuestionsTable,
  coursesTable,
  db,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { materializeBankQuestion } from "./sat-bank-service.ts";
import {
  selectBankQuestionsForTutorQuiz,
  tutorQuizTimeLimitMinutes,
} from "./tutor-reusable-quiz-select.ts";

export {
  TUTOR_QUIZ_MAX_QUESTIONS,
  TUTOR_QUIZ_SPR_NOTE,
  isTutorQuizMcq,
  selectBankQuestionsForTutorQuiz,
  tutorQuizTimeLimitMinutes,
} from "./tutor-reusable-quiz-select.ts";

export async function createReusableQuizFromBank(input: {
  courseId: string;
  title: string;
  subject?: string | null;
  bankQuestionIds: string[];
  actorUserId?: string | null;
}) {
  const title = input.title.trim();
  if (title.length < 2) {
    throw Object.assign(new Error("A quiz title is required."), { status: 400 });
  }
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, input.courseId))
    .limit(1);
  if (!course) {
    throw Object.assign(new Error("Program not found"), { status: 404 });
  }
  const uniqueIds = [...new Set(input.bankQuestionIds)];
  const rows =
    uniqueIds.length > 0
      ? await db
          .select()
          .from(bankQuestionsTable)
          .where(inArray(bankQuestionsTable.id, uniqueIds))
      : [];
  const planned = selectBankQuestionsForTutorQuiz(rows, input.bankQuestionIds);
  if (planned.error || planned.selected.length === 0) {
    throw Object.assign(new Error(planned.error || "Select at least one multiple-choice question."), {
      status: 400,
    });
  }
  const estimatedSeconds = planned.selected.reduce(
    (sum, row) => sum + Math.max(0, Number(row.estimatedSeconds) || 0),
    0,
  );
  const subject = input.subject?.trim() || course.subject || "SAT";
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course.id,
      sessionId: null,
      deliveryPhase: "before_session",
      title,
      subject,
      instructions: "Reusable quiz assembled from official SAT/PSAT bank questions.",
      status: "published",
      timeLimitMinutes: tutorQuizTimeLimitMinutes(estimatedSeconds, planned.selected.length),
      maxAttempts: 1,
    })
    .returning();
  for (const [index, bank] of planned.selected.entries()) {
    const questionId = await materializeBankQuestion(bank.id);
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: assignment!.id,
      questionId,
      position: index,
      predictionFirst: false,
    });
  }
  if (input.actorUserId) {
    await db.insert(auditLogsTable).values({
      actorUserId: input.actorUserId,
      action: "assignment.created",
      entityType: "assignment",
      entityId: assignment!.id,
      metadata: {
        courseId: assignment!.courseId,
        sessionId: assignment!.sessionId,
        status: assignment!.status,
        source: "tutor-bank-quiz",
        bankQuestionIds: planned.selected.map((row) => row.id),
      },
    });
  }
  return assignment!;
}
