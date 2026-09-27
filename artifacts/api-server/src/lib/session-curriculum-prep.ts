import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  adaptiveRecommendationsTable,
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  auditLogsTable,
  curriculumBlocksTable,
  db,
  questionsTable,
  responsesTable,
  reviewQueueTable,
  sessionsTable,
} from "@workspace/db";
import {
  describeSessionPrepMode,
  type SessionPrepMode,
} from "./assessment-analysis";
import {
  IN_SESSION_PRACTICE_INSTRUCTIONS,
  IN_SESSION_PRACTICE_TITLE,
  deterministicPracticeQuestion,
  practiceSubjectFamily,
  samePracticeQuestionSet,
  selectHomeworkForPracticePrep,
  selectPracticeQuestionsFromHomeworkMisses,
  type HomeworkMissForPractice,
  type PracticeSkillMapping,
} from "./in-session-practice";
import { isStudentUsableServedQuestion } from "./sat-bank-diagnostic-quality";
import {
  IN_SESSION_HOMEWORK_COMPLETION_TITLE,
  MAX_IN_SESSION_HOMEWORK_QUESTIONS,
  selectInSessionHomeworkQuestionIds,
} from "./session-homework";

function subjectFamily(subject: string): string {
  return practiceSubjectFamily(subject);
}

async function ensureDuringSessionAssignment(
  session: typeof sessionsTable.$inferSelect,
) {
  const [existing] = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, session.id),
        eq(assignmentsTable.deliveryPhase, "during_session"),
      ),
    )
    .orderBy(asc(assignmentsTable.createdAt))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(assignmentsTable)
    .values({
      courseId: session.courseId,
      sessionId: session.id,
      deliveryPhase: "during_session",
      title: `During session practice — ${session.title}`,
      subject: session.subject,
      instructions:
        "Work through this original practice sequence with your tutor during the session.",
      status: "draft",
      timeLimitMinutes: 30,
      maxAttempts: 1,
    })
    .returning();
  return created!;
}

async function assignmentQuestionCount(assignmentId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  return Number(count ?? 0);
}

async function attachQuestions(
  assignmentId: string,
  questionIds: string[],
): Promise<number> {
  if (questionIds.length === 0) return 0;
  const existing = await db
    .select({ questionId: assignmentQuestionsTable.questionId })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  const already = new Set(existing.map((row) => row.questionId));
  let position = existing.length;
  let attached = 0;
  for (const questionId of questionIds) {
    if (already.has(questionId)) continue;
    await db
      .insert(assignmentQuestionsTable)
      .values({
        assignmentId,
        questionId,
        position,
      })
      .onConflictDoNothing();
    already.add(questionId);
    position += 1;
    attached += 1;
  }
  if (attached > 0) {
    await db
      .update(assignmentsTable)
      .set({ status: "published" })
      .where(eq(assignmentsTable.id, assignmentId));
  }
  return attached;
}

async function ensurePrepBlock(
  sessionId: string,
  mode: SessionPrepMode,
  summary: string,
) {
  const [existing] = await db
    .select()
    .from(curriculumBlocksTable)
    .where(
      and(
        eq(curriculumBlocksTable.sessionId, sessionId),
        eq(curriculumBlocksTable.kind, "adaptive_prep"),
      ),
    )
    .limit(1);
  const config = {
    title: "AI-native session plan",
    mode,
    text: summary,
  };
  if (existing) {
    await db
      .update(curriculumBlocksTable)
      .set({
        status: "published",
        visibility: "tutor",
        config,
        updatedAt: new Date(),
      })
      .where(eq(curriculumBlocksTable.id, existing.id));
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(curriculumBlocksTable)
    .where(eq(curriculumBlocksTable.sessionId, sessionId));
  await db.insert(curriculumBlocksTable).values({
    sessionId,
    kind: "adaptive_prep",
    position: Number(count ?? 0),
    visibility: "tutor",
    status: "published",
    config,
  });
}

async function copyHomeworkIntoDuringSession(
  homeworkId: string,
  duringId: string,
): Promise<number> {
  const source = await db
    .select({
      questionId: assignmentQuestionsTable.questionId,
      predictionFirst: assignmentQuestionsTable.predictionFirst,
    })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, homeworkId))
    .orderBy(asc(assignmentQuestionsTable.position));
  if (source.length === 0) return 0;
  const existing = await db
    .select({ questionId: assignmentQuestionsTable.questionId })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, duringId));
  const already = new Set(existing.map((row) => row.questionId));
  const answeredRows = await db
    .select({
      questionId: responsesTable.questionId,
      finalAnswer: responsesTable.finalAnswer,
    })
    .from(responsesTable)
    .innerJoin(attemptsTable, eq(attemptsTable.id, responsesTable.attemptId))
    .where(eq(attemptsTable.assignmentId, homeworkId));
  const answered = new Set(
    answeredRows
      .filter((row) => Boolean(row.finalAnswer?.trim()))
      .map((row) => row.questionId),
  );
  const unansweredIds = source
    .map((row) => row.questionId)
    .filter((id) => !answered.has(id));
  const selectedIds = selectInSessionHomeworkQuestionIds(
    source.map((row) => row.questionId),
    {
      unansweredIds,
      alreadyAttachedIds: [...already],
    },
  );
  const sourceById = new Map(source.map((row) => [row.questionId, row]));
  let position = existing.length;
  let attached = 0;
  for (const questionId of selectedIds) {
    if (already.has(questionId)) continue;
    const row = sourceById.get(questionId);
    await db
      .insert(assignmentQuestionsTable)
      .values({
        assignmentId: duringId,
        questionId,
        position,
        predictionFirst: row?.predictionFirst ?? false,
      })
      .onConflictDoNothing();
    already.add(questionId);
    position += 1;
    attached += 1;
  }
  if (attached > 0 || source.length > 0) {
    await db
      .update(assignmentsTable)
      .set({
        status: "published",
        instructions:
          "Work up to 15 of these items together. You can submit for results without answering every question.",
        title: IN_SESSION_HOMEWORK_COMPLETION_TITLE,
        timeLimitMinutes: 30,
      })
      .where(eq(assignmentsTable.id, duringId));
  }
  return attached;
}

async function ensureOriginalPracticeQuestion(
  skill: string,
  subject: string,
  blocked: Set<string>,
) {
  const existing = await db
    .select()
    .from(questionsTable)
    .where(
      and(
        eq(questionsTable.subject, subject),
        eq(questionsTable.skill, skill),
        eq(questionsTable.sourceType, "original"),
        eq(questionsTable.generationMethod, "adaptive-deterministic"),
        eq(questionsTable.reviewStatus, "approved"),
      ),
    )
    .orderBy(desc(questionsTable.createdAt));
  const available = existing.find(
    (question) => !blocked.has(question.id) && isStudentUsableServedQuestion(question),
  );
  if (available) return available;

  const template = deterministicPracticeQuestion(skill);
  const [created] = await db
    .insert(questionsTable)
    .values({
      subject,
      domain: "Adaptive practice",
      skill,
      questionType: "multiple_choice",
      difficulty: "medium",
      stimulus: template.stimulus,
      prompt: template.prompt,
      choices: template.choices,
      correctAnswer: template.correctAnswer,
      explanation: template.explanation,
      sourceType: "original",
      sourceId: null,
      reviewStatus: "approved",
      tags: [`adaptive:${skill.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, "in-session-practice"],
      generationMethod: "adaptive-deterministic",
      reviewedAt: new Date(),
    })
    .returning();
  return created ?? null;
}

async function usedQuestionIdsForPractice(
  courseId: string,
  studentUserId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ questionId: responsesTable.questionId })
    .from(responsesTable)
    .innerJoin(attemptsTable, eq(attemptsTable.id, responsesTable.attemptId))
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .where(
      and(eq(assignmentsTable.courseId, courseId), eq(attemptsTable.userId, studentUserId)),
    );
  return new Set(rows.map((row) => row.questionId));
}

async function syncPracticeQuestions(
  assignmentId: string,
  questionIds: string[],
): Promise<boolean> {
  const existing = await db
    .select({ questionId: assignmentQuestionsTable.questionId })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentQuestionsTable.position));
  const current = existing.map((row) => row.questionId);
  if (samePracticeQuestionSet(current, questionIds)) return false;
  await db
    .delete(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  for (let index = 0; index < questionIds.length; index += 1) {
    await db.insert(assignmentQuestionsTable).values({
      assignmentId,
      questionId: questionIds[index]!,
      position: index,
      predictionFirst: false,
    });
  }
  return true;
}

async function publishPracticeFromHomeworkMisses(
  session: typeof sessionsTable.$inferSelect,
  duringId: string,
  studentUserId: string,
  missed: HomeworkMissForPractice[],
): Promise<{ questionCount: number; changed: boolean; mapping: PracticeSkillMapping[] }> {
  const blocked = await usedQuestionIdsForPractice(session.courseId, studentUserId);
  const bankRows = await db
    .select()
    .from(questionsTable)
    .where(
      and(
        inArray(questionsTable.reviewStatus, ["approved", "reviewed"]),
        eq(questionsTable.sourceType, "original"),
      ),
    );
  const usable = bankRows.filter((question) => isStudentUsableServedQuestion(question));
  const recommendations = await db
    .select({
      id: adaptiveRecommendationsTable.id,
      status: adaptiveRecommendationsTable.status,
      recommendedQuestionId: adaptiveRecommendationsTable.recommendedQuestionId,
    })
    .from(adaptiveRecommendationsTable)
    .where(eq(adaptiveRecommendationsTable.sessionId, session.id));
  const recommendedIds = new Set(
    recommendations
      .filter((row) => row.status !== "dismissed")
      .map((row) => row.recommendedQuestionId)
      .filter((id): id is string => Boolean(id)),
  );
  const preferred = usable.filter((question) => recommendedIds.has(question.id));
  const rest = usable.filter((question) => !recommendedIds.has(question.id));
  const plan = selectPracticeQuestionsFromHomeworkMisses({
    missed,
    bank: [...preferred, ...rest].map((question) => ({
      id: question.id,
      skill: question.skill,
      subject: question.subject,
    })),
    sessionSubject: session.subject,
    usedQuestionIds: blocked,
    maxCount: MAX_IN_SESSION_HOMEWORK_QUESTIONS,
  });
  const mapping = plan.mapping.map((row) => ({ ...row }));
  for (const row of mapping) {
    if (row.practiceQuestionId) continue;
    const created = await ensureOriginalPracticeQuestion(row.skill, session.subject, blocked);
    if (!created) continue;
    row.practiceQuestionId = created.id;
    blocked.add(created.id);
  }
  const questionIds: string[] = [];
  for (const id of [
    ...mapping.flatMap((row) => (row.practiceQuestionId ? [row.practiceQuestionId] : [])),
    ...plan.extraQuestionIds,
  ]) {
    if (questionIds.includes(id)) continue;
    questionIds.push(id);
    if (questionIds.length >= MAX_IN_SESSION_HOMEWORK_QUESTIONS) break;
  }
  if (questionIds.length === 0) {
    return { questionCount: await assignmentQuestionCount(duringId), changed: false, mapping };
  }
  const questionsChanged = await syncPracticeQuestions(duringId, questionIds);
  const [current] = await db
    .select({ title: assignmentsTable.title, status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, duringId))
    .limit(1);
  const metaChanged =
    current?.title !== IN_SESSION_PRACTICE_TITLE || current.status !== "published";
  if (questionsChanged || metaChanged) {
    await db
      .update(assignmentsTable)
      .set({
        status: "published",
        title: IN_SESSION_PRACTICE_TITLE,
        instructions: IN_SESSION_PRACTICE_INSTRUCTIONS,
        timeLimitMinutes: 30,
      })
      .where(eq(assignmentsTable.id, duringId));
  }
  const attachedIds = new Set(questionIds);
  for (const row of recommendations) {
    if (row.status === "dismissed" || row.status === "accepted") continue;
    if (!row.recommendedQuestionId || !attachedIds.has(row.recommendedQuestionId)) continue;
    await db
      .update(adaptiveRecommendationsTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(adaptiveRecommendationsTable.id, row.id));
  }
  return {
    questionCount: questionIds.length,
    changed: questionsChanged || metaChanged,
    mapping,
  };
}

async function attachHardBank(
  session: typeof sessionsTable.$inferSelect,
  duringId: string,
  studentUserId: string,
): Promise<number> {
  const usedRows = await db
    .select({ questionId: assignmentQuestionsTable.questionId })
    .from(assignmentQuestionsTable)
    .innerJoin(
      attemptsTable,
      eq(attemptsTable.assignmentId, assignmentQuestionsTable.assignmentId),
    )
    .where(eq(attemptsTable.userId, studentUserId));
  const used = new Set(usedRows.map((row) => row.questionId));
  const hardPool = await db
    .select()
    .from(questionsTable)
    .where(
      and(
        inArray(questionsTable.reviewStatus, ["approved", "reviewed"]),
        eq(questionsTable.sourceType, "original"),
        eq(questionsTable.difficulty, "hard"),
      ),
    );
  const candidates = hardPool
    .filter(
      (question) =>
        subjectFamily(question.subject) === subjectFamily(session.subject) &&
        !used.has(question.id),
    )
    .slice(0, 6)
    .map((question) => question.id);
  const attached = await attachQuestions(duringId, candidates);
  if (attached > 0 || (await assignmentQuestionCount(duringId)) > 0) {
    await db
      .update(assignmentsTable)
      .set({
        status: "published",
        instructions:
          "Homework was complete with no misses. Use these harder originals if you have leftover session time. Review every answer and explanation together.",
        title: "Hard-question bank — leftover time",
      })
      .where(eq(assignmentsTable.id, duringId));
  }
  return attached;
}

export type SessionPrepResult = {
  mode: SessionPrepMode;
  summary: string;
  duringAssignmentId: string;
  attachedQuestionCount: number;
};

export async function prepareSessionCurriculum(
  session: typeof sessionsTable.$inferSelect,
): Promise<SessionPrepResult> {
  const during = await ensureDuringSessionAssignment(session);
  const homeworkRows = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, session.id),
        eq(assignmentsTable.deliveryPhase, "before_session"),
      ),
    )
    .orderBy(asc(assignmentsTable.createdAt));
  const submittedRows =
    session.clientUserId && homeworkRows.length > 0
      ? await db
          .select({ assignmentId: attemptsTable.assignmentId })
          .from(attemptsTable)
          .where(
            and(
              eq(attemptsTable.userId, session.clientUserId),
              inArray(attemptsTable.status, ["submitted", "expired"]),
              inArray(
                attemptsTable.assignmentId,
                homeworkRows.map((row) => row.id),
              ),
            ),
          )
      : [];
  const homework = selectHomeworkForPracticePrep(
    homeworkRows,
    new Set(submittedRows.map((row) => row.assignmentId)),
  );

  if (!homework || !session.clientUserId) {
    const mode: SessionPrepMode = "awaiting_homework";
    const summary = describeSessionPrepMode(mode);
    await ensurePrepBlock(session.id, mode, summary);
    return {
      mode,
      summary,
      duringAssignmentId: during.id,
      attachedQuestionCount: await assignmentQuestionCount(during.id),
    };
  }

  const [latestAttempt] = await db
    .select()
    .from(attemptsTable)
    .where(
      and(
        eq(attemptsTable.assignmentId, homework.id),
        eq(attemptsTable.userId, session.clientUserId),
        inArray(attemptsTable.status, ["submitted", "expired"]),
      ),
    )
    .orderBy(desc(attemptsTable.startedAt))
    .limit(1);

  if (!latestAttempt) {
    const attached = await copyHomeworkIntoDuringSession(homework.id, during.id);
    const mode: SessionPrepMode = "complete_homework_in_session";
    const summary = describeSessionPrepMode(mode);
    await ensurePrepBlock(session.id, mode, summary);
    await db.insert(auditLogsTable).values({
      actorUserId: session.clientUserId,
      action: "session_curriculum.prep_incomplete_homework",
      entityType: "session",
      entityId: session.id,
      metadata: { duringAssignmentId: during.id, attached },
    });
    return {
      mode,
      summary,
      duringAssignmentId: during.id,
      attachedQuestionCount: await assignmentQuestionCount(during.id),
    };
  }

  const result = latestAttempt.result as
    | { items?: Array<{ questionId?: string; correct?: boolean; skill?: string | null }> }
    | null
    | undefined;
  const missed = (result?.items ?? []).filter(
    (item): item is { questionId: string; correct: boolean; skill?: string | null } =>
      item.correct === false && typeof item.questionId === "string" && item.questionId.length > 0,
  );

  if (missed.length === 0) {
    const attached = await attachHardBank(session, during.id, session.clientUserId);
    const mode: SessionPrepMode = "hard_bank";
    const summary = describeSessionPrepMode(mode);
    await ensurePrepBlock(session.id, mode, summary);
    await db.insert(auditLogsTable).values({
      actorUserId: session.clientUserId,
      action: "session_curriculum.prep_hard_bank",
      entityType: "session",
      entityId: session.id,
      metadata: { duringAssignmentId: during.id, attached },
    });
    return {
      mode,
      summary,
      duringAssignmentId: during.id,
      attachedQuestionCount: await assignmentQuestionCount(during.id),
    };
  }

  const practice = await publishPracticeFromHomeworkMisses(
    session,
    during.id,
    session.clientUserId,
    missed,
  );
  const mode: SessionPrepMode = "mistake_focus";
  const summary = describeSessionPrepMode(mode);
  await ensurePrepBlock(session.id, mode, summary);
  if (practice.changed) {
    await db.insert(auditLogsTable).values({
      actorUserId: session.clientUserId,
      action: "session_curriculum.prep_mistake_focus",
      entityType: "session",
      entityId: session.id,
      metadata: {
        duringAssignmentId: during.id,
        homeworkAssignmentId: homework.id,
        sourceAttemptId: latestAttempt.id,
        missed: missed.length,
        questionCount: practice.questionCount,
        mapping: practice.mapping.map((row) => ({
          skill: row.skill,
          missedQuestionIds: row.missedQuestionIds,
          practiceQuestionId: row.practiceQuestionId,
        })),
      },
    });
  }
  return {
    mode,
    summary,
    duringAssignmentId: during.id,
    attachedQuestionCount: await assignmentQuestionCount(during.id),
  };
}

export async function enqueueMissedReviewItems(input: {
  attemptId: string;
  studentUserId: string;
  items: Array<{
    questionId: string;
    skill: string;
    correct: boolean;
    prompt?: string;
  }>;
}): Promise<number> {
  const missed = input.items.filter((item) => item.correct === false);
  if (missed.length === 0) return 0;
  const existing = await db
    .select({ questionId: reviewQueueTable.questionId })
    .from(reviewQueueTable)
    .where(
      and(
        eq(reviewQueueTable.attemptId, input.attemptId),
        eq(reviewQueueTable.status, "open"),
      ),
    );
  const already = new Set(existing.map((row) => row.questionId));
  let created = 0;
  for (const item of missed) {
    if (already.has(item.questionId)) continue;
    await db.insert(reviewQueueTable).values({
      attemptId: input.attemptId,
      questionId: item.questionId,
      studentUserId: input.studentUserId,
      skill: item.skill,
      reason: `New submission alert: missed ${item.skill}${item.prompt ? ` — ${item.prompt.slice(0, 120)}` : ""}`,
      status: "open",
    });
    already.add(item.questionId);
    created += 1;
  }
  return created;
}
