import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  bankQuestionsTable,
  db,
} from "@workspace/db";
import { isOfficialSatExtract } from "./sat-bank-diagnostic-quality.ts";
import { materializeHardSatQuestion } from "./sat-bank-service.ts";
import { loadSeenSatBankUsage } from "./sat-bank-usage.ts";
import { satSectionsForSession } from "./sat-hard-sets.ts";
import { logger } from "./logger.ts";
import { normalizedSessionSubject } from "./session-schedule.ts";
import {
  HARD_RESERVE_DEFAULT,
  decideHardReserveWrite,
  hardChallengeSetTitle,
  isHardChallengeReserve,
  selectHardReserve,
  type HardReserveCandidate,
} from "./sat-hard-reserve-plan.ts";
import {
  HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  isRenderableHardSatItem,
  toRenderableHardSatInput,
} from "./sat-set-difficulty.ts";

export {
  HARD_CHALLENGE_TITLE_PREFIX,
  HARD_RESERVE_DEFAULT,
  HARD_RESERVE_MAX,
  decideHardReserveWrite,
  duringSessionAcceptsSessionWork,
  hardChallengeSetTitle,
  hardChallengeTitleIsPrework,
  hardReserveTarget,
  isHardChallengeReserve,
  isHardChallengeSetTitle,
  resolveDuringSessionAssignment,
  selectHardReserve,
} from "./sat-hard-reserve-plan.ts";
export type { HardReserveCandidate, HardReservePick } from "./sat-hard-reserve-plan.ts";

async function loadOfficialHardReservePool(): Promise<HardReserveCandidate[]> {
  const rows = await db
    .select()
    .from(bankQuestionsTable)
    .orderBy(asc(bankQuestionsTable.position), asc(bankQuestionsTable.questionNumber));
  const selected: HardReserveCandidate[] = [];
  for (const row of rows) {
    const item = toRenderableHardSatInput(row);
    if (!isRenderableHardSatItem(item)) continue;
    if (!isOfficialSatExtract(item)) continue;
    selected.push({
      id: row.id,
      sourceKey: row.sourceKey,
      examFamily: row.examFamily,
      sourceKind: row.sourceKind,
      section: row.section,
      inHardPool: true,
    });
  }
  return selected;
}

async function sourceKeysOnSession(sessionId: string): Promise<Set<string>> {
  const rows = await db
    .select({ sourceKey: bankQuestionsTable.sourceKey })
    .from(assignmentQuestionsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignmentQuestionsTable.assignmentId))
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(
      and(eq(assignmentsTable.sessionId, sessionId), ne(assignmentsTable.status, "archived")),
    );
  return new Set(rows.map((row) => row.sourceKey).filter((key): key is string => Boolean(key)));
}

function reserveInstructions(count: number, target: number): string {
  const held =
    "Hard reserve for the tutor. Publish it during the session if the student is doing well. Students do not see this set while it stays a draft.";
  if (count >= target) return held;
  return `${held} ${count} of ${target} hard official SAT items were available without repeating this session's questions or questions the student has already seen. Shortfall: ${target - count}.`;
}

export type HardReserveResult = {
  action: "skipped" | "kept" | "created" | "shortfall";
  assignmentId: string | null;
  questionCount: number;
  shortfall: number;
  target: number;
};

/**
 * Create the draft hard reserve for one SAT session.
 * A live reserve is left untouched. Pre-work and other in-session assignments are not archived.
 */
export async function ensureHardChallengeReserve(session: {
  id: string;
  courseId: string;
  subject: string;
  title: string;
  clientUserId?: string | null;
}): Promise<HardReserveResult> {
  const target = HARD_RESERVE_DEFAULT;
  if (normalizedSessionSubject(session.subject) !== "SAT") {
    return { action: "skipped", assignmentId: null, questionCount: 0, shortfall: 0, target };
  }
  const during = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      hardChallengeReserve: assignmentsTable.hardChallengeReserve,
    })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, session.id),
        eq(assignmentsTable.deliveryPhase, "during_session"),
      ),
    );
  if (decideHardReserveWrite(during) === "keep") {
    const existing = during.find(
      (row) => row.status !== "archived" && isHardChallengeReserve(row),
    );
    const questionCount = existing ? await assignmentQuestionCount(existing.id) : 0;
    return {
      action: "kept",
      assignmentId: existing?.id ?? null,
      questionCount,
      shortfall: Math.max(0, target - questionCount),
      target,
    };
  }
  const seen = session.clientUserId
    ? await loadSeenSatBankUsage(session.clientUserId, [])
    : { sourceKeys: new Set<string>(), practiceTests: new Set<number>() };
  const onSession = await sourceKeysOnSession(session.id);
  const exclude = new Set<string>([...seen.sourceKeys, ...onSession]);
  const sections = await satSectionsForSession(session);
  const pool = await loadOfficialHardReservePool();
  const picked = selectHardReserve(pool, {
    seed: session.id,
    target,
    excludeSourceKeys: exclude,
    sections,
  });
  if (picked.selected.length === 0) {
    logger.info(
      { sessionId: session.id, target, shortfall: picked.shortfall, pool: pool.length },
      "Hard challenge reserve shortfall",
    );
    return {
      action: "shortfall",
      assignmentId: null,
      questionCount: 0,
      shortfall: picked.shortfall,
      target,
    };
  }
  const questionIds: string[] = [];
  for (const item of picked.selected) {
    questionIds.push(await materializeHardSatQuestion(item.id));
  }
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from sessions where id = ${session.id} for update`);
    const live = await tx
      .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      hardChallengeReserve: assignmentsTable.hardChallengeReserve,
    })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.sessionId, session.id),
          eq(assignmentsTable.deliveryPhase, "during_session"),
        ),
      );
    if (decideHardReserveWrite(live) === "keep") {
      const existing = live.find(
        (row) => row.status !== "archived" && isHardChallengeReserve(row),
      );
      return { assignmentId: existing?.id ?? null, created: false as const };
    }
    const [assignment] = await tx
      .insert(assignmentsTable)
      .values({
        courseId: session.courseId,
        sessionId: session.id,
        deliveryPhase: "during_session",
        title: hardChallengeSetTitle(picked.selected.length, session.title),
        subject: session.subject || "SAT",
        instructions: reserveInstructions(picked.selected.length, picked.target),
        status: "draft",
        timeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
        maxAttempts: 1,
        hardChallengeReserve: true,
      })
      .returning();
    for (const [index, questionId] of questionIds.entries()) {
      await tx.insert(assignmentQuestionsTable).values({
        assignmentId: assignment!.id,
        questionId,
        position: index,
        predictionFirst: false,
      });
    }
    return { assignmentId: assignment!.id, created: true as const };
  });
  if (!created.created) {
    const questionCount = created.assignmentId ? await assignmentQuestionCount(created.assignmentId) : 0;
    return {
      action: "kept",
      assignmentId: created.assignmentId,
      questionCount,
      shortfall: Math.max(0, target - questionCount),
      target,
    };
  }
  if (picked.shortfall > 0) {
    logger.info(
      { sessionId: session.id, questionCount: picked.selected.length, shortfall: picked.shortfall },
      "Hard challenge reserve created short",
    );
  }
  return {
    action: picked.shortfall > 0 ? "shortfall" : "created",
    assignmentId: created.assignmentId,
    questionCount: picked.selected.length,
    shortfall: picked.shortfall,
    target: picked.target,
  };
}

async function assignmentQuestionCount(assignmentId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  return Number(count ?? 0);
}
