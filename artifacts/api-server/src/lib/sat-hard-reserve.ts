import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  bankQuestionsTable,
  db,
} from "@workspace/db";
import { MICHELLE_MAKAREM_USER_ID, skipsAutoPrework } from "./no-auto-prework-clients.ts";
import { isOfficialSatExtract } from "./sat-bank-diagnostic-quality.ts";
import { materializeHardSatQuestion } from "./sat-bank-service.ts";
import { loadSeenSatBankUsage } from "./sat-bank-usage.ts";
import { filterUnseenBankItems } from "./student-question-usage.ts";
import { isMichelleFutureHardSatSession, satSectionsForSession, sourceKeysForAssignment } from "./sat-hard-sets.ts";
import { formatMichelleHardAssignmentTitle } from "./michelle-hard-assignment-title.ts";
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
  isOfficialHardTailItem,
  isIeltsContent,
  isRenderableHardSatItem,
  isSatExamFamily,
  satSection,
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
    if (!isSatExamFamily(row.examFamily) || isIeltsContent(row)) continue;
    const official = isOfficialSatExtract(item);
    const michelleOriginal =
      (row.sourceKind ?? "").trim().toLowerCase() === "original_hard" &&
      (row.sourceKey ?? "").startsWith("original-hard-michelle-");
    if (!official && !michelleOriginal) continue;
    if (official && !isOfficialHardTailItem(item)) continue;
    selected.push({
      id: row.id,
      sourceKey: row.sourceKey,
      examFamily: row.examFamily,
      sourceKind: row.sourceKind,
      section: row.section,
      domain: row.domain,
      inHardPool: true,
      linkedQuestionId: row.linkedQuestionId,
      prompt: row.prompt,
      stimulus: row.stimulus,
      choices: row.choices,
    });
  }
  return selected;
}

async function sourceKeysOnSession(sessionId: string): Promise<Set<string>> {
  const assignments = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(eq(assignmentsTable.sessionId, sessionId), ne(assignmentsTable.status, "archived")),
    );
  const keys = new Set<string>();
  for (const row of assignments) {
    for (const sourceKey of await sourceKeysForAssignment(row.id)) {
      keys.add(sourceKey);
    }
  }
  return keys;
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


async function unattemptedReserveNeedsSectionRefresh(
  assignmentId: string,
  sections: readonly ("rw" | "math")[],
): Promise<boolean> {
  if (sections.length !== 1) return false;
  const required = sections[0]!;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(attemptsTable)
    .where(eq(attemptsTable.assignmentId, assignmentId));
  if (Number(count ?? 0) > 0) return false;
  const rows = await db
    .select({ section: bankQuestionsTable.section })
    .from(assignmentQuestionsTable)
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  if (rows.length === 0) return true;
  return rows.some((row) => satSection(row.section) !== required);
}

/**
 * Create the draft hard reserve for one SAT session.
 * A live reserve is left untouched unless it is unattempted and does not match a
 * required single section (Michelle's Xavier math or Sophia Lamas reading).
 * Pre-work and other in-session assignments are not archived.
 */

async function applyMichelleHardReserveTitle(
  session: {
    id: string;
    subject: string;
    title: string;
    clientUserId?: string | null;
    dateTime?: Date | string | null;
    timezone?: string | null;
  },
  assignmentId: string,
  sections: readonly ("rw" | "math")[],
): Promise<void> {
  if (!session.dateTime || !session.clientUserId) return;
  const dateTime = new Date(session.dateTime);
  if (Number.isNaN(dateTime.getTime())) return;
  if (!isMichelleFutureHardSatSession({
    id: session.id,
    clientUserId: session.clientUserId,
    subject: session.subject || "SAT",
    dateTime,
    timezone: session.timezone,
  })) {
    return;
  }
  const title = formatMichelleHardAssignmentTitle({
    dateTime,
    timezone: session.timezone,
    kind: "reserve",
    sessionTitle: session.title,
    sections,
  });
  const subject =
    sections.length === 1 && sections[0] === "math"
      ? "SAT Math"
      : sections.length === 1 && sections[0] === "rw"
        ? "SAT English"
        : "SAT";
  await db.update(assignmentsTable).set({ title, subject }).where(eq(assignmentsTable.id, assignmentId));
}

export async function ensureHardChallengeReserve(session: {
  id: string;
  courseId: string;
  subject: string;
  title: string;
  clientUserId?: string | null;
  tutorUserId?: string | null;
  dateTime?: Date | string | null;
  timezone?: string | null;
}): Promise<HardReserveResult> {
  const target = HARD_RESERVE_DEFAULT;
  if (normalizedSessionSubject(session.subject) !== "SAT") {
    return { action: "skipped", assignmentId: null, questionCount: 0, shortfall: 0, target };
  }
  if (skipsAutoPrework(session)) {
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
  const sections = await satSectionsForSession(session);
  const includeMichelleOriginalHard = session.clientUserId === MICHELLE_MAKAREM_USER_ID;
  if (decideHardReserveWrite(during) === "keep") {
    const existing = during.find(
      (row) => row.status !== "archived" && isHardChallengeReserve(row),
    );
    const shouldReplace = existing
      ? await unattemptedReserveNeedsSectionRefresh(existing.id, sections)
      : false;
    if (!shouldReplace) {
      if (existing) await applyMichelleHardReserveTitle(session, existing.id, sections);
      const questionCount = existing ? await assignmentQuestionCount(existing.id) : 0;
      return {
        action: "kept",
        assignmentId: existing?.id ?? null,
        questionCount,
        shortfall: Math.max(0, target - questionCount),
        target,
      };
    }
    if (existing) {
      await db
        .update(assignmentsTable)
        .set({ status: "archived" })
        .where(eq(assignmentsTable.id, existing.id));
    }
  }
  const seen = session.clientUserId
    ? await loadSeenSatBankUsage(session.clientUserId, [])
    : { sourceKeys: new Set<string>(), practiceTests: new Set<number>() };
  const onSession = await sourceKeysOnSession(session.id);
  const exclude = new Set<string>([...seen.sourceKeys, ...onSession]);
  const pool = await loadOfficialHardReservePool();
  const unseenPool = filterUnseenBankItems(pool, {
    questionIds: seen.questionIds ?? new Set(),
    sourceKeys: seen.sourceKeys,
    fingerprints: seen.fingerprints ?? new Set(),
  });
  const picked = selectHardReserve(unseenPool, {
    seed: session.id,
    target,
    excludeSourceKeys: exclude,
    sections,
    includeMichelleOriginalHard,
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
  if (created.assignmentId) {
    await applyMichelleHardReserveTitle(session, created.assignmentId, sections);
  }
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
