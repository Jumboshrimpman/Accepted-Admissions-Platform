/**
 * Assign the next unused Michelle × Sophia Lamas curated SAT English bundle
 * to a session: 40 published pre-work (50 min), 15 published in-session, and
 * 5 draft reserve questions. Unattempted auto-generated sets are replaced.
 * Attempted sets and past quizzes are left untouched.
 */

import { and, eq, ne, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  bankQuestionsTable,
  curriculumBlocksTable,
  db,
  questionsTable,
  sessionsTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
import { formatMichelleHardAssignmentTitle } from "./michelle-hard-assignment-title.ts";
import {
  isMichelleSophiaLamasSatClient,
  isSophiaLamasTutor,
  sessionConsumesSatPrepQueue,
} from "./michelle-sophia-lamas-sat-prep-slides.ts";
import {
  assertCuratedRwBundlesComplete,
  bundleAssignedFromSourceKeys,
  CURATED_RW_IN_SESSION_QUESTIONS,
  CURATED_RW_PREWORK_QUESTIONS,
  CURATED_RW_RESERVE_QUESTIONS,
  curatedRwItemsForBundle,
  isOriginalCuratedRwItem,
  michelleSophiaLamasCuratedRwBankRecords,
  nextCuratedRwBundleForSession,
  type CuratedRwBundleNumber,
  type CuratedRwPhase,
  type CuratedRwQueuePeer,
} from "./michelle-sophia-lamas-curated-rw.ts";
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
import { logger } from "./logger.ts";
import { materializeBankQuestion, upsertBankRecords } from "./sat-bank-service.ts";
import { routinePreworkTimeLimitMinutes } from "./sat-bank-timing.ts";
import {
  HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  type SatPracticeSection,
} from "./sat-set-difficulty.ts";
import { normalizedSessionSubject } from "./session-schedule.ts";

type SessionRow = typeof sessionsTable.$inferSelect;

export type EnsureCuratedRwSetsResult =
  | { action: "skipped"; reason: string }
  | { action: "exhausted" }
  | { action: "blocked-by-attempts"; assignmentIds: string[] }
  | {
      action: "unchanged" | "assigned";
      bundle: CuratedRwBundleNumber;
      preworkAssignmentId: string;
      inSessionAssignmentId: string;
      reserveAssignmentId: string;
    };

const SECTIONS: readonly SatPracticeSection[] = ["rw"];
const CURATED_PREP_SUMMARY =
  "Hard SAT set: 40 pre-work questions and 15 in-session module 2 questions, with a 5-question tutor reserve. The in-session set is not timed.";

export async function ensureMichelleSophiaLamasCuratedRwBank(): Promise<{
  insertedOrUpdated: number;
}> {
  assertCuratedRwBundlesComplete();
  const written = await upsertBankRecords(michelleSophiaLamasCuratedRwBankRecords());
  logger.info(
    { inserted: written.inserted, updated: written.updated },
    "Michelle Sophia Lamas curated SAT English bank ready",
  );
  return { insertedOrUpdated: written.inserted + written.updated };
}

export async function isMichelleSophiaLamasSatEnglishSession(
  session: SessionRow,
): Promise<boolean> {
  if ((session.status ?? "").trim() === "archived") return false;
  if ((session.bookingStatus ?? "").trim() === "cancelled") return false;
  if (normalizedSessionSubject(session.subject) !== "SAT") return false;
  if (session.clientUserId !== MICHELLE_MAKAREM_USER_ID) {
    if (!session.clientUserId) return false;
    const [client] = await db
      .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, session.clientUserId))
      .limit(1);
    if (!isMichelleSophiaLamasSatClient(client)) return false;
  }
  const tutor = await loadTutorIdentity(session.tutorUserId);
  return isSophiaLamasTutor(tutor);
}

export async function ensureMichelleSophiaLamasCuratedRwSets(
  sessionOrId: SessionRow | { id: string },
): Promise<EnsureCuratedRwSetsResult> {
  const session = await loadSession(sessionOrId);
  if (!session) return { action: "skipped", reason: "session-not-found" };
  if (!(await isMichelleSophiaLamasSatEnglishSession(session))) {
    return { action: "skipped", reason: "not-michelle-sophia-lamas-sat" };
  }

  await ensureMichelleSophiaLamasCuratedRwBank();

  const live = await liveSessionAssignments(session.id);
  const attempted = [];
  for (const row of live) {
    if ((await attemptCount(row.id)) > 0) attempted.push(row.id);
  }
  if (attempted.length > 0) {
    return { action: "blocked-by-attempts", assignmentIds: attempted };
  }

  const currentBundle = bundleAssignedFromSourceKeys(await allSourceKeys(live.map((row) => row.id)));
  const peers = await curatedQueuePeers(session.id);
  const bundle =
    currentBundle ??
    nextCuratedRwBundleForSession({
      currentSessionId: session.id,
      currentCreatedAt: session.createdAt,
      peers,
    });
  if (!bundle) return { action: "exhausted" };

  if (currentBundle && (await setsAreComplete(live, currentBundle))) {
    await retitleLiveSets(session, live);
    await markCuratedPrepReady(session.id);
    await markSessionHasHomework(session.id);
    return {
      action: "unchanged",
      bundle: currentBundle,
      preworkAssignmentId: findLive(live, "before_session", false)!.id,
      inSessionAssignmentId: findLive(live, "during_session", false)!.id,
      reserveAssignmentId: findLive(live, "during_session", true)!.id,
    };
  }

  const questionIdsByPhase = await materializeBundle(bundle);
  const tutor = await loadTutorIdentity(session.tutorUserId);
  const titleFor = (kind: "prework" | "in-session" | "reserve") =>
    formatMichelleHardAssignmentTitle({
      dateTime: session.dateTime,
      timezone: session.timezone,
      kind,
      tutorName: tutor.name,
      tutorEmail: tutor.email,
      sessionTitle: session.title,
      sections: SECTIONS,
    });

  const preworkId = await writeCuratedAssignment({
    session,
    existing: findLive(live, "before_session", false),
    deliveryPhase: "before_session",
    hardChallengeReserve: false,
    status: "published",
    title: titleFor("prework"),
    timeLimitMinutes: routinePreworkTimeLimitMinutes(CURATED_RW_PREWORK_QUESTIONS),
    instructions:
      "40 hard SAT Reading & Writing questions for this session (not a full-length SAT). Accuracy is recorded; this is not an official SAT score.",
    questionIds: questionIdsByPhase.prework,
  });
  const inSessionId = await writeCuratedAssignment({
    session,
    existing: findLive(live, "during_session", false),
    deliveryPhase: "during_session",
    hardChallengeReserve: false,
    status: "published",
    title: titleFor("in-session"),
    timeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
    instructions:
      "15 hard SAT Reading & Writing questions written for this session. Work through them with your tutor. This is not a timed prediction quiz.",
    questionIds: questionIdsByPhase.insession,
  });
  const reserveId = await writeCuratedAssignment({
    session,
    existing: findLive(live, "during_session", true),
    deliveryPhase: "during_session",
    hardChallengeReserve: true,
    status: "draft",
    title: titleFor("reserve"),
    timeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
    instructions:
      "Hard reserve for the tutor. Publish it during the session if the student is doing well. Students do not see this set while it stays a draft.",
    questionIds: questionIdsByPhase.reserve,
  });

  // Archive leftover unattempted live sets that we did not reuse
  // (e.g. a second in-session row).
  const keep = new Set([preworkId, inSessionId, reserveId]);
  for (const row of live) {
    if (keep.has(row.id)) continue;
    if ((await attemptCount(row.id)) > 0) continue;
    await archiveUnattempted(session.id, row.id);
  }

  await markCuratedPrepReady(session.id);
  await markSessionHasHomework(session.id);
  logger.info(
    { sessionId: session.id, bundle, preworkId, inSessionId, reserveId },
    "Assigned Michelle Sophia Lamas curated SAT English bundle",
  );
  return {
    action: "assigned",
    bundle,
    preworkAssignmentId: preworkId,
    inSessionAssignmentId: inSessionId,
    reserveAssignmentId: reserveId,
  };
}

async function loadSession(sessionOrId: SessionRow | { id: string }): Promise<SessionRow | null> {
  if ("courseId" in sessionOrId && "subject" in sessionOrId && "dateTime" in sessionOrId) {
    return sessionOrId as SessionRow;
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionOrId.id))
    .limit(1);
  return session ?? null;
}

async function loadTutorIdentity(tutorUserId: string | null | undefined): Promise<{
  name: string | null;
  email: string | null;
  displayName: string | null;
}> {
  if (!tutorUserId) return { name: null, email: null, displayName: null };
  const [row] = await db
    .select({
      profileName: tutorProfilesTable.name,
      profileEmail: tutorProfilesTable.email,
      displayName: usersTable.displayName,
      email: usersTable.email,
    })
    .from(usersTable)
    .leftJoin(tutorProfilesTable, eq(tutorProfilesTable.userId, usersTable.id))
    .where(eq(usersTable.id, tutorUserId))
    .limit(1);
  return {
    name: row?.profileName ?? row?.displayName ?? null,
    email: row?.profileEmail ?? row?.email ?? null,
    displayName: row?.displayName ?? null,
  };
}

type LiveAssignment = {
  id: string;
  title: string;
  deliveryPhase: string;
  hardChallengeReserve: boolean;
  status: string;
};

async function liveSessionAssignments(sessionId: string): Promise<LiveAssignment[]> {
  return db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      deliveryPhase: assignmentsTable.deliveryPhase,
      hardChallengeReserve: assignmentsTable.hardChallengeReserve,
      status: assignmentsTable.status,
    })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.sessionId, sessionId), ne(assignmentsTable.status, "archived")));
}

function findLive(
  live: readonly LiveAssignment[],
  deliveryPhase: "before_session" | "during_session",
  reserve: boolean,
): LiveAssignment | undefined {
  return live.find(
    (row) => row.deliveryPhase === deliveryPhase && row.hardChallengeReserve === reserve,
  );
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

async function sourceKeysForAssignment(assignmentId: string): Promise<string[]> {
  const rows = await db
    .select({
      linkedSourceKey: bankQuestionsTable.sourceKey,
      tags: questionsTable.tags,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
    .leftJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  return rows.flatMap((row) => {
    if (row.linkedSourceKey) return [row.linkedSourceKey];
    const tags = row.tags;
    if (!Array.isArray(tags)) return [];
    const taggedKey = tags.find(
      (tag): tag is string =>
        typeof tag === "string" && /^(sat-pt|psat-pt|original-hard-)/i.test(tag),
    );
    return taggedKey ? [taggedKey] : [];
  });
}

async function allSourceKeys(assignmentIds: string[]): Promise<string[]> {
  const keys: string[] = [];
  for (const id of assignmentIds) keys.push(...(await sourceKeysForAssignment(id)));
  return keys;
}

async function setsAreComplete(
  live: readonly LiveAssignment[],
  bundle: CuratedRwBundleNumber,
): Promise<boolean> {
  const prework = findLive(live, "before_session", false);
  const inSession = findLive(live, "during_session", false);
  const reserve = findLive(live, "during_session", true);
  if (!prework || !inSession || !reserve) return false;
  if ((await assignmentQuestionCount(prework.id)) !== CURATED_RW_PREWORK_QUESTIONS) return false;
  if ((await assignmentQuestionCount(inSession.id)) !== CURATED_RW_IN_SESSION_QUESTIONS) return false;
  if ((await assignmentQuestionCount(reserve.id)) !== CURATED_RW_RESERVE_QUESTIONS) return false;
  const keys = await allSourceKeys([prework.id, inSession.id, reserve.id]);
  return bundleAssignedFromSourceKeys(keys) === bundle;
}

async function retitleLiveSets(session: SessionRow, live: readonly LiveAssignment[]): Promise<void> {
  const tutor = await loadTutorIdentity(session.tutorUserId);
  const titleFor = (kind: "prework" | "in-session" | "reserve") =>
    formatMichelleHardAssignmentTitle({
      dateTime: session.dateTime,
      timezone: session.timezone,
      kind,
      tutorName: tutor.name,
      tutorEmail: tutor.email,
      sessionTitle: session.title,
      sections: SECTIONS,
    });
  const mapping: Array<[LiveAssignment | undefined, "prework" | "in-session" | "reserve"]> = [
    [findLive(live, "before_session", false), "prework"],
    [findLive(live, "during_session", false), "in-session"],
    [findLive(live, "during_session", true), "reserve"],
  ];
  for (const [row, kind] of mapping) {
    if (!row) continue;
    const title = titleFor(kind);
    if (row.title === title) continue;
    await db
      .update(assignmentsTable)
      .set({ title, subject: "SAT English" })
      .where(eq(assignmentsTable.id, row.id));
  }
}

async function materializeBundle(bundle: CuratedRwBundleNumber): Promise<Record<CuratedRwPhase, string[]>> {
  const result: Record<CuratedRwPhase, string[]> = { prework: [], insession: [], reserve: [] };
  for (const phase of ["prework", "insession", "reserve"] as const) {
    for (const item of curatedRwItemsForBundle(bundle, phase)) {
      const sourceKey = isOriginalCuratedRwItem(item) ? item.sourceKey : item.officialSourceKey;
      const [bank] = await db
        .select({ id: bankQuestionsTable.id })
        .from(bankQuestionsTable)
        .where(eq(bankQuestionsTable.sourceKey, sourceKey))
        .limit(1);
      if (!bank) {
        throw new Error(`Curated SAT English item missing from the bank: ${sourceKey}`);
      }
      result[phase].push(await materializeBankQuestion(bank.id));
    }
  }
  return result;
}

async function writeCuratedAssignment(input: {
  session: SessionRow;
  existing?: LiveAssignment;
  deliveryPhase: "before_session" | "during_session";
  hardChallengeReserve: boolean;
  status: "published" | "draft";
  title: string;
  timeLimitMinutes: number;
  instructions: string;
  questionIds: string[];
}): Promise<string> {
  if (input.existing && (await attemptCount(input.existing.id)) > 0) {
    throw new Error(`Refusing to replace attempted assignment ${input.existing.id}`);
  }
  // Always insert a new assignment and archive the unattempted predecessor so
  // its question rows stay intact for rollback. Never delete assignment_questions.
  const assignmentId = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from sessions where id = ${input.session.id} for update`);
    if (input.existing) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, input.existing.id));
      if (Number(count) > 0) {
        throw new Error(`Refusing to replace attempted assignment ${input.existing.id}`);
      }
      await tx
        .update(assignmentsTable)
        .set({ status: "archived" })
        .where(
          and(
            eq(assignmentsTable.id, input.existing.id),
            eq(assignmentsTable.sessionId, input.session.id),
            ne(assignmentsTable.status, "archived"),
          ),
        );
    }
    const [created] = await tx
      .insert(assignmentsTable)
      .values({
        courseId: input.session.courseId,
        sessionId: input.session.id,
        deliveryPhase: input.deliveryPhase,
        title: input.title,
        subject: "SAT English",
        instructions: input.instructions,
        status: input.status,
        timeLimitMinutes: input.timeLimitMinutes,
        maxAttempts: 1,
        hardChallengeReserve: input.hardChallengeReserve,
      })
      .returning({ id: assignmentsTable.id });
    return created!.id;
  });
  for (const [index, questionId] of input.questionIds.entries()) {
    await db.insert(assignmentQuestionsTable).values({
      assignmentId,
      questionId,
      position: index,
      predictionFirst: false,
    });
  }
  return assignmentId;
}

async function archiveUnattempted(sessionId: string, assignmentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from assignments where id = ${assignmentId} for update`);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, assignmentId));
    if (Number(count) > 0) return;
    await tx
      .update(assignmentsTable)
      .set({ status: "archived" })
      .where(
        and(
          eq(assignmentsTable.id, assignmentId),
          eq(assignmentsTable.sessionId, sessionId),
          ne(assignmentsTable.status, "archived"),
        ),
      );
  });
}

async function markSessionHasHomework(sessionId: string): Promise<void> {
  await db
    .update(sessionsTable)
    .set({ hasHomework: true, updatedAt: new Date() })
    .where(eq(sessionsTable.id, sessionId));
}

async function markCuratedPrepReady(sessionId: string): Promise<void> {
  const [block] = await db
    .select()
    .from(curriculumBlocksTable)
    .where(
      and(
        eq(curriculumBlocksTable.sessionId, sessionId),
        eq(curriculumBlocksTable.kind, "adaptive_prep"),
      ),
    )
    .limit(1);
  if (!block) return;
  const config =
    block.config && typeof block.config === "object" && !Array.isArray(block.config)
      ? (block.config as Record<string, unknown>)
      : {};
  await db
    .update(curriculumBlocksTable)
    .set({
      config: {
        ...config,
        mode: "hard_bank",
        title: typeof config.title === "string" ? config.title : "AI-native session plan",
        text: CURATED_PREP_SUMMARY,
        needsQuestions: false,
      },
      updatedAt: new Date(),
    })
    .where(eq(curriculumBlocksTable.id, block.id));
}

async function curatedQueuePeers(exceptSessionId: string): Promise<CuratedRwQueuePeer[]> {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, MICHELLE_MAKAREM_USER_ID),
        ne(sessionsTable.id, exceptSessionId),
        ne(sessionsTable.status, "archived"),
      ),
    );
  const peers: CuratedRwQueuePeer[] = [];
  for (const session of sessions) {
    if (!(await isMichelleSophiaLamasSatEnglishSession(session)) && session.bookingStatus !== "cancelled") {
      continue;
    }
    // Include cancelled-without-credit-restore and live Sophia Lamas SAT sessions.
    const tutor = await loadTutorIdentity(session.tutorUserId);
    if (!isSophiaLamasTutor(tutor)) continue;
    if (normalizedSessionSubject(session.subject) !== "SAT") continue;
    if (!sessionConsumesSatPrepQueue(session)) continue;
    const live = await liveSessionAssignments(session.id);
    const keys = await allSourceKeys(live.map((row) => row.id));
    peers.push({
      id: session.id,
      createdAt: session.createdAt,
      assignedBundle: bundleAssignedFromSourceKeys(keys),
    });
  }
  return peers;
}
