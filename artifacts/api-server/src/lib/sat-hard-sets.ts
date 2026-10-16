import { and, asc, eq, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  bankQuestionsTable,
  db,
  remediationRetriesTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { assignPreworkFromBank, materializeHardSatQuestion } from "./sat-bank-service.ts";
import { listLiveBeforeSessionHomework } from "./session-prework-live.ts";
import { isPostSessionFollowUpTitle } from "./post-session-follow-up.ts";
import { inferSessionPreworkKind } from "./session-prework-dedupe.ts";
import {
  HARD_SAT_IN_SESSION_MAX_QUESTIONS,
  HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  coercePracticeTestNumber,
  isRenderableHardSatItem,
  planHardSatSessionSets,
  satDifficultyForStudent,
  sameSourceKeySet,
  selectHardSatQuestions,
  type HardSatCandidate,
  type RenderableHardSatInput,
  type SatDifficulty,
} from "./sat-set-difficulty.ts";
import { normalizedSessionSubject } from "./session-schedule.ts";

const HARD_IN_SESSION_TITLE = "Hard SAT in-session (up to 15)";
const HARD_IN_SESSION_INSTRUCTIONS =
  "Up to 15 hard module 2 questions from official SAT practice tests the student has not already been assigned. 30 minutes. Work through them with your tutor.";

type SessionRow = typeof sessionsTable.$inferSelect;

export async function satDifficultyForSession(session: {
  subject: string;
  title: string;
  dateTime: Date;
  timezone?: string | null;
  clientUserId?: string | null;
}): Promise<SatDifficulty> {
  if (normalizedSessionSubject(session.subject) !== "SAT") return "standard";
  let email: string | null = null;
  let displayName: string | null = null;
  if (session.clientUserId) {
    const [user] = await db
      .select({ email: usersTable.email, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, session.clientUserId))
      .limit(1);
    email = user?.email ?? null;
    displayName = user?.displayName ?? null;
  }
  return satDifficultyForStudent({
    email,
    displayName,
    sessionTitle: session.title,
    subject: session.subject,
    session,
  });
}

async function attemptCount(assignmentId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(attemptsTable)
    .where(eq(attemptsTable.assignmentId, assignmentId));
  return Number(count ?? 0);
}

async function sourceKeysForAssignment(assignmentId: string): Promise<string[]> {
  const rows = await db
    .select({ sourceKey: bankQuestionsTable.sourceKey })
    .from(assignmentQuestionsTable)
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentQuestionsTable.position));
  return rows.map((row) => row.sourceKey);
}

async function loadSeenSatBankUsage(
  studentUserId: string,
  ignoreAssignmentIds: readonly string[],
): Promise<{ sourceKeys: Set<string>; practiceTests: Set<number> }> {
  const ignore = new Set(ignoreAssignmentIds);
  const rows = await db
    .select({
      sourceKey: bankQuestionsTable.sourceKey,
      practiceTestNumber: bankQuestionsTable.practiceTestNumber,
      assignmentId: assignmentQuestionsTable.assignmentId,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignmentQuestionsTable.assignmentId))
    .innerJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(eq(sessionsTable.clientUserId, studentUserId));
  const sourceKeys = new Set<string>();
  const practiceTests = new Set<number>();
  for (const row of rows) {
    if (ignore.has(row.assignmentId)) continue;
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

async function loadRenderableHardBank(): Promise<Array<HardSatCandidate & { bankId: string }>> {
  const rows = await db
    .select()
    .from(bankQuestionsTable)
    .orderBy(asc(bankQuestionsTable.position), asc(bankQuestionsTable.questionNumber));
  const selected: Array<HardSatCandidate & { bankId: string }> = [];
  for (const row of rows) {
    const item: RenderableHardSatInput = {
      id: row.id,
      sourceKey: row.sourceKey,
      examFamily: row.examFamily,
      sourceKind: row.sourceKind,
      section: row.section,
      module: Number(row.module),
      questionNumber: Number(row.questionNumber),
      practiceTestNumber: coercePracticeTestNumber(row.practiceTestNumber),
      prompt: row.prompt,
      stimulus: row.stimulus,
      choices: Array.isArray(row.choices) ? row.choices : [],
      figures: row.figures,
      questionType: row.questionType,
      correctAnswer: row.correctAnswer,
      officialExplanation: row.officialExplanation,
      extractGaps: (row.extractGaps ?? {}) as Record<string, unknown>,
      domain: row.domain,
      skill: row.skill,
      difficulty: row.difficulty,
    };
    if (!isRenderableHardSatItem(item)) continue;
    selected.push({
      id: row.id,
      bankId: row.id,
      sourceKey: row.sourceKey,
      section: row.section,
      module: Number(row.module),
      questionNumber: Number(row.questionNumber),
      practiceTestNumber: coercePracticeTestNumber(row.practiceTestNumber),
    });
  }
  return selected;
}

function replaceableRoutinePrework<T extends {
  id: string;
  title?: string | null;
  status?: string | null;
  homeworkKind?: string | null;
  questionCount?: number | null;
  attemptCount: number;
}>(rows: readonly T[]): T[] {
  return rows.filter((row) => {
    if (row.attemptCount > 0) return false;
    if (row.status === "archived") return false;
    if (isPostSessionFollowUpTitle(row.title)) return false;
    return inferSessionPreworkKind(row) === "routine";
  });
}

/**
 * Replace an unattempted future hard-mode pre-work set.
 * Sessions that already have an attempt are left alone, including their attempt rows.
 */
export async function ensureHardSatPrework(
  session: SessionRow,
  actorUserId?: string | null,
): Promise<
  | { action: "not-hard" }
  | { action: "blocked-by-attempts"; assignmentId: string | null }
  | { action: "unchanged"; assignmentId: string | null }
  | { action: "unavailable"; assignmentId: string | null }
  | {
      action: "assigned";
      result: Awaited<ReturnType<typeof assignPreworkFromBank>>;
    }
> {
  if ((await satDifficultyForSession(session)) !== "hard") {
    return { action: "not-hard" };
  }
  const live = await listLiveBeforeSessionHomework(session.id);
  const routine = live.filter((row) => inferSessionPreworkKind(row) === "routine");
  const attempted = routine.find((row) => row.attemptCount > 0);
  if (attempted) {
    return { action: "blocked-by-attempts", assignmentId: attempted.id };
  }
  const replaceable = replaceableRoutinePrework(routine);
  const during = await unattemptedDuringAssignment(session.id);
  const ignoreIds = [
    ...replaceable.map((row) => row.id),
    ...(during ? [during.id] : []),
  ];
  try {
    const seen = session.clientUserId
      ? await loadSeenSatBankUsage(session.clientUserId, ignoreIds)
      : { sourceKeys: new Set<string>(), practiceTests: new Set<number>() };
    const pool = await loadRenderableHardBank();
    const planned = planHardSatSessionSets(pool, {
      excludeSourceKeys: seen.sourceKeys,
      seenPracticeTests: seen.practiceTests,
    });
    const desiredKeys = planned.prework.map((item) => item.sourceKey);
    const keeper = replaceable[0] ?? null;
    const assignedKeys = keeper ? await sourceKeysForAssignment(keeper.id) : [];
    if (
      keeper &&
      desiredKeys.length > 0 &&
      sameSourceKeySet(assignedKeys, desiredKeys)
    ) {
      return { action: "unchanged", assignmentId: keeper.id };
    }
    if (desiredKeys.length === 0) {
      return { action: "unavailable", assignmentId: keeper?.id ?? null };
    }
    const result = await assignPreworkFromBank({
      sessionId: session.id,
      actorUserId,
      homeworkKind: "routine",
      difficulty: "hard",
      mcqOnly: true,
      skipArchiveExisting: false,
      excludeSourceKeys: seen.sourceKeys,
      seenPracticeTests: seen.practiceTests,
      archiveAssignmentIds: replaceable.map((row) => row.id),
    });
    return { action: "assigned", result };
  } catch {
    return { action: "unavailable", assignmentId: replaceable[0]?.id ?? null };
  }
}

/**
 * Official hardest module 2 items for one session.
 * Excludes that session's pre-work, questions the student has already been
 * assigned, placeholders, and seeded originals.
 */
export async function officialHardInSessionItems(
  session: { id: string; clientUserId?: string | null },
  ignoreAssignmentIds: readonly string[] = [],
): Promise<Array<HardSatCandidate & { bankId: string }>> {
  const live = await listLiveBeforeSessionHomework(session.id);
  const preworkKeys = new Set<string>();
  for (const row of live) {
    for (const sourceKey of await sourceKeysForAssignment(row.id)) {
      preworkKeys.add(sourceKey);
    }
  }
  const seen = session.clientUserId
    ? await loadSeenSatBankUsage(session.clientUserId, ignoreAssignmentIds)
    : { sourceKeys: new Set<string>(), practiceTests: new Set<number>() };
  const exclude = new Set<string>([...seen.sourceKeys, ...preworkKeys]);
  const pool = await loadRenderableHardBank();
  return selectHardSatQuestions(pool, {
    targetCount: HARD_SAT_IN_SESSION_MAX_QUESTIONS,
    minCount: 1,
    maxCount: HARD_SAT_IN_SESSION_MAX_QUESTIONS,
    excludeSourceKeys: exclude,
    seenPracticeTests: seen.practiceTests,
  });
}

async function writeOfficialHardInSession(
  duringId: string,
  items: ReadonlyArray<HardSatCandidate & { bankId: string }>,
): Promise<"attempted" | "unchanged" | "updated"> {
  if ((await attemptCount(duringId)) > 0) return "attempted";
  const desiredKeys = items.map((item) => item.sourceKey);
  const currentKeys = await sourceKeysForAssignment(duringId);
  if (sameSourceKeySet(currentKeys, desiredKeys)) return "unchanged";
  const questionIds: string[] = [];
  for (const item of items) {
    questionIds.push(await materializeHardSatQuestion(item.id));
  }
  if ((await attemptCount(duringId)) > 0) return "attempted";
  await db.delete(assignmentQuestionsTable).where(eq(assignmentQuestionsTable.assignmentId, duringId));
  for (const [index, questionId] of questionIds.entries()) {
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: duringId,
      questionId,
      position: index,
      predictionFirst: false,
    });
  }
  return "updated";
}

async function unattemptedDuringAssignment(sessionId: string) {
  const [during] = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, sessionId),
        eq(assignmentsTable.deliveryPhase, "during_session"),
      ),
    )
    .orderBy(asc(assignmentsTable.createdAt))
    .limit(1);
  if (!during || during.status === "archived") return null;
  if ((await attemptCount(during.id)) > 0) return null;
  return during;
}

async function ensureDuringAssignment(session: SessionRow) {
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
      title: `${HARD_IN_SESSION_TITLE} — ${session.title}`,
      subject: session.subject,
      instructions: HARD_IN_SESSION_INSTRUCTIONS,
      status: "published",
      timeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
      maxAttempts: 1,
    })
    .returning();
  return created!;
}

export async function ensureHardSatInSession(session: SessionRow): Promise<{
  status: "not-hard" | "attempted" | "unchanged" | "updated" | "unavailable";
  questionCount: number;
  duringAssignmentId: string | null;
}> {
  if ((await satDifficultyForSession(session)) !== "hard") {
    return { status: "not-hard", questionCount: 0, duringAssignmentId: null };
  }
  const [existingDuring] = await db
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
  if (existingDuring && (await attemptCount(existingDuring.id)) > 0) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, existingDuring.id));
    return {
      status: "attempted",
      questionCount: Number(count ?? 0),
      duringAssignmentId: existingDuring.id,
    };
  }
  try {
    const inSession = await officialHardInSessionItems(
      session,
      existingDuring ? [existingDuring.id] : [],
    );
    if (inSession.length === 0) {
      return {
        status: "unavailable",
        questionCount: existingDuring
          ? (await sourceKeysForAssignment(existingDuring.id)).length
          : 0,
        duringAssignmentId: existingDuring?.id ?? null,
      };
    }
    const during = existingDuring ?? (await ensureDuringAssignment(session));
    const written = await writeOfficialHardInSession(during.id, inSession);
    if (written === "attempted") {
      return {
        status: "attempted",
        questionCount: (await sourceKeysForAssignment(during.id)).length,
        duringAssignmentId: during.id,
      };
    }
    await publishHardInSession(during.id, session.title);
    return {
      status: written,
      questionCount: inSession.length,
      duringAssignmentId: during.id,
    };
  } catch {
    return {
      status: "unavailable",
      questionCount: 0,
      duringAssignmentId: existingDuring?.id ?? null,
    };
  }
}

/** Replace an unattempted in-session set with official hardest module 2 items. */
export async function fillUnattemptedOfficialHardInSession(
  session: SessionRow,
  duringId: string,
): Promise<number> {
  if ((await attemptCount(duringId)) > 0) return 0;
  const items = await officialHardInSessionItems(session, [duringId]);
  if (items.length === 0) return 0;
  const written = await writeOfficialHardInSession(duringId, items);
  if (written === "attempted") return 0;
  return items.length;
}

async function publishHardInSession(assignmentId: string, sessionTitle: string) {
  await db
    .update(assignmentsTable)
    .set({
      status: "published",
      title: `${HARD_IN_SESSION_TITLE} — ${sessionTitle}`,
      instructions: HARD_IN_SESSION_INSTRUCTIONS,
      timeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
    })
    .where(eq(assignmentsTable.id, assignmentId));
}

/**
 * Apply the hard pre-work and in-session sets for a session that qualifies.
 * Standard sessions, English sessions, and anything already attempted are unchanged.
 */
export async function ensureHardSatSessionSets(
  session: SessionRow,
  actorUserId?: string | null,
): Promise<{
  difficulty: SatDifficulty;
  inSessionStatus: "not-hard" | "attempted" | "unchanged" | "updated" | "unavailable" | null;
}> {
  const difficulty = await satDifficultyForSession(session);
  if (difficulty !== "hard") return { difficulty, inSessionStatus: null };
  await ensureHardSatPrework(session, actorUserId);
  const inSession = await ensureHardSatInSession(session);
  return { difficulty, inSessionStatus: inSession.status };
}
