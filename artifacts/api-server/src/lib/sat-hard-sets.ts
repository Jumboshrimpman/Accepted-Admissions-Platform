import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  adminNotificationsTable,
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  bankQuestionsTable,
  curriculumBlocksTable,
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
  HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  HARD_SAT_PREWORK_QUESTIONS,
  coercePracticeTestNumber,
  inSessionQuestionTargetForStudent,
  isRenderableHardSatItem,
  planHardSatSessionSets,
  satBankUsageCountsAsSeen,
  satDifficultyForStudent,
  toRenderableHardSatInput,
  type HardSatCandidate,
  type SatDifficulty,
} from "./sat-set-difficulty.ts";
import { normalizedSessionSubject } from "./session-schedule.ts";

const HARD_IN_SESSION_TITLE = "Hard SAT in-session";

function hardInSessionInstructions(target: number): string {
  return `${target} hard module 2 questions from official SAT practice tests the student has not already been assigned. 30 minutes. Work through them with your tutor.`;
}

export const HARD_SAT_NEEDS_QUESTIONS_SUMMARY =
  "This session still needs questions. The hard SAT bank could not fill the full pre-work set and the full in-session set, so no partial set was assigned and standard items were not used.";

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

async function inSessionTargetForSession(session: {
  subject: string;
  title: string;
  dateTime: Date;
  timezone?: string | null;
  clientUserId?: string | null;
}): Promise<number> {
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
  return inSessionQuestionTargetForStudent({
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

async function loadRenderableHardBank(): Promise<Array<HardSatCandidate & { bankId: string }>> {
  const rows = await db
    .select()
    .from(bankQuestionsTable)
    .orderBy(asc(bankQuestionsTable.position), asc(bankQuestionsTable.questionNumber));
  const selected: Array<HardSatCandidate & { bankId: string }> = [];
  for (const row of rows) {
    const item = toRenderableHardSatInput(row);
    if (!isRenderableHardSatItem(item)) continue;
    selected.push({
      id: row.id,
      bankId: row.id,
      sourceKey: row.sourceKey,
      section: row.section,
      module: Number(row.module),
      questionNumber: Number(row.questionNumber),
      practiceTestNumber: item.practiceTestNumber ?? null,
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

async function liveDuringAssignments(sessionId: string) {
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, sessionId),
        eq(assignmentsTable.deliveryPhase, "during_session"),
      ),
    )
    .orderBy(asc(assignmentsTable.createdAt));
  return rows.filter((row) => row.status !== "archived");
}

async function markSessionNeedsHardQuestions(sessionId: string, summary: string) {
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
    mode: "hard_bank",
    text: summary,
    needsQuestions: true,
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

/** Idempotent admin-portal alert. Does not send email. */
export async function raiseHardSatShortfallAlert(session: SessionRow, detail: string): Promise<void> {
  await markSessionNeedsHardQuestions(session.id, HARD_SAT_NEEDS_QUESTIONS_SUMMARY);
  const already = await db
    .select({ id: adminNotificationsTable.id })
    .from(adminNotificationsTable)
    .where(
      and(
        eq(adminNotificationsTable.sessionId, session.id),
        eq(adminNotificationsTable.kind, "hard_sat_shortfall"),
        eq(adminNotificationsTable.status, "unread"),
      ),
    )
    .limit(1);
  if (already.length > 0) return;
  const administrators = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "administrator"));
  if (administrators.length === 0) return;
  await db.insert(adminNotificationsTable).values(
    administrators.map((admin) => ({
      recipientUserId: admin.id,
      kind: "hard_sat_shortfall",
      sessionId: session.id,
      title: "Hard SAT set needs questions",
      message: `${session.title} still needs questions. ${detail}`,
      status: "unread" as const,
    })),
  );
}

export async function describeHardSatSessionPrep(session: SessionRow): Promise<{
  summary: string;
  duringAssignmentId: string | null;
  questionCount: number;
  preworkCount: number;
  needsQuestions: boolean;
}> {
  const target = await inSessionTargetForSession(session);
  const live = await listLiveBeforeSessionHomework(session.id);
  const routine = live.filter((row) => inferSessionPreworkKind(row) === "routine");
  let preworkCount = 0;
  for (const row of routine) {
    preworkCount += (await sourceKeysForAssignment(row.id)).length;
  }
  const duringRows = await liveDuringAssignments(session.id);
  let duringAssignmentId: string | null = null;
  let questionCount = 0;
  for (const row of duringRows) {
    const keys = await sourceKeysForAssignment(row.id);
    if (!duringAssignmentId) duringAssignmentId = row.id;
    questionCount += keys.length;
    if ((await attemptCount(row.id)) > 0) {
      return {
        summary: "In-session work already started, so the attached questions were left unchanged.",
        duringAssignmentId: row.id,
        questionCount: keys.length,
        preworkCount,
        needsQuestions: preworkCount !== HARD_SAT_PREWORK_QUESTIONS || keys.length !== target,
      };
    }
  }
  const needsQuestions = preworkCount !== HARD_SAT_PREWORK_QUESTIONS || questionCount !== target;
  const summary = needsQuestions
    ? `${HARD_SAT_NEEDS_QUESTIONS_SUMMARY} Assigned now: ${preworkCount} pre-work and ${questionCount} in-session; a full set is ${HARD_SAT_PREWORK_QUESTIONS} pre-work and ${target} in-session.`
    : `Hard SAT set: ${HARD_SAT_PREWORK_QUESTIONS} pre-work questions and ${target} in-session module 2 questions. ${HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES} minutes for the in-session set.`;
  return { summary, duringAssignmentId, questionCount, preworkCount, needsQuestions };
}

/**
 * Fill an empty hard pre-work set from the same renderable pool used for planning.
 * A set that already has questions is left alone, including its attempt rows.
 */
export async function ensureHardSatPrework(
  session: SessionRow,
  actorUserId?: string | null,
): Promise<
  | { action: "not-hard" }
  | { action: "blocked-by-attempts"; assignmentId: string | null }
  | { action: "unchanged"; assignmentId: string | null }
  | { action: "unavailable"; assignmentId: string | null }
  | { action: "shortfall"; assignmentId: string | null }
  | {
      action: "assigned";
      result: Awaited<ReturnType<typeof assignPreworkFromBank>>;
    }
> {
  if ((await satDifficultyForSession(session)) !== "hard") {
    return { action: "not-hard" };
  }
  const target = await inSessionTargetForSession(session);
  const live = await listLiveBeforeSessionHomework(session.id);
  const routine = live.filter((row) => inferSessionPreworkKind(row) === "routine");
  const attempted = routine.find((row) => row.attemptCount > 0);
  if (attempted) {
    return { action: "blocked-by-attempts", assignmentId: attempted.id };
  }
  const replaceable = replaceableRoutinePrework(routine);
  const keeper = replaceable[0] ?? null;
  const assignedKeys = keeper ? await sourceKeysForAssignment(keeper.id) : [];
  if (assignedKeys.length > 0) {
    if (assignedKeys.length !== HARD_SAT_PREWORK_QUESTIONS) {
      await raiseHardSatShortfallAlert(
        session,
        `Pre-work has ${assignedKeys.length} questions and was left unchanged. A full set is ${HARD_SAT_PREWORK_QUESTIONS} pre-work and ${target} in-session.`,
      );
    }
    return { action: "unchanged", assignmentId: keeper!.id };
  }
  const duringRows = await liveDuringAssignments(session.id);
  const duringKeys = duringRows[0] ? await sourceKeysForAssignment(duringRows[0].id) : [];
  try {
    const seen = session.clientUserId
      ? await loadSeenSatBankUsage(session.clientUserId, [])
      : { sourceKeys: new Set<string>(), practiceTests: new Set<number>() };
    const pool = await loadRenderableHardBank();
    const planned = planHardSatSessionSets(pool, {
      excludeSourceKeys: seen.sourceKeys,
      seenPracticeTests: seen.practiceTests,
      preworkTarget: HARD_SAT_PREWORK_QUESTIONS,
      preworkMin: HARD_SAT_PREWORK_QUESTIONS,
      preworkMax: HARD_SAT_PREWORK_QUESTIONS,
      inSessionMax: target,
    });
    const inSessionReady = duringKeys.length === target || planned.inSession.length === target;
    if (planned.prework.length !== HARD_SAT_PREWORK_QUESTIONS || !inSessionReady) {
      await raiseHardSatShortfallAlert(
        session,
        `The renderable hard pool has ${planned.prework.length} pre-work and ${planned.inSession.length} in-session items available. A full set is ${HARD_SAT_PREWORK_QUESTIONS} and ${target}. No partial set was assigned.`,
      );
      return { action: "shortfall", assignmentId: keeper?.id ?? null };
    }
    const result = await assignPreworkFromBank({
      sessionId: session.id,
      actorUserId,
      homeworkKind: "routine",
      difficulty: "hard",
      mcqOnly: true,
      skipArchiveExisting: false,
      bankQuestionIds: planned.prework.map((item) => item.bankId),
      archiveAssignmentIds: replaceable.map((row) => row.id),
    });
    if (result.questionCount !== HARD_SAT_PREWORK_QUESTIONS) {
      await raiseHardSatShortfallAlert(
        session,
        `Pre-work assignment wrote ${result.questionCount} questions instead of ${HARD_SAT_PREWORK_QUESTIONS}.`,
      );
      return { action: "shortfall", assignmentId: result.assignmentId };
    }
    return { action: "assigned", result };
  } catch {
    await raiseHardSatShortfallAlert(
      session,
      "The hard SAT pre-work set could not be assigned from the renderable pool.",
    );
    return { action: "shortfall", assignmentId: keeper?.id ?? null };
  }
}

/**
 * Official hardest module 2 items for one session.
 * Excludes that session's pre-work, questions the student has already been
 * assigned, placeholders, and seeded originals.
 */
export async function officialHardInSessionItems(
  session: { id: string; clientUserId?: string | null; subject?: string; title?: string; dateTime?: Date; timezone?: string | null },
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
  const target =
    session.dateTime && session.subject
      ? await inSessionTargetForSession({
          subject: session.subject,
          title: session.title ?? "",
          dateTime: session.dateTime,
          timezone: session.timezone,
          clientUserId: session.clientUserId,
        })
      : await inSessionTargetForSession({
          subject: "SAT",
          title: session.title ?? "",
          dateTime: new Date(),
          clientUserId: session.clientUserId,
        });
  return planHardSatSessionSets(pool, {
    excludeSourceKeys: exclude,
    seenPracticeTests: seen.practiceTests,
    preworkTarget: 0,
    preworkMin: 0,
    preworkMax: 0,
    inSessionMax: target,
  }).inSession;
}

async function writeOfficialHardInSession(
  duringId: string,
  items: ReadonlyArray<HardSatCandidate & { bankId: string }>,
): Promise<"attempted" | "unchanged" | "updated" | "archived"> {
  const [assignment] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, duringId))
    .limit(1);
  if (!assignment || assignment.status === "archived") return "archived";
  if ((await attemptCount(duringId)) > 0) return "attempted";
  const currentKeys = await sourceKeysForAssignment(duringId);
  if (currentKeys.length > 0) return "unchanged";
  const questionIds: string[] = [];
  for (const item of items) {
    questionIds.push(await materializeHardSatQuestion(item.id));
  }
  if ((await attemptCount(duringId)) > 0) return "attempted";
  const [stillLive] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, duringId))
    .limit(1);
  if (!stillLive || stillLive.status === "archived") return "archived";
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

async function ensureDuringAssignment(session: SessionRow, target: number) {
  const existing = await liveDuringAssignments(session.id);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(assignmentsTable)
    .values({
      courseId: session.courseId,
      sessionId: session.id,
      deliveryPhase: "during_session",
      title: `${HARD_IN_SESSION_TITLE} (${target}) — ${session.title}`,
      subject: session.subject,
      instructions: hardInSessionInstructions(target),
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
  const target = await inSessionTargetForSession(session);
  const liveDuring = await liveDuringAssignments(session.id);
  const existingDuring = liveDuring[0] ?? null;
  if (existingDuring && (await attemptCount(existingDuring.id)) > 0) {
    const keys = await sourceKeysForAssignment(existingDuring.id);
    return {
      status: "attempted",
      questionCount: keys.length,
      duringAssignmentId: existingDuring.id,
    };
  }
  if (existingDuring) {
    const currentKeys = await sourceKeysForAssignment(existingDuring.id);
    if (currentKeys.length > 0) {
      if (currentKeys.length !== target) {
        await raiseHardSatShortfallAlert(
          session,
          `In-session has ${currentKeys.length} questions and was left unchanged. The target is ${target}.`,
        );
      }
      return {
        status: "unchanged",
        questionCount: currentKeys.length,
        duringAssignmentId: existingDuring.id,
      };
    }
  }
  try {
    const inSession = await officialHardInSessionItems(session, existingDuring ? [existingDuring.id] : []);
    if (inSession.length !== target) {
      await raiseHardSatShortfallAlert(
        session,
        `The renderable hard pool can supply ${inSession.length} in-session questions. The target is ${target}. No partial in-session set was assigned.`,
      );
      return {
        status: "unavailable",
        questionCount: 0,
        duringAssignmentId: existingDuring?.id ?? null,
      };
    }
    const during = existingDuring ?? (await ensureDuringAssignment(session, target));
    const written = await writeOfficialHardInSession(during.id, inSession);
    if (written === "attempted" || written === "archived") {
      return {
        status: written === "archived" ? "unchanged" : "attempted",
        questionCount: (await sourceKeysForAssignment(during.id)).length,
        duringAssignmentId: written === "archived" ? null : during.id,
      };
    }
    await publishHardInSession(during.id, session.title, target);
    return {
      status: written,
      questionCount: inSession.length,
      duringAssignmentId: during.id,
    };
  } catch {
    await raiseHardSatShortfallAlert(session, "The hard in-session set could not be assigned.");
    return {
      status: "unavailable",
      questionCount: 0,
      duringAssignmentId: existingDuring?.id ?? null,
    };
  }
}

/** Fill an empty in-session assignment from the official hard pool. Assigned sets are not replaced. */
export async function fillUnattemptedOfficialHardInSession(
  session: SessionRow,
  duringId: string,
): Promise<number> {
  const [assignment] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, duringId))
    .limit(1);
  if (!assignment || assignment.status === "archived") return 0;
  if ((await attemptCount(duringId)) > 0) return 0;
  const currentKeys = await sourceKeysForAssignment(duringId);
  if (currentKeys.length > 0) return 0;
  const target = await inSessionTargetForSession(session);
  const items = await officialHardInSessionItems(session, [duringId]);
  if (items.length !== target) return 0;
  const written = await writeOfficialHardInSession(duringId, items);
  if (written !== "updated") return 0;
  return items.length;
}

async function publishHardInSession(assignmentId: string, sessionTitle: string, target: number) {
  const [assignment] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);
  if (!assignment || assignment.status === "archived") return;
  await db
    .update(assignmentsTable)
    .set({
      status: "published",
      title: `${HARD_IN_SESSION_TITLE} (${target}) — ${sessionTitle}`,
      instructions: hardInSessionInstructions(target),
      timeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
    })
    .where(and(eq(assignmentsTable.id, assignmentId), ne(assignmentsTable.status, "archived")));
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
  const prework = await ensureHardSatPrework(session, actorUserId);
  if (prework.action === "shortfall") return { difficulty, inSessionStatus: "unavailable" };
  const inSession = await ensureHardSatInSession(session);
  return { difficulty, inSessionStatus: inSession.status };
}
