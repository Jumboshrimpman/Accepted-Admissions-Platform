import { and, eq, ilike, or, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  db,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { normalizeProvisionedEmail } from "./access-config.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { liveDiagnosticAssignmentTitle } from "./sat-bank-diagnostic-quality.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { TAITO_STUDENT_EMAIL } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SAMA_TEST_CLIENT_EMAIL,
  XAVIER_SAT_CAPABILITY_SESSION_TITLE,
} from "./xavier-sat-capability-session.ts";

export type UnassignTaitoCapabilityResult = {
  sessionIds: string[];
  nextClientUserId: string | null;
};

export type RetitledDiagnostic = {
  id: string;
  from: string;
  to: string;
  questionCount: number;
};

/**
 * One-time Cos cleanup: drop Taito as the Xavier capability-test client.
 * Does not archive the session or rematerialize the bank. Sama stays if present;
 * otherwise the session is tutor-only.
 */
export async function unassignTaitoFromXavierCapabilitySessions(options?: {
  taitoEmail?: string;
  samaEmail?: string;
}): Promise<UnassignTaitoCapabilityResult> {
  const taitoEmail = normalizeProvisionedEmail(
    options?.taitoEmail ?? TAITO_STUDENT_EMAIL,
  );
  const samaEmail = normalizeProvisionedEmail(
    options?.samaEmail ?? SAMA_TEST_CLIENT_EMAIL,
  );
  const [taito] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, taitoEmail))
    .limit(1);
  if (!taito) {
    return { sessionIds: [], nextClientUserId: null };
  }
  const [sama] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, samaEmail))
    .limit(1);
  const nextClientUserId = sama?.id ?? null;
  const capabilitySessions = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, taito.id),
        or(
          eq(sessionsTable.title, XAVIER_SAT_CAPABILITY_SESSION_TITLE),
          ilike(sessionsTable.title, `${XAVIER_SAT_CAPABILITY_SESSION_TITLE}%`),
        ),
      ),
    );
  const sessionIds = capabilitySessions.map((session) => session.id);
  if (sessionIds.length > 0) {
    await db
      .update(sessionsTable)
      .set({
        clientUserId: nextClientUserId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessionsTable.clientUserId, taito.id),
          or(
            eq(sessionsTable.title, XAVIER_SAT_CAPABILITY_SESSION_TITLE),
            ilike(sessionsTable.title, `${XAVIER_SAT_CAPABILITY_SESSION_TITLE}%`),
          ),
        ),
      );
  }
  return { sessionIds, nextClientUserId };
}

/**
 * Align stored diagnostic titles with live question counts. Titles only —
 * does not rematerialize banks or unlink questions.
 */
export async function retitleShortCleanDiagnostics(options?: {
  courseId?: string;
}): Promise<RetitledDiagnostic[]> {
  const conditions = [ilike(assignmentsTable.title, "%diagnostic%")];
  if (options?.courseId) {
    conditions.push(eq(assignmentsTable.courseId, options.courseId));
  }
  const rows = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
    })
    .from(assignmentsTable)
    .where(and(...conditions));
  const updated: RetitledDiagnostic[] = [];
  for (const row of rows) {
    if (row.status === "archived") continue;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, row.id));
    const questionCount = Number(count);
    const nextTitle = liveDiagnosticAssignmentTitle({
      title: row.title,
      questionCount,
    });
    if (nextTitle === row.title) continue;
    await db
      .update(assignmentsTable)
      .set({ title: nextTitle })
      .where(eq(assignmentsTable.id, row.id));
    updated.push({
      id: row.id,
      from: row.title,
      to: nextTitle,
      questionCount,
    });
  }
  return updated;
}

export async function reconcileClientQuizLabels(options?: {
  taitoEmail?: string;
  samaEmail?: string;
  courseId?: string;
}): Promise<{
  unassignedCapabilitySessions: UnassignTaitoCapabilityResult;
  retitledDiagnostics: RetitledDiagnostic[];
}> {
  const unassignedCapabilitySessions =
    await unassignTaitoFromXavierCapabilitySessions(options);
  const retitledDiagnostics = await retitleShortCleanDiagnostics({
    courseId: options?.courseId,
  });
  return { unassignedCapabilitySessions, retitledDiagnostics };
}
