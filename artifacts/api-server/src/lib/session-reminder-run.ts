import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import {
  db,
  sessionsTable,
  studentSessionReminderSendsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { isCancelledBooking } from "./session-listing.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { logger } from "./logger.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { sendTransactionalEmail, verifiedFromAddress } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import {
  SESSION_REMINDER_INTERVAL_MS,
  SESSION_REMINDER_ONE_DAY_HOURS,
  SOPHIA_SLEIMAN_REMINDER_EMAIL,
  SOPHIA_SLEIMAN_REMINDER_USER_ID,
  hoursUntilSession,
  sessionReminderEmail,
  shouldSendSessionReminder,
  startSophiaSessionReminderTick as startTick,
  type SessionReminderKind,
} from "./session-reminders.ts";

export type SessionReminderRunResult = {
  dryRun: boolean;
  considered: number;
  sent: number;
  alreadySent: number;
  skipped: number;
  failed: number;
  planned: Array<{
    sessionId: string;
    kind: SessionReminderKind;
    to: string;
    subject: string;
  }>;
};

const KINDS: SessionReminderKind[] = ["1_day", "1_hour"];

export async function runSophiaSessionReminders(input?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<SessionReminderRunResult> {
  const now = input?.now ?? new Date();
  const dryRun = input?.dryRun === true;
  const windowEnd = new Date(now.getTime() + SESSION_REMINDER_ONE_DAY_HOURS * 60 * 60 * 1000);
  const result: SessionReminderRunResult = {
    dryRun,
    considered: 0,
    sent: 0,
    alreadySent: 0,
    skipped: 0,
    failed: 0,
    planned: [],
  };

  const rows = await db
    .select({
      sessionId: sessionsTable.id,
      title: sessionsTable.title,
      dateTime: sessionsTable.dateTime,
      durationMinutes: sessionsTable.durationMinutes,
      meetUrl: sessionsTable.meetUrl,
      providerEventUrl: sessionsTable.providerEventUrl,
      bookingStatus: sessionsTable.bookingStatus,
      cancelledAt: sessionsTable.cancelledAt,
      status: sessionsTable.status,
      clientUserId: sessionsTable.clientUserId,
      tutorUserId: sessionsTable.tutorUserId,
      studentEmail: usersTable.email,
      studentName: usersTable.displayName,
      studentRole: usersTable.role,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.clientUserId))
    .where(
      and(
        eq(sessionsTable.clientUserId, SOPHIA_SLEIMAN_REMINDER_USER_ID),
        gte(sessionsTable.dateTime, now),
        lte(sessionsTable.dateTime, windowEnd),
        isNull(sessionsTable.cancelledAt),
        eq(sessionsTable.bookingStatus, "confirmed"),
        ne(sessionsTable.status, "archived"),
      ),
    );

  if (rows.length === 0) return result;

  const tutorIds = [...new Set(rows.map((row) => row.tutorUserId).filter((id): id is string => Boolean(id)))];
  const tutors = tutorIds.length
    ? await db
        .select({ id: usersTable.id, displayName: usersTable.displayName })
        .from(usersTable)
        .where(inArray(usersTable.id, tutorIds))
    : [];
  const tutorNameById = new Map(tutors.map((tutor) => [tutor.id, tutor.displayName ?? ""]));

  const sessionIds = rows.map((row) => row.sessionId);
  const priorSends = await db
    .select({
      sessionId: studentSessionReminderSendsTable.sessionId,
      kind: studentSessionReminderSendsTable.kind,
    })
    .from(studentSessionReminderSendsTable)
    .where(inArray(studentSessionReminderSendsTable.sessionId, sessionIds));
  const already = new Set(priorSends.map((row) => `${row.sessionId}:${row.kind}`));

  for (const session of rows) {
    const sessionCancelled = isCancelledBooking({
      bookingStatus: session.bookingStatus,
      cancelledAt: session.cancelledAt,
    });
    const hours = hoursUntilSession(session.dateTime, now);
    const tutorName = (session.tutorUserId && tutorNameById.get(session.tutorUserId)) || "your tutor";
    for (const kind of KINDS) {
      const eligible = shouldSendSessionReminder({
        kind,
        userId: session.clientUserId,
        email: session.studentEmail,
        role: session.studentRole,
        sessionCancelled,
        hoursUntilSession: hours,
      });
      if (!eligible) continue;
      const to = (session.studentEmail ?? "").trim().toLowerCase();
      if (to !== SOPHIA_SLEIMAN_REMINDER_EMAIL) {
        result.skipped += 1;
        continue;
      }
      const email = sessionReminderEmail({
        studentName: session.studentName,
        sessionTitle: session.title,
        tutorName,
        start: session.dateTime,
        durationMinutes: Number(session.durationMinutes) || 0,
        meetUrl: session.meetUrl || session.providerEventUrl,
        kind,
      });
      result.considered += 1;
      result.planned.push({
        sessionId: session.sessionId,
        kind,
        to,
        subject: email.subject,
      });
      const claimKey = `${session.sessionId}:${kind}`;
      if (already.has(claimKey)) {
        result.alreadySent += 1;
        continue;
      }
      if (dryRun) continue;

      const claimed = await db
        .insert(studentSessionReminderSendsTable)
        .values({
          sessionId: session.sessionId,
          kind,
        })
        .onConflictDoNothing({
          target: [
            studentSessionReminderSendsTable.sessionId,
            studentSessionReminderSendsTable.kind,
          ],
        })
        .returning({ id: studentSessionReminderSendsTable.id });
      if (claimed.length === 0) {
        result.alreadySent += 1;
        continue;
      }
      const delivery = await sendTransactionalEmail({
        to,
        from: verifiedFromAddress(),
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      if (delivery.status === "sent") {
        result.sent += 1;
        already.add(claimKey);
        continue;
      }
      await db
        .delete(studentSessionReminderSendsTable)
        .where(eq(studentSessionReminderSendsTable.id, claimed[0]!.id));
      if (delivery.status === "skipped") result.skipped += 1;
      else result.failed += 1;
    }
  }

  return result;
}


export function startSophiaSessionReminderTick(options?: {
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  run?: () => Promise<unknown>;
  runOnStart?: boolean;
}): { stop: () => void } {
  const run =
    options?.run ??
    (() =>
      runSophiaSessionReminders()
        .then((result) => {
          if (result.considered > 0 || result.sent > 0 || result.failed > 0) {
            logger.info(
              {
                considered: result.considered,
                sent: result.sent,
                alreadySent: result.alreadySent,
                skipped: result.skipped,
                failed: result.failed,
              },
              "Sophia S session reminder tick",
            );
          }
          return result;
        })
        .catch((err) => {
          logger.warn({ err }, "Sophia S session reminder tick skipped");
        }));
  return startTick({
    run,
    intervalMs: options?.intervalMs ?? SESSION_REMINDER_INTERVAL_MS,
    setIntervalFn: options?.setIntervalFn,
    clearIntervalFn: options?.clearIntervalFn,
    runOnStart: options?.runOnStart,
  });
}
