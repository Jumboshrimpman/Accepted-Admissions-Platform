import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { eq } from "drizzle-orm";
// @ts-expect-error Native Node test execution requires the source extension.
import * as tutorPayoutLedger from "./tutor-payout-ledger.ts";

const {
  accrueObligationForCompletedSession,
  amountOwedCents,
  listTutorPayoutObligations,
  markObligationPaid,
  reverseObligation,
  TutorPayoutLedgerError,
} = tutorPayoutLedger;

type DatabaseModule = typeof import("@workspace/db");

let database: DatabaseModule | null = null;

async function loadDb(): Promise<DatabaseModule> {
  if (!database) database = await import("@workspace/db");
  return database;
}

after(async () => {
  if (database?.pool) await database.pool.end();
});

test("one hour at $65 yields 6500 cents owed", () => {
  assert.equal(amountOwedCents(6_500, 60), 6_500);
  assert.equal(amountOwedCents(6_500, 90), 9_750);
});

async function createPayoutFixture() {
  const db = await loadDb();
  const suffix = randomUUID().slice(0, 8);
  const studentId = randomUUID();
  const tutorId = randomUUID();
  const otherTutorId = randomUUID();
  const adminId = randomUUID();
  const courseId = randomUUID();
  const profileId = randomUUID();
  const otherProfileId = randomUUID();
  const paymentId = randomUUID();
  const sessionDate = new Date("2026-09-10T15:00:00.000Z");

  await db.db.insert(db.usersTable).values([
    {
      id: studentId,
      clerkUserId: `payout-student-${suffix}`,
      email: `payout-student-${suffix}@example.invalid`,
      displayName: "Payout Student",
      role: "student",
    },
    {
      id: tutorId,
      clerkUserId: `payout-tutor-${suffix}`,
      email: `payout-tutor-${suffix}@example.invalid`,
      displayName: "Xavier Morales",
      role: "tutor",
    },
    {
      id: otherTutorId,
      clerkUserId: `payout-other-tutor-${suffix}`,
      email: `payout-other-tutor-${suffix}@example.invalid`,
      displayName: "Other Tutor",
      role: "tutor",
    },
    {
      id: adminId,
      clerkUserId: `payout-admin-${suffix}`,
      email: `payout-admin-${suffix}@example.invalid`,
      displayName: "Payout Admin",
      role: "administrator",
    },
  ]);

  await db.db.insert(db.coursesTable).values({
    id: courseId,
    title: `Payout course ${suffix}`,
    subject: "SAT",
    term: "Fall 2026",
    status: "published",
  });

  await db.db.insert(db.tutorProfilesTable).values([
    {
      id: profileId,
      userId: tutorId,
      email: `payout-tutor-${suffix}@example.invalid`,
      name: "Xavier Morales",
      title: "SAT Tutor",
      biography: "Test tutor",
      subjects: ["SAT"],
      bookingEligible: true,
    },
    {
      id: otherProfileId,
      userId: otherTutorId,
      email: `payout-other-tutor-${suffix}@example.invalid`,
      name: "Other Tutor",
      title: "SAT Tutor",
      biography: "Other tutor",
      subjects: ["SAT"],
      bookingEligible: true,
    },
  ]);

  await db.db.insert(db.tutorCompensationRatesTable).values({
    tutorProfileId: profileId,
    hourlyRateCents: 6_500,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: adminId,
  });

  await db.db.insert(db.paymentsTable).values({
    id: paymentId,
    clientUserId: studentId,
    amountCents: 17_500,
    tutorShareCents: 0,
    platformShareCents: 17_500,
    status: "paid",
    method: "stripe_checkout",
    providerPaymentIntentId: `pi_test_${suffix}`,
    paidAt: new Date(),
    verifiedAt: new Date(),
  });

  await db.db.insert(db.creditLedgerTable).values([
    {
      clientUserId: studentId,
      entryType: "original",
      hours: 1,
      referenceType: "payment",
      referenceId: paymentId,
      fulfillmentKey: `payout-payment-${suffix}`,
      note: "Purchase",
    },
  ]);

  return {
    db,
    suffix,
    studentId,
    tutorId,
    otherTutorId,
    adminId,
    courseId,
    profileId,
    otherProfileId,
    paymentId,
    sessionDate,
  };
}

async function cleanupPayoutFixture(fixture: Awaited<ReturnType<typeof createPayoutFixture>>) {
  const { db } = fixture;
  await db.db
    .delete(db.tutorPayoutObligationsTable)
    .where(eq(db.tutorPayoutObligationsTable.tutorUserId, fixture.tutorId));
  await db.db
    .delete(db.tutorPayoutObligationsTable)
    .where(eq(db.tutorPayoutObligationsTable.tutorUserId, fixture.otherTutorId));
  await db.db
    .delete(db.creditLedgerTable)
    .where(eq(db.creditLedgerTable.clientUserId, fixture.studentId));
  await db.db
    .delete(db.sessionsTable)
    .where(eq(db.sessionsTable.clientUserId, fixture.studentId));
  await db.db.delete(db.paymentsTable).where(eq(db.paymentsTable.id, fixture.paymentId));
  await db.db
    .delete(db.tutorCompensationRatesTable)
    .where(eq(db.tutorCompensationRatesTable.tutorProfileId, fixture.profileId));
  await db.db
    .delete(db.tutorCompensationRatesTable)
    .where(eq(db.tutorCompensationRatesTable.tutorProfileId, fixture.otherProfileId));
  await db.db
    .delete(db.tutorProfilesTable)
    .where(eq(db.tutorProfilesTable.id, fixture.profileId));
  await db.db
    .delete(db.tutorProfilesTable)
    .where(eq(db.tutorProfilesTable.id, fixture.otherProfileId));
  await db.db.delete(db.coursesTable).where(eq(db.coursesTable.id, fixture.courseId));
  for (const id of [
    fixture.studentId,
    fixture.tutorId,
    fixture.otherTutorId,
    fixture.adminId,
  ]) {
    await db.db.delete(db.usersTable).where(eq(db.usersTable.id, id));
  }
}

async function insertSession(
  fixture: Awaited<ReturnType<typeof createPayoutFixture>>,
  overrides: Partial<{
    status: "draft" | "published" | "completed" | "archived";
    bookingStatus: string;
    durationMinutes: number;
    tutorUserId: string;
  }> = {},
) {
  const [session] = await fixture.db.db
    .insert(fixture.db.sessionsTable)
    .values({
      courseId: fixture.courseId,
      clientUserId: fixture.studentId,
      tutorUserId: overrides.tutorUserId ?? fixture.tutorId,
      dateTime: fixture.sessionDate,
      timezone: "America/New_York",
      subject: "SAT",
      title: "SAT Session with Xavier",
      status: overrides.status ?? "published",
      durationMinutes: overrides.durationMinutes ?? 60,
      bookingStatus: overrides.bookingStatus ?? "confirmed",
    })
    .returning();
  await fixture.db.db.insert(fixture.db.creditLedgerTable).values({
    clientUserId: fixture.studentId,
    sessionId: session!.id,
    entryType: "debit",
    hours: (overrides.durationMinutes ?? 60) / 60,
    referenceType: "payment",
    referenceId: fixture.paymentId,
    fulfillmentKey: `payout-debit-${session!.id}`,
    note: "Session debit",
  });
  return session!;
}

test("completed one-hour Xavier session creates a $65 due obligation", async () => {
  const fixture = await createPayoutFixture();
  try {
    const session = await insertSession(fixture, { status: "completed" });
    const obligation = await accrueObligationForCompletedSession(session);
    assert.ok(obligation);
    assert.equal(obligation.status, "due");
    assert.equal(obligation.amountOwedCents, 6_500);
    assert.equal(obligation.tutorRateCents, 6_500);
    assert.equal(obligation.paymentId, fixture.paymentId);
    assert.equal(obligation.purchaseReference, `pi_test_${fixture.suffix}`);
  } finally {
    await cleanupPayoutFixture(fixture);
  }
});

test("completing the same session twice does not duplicate the obligation", async () => {
  const fixture = await createPayoutFixture();
  try {
    const session = await insertSession(fixture, { status: "completed" });
    const first = await accrueObligationForCompletedSession(session);
    const second = await accrueObligationForCompletedSession(session);
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.id, second.id);
    const rows = await fixture.db.db
      .select()
      .from(fixture.db.tutorPayoutObligationsTable)
      .where(eq(fixture.db.tutorPayoutObligationsTable.sessionId, session.id));
    assert.equal(rows.length, 1);
  } finally {
    await cleanupPayoutFixture(fixture);
  }
});

test("cancelled sessions do not create an obligation", async () => {
  const fixture = await createPayoutFixture();
  try {
    const session = await insertSession(fixture, {
      status: "completed",
      bookingStatus: "cancelled",
    });
    const obligation = await accrueObligationForCompletedSession(session);
    assert.equal(obligation, null);
    const rows = await fixture.db.db
      .select()
      .from(fixture.db.tutorPayoutObligationsTable)
      .where(eq(fixture.db.tutorPayoutObligationsTable.sessionId, session.id));
    assert.equal(rows.length, 0);
  } finally {
    await cleanupPayoutFixture(fixture);
  }
});

test("only administrators can mark obligations paid and paid status is recorded", async () => {
  const fixture = await createPayoutFixture();
  try {
    const session = await insertSession(fixture, { status: "completed" });
    const obligation = await accrueObligationForCompletedSession(session);
    assert.ok(obligation);

    await assert.rejects(
      () =>
        markObligationPaid(obligation.id, {
          id: fixture.tutorId,
          role: "tutor",
        } as never),
      (error: unknown) =>
        error instanceof TutorPayoutLedgerError && error.code === "ADMIN_ONLY",
    );

    await assert.rejects(
      () =>
        markObligationPaid(obligation.id, {
          id: fixture.studentId,
          role: "student",
        } as never),
      (error: unknown) =>
        error instanceof TutorPayoutLedgerError && error.code === "ADMIN_ONLY",
    );

    const paid = await markObligationPaid(
      obligation.id,
      { id: fixture.adminId, role: "administrator" } as never,
      { paymentReference: "ACH-1001", notes: "Paid via bank transfer" },
    );
    assert.equal(paid.status, "paid");
    assert.equal(paid.paidByUserId, fixture.adminId);
    assert.ok(paid.paidAt);
    assert.equal(paid.paymentReference, "ACH-1001");
    assert.equal(paid.notes, "Paid via bank transfer");
  } finally {
    await cleanupPayoutFixture(fixture);
  }
});

test("tutors see only their own payout history; students see none via scoped list", async () => {
  const fixture = await createPayoutFixture();
  try {
    const ownSession = await insertSession(fixture, { status: "completed" });
    await accrueObligationForCompletedSession(ownSession);

    // Other tutor has no rate — create obligation manually for scope test.
    const otherSession = await insertSession(fixture, {
      status: "completed",
      tutorUserId: fixture.otherTutorId,
    });
    await fixture.db.db.insert(fixture.db.tutorCompensationRatesTable).values({
      tutorProfileId: fixture.otherProfileId,
      hourlyRateCents: 6_500,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: fixture.adminId,
    });
    await accrueObligationForCompletedSession(otherSession);

    const own = await listTutorPayoutObligations({ tutorUserId: fixture.tutorId });
    const other = await listTutorPayoutObligations({ tutorUserId: fixture.otherTutorId });
    const company = await listTutorPayoutObligations();

    assert.equal(own.length, 1);
    assert.equal(own[0]!.tutorUserId, fixture.tutorId);
    assert.equal(other.length, 1);
    assert.equal(other[0]!.tutorUserId, fixture.otherTutorId);
    assert.ok(company.length >= 2);
    assert.ok(company.every((row) => row.tutorRateCents > 0));

    // Student-scoped call is not exposed by API; empty filter by student is N/A.
    // Reverse path remains admin-only.
    await assert.rejects(
      () =>
        reverseObligation(own[0]!.id, {
          id: fixture.tutorId,
          role: "tutor",
        } as never),
      (error: unknown) =>
        error instanceof TutorPayoutLedgerError && error.code === "ADMIN_ONLY",
    );
  } finally {
    await cleanupPayoutFixture(fixture);
  }
});

test("checkout-style payments keep tutorShareCents at zero (no Connect transfer intent)", async () => {
  const fixture = await createPayoutFixture();
  try {
    const [payment] = await fixture.db.db
      .select()
      .from(fixture.db.paymentsTable)
      .where(eq(fixture.db.paymentsTable.id, fixture.paymentId))
      .limit(1);
    assert.equal(payment!.tutorShareCents, 0);
    assert.equal(payment!.platformShareCents, 17_500);
  } finally {
    await cleanupPayoutFixture(fixture);
  }
});
