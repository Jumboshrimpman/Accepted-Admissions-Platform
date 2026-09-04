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
  reviewQueueTable,
  sessionsTable,
} from "@workspace/db";
import {
  describeSessionPrepMode,
  type SessionPrepMode,
} from "./assessment-analysis";

function subjectFamily(subject: string): string {
  const normalized = subject.trim().toLowerCase();
  if (normalized.includes("ielts") || normalized.includes("english")) return "ielts";
  if (normalized.includes("sat") || normalized.includes("math") || normalized.includes("reading")) {
    return "sat";
  }
  return normalized || "all";
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
        visibility: "both",
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
    visibility: "both",
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
  let position = existing.length;
  let attached = 0;
  for (const row of source) {
    if (already.has(row.questionId)) continue;
    await db
      .insert(assignmentQuestionsTable)
      .values({
        assignmentId: duringId,
        questionId: row.questionId,
        position,
        predictionFirst: row.predictionFirst,
      })
      .onConflictDoNothing();
    position += 1;
    attached += 1;
  }
  if (attached > 0 || source.length > 0) {
    await db
      .update(assignmentsTable)
      .set({
        status: "published",
        instructions:
          "Homework was not finished before the meeting. Complete this prep together, then review every explanation.",
        title: "In-session homework completion",
      })
      .where(eq(assignmentsTable.id, duringId));
  }
  return attached;
}

async function acceptOpenRecommendations(
  session: typeof sessionsTable.$inferSelect,
  duringId: string,
): Promise<number> {
  const open = await db
    .select()
    .from(adaptiveRecommendationsTable)
    .where(
      and(
        eq(adaptiveRecommendationsTable.sessionId, session.id),
        eq(adaptiveRecommendationsTable.status, "recommended"),
      ),
    )
    .orderBy(asc(adaptiveRecommendationsTable.position));
  if (open.length === 0) return 0;
  const questionIds = open
    .map((row) => row.recommendedQuestionId)
    .filter((id): id is string => Boolean(id));
  const attached = await attachQuestions(duringId, questionIds);
  for (const row of open) {
    await db
      .update(adaptiveRecommendationsTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(adaptiveRecommendationsTable.id, row.id));
  }
  if (attached > 0) {
    await db
      .update(assignmentsTable)
      .set({
        status: "published",
        instructions:
          "Work the similar practice items generated from homework misses. Review the answer and explanation for each item together.",
        title: "In-session mistake focus",
      })
      .where(eq(assignmentsTable.id, duringId));
  }
  return attached;
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
  const [homework] = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, session.id),
        eq(assignmentsTable.deliveryPhase, "before_session"),
      ),
    )
    .orderBy(asc(assignmentsTable.createdAt))
    .limit(1);

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
    | { items?: Array<{ correct: boolean }> }
    | null
    | undefined;
  const missed = (result?.items ?? []).filter((item) => item.correct === false);

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

  const attached = await acceptOpenRecommendations(session, during.id);
  const mode: SessionPrepMode = "mistake_focus";
  const summary = describeSessionPrepMode(mode);
  await ensurePrepBlock(session.id, mode, summary);
  await db.insert(auditLogsTable).values({
    actorUserId: session.clientUserId,
    action: "session_curriculum.prep_mistake_focus",
    entityType: "session",
    entityId: session.id,
    metadata: { duringAssignmentId: during.id, attached, missed: missed.length },
  });
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
