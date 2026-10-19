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
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
import { assignPreworkFromBank, materializeHardSatQuestion } from "./sat-bank-service.ts";
import { listLiveBeforeSessionHomework } from "./session-prework-live.ts";
import { inferSessionPreworkKind } from "./session-prework-dedupe.ts";
import {
  HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  HARD_SAT_PREWORK_QUESTIONS,
  coercePracticeTestNumber,
  inSessionQuestionTargetForStudent,
  isRenderableHardSatItem,
  originalHardSatDateKeyForSession,
  planHardSatSessionSets,
  satBankUsageCountsAsSeen,
  satDifficultyForStudent,
  toRenderableHardSatInput,
  type HardSatCandidate,
  type SatDifficulty,
} from "./sat-set-difficulty.ts";
import {
  EUNICE_TUTOR_EMAIL,
  TAITO_STUDENT_EMAIL,
  matchesTaitoScheduledDate,
  normalizedSessionSubject,
} from "./session-schedule.ts";

const HARD_IN_SESSION_TITLE = "Hard SAT in-session";

function hardInSessionInstructions(target: number, original: boolean): string {
  if (original) {
    return `${target} hard module 2 questions written for this session. 30 minutes. Work through them with your tutor.`;
  }
  return `${target} hard module 2 questions from official SAT practice tests the student has not already been assigned. 30 minutes. Work through them with your tutor.`;
}

async function hardPlanOptionsForSession(session: {
  dateTime?: Date;
  timezone?: string | null;
  clientUserId?: string | null;
}): Promise<{
  originalDateKey: string | null;
  balance: "sat" | "even";
}> {
  let email: string | null = null;
  if (session.clientUserId) {
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, session.clientUserId))
      .limit(1);
    email = user?.email ?? null;
  }
  const originalDateKey =
    session.dateTime && email
      ? originalHardSatDateKeyForSession({
          dateTime: session.dateTime,
          timezone: session.timezone,
          email,
          clientUserId: session.clientUserId,
        })
      : null;
  return { originalDateKey, balance: originalDateKey ? "even" : "sat" };
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

async function assignmentQuestionCount(assignmentId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  return Number(count ?? 0);
}

/** Archive a live pre-work row that has no attempts. Attempt rows are not rewritten. */
async function archiveUnattemptedAssignment(sessionId: string, assignmentId: string): Promise<void> {
  if ((await attemptCount(assignmentId)) > 0) return;
  await db
    .update(assignmentsTable)
    .set({ status: "archived" })
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.sessionId, sessionId),
        ne(assignmentsTable.status, "archived"),
      ),
    );
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

async function hardPoolSourceKeys(): Promise<Set<string>> {
  const pool = await loadRenderableHardBank();
  return new Set(pool.map((item) => item.sourceKey));
}

/** True only when every attached question is a renderable hard-pool item. */
async function classifyBankAssignment(
  assignmentId: string,
  hardKeys: ReadonlySet<string>,
  knownAttempts?: number,
): Promise<{
  keys: string[];
  questionCount: number;
  attempts: number;
  everyKeyIsHard: boolean;
}> {
  const keys = await sourceKeysForAssignment(assignmentId);
  const questionCount = await assignmentQuestionCount(assignmentId);
  const attempts = knownAttempts ?? (await attemptCount(assignmentId));
  const everyKeyIsHard =
    questionCount > 0 &&
    keys.length === questionCount &&
    keys.every((sourceKey) => hardKeys.has(sourceKey));
  return { keys, questionCount, attempts, everyKeyIsHard };
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
      sourceKind: row.sourceKind,
    });
  }
  return selected;
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
  const hardKeys = await hardPoolSourceKeys();
  const live = await listLiveBeforeSessionHomework(session.id);
  const routine = live.filter((row) => inferSessionPreworkKind(row) === "routine");
  let preworkCount = 0;
  let hasNonHardPrework = false;
  let hasFullHardPrework = false;
  for (const row of routine) {
    const info = await classifyBankAssignment(row.id, hardKeys, row.attemptCount);
    if (info.questionCount === 0) continue;
    preworkCount += info.questionCount;
    if (!info.everyKeyIsHard) hasNonHardPrework = true;
    else if (info.keys.length === HARD_SAT_PREWORK_QUESTIONS) hasFullHardPrework = true;
  }
  const duringRows = await liveDuringAssignments(session.id);
  let duringAssignmentId: string | null = null;
  let questionCount = 0;
  let hasNonHardDuring = false;
  let hasFullHardDuring = false;
  let duringAttempted = false;
  for (const row of duringRows) {
    const info = await classifyBankAssignment(row.id, hardKeys);
    if (!duringAssignmentId) duringAssignmentId = row.id;
    questionCount += info.questionCount;
    if (info.attempts > 0) duringAttempted = true;
    if (info.questionCount === 0) continue;
    if (!info.everyKeyIsHard) hasNonHardDuring = true;
    else if (info.keys.length === target) hasFullHardDuring = true;
  }
  const needsQuestions =
    hasNonHardPrework || hasNonHardDuring || !hasFullHardPrework || !hasFullHardDuring;
  if (duringAttempted && !needsQuestions) {
    return {
      summary: "In-session work already started, so the attached questions were left unchanged.",
      duringAssignmentId,
      questionCount,
      preworkCount,
      needsQuestions: false,
    };
  }
  const summary = needsQuestions
    ? `${HARD_SAT_NEEDS_QUESTIONS_SUMMARY} Assigned now: ${preworkCount} pre-work and ${questionCount} in-session; a full set is ${HARD_SAT_PREWORK_QUESTIONS} pre-work and ${target} in-session.`
    : `Hard SAT set: ${HARD_SAT_PREWORK_QUESTIONS} pre-work questions and ${target} in-session module 2 questions. ${HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES} minutes for the in-session set.`;
  return { summary, duringAssignmentId, questionCount, preworkCount, needsQuestions };
}

/**
 * Fill hard pre-work from the same renderable pool used for planning.
 * A live unattempted routine set stays only when every question's source key
 * is in that pool. Anything else with no attempts is archived and refilled,
 * or flagged as a shortfall when the pool cannot fill a full set.
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
  const hardKeys = await hardPoolSourceKeys();
  const live = await listLiveBeforeSessionHomework(session.id);
  const routine = live.filter((row) => inferSessionPreworkKind(row) === "routine");
  const classified = [];
  for (const row of routine) {
    classified.push({
      row,
      ...(await classifyBankAssignment(row.id, hardKeys, row.attemptCount)),
    });
  }
  const attempted = classified.filter((item) => item.attempts > 0);
  if (attempted.length > 0) {
    const hasFullHard = classified.some(
      (item) => item.everyKeyIsHard && item.keys.length === HARD_SAT_PREWORK_QUESTIONS,
    );
    const everyLiveSetIsHard = classified.every(
      (item) => item.questionCount === 0 || item.everyKeyIsHard,
    );
    if (!hasFullHard || !everyLiveSetIsHard) {
      await raiseHardSatShortfallAlert(
        session,
        `Pre-work already has attempts and is not a full hard set of ${HARD_SAT_PREWORK_QUESTIONS}. The attempted set was left in place.`,
      );
    }
    for (const item of classified) {
      if (item.attempts > 0 || item.questionCount === 0 || item.everyKeyIsHard) continue;
      await archiveUnattemptedAssignment(session.id, item.row.id);
    }
    return { action: "blocked-by-attempts", assignmentId: attempted[0]!.row.id };
  }
  for (const item of classified) {
    if (item.questionCount > 0 && !item.everyKeyIsHard) {
      await archiveUnattemptedAssignment(session.id, item.row.id);
    }
  }
  const fullHard = classified.find(
    (item) => item.everyKeyIsHard && item.keys.length === HARD_SAT_PREWORK_QUESTIONS,
  );
  if (fullHard) {
    return { action: "unchanged", assignmentId: fullHard.row.id };
  }
  const shortHard = classified.find(
    (item) => item.everyKeyIsHard && item.keys.length < HARD_SAT_PREWORK_QUESTIONS,
  );
  const replaceableIds = classified.map((item) => item.row.id);
  try {
    const seen = session.clientUserId
      ? await loadSeenSatBankUsage(session.clientUserId, replaceableIds)
      : { sourceKeys: new Set<string>(), practiceTests: new Set<number>() };
    const pool = await loadRenderableHardBank();
    const planned = planHardSatSessionSets(pool, {
      excludeSourceKeys: seen.sourceKeys,
      seenPracticeTests: seen.practiceTests,
      preworkTarget: HARD_SAT_PREWORK_QUESTIONS,
      preworkMin: HARD_SAT_PREWORK_QUESTIONS,
      preworkMax: HARD_SAT_PREWORK_QUESTIONS,
      inSessionMax: target,
      ...(await hardPlanOptionsForSession(session)),
    });
    const duringRows = await liveDuringAssignments(session.id);
    let duringIsFullHard = false;
    for (const row of duringRows) {
      const info = await classifyBankAssignment(row.id, hardKeys);
      if (info.everyKeyIsHard && info.keys.length === target) duringIsFullHard = true;
    }
    const inSessionReady = duringIsFullHard || planned.inSession.length === target;
    if (planned.prework.length !== HARD_SAT_PREWORK_QUESTIONS || !inSessionReady) {
      if (shortHard) {
        await raiseHardSatShortfallAlert(
          session,
          `Pre-work has ${shortHard.keys.length} hard questions and was left unchanged. A full set is ${HARD_SAT_PREWORK_QUESTIONS} pre-work and ${target} in-session.`,
        );
        return { action: "unchanged", assignmentId: shortHard.row.id };
      }
      await raiseHardSatShortfallAlert(
        session,
        `The renderable hard pool has ${planned.prework.length} pre-work and ${planned.inSession.length} in-session items available. A full set is ${HARD_SAT_PREWORK_QUESTIONS} and ${target}. No partial set was assigned.`,
      );
      return { action: "shortfall", assignmentId: null };
    }
    const result = await assignPreworkFromBank({
      sessionId: session.id,
      actorUserId,
      homeworkKind: "routine",
      difficulty: "hard",
      mcqOnly: true,
      skipArchiveExisting: false,
      bankQuestionIds: planned.prework.map((item) => item.bankId),
      archiveAssignmentIds: replaceableIds,
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
    return { action: "shortfall", assignmentId: null };
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
    ...(await hardPlanOptionsForSession(session)),
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
      instructions: hardInSessionInstructions(target, (await hardPlanOptionsForSession(session)).originalDateKey != null),
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
  const hardKeys = await hardPoolSourceKeys();
  const liveDuring = await liveDuringAssignments(session.id);
  const classified = [];
  for (const row of liveDuring) {
    classified.push({ row, ...(await classifyBankAssignment(row.id, hardKeys)) });
  }
  const attempted = classified.filter((item) => item.attempts > 0);
  if (attempted.length > 0) {
    const hasFullHard = classified.some(
      (item) => item.everyKeyIsHard && item.keys.length === target,
    );
    const everyLiveSetIsHard = classified.every(
      (item) => item.questionCount === 0 || item.everyKeyIsHard,
    );
    if (!hasFullHard || !everyLiveSetIsHard) {
      await raiseHardSatShortfallAlert(
        session,
        `In-session work already started and is not a full hard set of ${target}. The attempted set was left in place.`,
      );
    }
    for (const item of classified) {
      if (item.attempts > 0 || item.questionCount === 0 || item.everyKeyIsHard) continue;
      await archiveUnattemptedAssignment(session.id, item.row.id);
    }
    const primary = attempted[0]!;
    return {
      status: "attempted",
      questionCount: primary.keys.length,
      duringAssignmentId: primary.row.id,
    };
  }
  for (const item of classified) {
    if (item.questionCount > 0 && !item.everyKeyIsHard) {
      await archiveUnattemptedAssignment(session.id, item.row.id);
    }
  }
  const fullHard = classified.find((item) => item.everyKeyIsHard && item.keys.length === target);
  if (fullHard) {
    return {
      status: "unchanged",
      questionCount: fullHard.keys.length,
      duringAssignmentId: fullHard.row.id,
    };
  }
  const shortHard = classified.find(
    (item) => item.everyKeyIsHard && item.keys.length < target,
  );
  try {
    const inSession = await officialHardInSessionItems(
      session,
      shortHard ? [shortHard.row.id] : [],
    );
    if (inSession.length !== target) {
      if (shortHard) {
        await raiseHardSatShortfallAlert(
          session,
          `In-session has ${shortHard.keys.length} hard questions and was left unchanged. The target is ${target}.`,
        );
        return {
          status: "unchanged",
          questionCount: shortHard.keys.length,
          duringAssignmentId: shortHard.row.id,
        };
      }
      await raiseHardSatShortfallAlert(
        session,
        `The renderable hard pool can supply ${inSession.length} in-session questions. The target is ${target}. No partial in-session set was assigned.`,
      );
      return {
        status: "unavailable",
        questionCount: 0,
        duringAssignmentId: null,
      };
    }
    if (shortHard) {
      await archiveUnattemptedAssignment(session.id, shortHard.row.id);
    }
    const during = (await liveDuringAssignments(session.id))[0] ?? (await ensureDuringAssignment(session, target));
    const written = await writeOfficialHardInSession(during.id, inSession);
    if (written === "attempted" || written === "archived") {
      return {
        status: written === "archived" ? "unchanged" : "attempted",
        questionCount: (await sourceKeysForAssignment(during.id)).length,
        duringAssignmentId: written === "archived" ? null : during.id,
      };
    }
    await publishHardInSession(
      during.id,
      session.title,
      target,
      (await hardPlanOptionsForSession(session)).originalDateKey != null,
    );
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
      duringAssignmentId: null,
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

async function publishHardInSession(
  assignmentId: string,
  sessionTitle: string,
  target: number,
  original: boolean,
) {
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
      instructions: hardInSessionInstructions(target, original),
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
  const inSession = await ensureHardSatInSession(session);
  if (prework.action === "shortfall" || inSession.status === "unavailable") {
    return { difficulty, inSessionStatus: "unavailable" };
  }
  return { difficulty, inSessionStatus: inSession.status };
}

/** Taito's Oct 30 SAT hour with Eunice. Michelle's Oct 25 set is a different student. */
export function isTaitoOct30EuniceSession(input: {
  subject: string;
  dateTime: Date;
  timezone?: string | null;
  studentEmail?: string | null;
  tutorEmail?: string | null;
  clientUserId?: string | null;
}): boolean {
  if (normalizedSessionSubject(input.subject) !== "SAT") return false;
  if ((input.studentEmail ?? "").trim().toLowerCase() !== TAITO_STUDENT_EMAIL) return false;
  if ((input.tutorEmail ?? "").trim().toLowerCase() !== EUNICE_TUTOR_EMAIL) return false;
  return matchesTaitoScheduledDate(
    {
      dateTime: input.dateTime,
      timezone: input.timezone,
      email: input.studentEmail,
      clientUserId: input.clientUserId,
    },
    "2026-10-30",
  );
}

/**
 * Point Taito's Oct 30 pre-work at the existing hard module 2 set when that
 * copy has no attempts. Other sessions, including Michelle's Oct 25 set, stay.
 */
export async function ensureTaitoOct30HardPrework(): Promise<{
  action: "missing" | "unchanged" | "assigned" | "blocked" | "shortfall";
}> {
  const [student] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, TAITO_STUDENT_EMAIL))
    .limit(1);
  if (!student) return { action: "missing" };
  const [tutor] = await db
    .select({ userId: tutorProfilesTable.userId, email: tutorProfilesTable.email })
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.email, EUNICE_TUTOR_EMAIL))
    .limit(1);
  if (!tutor?.userId) return { action: "missing" };
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, student.id),
        eq(sessionsTable.tutorUserId, tutor.userId),
        ne(sessionsTable.status, "archived"),
      ),
    );
  const session = sessions.find((row) =>
    isTaitoOct30EuniceSession({
      subject: row.subject,
      dateTime: row.dateTime,
      timezone: row.timezone,
      studentEmail: student.email,
      tutorEmail: tutor.email,
      clientUserId: row.clientUserId,
    }),
  );
  if (!session) return { action: "missing" };
  const result = await ensureHardSatPrework(session);
  if (result.action === "assigned") return { action: "assigned" };
  if (result.action === "blocked-by-attempts") return { action: "blocked" };
  if (result.action === "shortfall") return { action: "shortfall" };
  return { action: "unchanged" };
}
