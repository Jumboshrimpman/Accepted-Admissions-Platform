import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
  preworkReminderSendsTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { isCancelledBooking } from "./session-listing.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { sendTransactionalEmail, verifiedFromAddress } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { PREWORK_REMINDER_WINDOW_HOURS, preworkReminderEmail, preworkReminderRecipient, resolvePreworkReminderDue, shouldSendPreworkReminder } from "./prework-reminders.ts";

export type PreworkReminderRunResult = {
  dryRun: boolean;
  considered: number;
  sent: number;
  alreadySent: number;
  skipped: number;
  failed: number;
  planned: Array<{
    assignmentId: string;
    studentUserId: string;
    to: string;
    subject: string;
  }>;
};

function hoursUntil(sessionStart: Date, now: Date): number {
  return (sessionStart.getTime() - now.getTime()) / (60 * 60 * 1000);
}

/**
 * Find students with untouched before-session work in the next 24 hours
 * and email each of them once. A dry run prints the plan and writes nothing.
 */
export async function runPreworkReminders(input: {
  now?: Date;
  dryRun?: boolean;
}): Promise<PreworkReminderRunResult> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun === true;
  const windowEnd = new Date(now.getTime() + PREWORK_REMINDER_WINDOW_HOURS * 60 * 60 * 1000);
  const result: PreworkReminderRunResult = {
    dryRun,
    considered: 0,
    sent: 0,
    alreadySent: 0,
    skipped: 0,
    failed: 0,
    planned: [],
  };

  const sessions = await db
    .select({
      sessionId: sessionsTable.id,
      dateTime: sessionsTable.dateTime,
      timezone: sessionsTable.timezone,
      subject: sessionsTable.subject,
      bookingStatus: sessionsTable.bookingStatus,
      cancelledAt: sessionsTable.cancelledAt,
      status: sessionsTable.status,
      clientUserId: sessionsTable.clientUserId,
      studentEmail: usersTable.email,
      studentName: usersTable.displayName,
      studentRole: usersTable.role,
      studentTimezone: usersTable.timezone,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.clientUserId))
    .where(
      and(
        gte(sessionsTable.dateTime, now),
        lte(sessionsTable.dateTime, windowEnd),
        isNull(sessionsTable.cancelledAt),
        eq(sessionsTable.bookingStatus, "confirmed"),
        ne(sessionsTable.status, "archived"),
        eq(usersTable.role, "student"),
      ),
    );

  const sessionIds = sessions
    .map((session) => session.sessionId)
    .filter((id): id is string => Boolean(id));
  if (sessionIds.length === 0) return result;

  const assignments = await db
    .select({
      id: assignmentsTable.id,
      sessionId: assignmentsTable.sessionId,
      title: assignmentsTable.title,
      subject: assignmentsTable.subject,
      deliveryPhase: assignmentsTable.deliveryPhase,
      deadline: assignmentsTable.deadline,
      assignedStudentUserId: assignmentsTable.assignedStudentUserId,
    })
    .from(assignmentsTable)
    .where(
      and(
        inArray(assignmentsTable.sessionId, sessionIds),
        eq(assignmentsTable.deliveryPhase, "before_session"),
        eq(assignmentsTable.status, "published"),
      ),
    );
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (assignmentIds.length === 0) return result;

  const studentIds = [
    ...new Set(
      sessions
        .map((session) => session.clientUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [attempts, questions, priorSends] = await Promise.all([
    db
      .select({
        assignmentId: attemptsTable.assignmentId,
        userId: attemptsTable.userId,
        status: attemptsTable.status,
        startedAt: attemptsTable.startedAt,
      })
      .from(attemptsTable)
      .where(
        and(
          inArray(attemptsTable.assignmentId, assignmentIds),
          inArray(attemptsTable.userId, studentIds),
        ),
      ),
    db
      .select({ assignmentId: assignmentQuestionsTable.assignmentId })
      .from(assignmentQuestionsTable)
      .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds)),
    db
      .select({
        assignmentId: preworkReminderSendsTable.assignmentId,
        studentUserId: preworkReminderSendsTable.studentUserId,
      })
      .from(preworkReminderSendsTable)
      .where(inArray(preworkReminderSendsTable.assignmentId, assignmentIds)),
  ]);

  const attemptsByKey = new Map<string, { status: string; startedAt: Date }[]>();
  for (const attempt of attempts) {
    const key = `${attempt.assignmentId}:${attempt.userId}`;
    const list = attemptsByKey.get(key) ?? [];
    list.push({ status: attempt.status, startedAt: attempt.startedAt });
    attemptsByKey.set(key, list);
  }
  const questionCountByAssignment = new Map<string, number>();
  for (const question of questions) {
    questionCountByAssignment.set(
      question.assignmentId,
      (questionCountByAssignment.get(question.assignmentId) ?? 0) + 1,
    );
  }
  const alreadySent = new Set(
    priorSends.map((row) => `${row.assignmentId}:${row.studentUserId}`),
  );
  const sessionsById = new Map(sessions.map((session) => [session.sessionId, session]));

  for (const assignment of assignments) {
    if (!assignment.sessionId) continue;
    const session = sessionsById.get(assignment.sessionId);
    if (!session?.clientUserId) continue;
    if (
      assignment.assignedStudentUserId &&
      assignment.assignedStudentUserId !== session.clientUserId
    ) {
      continue;
    }
    const attemptKey = `${assignment.id}:${session.clientUserId}`;
    const studentAttempts = attemptsByKey.get(attemptKey) ?? [];
    const latest = [...studentAttempts].sort(
      (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
    )[0];
    const sessionCancelled = isCancelledBooking({
      bookingStatus: session.bookingStatus,
      cancelledAt: session.cancelledAt,
    });
    const send = shouldSendPreworkReminder({
      role: session.studentRole,
      hasStarted: studentAttempts.length > 0,
      latestAttemptStatus: latest?.status ?? null,
      deliveryPhase: assignment.deliveryPhase,
      sessionCancelled,
      hoursUntilSession: hoursUntil(session.dateTime, now),
    });
    if (!send) continue;
    const recipient = preworkReminderRecipient({
      role: session.studentRole,
      email: session.studentEmail,
    });
    if (!recipient) {
      result.skipped += 1;
      continue;
    }
    const due = resolvePreworkReminderDue({
      deliveryPhase: assignment.deliveryPhase,
      deadline: assignment.deadline,
      sessionDateTime: session.dateTime,
    });
    if (!due) {
      result.skipped += 1;
      continue;
    }
    result.considered += 1;
    const email = preworkReminderEmail({
      studentName: session.studentName,
      assignmentTitle: assignment.title,
      subject: assignment.subject || session.subject,
      sessionDateTime: session.dateTime,
      sessionTimezone: session.timezone,
      clientTimezone: session.studentTimezone,
      dueAt: due.at,
      dueSource: due.source,
      assignmentId: assignment.id,
      questionCount: questionCountByAssignment.get(assignment.id) ?? null,
    });
    result.planned.push({
      assignmentId: assignment.id,
      studentUserId: session.clientUserId,
      to: recipient,
      subject: email.subject,
    });
    if (alreadySent.has(attemptKey)) {
      result.alreadySent += 1;
      continue;
    }
    if (dryRun) continue;

    const claimed = await db
      .insert(preworkReminderSendsTable)
      .values({
        assignmentId: assignment.id,
        studentUserId: session.clientUserId,
        sessionId: session.sessionId,
      })
      .onConflictDoNothing({
        target: [
          preworkReminderSendsTable.assignmentId,
          preworkReminderSendsTable.studentUserId,
        ],
      })
      .returning({ id: preworkReminderSendsTable.id });
    if (claimed.length === 0) {
      result.alreadySent += 1;
      continue;
    }
    const delivery = await sendTransactionalEmail({
      to: recipient,
      from: verifiedFromAddress(),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    if (delivery.status === "sent") {
      result.sent += 1;
      continue;
    }
    await db
      .delete(preworkReminderSendsTable)
      .where(eq(preworkReminderSendsTable.id, claimed[0]!.id));
    if (delivery.status === "skipped") result.skipped += 1;
    else result.failed += 1;
  }

  return result;
}
