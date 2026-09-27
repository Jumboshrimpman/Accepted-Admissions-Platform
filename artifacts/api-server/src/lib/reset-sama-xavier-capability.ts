import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adaptiveRecommendationsTable,
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  auditLogsTable,
  db,
  homeworkWeaknessGroupsTable,
  questionReportsTable,
  remediationRetriesTable,
  responsesTable,
  reviewQueueTable,
  sessionsTable,
  timerEventsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { nextWeekdayFourPmEastern } from "./xavier-sat-capability-session.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SAMA_TEST_CLIENT_EMAIL,
  XAVIER_CANONICAL_CLERK_USER_ID,
  XAVIER_DUPLICATE_CLERK_USER_ID,
  XAVIER_SAT_CAPABILITY_SESSION_TITLE,
  XAVIER_TUTOR_EMAIL,
} from "./xavier-sat-capability-session.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CAPABILITY_RESET_SAMA_EMAIL,
  CAPABILITY_RESET_SESSION_TITLE_PREFIX,
  SAMA_XAVIER_CAPABILITY_RESET_ACTION,
  capabilityAssignmentFixes,
  capabilityResetScope,
  capabilitySessionNeedsVisibilityRestore,
  shouldRefreshCapabilitySchedule,
  isSamaXavierCapabilityResetTarget,
  type CapabilityResetIdentity,
} from "./reset-sama-xavier-capability-select.ts";

if (
  SAMA_TEST_CLIENT_EMAIL !== CAPABILITY_RESET_SAMA_EMAIL ||
  XAVIER_TUTOR_EMAIL !== "xaver.rmz6@gmail.com" ||
  XAVIER_CANONICAL_CLERK_USER_ID !== "user_3IxUfoT1xRnDsqhlx5NN1eGfRg6" ||
  XAVIER_DUPLICATE_CLERK_USER_ID !== "user_3IsvKVDGAg5KdvwHhvODf2VFqtd" ||
  XAVIER_SAT_CAPABILITY_SESSION_TITLE !== CAPABILITY_RESET_SESSION_TITLE_PREFIX
) {
  throw new Error(
    "Xavier SAT capability reset constants drifted from the capability-session seed.",
  );
}

export type SamaXavierCapabilityResetResult = {
  applied: boolean;
  alreadyApplied: boolean;
  sessionIds: string[];
  alreadyAppliedSessionIds: string[];
  deletedAttempts: number;
  questionsKept: number;
  scheduleRefreshed: boolean;
  skippedReason?: string;
};

const EMPTY_RESULT: SamaXavierCapabilityResetResult = {
  applied: false,
  alreadyApplied: false,
  sessionIds: [],
  alreadyAppliedSessionIds: [],
  deletedAttempts: 0,
  questionsKept: 0,
  scheduleRefreshed: false,
};

async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);
  return user ?? null;
}

async function deleteAttemptTree(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  attemptIds: string[],
): Promise<number> {
  if (attemptIds.length === 0) return 0;
  await tx
    .delete(questionReportsTable)
    .where(inArray(questionReportsTable.attemptId, attemptIds));
  await tx.delete(reviewQueueTable).where(inArray(reviewQueueTable.attemptId, attemptIds));
  await tx.delete(timerEventsTable).where(inArray(timerEventsTable.attemptId, attemptIds));
  await tx.delete(responsesTable).where(inArray(responsesTable.attemptId, attemptIds));
  await tx
    .delete(adaptiveRecommendationsTable)
    .where(inArray(adaptiveRecommendationsTable.sourceAttemptId, attemptIds));
  await tx
    .delete(homeworkWeaknessGroupsTable)
    .where(inArray(homeworkWeaknessGroupsTable.attemptId, attemptIds));
  await tx
    .delete(remediationRetriesTable)
    .where(inArray(remediationRetriesTable.sourceAttemptId, attemptIds));
  await tx.delete(attemptsTable).where(inArray(attemptsTable.id, attemptIds));
  return attemptIds.length;
}

/**
 * One-shot boot reset for samapostgrad’s Xavier SAT capability test.
 * Deletes that student’s attempts (submitted, paused, flags, and answers)
 * on that session only. Keeps the assignment, its questions, and Xavier.
 * Does not rematerialize the question bank or touch other tutors’ homework.
 */
export async function resetSamaXavierSatCapabilityAttempts(
  identity: CapabilityResetIdentity & { now?: Date } = {},
): Promise<SamaXavierCapabilityResetResult> {
  const resolved = capabilityResetScope(identity);
  if (!resolved.ok) {
    return { ...EMPTY_RESULT, skippedReason: resolved.reason };
  }
  const { scope } = resolved;
  const now = identity.now ?? new Date();
  const sama = await findUserByEmail(scope.samaEmail);
  const xavier = await findUserByEmail(scope.xavierEmail);
  if (!sama || !xavier || sama.role !== "student" || xavier.role !== "tutor") {
    return {
      ...EMPTY_RESULT,
      skippedReason: "No samapostgrad student and Xavier tutor pair is available to reset.",
    };
  }
  if (
    !isSamaXavierCapabilityResetTarget(
      {
        sessionTitle: scope.titlePrefix,
        clientEmail: sama.email,
        tutorEmail: xavier.email,
        tutorClerkUserId: xavier.clerkUserId,
      },
      scope,
    )
  ) {
    return {
      ...EMPTY_RESULT,
      skippedReason: "Refusing reset: Xavier and samapostgrad identities do not match.",
    };
  }

  const titlePattern = `${scope.titlePrefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, sama.id),
        eq(sessionsTable.tutorUserId, xavier.id),
        sql`${sessionsTable.title} LIKE ${titlePattern} ESCAPE '\\'`,
      ),
    );

  const targets = sessions.filter((session) =>
    isSamaXavierCapabilityResetTarget(
      {
        sessionTitle: session.title,
        clientEmail: sama.email,
        tutorEmail: xavier.email,
        tutorClerkUserId: xavier.clerkUserId,
      },
      scope,
    ),
  );
  if (targets.length === 0) {
    return {
      ...EMPTY_RESULT,
      skippedReason: "No Xavier SAT capability session for samapostgrad.",
    };
  }

  const sessionIds: string[] = [];
  const alreadyAppliedSessionIds: string[] = [];
  let deletedAttempts = 0;
  let questionsKept = 0;
  let scheduleRefreshed = false;

  for (const session of targets) {
    const outcome = await db.transaction(async (tx) => {
      const [marker] = await tx
        .select({ id: auditLogsTable.id })
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.action, SAMA_XAVIER_CAPABILITY_RESET_ACTION),
            eq(auditLogsTable.entityType, "session"),
            eq(auditLogsTable.entityId, session.id),
          ),
        )
        .limit(1);
      if (marker) return { alreadyApplied: true as const };

      const assignmentRows = await tx
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.sessionId, session.id));
      const assignmentIds = assignmentRows.map((row) => row.id);
      const questionCounts = new Map<string, number>();
      if (assignmentIds.length > 0) {
        const counts = await tx
          .select({
            assignmentId: assignmentQuestionsTable.assignmentId,
            count: sql<number>`count(*)`,
          })
          .from(assignmentQuestionsTable)
          .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds))
          .groupBy(assignmentQuestionsTable.assignmentId);
        for (const row of counts) questionCounts.set(row.assignmentId, Number(row.count));
      }
      const kept = [...questionCounts.values()].reduce((sum, count) => sum + count, 0);
      const fixes = capabilityAssignmentFixes(
        assignmentRows.map((row) => ({
          id: row.id,
          deliveryPhase: row.deliveryPhase,
          status: row.status,
          deadline: row.deadline,
          questionCount: questionCounts.get(row.id) ?? 0,
        })),
        now,
      );
      const attempts =
        assignmentIds.length === 0
          ? []
          : await tx
              .select({ id: attemptsTable.id })
              .from(attemptsTable)
              .where(
                and(
                  inArray(attemptsTable.assignmentId, assignmentIds),
                  eq(attemptsTable.userId, sama.id),
                ),
              );
      const deleted = await deleteAttemptTree(
        tx,
        attempts.map((row) => row.id),
      );
      for (const assignmentId of fixes.publishIds) {
        await tx
          .update(assignmentsTable)
          .set({ status: "published" })
          .where(eq(assignmentsTable.id, assignmentId));
      }
      for (const assignmentId of fixes.clearDeadlineIds) {
        await tx
          .update(assignmentsTable)
          .set({ deadline: null })
          .where(eq(assignmentsTable.id, assignmentId));
      }
      const willHavePrework = assignmentRows.some(
        (row) =>
          row.deliveryPhase !== "during_session" &&
          (row.status !== "archived" || fixes.publishIds.includes(row.id)),
      );
      const visibility = capabilitySessionNeedsVisibilityRestore({
        status: session.status,
        bookingStatus: session.bookingStatus,
        cancelledAt: session.cancelledAt,
        hasHomework: session.hasHomework,
        willHavePrework,
      });
      const refreshSchedule = shouldRefreshCapabilitySchedule({
        dateTime: session.dateTime,
        timezone: session.timezone,
        providerEventId: session.providerEventId,
        now,
      });
      const patch: {
        dateTime?: Date;
        status?: "published";
        bookingStatus?: string;
        cancelledAt?: null;
        cancellationReason?: null;
        hasHomework?: boolean;
        updatedAt: Date;
      } = { updatedAt: now };
      let changed = false;
      if (refreshSchedule) {
        patch.dateTime = nextWeekdayFourPmEastern(now);
        changed = true;
      }
      if (visibility.publishSession) {
        patch.status = "published";
        changed = true;
      }
      if (visibility.restoreBooking) {
        patch.bookingStatus = "confirmed";
        patch.cancelledAt = null;
        patch.cancellationReason = null;
        changed = true;
      }
      if (visibility.setHasHomework) {
        patch.hasHomework = true;
        changed = true;
      }
      if (changed) {
        await tx.update(sessionsTable).set(patch).where(eq(sessionsTable.id, session.id));
      }
      await tx.insert(auditLogsTable).values({
        actorUserId: xavier.id,
        action: SAMA_XAVIER_CAPABILITY_RESET_ACTION,
        entityType: "session",
        entityId: session.id,
        metadata: {
          scope: "sama-xavier-sat-capability",
          studentEmail: scope.samaEmail,
          tutorEmail: scope.xavierEmail,
          deletedAttempts: deleted,
          questionsKept: kept,
          scheduleRefreshed: refreshSchedule,
        },
      });
      return {
        alreadyApplied: false as const,
        deleted,
        kept,
        scheduleRefreshed: refreshSchedule,
      };
    });

    if (outcome.alreadyApplied) {
      alreadyAppliedSessionIds.push(session.id);
      continue;
    }
    sessionIds.push(session.id);
    deletedAttempts += outcome.deleted;
    questionsKept += outcome.kept;
    scheduleRefreshed = scheduleRefreshed || outcome.scheduleRefreshed;
  }

  return {
    applied: sessionIds.length > 0,
    alreadyApplied: sessionIds.length === 0 && alreadyAppliedSessionIds.length > 0,
    sessionIds,
    alreadyAppliedSessionIds,
    deletedAttempts,
    questionsKept,
    scheduleRefreshed,
  };
}
