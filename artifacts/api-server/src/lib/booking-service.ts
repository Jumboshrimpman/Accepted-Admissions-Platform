import { and, eq, or, sql } from "drizzle-orm";
import {
  adminNotificationsTable,
  auditLogsTable,
  coursesTable,
  creditLedgerTable,
  db,
  sessionsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import type { BusyWindow } from "./booking";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEET_LOCK_KEY, SHARED_MEET_CONFLICT_MESSAGE, sessionClaimsSharedFallMeet, sharedMeetOccupancyWindows } from "./shared-meet-conflict.ts";

export const BOOKING_CANCEL_RESTORE_NOTICE_MS = 24 * 60 * 60 * 1000;

export class BookingServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BookingServiceError";
    this.status = status;
    this.code = code;
  }
}

export function isEligibleForCreditRestore(
  sessionDateTime: Date,
  now: Date = new Date(),
): boolean {
  return sessionDateTime.getTime() - now.getTime() >= BOOKING_CANCEL_RESTORE_NOTICE_MS;
}

export function sessionDebitFulfillmentKey(sessionId: string): string {
  return `session-debit:${sessionId}`;
}

export function sessionRestoreFulfillmentKey(sessionId: string): string {
  return `session-restore:${sessionId}`;
}

export function sessionCalendarFailRestoreFulfillmentKey(sessionId: string): string {
  return `session-calendar-fail-restore:${sessionId}`;
}

export function remainingCreditHours(
  entries: Array<{ entryType: string; hours: number }>,
): number {
  return entries.reduce((total, entry) => {
    const positive = ["original", "restored", "adjustment_credit"].includes(entry.entryType);
    return total + (positive ? entry.hours : -entry.hours);
  }, 0);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function acquireBookingLocks(
  tx: Tx,
  participantIds: string[],
  startIso: string,
): Promise<void> {
  const lockKeys = participantIds
    .filter(Boolean)
    .map((id) => `participant:${id}`)
    .sort();
  for (const lockKey of lockKeys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${lockKey}:${startIso}`}))`);
  }
}

export async function acquireSharedMeetLock(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SHARED_FALL_MEET_LOCK_KEY}))`);
}

function overlappingSessionWhere(args: {
  start: Date;
  end: Date;
  excludeSessionId?: string;
}) {
  return and(
    sql`${sessionsTable.status} <> 'archived'`,
    sql`${sessionsTable.bookingStatus} <> 'cancelled'`,
    sql`${sessionsTable.dateTime} < ${args.end}`,
    sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${args.start}`,
    args.excludeSessionId ? sql`${sessionsTable.id} <> ${args.excludeSessionId}` : sql`true`,
  );
}

async function overlappingSharedMeetCandidates(
  query: Tx | typeof db,
  args: {
    start: Date;
    end: Date;
    excludeSessionId?: string;
  },
) {
  return query
    .select({
      id: sessionsTable.id,
      dateTime: sessionsTable.dateTime,
      durationMinutes: sessionsTable.durationMinutes,
      subject: sessionsTable.subject,
      term: coursesTable.term,
      courseMeetUrl: coursesTable.meetUrl,
    })
    .from(sessionsTable)
    .innerJoin(coursesTable, eq(sessionsTable.courseId, coursesTable.id))
    .where(overlappingSessionWhere(args));
}

export async function listSharedMeetBusyWindows(args: {
  start: Date;
  end: Date;
  excludeSessionId?: string;
}): Promise<BusyWindow[]> {
  const rows = await overlappingSharedMeetCandidates(db, args);
  return sharedMeetOccupancyWindows(rows);
}

export async function assertNoSharedMeetConflict(
  tx: Tx,
  args: {
    start: Date;
    end: Date;
    excludeSessionId?: string;
  },
): Promise<void> {
  const rows = await overlappingSharedMeetCandidates(tx, args);
  if (rows.some((row) => sessionClaimsSharedFallMeet(row))) {
    throw new BookingServiceError(409, "SCHEDULE_CONFLICT", SHARED_MEET_CONFLICT_MESSAGE);
  }
}

export async function assertNoScheduleConflict(
  tx: Tx,
  args: {
    participantIds: string[];
    start: Date;
    end: Date;
    excludeSessionId?: string;
  },
): Promise<void> {
  await acquireSharedMeetLock(tx);
  const [conflict] = await tx
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        sql`${sessionsTable.status} <> 'archived'`,
        sql`${sessionsTable.bookingStatus} <> 'cancelled'`,
        sql`${sessionsTable.dateTime} < ${args.end}`,
        sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${args.start}`,
        args.excludeSessionId ? sql`${sessionsTable.id} <> ${args.excludeSessionId}` : sql`true`,
        or(
          ...args.participantIds.flatMap((id) => [
            eq(sessionsTable.tutorUserId, id),
            eq(sessionsTable.clientUserId, id),
          ]),
        ),
      ),
    )
    .limit(1);
  if (conflict) {
    throw new BookingServiceError(
      409,
      "SCHEDULE_CONFLICT",
      "That time overlaps another active meeting for you or the tutor. Choose a different slot.",
    );
  }
  await assertNoSharedMeetConflict(tx, {
    start: args.start,
    end: args.end,
    excludeSessionId: args.excludeSessionId,
  });
}

export async function lockClientCreditsAndRequireHours(
  tx: Tx,
  clientUserId: string,
  requiredHours: number,
): Promise<void> {
  await tx.execute(
    sql`select id from credit_ledger where client_user_id = ${clientUserId} for update`,
  );
  const entries = await tx
    .select({ entryType: creditLedgerTable.entryType, hours: creditLedgerTable.hours })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.clientUserId, clientUserId));
  if (remainingCreditHours(entries) < requiredHours) {
    throw new BookingServiceError(
      409,
      "INSUFFICIENT_CREDIT",
      "You do not have enough prepaid hours for this session.",
    );
  }
}

export async function insertConfirmedBookingWithDebit(
  tx: Tx,
  args: {
    courseId: string;
    clientUserId: string;
    tutorUserId: string | null;
    start: Date;
    timezone: string;
    subject: string;
    title: string;
    durationMinutes: number;
    tutorName: string;
  },
): Promise<typeof sessionsTable.$inferSelect> {
  const [session] = await tx
    .insert(sessionsTable)
    .values({
      courseId: args.courseId,
      clientUserId: args.clientUserId,
      tutorUserId: args.tutorUserId,
      dateTime: args.start,
      timezone: args.timezone,
      subject: args.subject,
      title: args.title,
      status: "published",
      durationMinutes: args.durationMinutes,
      bookingStatus: "confirmed",
    })
    .returning();
  if (!session) throw new BookingServiceError(500, "BOOKING_FAILED", "Session could not be created.");
  const hours = args.durationMinutes / 60;
  await tx.insert(creditLedgerTable).values({
    clientUserId: args.clientUserId,
    productId: null,
    sessionId: session.id,
    entryType: "debit",
    hours,
    fulfillmentKey: sessionDebitFulfillmentKey(session.id),
    referenceType: "session",
    referenceId: session.id,
    note: `Reserved SAT session with ${args.tutorName}`,
  });
  return session;
}

export async function rollbackBookingAfterCalendarFailure(
  tx: Tx,
  args: {
    sessionId: string;
    clientUserId: string;
    durationMinutes: number;
    actorUserId: string;
  },
): Promise<void> {
  await tx
    .update(sessionsTable)
    .set({
      bookingStatus: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: "Calendar event could not be created",
      updatedAt: new Date(),
    })
    .where(eq(sessionsTable.id, args.sessionId));
  const hours = args.durationMinutes / 60;
  await tx
    .insert(creditLedgerTable)
    .values({
      clientUserId: args.clientUserId,
      sessionId: args.sessionId,
      entryType: "restored",
      hours,
      fulfillmentKey: sessionCalendarFailRestoreFulfillmentKey(args.sessionId),
      referenceType: "session",
      referenceId: args.sessionId,
      note: "Restored after calendar event creation failed",
    })
    .onConflictDoNothing({ target: creditLedgerTable.fulfillmentKey });
  await tx.insert(auditLogsTable).values({
    actorUserId: args.actorUserId,
    action: "credit.restored",
    entityType: "session",
    entityId: args.sessionId,
    metadata: {
      reason: "calendar_event_failed",
      hours,
      clientUserId: args.clientUserId,
    },
  });
  await tx.insert(auditLogsTable).values({
    actorUserId: args.actorUserId,
    action: "booking.cancelled",
    entityType: "session",
    entityId: args.sessionId,
    metadata: {
      reason: "calendar_event_failed",
      creditRestored: true,
      clientUserId: args.clientUserId,
    },
  });
}

export async function cancelBookingWithCreditPolicy(
  tx: Tx,
  args: {
    session: typeof sessionsTable.$inferSelect;
    reason: string;
    actorUserId: string;
    now?: Date;
  },
): Promise<{ session: typeof sessionsTable.$inferSelect; creditRestored: boolean }> {
  const now = args.now ?? new Date();
  await tx.execute(sql`select id from sessions where id = ${args.session.id} for update`);
  const [current] = await tx
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, args.session.id));
  if (!current || current.bookingStatus === "cancelled") {
    return { session: current ?? args.session, creditRestored: false };
  }
  if (current.dateTime <= now) {
    throw new BookingServiceError(
      409,
      "SESSION_STARTED",
      "A session that has started cannot be cancelled.",
    );
  }
  const creditRestored = isEligibleForCreditRestore(current.dateTime, now);
  const [saved] = await tx
    .update(sessionsTable)
    .set({
      bookingStatus: "cancelled",
      cancelledAt: now,
      cancellationReason: args.reason,
      updatedAt: now,
    })
    .where(eq(sessionsTable.id, current.id))
    .returning();
  const hours = current.durationMinutes / 60;
  if (creditRestored && current.clientUserId) {
    await tx
      .insert(creditLedgerTable)
      .values({
        clientUserId: current.clientUserId,
        sessionId: current.id,
        entryType: "restored",
        hours,
        fulfillmentKey: sessionRestoreFulfillmentKey(current.id),
        referenceType: "session",
        referenceId: current.id,
        note: "Credit restored after eligible session cancellation",
      })
      .onConflictDoNothing({ target: creditLedgerTable.fulfillmentKey });
    await tx.insert(auditLogsTable).values({
      actorUserId: args.actorUserId,
      action: "credit.restored",
      entityType: "session",
      entityId: current.id,
      metadata: {
        reason: "eligible_cancellation",
        hours,
        clientUserId: current.clientUserId,
      },
    });
  }
  await tx.insert(auditLogsTable).values({
    actorUserId: args.actorUserId,
    action: "booking.cancelled",
    entityType: "session",
    entityId: current.id,
    metadata: {
      reason: args.reason,
      creditRestored,
      clientUserId: current.clientUserId,
      tutorUserId: current.tutorUserId,
      hours,
    },
  });
  return { session: saved ?? current, creditRestored };
}

export async function recordBookingConfirmedAudit(
  actorUserId: string,
  session: typeof sessionsTable.$inferSelect,
): Promise<void> {
  await db.insert(auditLogsTable).values({
    actorUserId,
    action: "booking.confirmed",
    entityType: "session",
    entityId: session.id,
    metadata: {
      clientUserId: session.clientUserId,
      tutorUserId: session.tutorUserId,
      dateTime: session.dateTime.toISOString(),
      hours: session.durationMinutes / 60,
      meetingUrl: session.providerEventUrl,
    },
  });
}

export async function notifyAdministratorsOfBooking(args: {
  kind: "booking_confirmed" | "booking_cancelled";
  sessionId: string;
  title: string;
  message: string;
}): Promise<void> {
  const administrators = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "administrator"));
  if (administrators.length === 0) return;
  await db.insert(adminNotificationsTable).values(
    administrators.map((admin) => ({
      recipientUserId: admin.id,
      kind: args.kind,
      guidanceRequestId: null,
      sessionId: args.sessionId,
      title: args.title,
      message: args.message,
      status: "unread",
    })),
  );
}

export function requireStudentBooker(user: AppUser): void {
  if (user.role !== "student") {
    throw new BookingServiceError(
      403,
      "STUDENT_ONLY",
      "Only a student can reserve a prepaid session.",
    );
  }
}
