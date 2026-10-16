import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adminNotificationsTable,
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import {
  PLACEHOLDER_SAT_ARCHIVE_FROM_DATE,
  eligiblePlaceholderArchiveIds,
  preworkStartabilityProblem,
  type PlaceholderArchiveCandidate,
} from "./session-homework.ts";
import {
  isTaitoFallSession,
  sessionLocalDateKey,
  TAITO_SESSION_TIMEZONE,
} from "./session-schedule.ts";

export const PREWORK_NOT_STARTABLE_KIND = "prework_not_startable";

type SessionRow = typeof sessionsTable.$inferSelect;

function dateKeyForSession(session: Pick<SessionRow, "dateTime" | "timezone">): string {
  return sessionLocalDateKey(session.dateTime, session.timezone || TAITO_SESSION_TIMEZONE);
}

async function questionAndAttemptCounts(assignmentId: string): Promise<{
  questionCount: number;
  attemptCount: number;
}> {
  const [questions, attempts] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, assignmentId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, assignmentId)),
  ]);
  return {
    questionCount: Number(questions[0]?.count ?? 0),
    attemptCount: Number(attempts[0]?.count ?? 0),
  };
}

export async function loadTaitoPlaceholderCandidates(
  allowedTitles: ReadonlySet<string>,
): Promise<PlaceholderArchiveCandidate[]> {
  const sessions = await db.select().from(sessionsTable);
  const taitoSessions = sessions.filter(
    (session) =>
      isTaitoFallSession(session) &&
      session.status !== "archived" &&
      session.bookingStatus !== "cancelled",
  );
  const sessionById = new Map(taitoSessions.map((session) => [session.id, session]));
  if (sessionById.size === 0) return [];
  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.sessionId, [...sessionById.keys()]));
  const candidates: PlaceholderArchiveCandidate[] = [];
  for (const assignment of assignments) {
    if (!assignment.sessionId || !allowedTitles.has(assignment.title)) continue;
    const session = sessionById.get(assignment.sessionId);
    if (!session) continue;
    const counts = await questionAndAttemptCounts(assignment.id);
    candidates.push({
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      questionCount: counts.questionCount,
      attemptCount: counts.attemptCount,
      sessionDateKey: dateKeyForSession(session),
    });
  }
  return candidates;
}

export async function archivePlaceholderAssignments(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(assignmentsTable)
    .set({ status: "archived" })
    .where(inArray(assignmentsTable.id, [...ids]));
}

export type PreworkVisibilityProblem = {
  sessionId: string;
  title: string;
  dateKey: string;
  problem: string;
};

async function assignmentsForVisibility(
  sessionId: string,
  treatArchivedIds: ReadonlySet<string>,
) {
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.sessionId, sessionId));
  const shaped = [];
  for (const row of rows) {
    const counts = await questionAndAttemptCounts(row.id);
    shaped.push({
      id: row.id,
      title: row.title,
      status: treatArchivedIds.has(row.id) ? "archived" : row.status,
      deliveryPhase: row.deliveryPhase,
      questionCount: counts.questionCount,
    });
  }
  return shaped;
}

export async function listUpcomingPreworkProblems(
  now: Date = new Date(),
  treatArchivedIds: ReadonlySet<string> = new Set(),
): Promise<PreworkVisibilityProblem[]> {
  const sessions = await db.select().from(sessionsTable);
  const upcoming = sessions.filter(
    (session) =>
      isTaitoFallSession(session) &&
      session.status !== "archived" &&
      session.bookingStatus !== "cancelled" &&
      session.dateTime.getTime() > now.getTime(),
  );
  const problems: PreworkVisibilityProblem[] = [];
  for (const session of upcoming) {
    const problem = preworkStartabilityProblem(
      await assignmentsForVisibility(session.id, treatArchivedIds),
    );
    if (!problem) continue;
    problems.push({
      sessionId: session.id,
      title: session.title,
      dateKey: dateKeyForSession(session),
      problem,
    });
  }
  return problems;
}

/** In-app admin alert only. Does not send email. */
export async function raisePreworkVisibilityAlerts(
  problems: readonly PreworkVisibilityProblem[],
): Promise<number> {
  if (problems.length === 0) return 0;
  const administrators = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "administrator"));
  if (administrators.length === 0) return 0;
  let raised = 0;
  for (const problem of problems) {
    const already = await db
      .select({ id: adminNotificationsTable.id })
      .from(adminNotificationsTable)
      .where(
        and(
          eq(adminNotificationsTable.sessionId, problem.sessionId),
          eq(adminNotificationsTable.kind, PREWORK_NOT_STARTABLE_KIND),
          eq(adminNotificationsTable.status, "unread"),
        ),
      )
      .limit(1);
    if (already.length > 0) continue;
    await db.insert(adminNotificationsTable).values(
      administrators.map((admin) => ({
        recipientUserId: admin.id,
        kind: PREWORK_NOT_STARTABLE_KIND,
        sessionId: problem.sessionId,
        title: "Pre-work is not startable",
        message: `${problem.title} (${problem.dateKey}) is not visible and startable. ${problem.problem}`,
        status: "unread" as const,
      })),
    );
    raised += 1;
  }
  return raised;
}

export async function raisePreworkVisibilityAlertForSession(
  session: SessionRow,
): Promise<string | null> {
  if (
    !isTaitoFallSession(session) ||
    session.status === "archived" ||
    session.bookingStatus === "cancelled" ||
    session.dateTime.getTime() <= Date.now()
  ) {
    return null;
  }
  const problem = preworkStartabilityProblem(await assignmentsForVisibility(session.id, new Set()));
  if (!problem) return null;
  await raisePreworkVisibilityAlerts([
    {
      sessionId: session.id,
      title: session.title,
      dateKey: dateKeyForSession(session),
      problem,
    },
  ]);
  return problem;
}

export function dryRunPlaceholderArchive(input: {
  candidates: readonly PlaceholderArchiveCandidate[];
  allowedTitles: ReadonlySet<string>;
}) {
  return eligiblePlaceholderArchiveIds(
    input.candidates,
    PLACEHOLDER_SAT_ARCHIVE_FROM_DATE,
    input.allowedTitles,
  );
}
