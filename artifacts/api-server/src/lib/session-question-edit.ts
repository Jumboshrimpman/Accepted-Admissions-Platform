import { and, eq, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  bankQuestionsTable,
  db,
  questionsTable,
} from "@workspace/db";
import {
  blankSessionMcqValues,
  sessionQuestionSnapshotValues,
  shouldForkSessionQuestion,
  validateSessionMcqEdit,
} from "./session-question-copy.ts";

export async function forkQuestionIfShared(input: {
  assignmentId: string;
  questionId: string;
}): Promise<{ questionId: string; forked: boolean }> {
  const [bankLink] = await db
    .select({ id: bankQuestionsTable.id })
    .from(bankQuestionsTable)
    .where(eq(bankQuestionsTable.linkedQuestionId, input.questionId))
    .limit(1);
  const otherLinks = await db
    .select({ assignmentId: assignmentQuestionsTable.assignmentId })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.questionId, input.questionId));
  const otherAssignmentCount = otherLinks.filter(
    (link) => link.assignmentId !== input.assignmentId,
  ).length;
  if (
    !shouldForkSessionQuestion({
      bankLinked: Boolean(bankLink),
      otherAssignmentCount,
    })
  ) {
    return { questionId: input.questionId, forked: false };
  }
  const [source] = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.id, input.questionId))
    .limit(1);
  if (!source) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }
  const [created] = await db
    .insert(questionsTable)
    .values(sessionQuestionSnapshotValues(source))
    .returning({ id: questionsTable.id });
  await db
    .update(assignmentQuestionsTable)
    .set({ questionId: created!.id })
    .where(
      and(
        eq(assignmentQuestionsTable.assignmentId, input.assignmentId),
        eq(assignmentQuestionsTable.questionId, input.questionId),
      ),
    );
  return { questionId: created!.id, forked: true };
}

export async function updateSessionAssignmentQuestionContent(input: {
  assignmentId: string;
  questionId: string;
  prompt?: string;
  choices?: unknown;
  correctAnswer?: string;
  explanation?: string;
}) {
  const forked = await forkQuestionIfShared({
    assignmentId: input.assignmentId,
    questionId: input.questionId,
  });
  const [question] = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.id, forked.questionId))
    .limit(1);
  if (!question) {
    throw Object.assign(new Error("Question not found"), { status: 404 });
  }
  const validated = validateSessionMcqEdit({
    prompt: input.prompt ?? question.prompt,
    choices: input.choices ?? question.choices,
    correctAnswer: input.correctAnswer ?? question.correctAnswer,
    explanation: input.explanation ?? question.explanation,
    questionType: question.questionType,
  });
  if (!validated.ok) {
    throw Object.assign(new Error(validated.error), { status: 400 });
  }
  const [updated] = await db
    .update(questionsTable)
    .set({
      prompt: validated.prompt,
      choices: validated.choices,
      correctAnswer: validated.correctAnswer,
      explanation: validated.explanation,
      questionType: "multiple_choice",
    })
    .where(eq(questionsTable.id, forked.questionId))
    .returning();
  return {
    questionId: updated!.id,
    forked: forked.forked,
    question: updated!,
  };
}

export async function addBlankMcqToSessionAssignment(input: {
  assignmentId: string;
  subject: string;
  position?: number;
}) {
  const [created] = await db
    .insert(questionsTable)
    .values(blankSessionMcqValues({ subject: input.subject }))
    .returning();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, input.assignmentId));
  await db.insert(assignmentQuestionsTable).values({
    assignmentId: input.assignmentId,
    questionId: created!.id,
    position: input.position ?? Number(count),
    predictionFirst: false,
  });
  return created!;
}
