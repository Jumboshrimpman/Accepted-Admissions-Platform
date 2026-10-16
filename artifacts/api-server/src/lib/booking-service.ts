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
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  sessionScheduleChangeError,
  type SessionScheduleChange,
  type SessionScheduleInstant,
} from "./session-schedule-guard.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { ledgerHours, remainingCreditHours, remainingCreditHoursForProduct } from "./credit-hours.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { selfServeSatBookingForAccount } from "./session-schedule.ts";

export { remainingCreditHours } from "./credit-hours.ts";

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

export {
  isPastSession,
  sessionEffectiveEnd,
  sessionScheduleChangeError,
  type SessionScheduleChange,
  type SessionScheduleInstant,
} from "./session-schedule-guard.ts";

export function assertSessionAllowsScheduleChange(
  session: SessionScheduleInstant,
  action: SessionScheduleChange,
  now: Date = new Date(),
): void {
  const error = sessionScheduleChangeError(session, action, now);
  if (error) {
    throw new BookingServiceError(error.status, error.code, error.message);
  }
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

/**
 * Serialize a shared-room write with the booking lock, then reject an overlap.
 * Sessions that do not claim the room skip the lock.
 */
export async function guardSharedMeetWrite(
  tx: Tx,
  args: {
    start: Date;
    end: Date;
    excludeSessionId?: string;
    courseId?: string | null;
    subject?: string | null;
  },
): Promise<void> {
  const [course] = args.courseId
    ? await tx
        .select({ term: coursesTable.term, meetUrl: coursesTable.meetUrl })
        .from(coursesTable)
        .where(eq(coursesTable.id, args.courseId))
        .limit(1)
    : [];
  const claims = sessionClaimsSharedFallMeet({
    term: course?.term,
    courseMeetUrl: course?.meetUrl,
    subject: args.subject,
  });
  if (!claims) return;
  await acquireSharedMeetLock(tx);
  await assertNoSharedMeetConflict(tx, {
    start: args.start,
    end: args.end,
    excludeSessionId: args.excludeSessionId,
  });
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
  productId?: string | null,
): Promise<void> {
  await tx.execute(
    sql`select id from credit_ledger where client_user_id = ${clientUserId} for update`,
  );
  const entries = await tx
    .select({
      entryType: creditLedgerTable.entryType,
      hours: creditLedgerTable.hours,
      productId: creditLedgerTable.productId,
    })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.clientUserId, clientUserId));
  const remaining = productId
    ? remainingCreditHoursForProduct(entries, productId)
    : remainingCreditHours(entries);
  if (remaining < requiredHours) {
    throw new BookingServiceError(
      409,
      "INSUFFICIENT_CREDIT",
      "You do not have enough prepaid hours for this session.",
    );
  }
}

async function debitProductId(
  tx: Tx,
  sessionId: string,
): Promise<string | null> {
  const [debit] = await tx
    .select({ productId: creditLedgerTable.productId })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.fulfillmentKey, sessionDebitFulfillmentKey(sessionId)))
    .limit(1);
  return debit?.productId ?? null;
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
    productId?: string | null;
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
  const hours = ledgerHours(args.durationMinutes) / 60;
  await tx.insert(creditLedgerTable).values({
    clientUserId: args.clientUserId,
    productId: args.productId ?? null,
    sessionId: session.id,
    entryType: "debit",
    hours,
    fulfillmentKey: sessionDebitFulfillmentKey(session.id),
    referenceType: "session",
    referenceId: session.id,
    note:
      args.subject === "SAT"
        ? `Reserved SAT session with ${args.tutorName}`
        : `Reserved ${args.subject} session with ${args.tutorName}`,
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
  const hours = ledgerHours(args.durationMinutes) / 60;
  const productId = await debitProductId(tx, args.sessionId);
  await tx
    .insert(creditLedgerTable)
    .values({
      clientUserId: args.clientUserId,
      productId,
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
  assertSessionAllowsScheduleChange(current, "cancel", now);
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
  const hours = ledgerHours(current.durationMinutes) / 60;
  if (creditRestored && current.clientUserId) {
    const productId = await debitProductId(tx, current.id);
    await tx
      .insert(creditLedgerTable)
      .values({
        clientUserId: current.clientUserId,
        productId,
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

/** In-app only. The message has no student, tutor, or email. */
export async function raiseLegacyCalendarManualEditAlert(
  sessionId: string,
  source: "primary" | "deleted_app_calendar" = "primary",
): Promise<void> {
  const already = await db
    .select({ id: adminNotificationsTable.id })
    .from(adminNotificationsTable)
    .where(
      and(
        eq(adminNotificationsTable.sessionId, sessionId),
        eq(adminNotificationsTable.kind, "legacy_calendar_event"),
        eq(adminNotificationsTable.status, "unread"),
      ),
    )
    .limit(1);
  if (already.length > 0) return;
  const administrators = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "administrator"));
  if (administrators.length === 0) return;
  await db.insert(adminNotificationsTable).values(
    administrators.map((admin) => ({
      recipientUserId: admin.id,
      kind: "legacy_calendar_event",
      guidanceRequestId: null,
      sessionId,
      title: "Calendar event needs a manual edit",
      message:
        source === "deleted_app_calendar"
          ? "This session's Google Calendar event is on a calendar the tutor deleted. Edit that event by hand."
          : "This session's Google Calendar event is on the tutor's primary calendar, and the current grant cannot change it. Edit that event by hand.",
      status: "unread",
    })),
  );
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

export function requireStudentBooker(user: Pick<AppUser, "role" | "email">): void {
  if (user.role !== "student") {
    throw new BookingServiceError(
      403,
      "STUDENT_ONLY",
      "Only a student can reserve a prepaid session.",
    );
  }
  if (!selfServeSatBookingForAccount({ role: user.role, email: user.email })) {
    throw new BookingServiceError(
      403,
      "OFF_PLATFORM_BILLING",
      "SAT booking is handled off-platform for this account.",
    );
  }
}
