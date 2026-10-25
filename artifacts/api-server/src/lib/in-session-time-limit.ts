import { and, eq, ne } from "drizzle-orm";
import { assignmentsTable, attemptsTable, db } from "@workspace/db";
import { logger } from "./logger.ts";

/**
 * Taito's Oct 23 in-session attempt. Its stored result stays as history.
 * Other expired in-session attempts are reopened so the set can continue.
 */
export const OCT23_IN_SESSION_ATTEMPT_ID = "e38f62db-f088-435c-aa84-4c5480707f59";

export function inSessionDeliverySkipsTimeLimit(
  deliveryPhase: string | null | undefined,
): boolean {
  return deliveryPhase === "during_session";
}

/** Server expiry applies to timed pre-work, homework, and review quizzes only. */
export function serverTimeLimitReached(input: {
  deliveryPhase: string | null | undefined;
  timeLimitMinutes: number;
  activeSeconds: number;
}): boolean {
  if (inSessionDeliverySkipsTimeLimit(input.deliveryPhase)) return false;
  return input.activeSeconds >= input.timeLimitMinutes * 60;
}

export function shouldReopenExpiredInSessionAttempt(input: {
  deliveryPhase: string | null | undefined;
  status: string;
  attemptId: string;
}): boolean {
  return (
    inSessionDeliverySkipsTimeLimit(input.deliveryPhase) &&
    input.status === "expired" &&
    input.attemptId !== OCT23_IN_SESSION_ATTEMPT_ID
  );
}

export async function reopenExpiredInSessionAttempt(attemptId: string): Promise<boolean> {
  if (attemptId === OCT23_IN_SESSION_ATTEMPT_ID) return false;
  const [row] = await db
    .select({
      status: attemptsTable.status,
      deliveryPhase: assignmentsTable.deliveryPhase,
    })
    .from(attemptsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (
    !row ||
    !shouldReopenExpiredInSessionAttempt({
      deliveryPhase: row.deliveryPhase,
      status: row.status,
      attemptId,
    })
  ) {
    return false;
  }
  await db
    .update(attemptsTable)
    .set({
      status: "active",
      result: null,
      score: null,
      submittedAt: null,
      analysis: null,
    })
    .where(
      and(eq(attemptsTable.id, attemptId), eq(attemptsTable.status, "expired")),
    );
  return true;
}

export type InSessionOpenRepair = {
  assignments: number;
  reopened: number;
  alreadyOpen: number;
  protectedLeft: number;
};

/**
 * Idempotent startup repair. Counts only — no names, emails, or answer text.
 * Timed pre-work and homework rows are not selected.
 */
export async function ensureInSessionAttemptsStayOpen(): Promise<InSessionOpenRepair> {
  const rows = await db
    .select({
      attemptId: attemptsTable.id,
      status: attemptsTable.status,
      deliveryPhase: assignmentsTable.deliveryPhase,
      assignmentId: assignmentsTable.id,
    })
    .from(assignmentsTable)
    .leftJoin(attemptsTable, eq(attemptsTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentsTable.deliveryPhase, "during_session"),
        ne(assignmentsTable.status, "archived"),
      ),
    );
  const assignmentIds = new Set(rows.map((row) => row.assignmentId));
  let reopened = 0;
  let alreadyOpen = 0;
  let protectedLeft = 0;
  for (const row of rows) {
    if (!row.attemptId || !row.status) continue;
    if (row.attemptId === OCT23_IN_SESSION_ATTEMPT_ID && row.status === "expired") {
      protectedLeft += 1;
      continue;
    }
    if (
      shouldReopenExpiredInSessionAttempt({
        deliveryPhase: row.deliveryPhase,
        status: row.status,
        attemptId: row.attemptId,
      })
    ) {
      if (await reopenExpiredInSessionAttempt(row.attemptId)) reopened += 1;
      continue;
    }
    if (row.status === "active" || row.status === "paused") alreadyOpen += 1;
  }
  const repair: InSessionOpenRepair = {
    assignments: assignmentIds.size,
    reopened,
    alreadyOpen,
    protectedLeft,
  };
  logger.info(repair, "In-session attempts left open");
  return repair;
}
