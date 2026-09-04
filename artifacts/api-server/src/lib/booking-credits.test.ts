import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { and, eq } from "drizzle-orm";
// @ts-expect-error Native Node test execution requires the source extension.
import * as bookingService from "./booking-service.ts";

const {
  acquireBookingLocks,
  assertNoScheduleConflict,
  BookingServiceError,
  cancelBookingWithCreditPolicy,
  insertConfirmedBookingWithDebit,
  isEligibleForCreditRestore,
  lockClientCreditsAndRequireHours,
  remainingCreditHours,
  requireStudentBooker,
  rollbackBookingAfterCalendarFailure,
  sessionCalendarFailRestoreFulfillmentKey,
  sessionDebitFulfillmentKey,
  sessionRestoreFulfillmentKey,
} = bookingService;

type DatabaseModule = typeof import("@workspace/db");

let database: DatabaseModule | null = null;

async function loadDb(): Promise<DatabaseModule> {
  if (!database) database = await import("@workspace/db");
  return database;
}

after(async () => {
  if (database?.pool) await database.pool.end();
});

test("eligible cancellation restores credit only at or beyond 24 hours", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  assert.equal(
    isEligibleForCreditRestore(new Date("2026-09-05T12:00:00.000Z"), now),
    true,
  );
  assert.equal(
    isEligibleForCreditRestore(new Date("2026-09-05T11:59:59.000Z"), now),
    false,
  );
  assert.equal(
    isEligibleForCreditRestore(new Date("2026-09-04T18:00:00.000Z"), now),
    false,
  );
});

test("fulfillment keys are unique per session lifecycle", () => {
  const id = "session-abc";
  assert.equal(sessionDebitFulfillmentKey(id), "session-debit:session-abc");
  assert.equal(sessionRestoreFulfillmentKey(id), "session-restore:session-abc");
  assert.equal(
    sessionCalendarFailRestoreFulfillmentKey(id),
    "session-calendar-fail-restore:session-abc",
  );
});

test("viewer and tutor roles cannot book using another client's credits", () => {
  assert.throws(
    () =>
      requireStudentBooker({
        id: "viewer",
        role: "viewer",
      } as never),
    (error: unknown) =>
      error instanceof BookingServiceError && error.code === "STUDENT_ONLY",
  );
  assert.throws(
    () =>
      requireStudentBooker({
        id: "tutor",
        role: "tutor",
      } as never),
    (error: unknown) =>
      error instanceof BookingServiceError && error.code === "STUDENT_ONLY",
  );
  assert.doesNotThrow(() =>
    requireStudentBooker({
      id: "student",
      role: "student",
    } as never),
  );
});

async function createBookingFixture(args: { creditHours: number }) {
  const db = await loadDb();
  const suffix = randomUUID().slice(0, 8);
  const studentId = randomUUID();
  const tutorId = randomUUID();
  const adminId = randomUUID();
  const courseId = randomUUID();
  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);

  await db.db.insert(db.usersTable).values([
    {
      id: studentId,
      clerkUserId: `booking-student-${suffix}`,
      email: `booking-student-${suffix}@example.invalid`,
      displayName: "Booking Student",
      role: "student",
    },
    {
      id: tutorId,
      clerkUserId: `booking-tutor-${suffix}`,
      email: `booking-tutor-${suffix}@example.invalid`,
      displayName: "Xavier Morales",
      role: "tutor",
    },
    {
      id: adminId,
      clerkUserId: `booking-admin-${suffix}`,
      email: `booking-admin-${suffix}@example.invalid`,
      displayName: "Booking Admin",
      role: "administrator",
    },
  ]);
  await db.db.insert(db.coursesTable).values({
    id: courseId,
    title: `Booking course ${suffix}`,
    subject: "SAT",
    term: "Fall 2026",
    status: "published",
  });
  await db.db.insert(db.courseMembershipsTable).values({
    courseId,
    userId: studentId,
    membershipRole: "student",
    subject: "SAT",
  });
  if (args.creditHours > 0) {
    await db.db.insert(db.creditLedgerTable).values({
      clientUserId: studentId,
      entryType: "original",
      hours: args.creditHours,
      fulfillmentKey: `booking-fixture-credit-${suffix}`,
      note: "Test prepaid credit",
    });
  }

  return { db, studentId, tutorId, adminId, courseId, start, suffix };
}

async function cleanupBookingFixture(fixture: {
  db: DatabaseModule;
  studentId: string;
  tutorId: string;
  adminId: string;
  courseId: string;
}) {
  await fixture.db.db
    .delete(fixture.db.adminNotificationsTable)
    .where(eq(fixture.db.adminNotificationsTable.recipientUserId, fixture.adminId));
  await fixture.db.db
    .delete(fixture.db.auditLogsTable)
    .where(
      and(
        eq(fixture.db.auditLogsTable.actorUserId, fixture.studentId),
      ),
    );
  const sessions = await fixture.db.db
    .select({ id: fixture.db.sessionsTable.id })
    .from(fixture.db.sessionsTable)
    .where(eq(fixture.db.sessionsTable.clientUserId, fixture.studentId));
  for (const session of sessions) {
    await fixture.db.db
      .delete(fixture.db.creditLedgerTable)
      .where(eq(fixture.db.creditLedgerTable.sessionId, session.id));
    await fixture.db.db
      .delete(fixture.db.adminNotificationsTable)
      .where(eq(fixture.db.adminNotificationsTable.sessionId, session.id));
    await fixture.db.db
      .delete(fixture.db.auditLogsTable)
      .where(eq(fixture.db.auditLogsTable.entityId, session.id));
  }
  await fixture.db.db
    .delete(fixture.db.creditLedgerTable)
    .where(eq(fixture.db.creditLedgerTable.clientUserId, fixture.studentId));
  await fixture.db.db
    .delete(fixture.db.sessionsTable)
    .where(eq(fixture.db.sessionsTable.clientUserId, fixture.studentId));
  await fixture.db.db
    .delete(fixture.db.courseMembershipsTable)
    .where(eq(fixture.db.courseMembershipsTable.courseId, fixture.courseId));
  await fixture.db.db
    .delete(fixture.db.coursesTable)
    .where(eq(fixture.db.coursesTable.id, fixture.courseId));
  await fixture.db.db
    .delete(fixture.db.usersTable)
    .where(eq(fixture.db.usersTable.id, fixture.studentId));
  await fixture.db.db
    .delete(fixture.db.usersTable)
    .where(eq(fixture.db.usersTable.id, fixture.tutorId));
  await fixture.db.db
    .delete(fixture.db.usersTable)
    .where(eq(fixture.db.usersTable.id, fixture.adminId));
}

async function creditHoursFor(db: DatabaseModule, userId: string): Promise<number> {
  const entries = await db.db
    .select()
    .from(db.creditLedgerTable)
    .where(eq(db.creditLedgerTable.clientUserId, userId));
  return remainingCreditHours(entries);
}

test("booking with one credit succeeds and leaves zero", async () => {
  const fixture = await createBookingFixture({ creditHours: 1 });
  try {
    const session = await fixture.db.db.transaction(async (tx) => {
      await acquireBookingLocks(tx, [fixture.studentId, fixture.tutorId], fixture.start.toISOString());
      await assertNoScheduleConflict(tx, {
        participantIds: [fixture.studentId, fixture.tutorId],
        start: fixture.start,
        end: new Date(fixture.start.getTime() + 60_000 * 60),
      });
      await lockClientCreditsAndRequireHours(tx, fixture.studentId, 1);
      return insertConfirmedBookingWithDebit(tx, {
        courseId: fixture.courseId,
        clientUserId: fixture.studentId,
        tutorUserId: fixture.tutorId,
        start: fixture.start,
        timezone: "America/New_York",
        subject: "SAT",
        title: "Student’s SAT Session with Xavier",
        durationMinutes: 60,
        tutorName: "Xavier Morales",
      });
    });
    assert.equal(session.bookingStatus, "confirmed");
    assert.equal(await creditHoursFor(fixture.db, fixture.studentId), 0);
    const [debit] = await fixture.db.db
      .select()
      .from(fixture.db.creditLedgerTable)
      .where(eq(fixture.db.creditLedgerTable.fulfillmentKey, sessionDebitFulfillmentKey(session.id)));
    assert.equal(debit?.hours, 1);
    assert.equal(debit?.entryType, "debit");
  } finally {
    await cleanupBookingFixture(fixture);
  }
});

test("booking without credit fails", async () => {
  const fixture = await createBookingFixture({ creditHours: 0 });
  try {
    await assert.rejects(
      () =>
        fixture.db.db.transaction(async (tx) => {
          await acquireBookingLocks(tx, [fixture.studentId, fixture.tutorId], fixture.start.toISOString());
          await lockClientCreditsAndRequireHours(tx, fixture.studentId, 1);
          return insertConfirmedBookingWithDebit(tx, {
            courseId: fixture.courseId,
            clientUserId: fixture.studentId,
            tutorUserId: fixture.tutorId,
            start: fixture.start,
            timezone: "America/New_York",
            subject: "SAT",
            title: "Should not book",
            durationMinutes: 60,
            tutorName: "Xavier Morales",
          });
        }),
      (error: unknown) =>
        error instanceof BookingServiceError && error.code === "INSUFFICIENT_CREDIT",
    );
    const sessions = await fixture.db.db
      .select()
      .from(fixture.db.sessionsTable)
      .where(eq(fixture.db.sessionsTable.clientUserId, fixture.studentId));
    assert.equal(sessions.length, 0);
    assert.equal(await creditHoursFor(fixture.db, fixture.studentId), 0);
  } finally {
    await cleanupBookingFixture(fixture);
  }
});

test("concurrent attempts cannot double-book a slot", async () => {
  const fixture = await createBookingFixture({ creditHours: 2 });
  const otherStudentId = randomUUID();
  try {
    await fixture.db.db.insert(fixture.db.usersTable).values({
      id: otherStudentId,
      clerkUserId: `booking-student-b-${fixture.suffix}`,
      email: `booking-student-b-${fixture.suffix}@example.invalid`,
      displayName: "Booking Student B",
      role: "student",
    });
    await fixture.db.db.insert(fixture.db.courseMembershipsTable).values({
      courseId: fixture.courseId,
      userId: otherStudentId,
      membershipRole: "student",
      subject: "SAT",
    });
    await fixture.db.db.insert(fixture.db.creditLedgerTable).values({
      clientUserId: otherStudentId,
      entryType: "original",
      hours: 1,
      fulfillmentKey: `booking-fixture-credit-b-${fixture.suffix}`,
      note: "Second student credit",
    });

    const book = async (clientUserId: string) =>
      fixture.db.db.transaction(async (tx) => {
        await acquireBookingLocks(tx, [clientUserId, fixture.tutorId], fixture.start.toISOString());
        await assertNoScheduleConflict(tx, {
          participantIds: [clientUserId, fixture.tutorId],
          start: fixture.start,
          end: new Date(fixture.start.getTime() + 60_000 * 60),
        });
        await lockClientCreditsAndRequireHours(tx, clientUserId, 1);
        return insertConfirmedBookingWithDebit(tx, {
          courseId: fixture.courseId,
          clientUserId,
          tutorUserId: fixture.tutorId,
          start: fixture.start,
          timezone: "America/New_York",
          subject: "SAT",
          title: "Concurrent booking",
          durationMinutes: 60,
          tutorName: "Xavier Morales",
        });
      });

    const results = await Promise.allSettled([
      book(fixture.studentId),
      book(otherStudentId),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0] &&
        rejected[0].status === "rejected" &&
        rejected[0].reason instanceof BookingServiceError &&
        rejected[0].reason.code === "SCHEDULE_CONFLICT",
    );
    const confirmed = await fixture.db.db
      .select()
      .from(fixture.db.sessionsTable)
      .where(
        and(
          eq(fixture.db.sessionsTable.tutorUserId, fixture.tutorId),
          eq(fixture.db.sessionsTable.bookingStatus, "confirmed"),
        ),
      );
    assert.equal(confirmed.length, 1);
  } finally {
    await fixture.db.db
      .delete(fixture.db.creditLedgerTable)
      .where(eq(fixture.db.creditLedgerTable.clientUserId, otherStudentId));
    await fixture.db.db
      .delete(fixture.db.sessionsTable)
      .where(eq(fixture.db.sessionsTable.clientUserId, otherStudentId));
    await fixture.db.db
      .delete(fixture.db.courseMembershipsTable)
      .where(eq(fixture.db.courseMembershipsTable.userId, otherStudentId));
    await fixture.db.db
      .delete(fixture.db.usersTable)
      .where(eq(fixture.db.usersTable.id, otherStudentId));
    await cleanupBookingFixture(fixture);
  }
});

test("one credit cannot be deducted twice for the same session", async () => {
  const fixture = await createBookingFixture({ creditHours: 1 });
  try {
    const session = await fixture.db.db.transaction(async (tx) => {
      await lockClientCreditsAndRequireHours(tx, fixture.studentId, 1);
      return insertConfirmedBookingWithDebit(tx, {
        courseId: fixture.courseId,
        clientUserId: fixture.studentId,
        tutorUserId: fixture.tutorId,
        start: fixture.start,
        timezone: "America/New_York",
        subject: "SAT",
        title: "Dedup debit",
        durationMinutes: 60,
        tutorName: "Xavier Morales",
      });
    });
    await assert.rejects(
      () =>
        fixture.db.db.insert(fixture.db.creditLedgerTable).values({
          clientUserId: fixture.studentId,
          sessionId: session.id,
          entryType: "debit",
          hours: 1,
          fulfillmentKey: sessionDebitFulfillmentKey(session.id),
          referenceType: "session",
          referenceId: session.id,
          note: "Duplicate debit attempt",
        }),
    );
    assert.equal(await creditHoursFor(fixture.db, fixture.studentId), 0);
  } finally {
    await cleanupBookingFixture(fixture);
  }
});

test("calendar failure restores credit and cancels phantom booking", async () => {
  const fixture = await createBookingFixture({ creditHours: 1 });
  try {
    const session = await fixture.db.db.transaction(async (tx) => {
      await lockClientCreditsAndRequireHours(tx, fixture.studentId, 1);
      return insertConfirmedBookingWithDebit(tx, {
        courseId: fixture.courseId,
        clientUserId: fixture.studentId,
        tutorUserId: fixture.tutorId,
        start: fixture.start,
        timezone: "America/New_York",
        subject: "SAT",
        title: "Calendar fail booking",
        durationMinutes: 60,
        tutorName: "Xavier Morales",
      });
    });
    assert.equal(await creditHoursFor(fixture.db, fixture.studentId), 0);
    await fixture.db.db.transaction(async (tx) => {
      await rollbackBookingAfterCalendarFailure(tx, {
        sessionId: session.id,
        clientUserId: fixture.studentId,
        durationMinutes: 60,
        actorUserId: fixture.studentId,
      });
    });
    const [updated] = await fixture.db.db
      .select()
      .from(fixture.db.sessionsTable)
      .where(eq(fixture.db.sessionsTable.id, session.id));
    assert.equal(updated?.bookingStatus, "cancelled");
    assert.equal(await creditHoursFor(fixture.db, fixture.studentId), 1);
    const audits = await fixture.db.db
      .select()
      .from(fixture.db.auditLogsTable)
      .where(eq(fixture.db.auditLogsTable.entityId, session.id));
    assert.ok(audits.some((entry) => entry.action === "credit.restored"));
    assert.ok(audits.some((entry) => entry.action === "booking.cancelled"));
  } finally {
    await cleanupBookingFixture(fixture);
  }
});

test("eligible cancellation restores one credit", async () => {
  const fixture = await createBookingFixture({ creditHours: 1 });
  try {
    const session = await fixture.db.db.transaction(async (tx) => {
      await lockClientCreditsAndRequireHours(tx, fixture.studentId, 1);
      return insertConfirmedBookingWithDebit(tx, {
        courseId: fixture.courseId,
        clientUserId: fixture.studentId,
        tutorUserId: fixture.tutorId,
        start: fixture.start,
        timezone: "America/New_York",
        subject: "SAT",
        title: "Eligible cancel",
        durationMinutes: 60,
        tutorName: "Xavier Morales",
      });
    });
    const result = await fixture.db.db.transaction(async (tx) =>
      cancelBookingWithCreditPolicy(tx, {
        session,
        reason: "Cancelled early",
        actorUserId: fixture.studentId,
        now: new Date(fixture.start.getTime() - 25 * 60 * 60 * 1000),
      }),
    );
    assert.equal(result.creditRestored, true);
    assert.equal(result.session.bookingStatus, "cancelled");
    assert.equal(await creditHoursFor(fixture.db, fixture.studentId), 1);
  } finally {
    await cleanupBookingFixture(fixture);
  }
});

test("late cancellation does not restore a credit", async () => {
  const fixture = await createBookingFixture({ creditHours: 1 });
  try {
    const session = await fixture.db.db.transaction(async (tx) => {
      await lockClientCreditsAndRequireHours(tx, fixture.studentId, 1);
      return insertConfirmedBookingWithDebit(tx, {
        courseId: fixture.courseId,
        clientUserId: fixture.studentId,
        tutorUserId: fixture.tutorId,
        start: fixture.start,
        timezone: "America/New_York",
        subject: "SAT",
        title: "Late cancel",
        durationMinutes: 60,
        tutorName: "Xavier Morales",
      });
    });
    const result = await fixture.db.db.transaction(async (tx) =>
      cancelBookingWithCreditPolicy(tx, {
        session,
        reason: "Cancelled late",
        actorUserId: fixture.studentId,
        now: new Date(fixture.start.getTime() - 2 * 60 * 60 * 1000),
      }),
    );
    assert.equal(result.creditRestored, false);
    assert.equal(result.session.bookingStatus, "cancelled");
    assert.equal(await creditHoursFor(fixture.db, fixture.studentId), 0);
  } finally {
    await cleanupBookingFixture(fixture);
  }
});
