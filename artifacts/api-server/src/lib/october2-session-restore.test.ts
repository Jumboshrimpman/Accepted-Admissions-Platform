import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  assignmentsTable,
  courseMembershipsTable,
  coursesTable,
  db,
  questionsTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const restoreModule = await import("./october2-session-restore.ts");
const { restoreTaitoOctober2SatSession } = restoreModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const privacyModule = await import("./session-privacy.ts");
const { reconcileTaitoSessions } = privacyModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const scheduleModule = await import("./session-schedule.ts");
const { taitoSessionDateTime } = scheduleModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const capabilityModule = await import("./xavier-sat-capability-session.ts");
const { XAVIER_SAT_CAPABILITY_SESSION_TITLE } = capabilityModule;

async function createUser(
  email: string,
  displayName: string,
  role: "student" | "tutor",
  clerkUserId: string,
) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(usersTable)
    .values({ clerkUserId, email, displayName, role })
    .returning();
  return created!;
}

test("restores a cancelled Oct 2 SAT session for samapostgrad without wiping homework or the bank", async () => {
  const suffix = randomUUID();
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Fall Oct 2 restore ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const sama = await createUser(
    "samapostgrad@gmail.com",
    "Sama Noori",
    "student",
    `oct2-restore-sama:${suffix}`,
  );
  const taito = await createUser(
    "taito0525@gmail.com",
    "Taito Goto",
    "student",
    `oct2-restore-taito:${suffix}`,
  );
  const eunice = await createUser(
    "eunice_chon@berkeley.edu",
    "Eunice Chon",
    "tutor",
    `oct2-restore-eunice:${suffix}`,
  );
  const xavier = await createUser(
    "xaver.rmz6@gmail.com",
    "Xavier Morales",
    "tutor",
    `oct2-restore-xavier:${suffix}`,
  );
  const [session] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: sama.id,
      tutorUserId: eunice.id,
      dateTime: taitoSessionDateTime("2026-10-02"),
      timezone: "Asia/Tokyo",
      subject: "SAT",
      title: "Sama’s SAT Session with Eunice",
      status: "archived",
      bookingStatus: "cancelled",
      cancelledAt: new Date("2026-09-07T18:00:00.000Z"),
      cancellationReason: "Cancelled by client",
      hasHomework: true,
    })
    .returning();
  const [homework] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: session!.id,
      deliveryPhase: "before_session",
      title: "Full-length SAT diagnostic — keep me",
      subject: "SAT Reading & Writing",
      instructions: "Do not reset this diagnostic.",
      status: "published",
      timeLimitMinutes: 134,
      maxAttempts: 1,
    })
    .returning();
  const [bankQuestion] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT Reading & Writing",
      domain: "Standard English Conventions",
      skill: "Boundaries",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: `Oct 2 restore bank sentinel ${suffix}`,
      choices: [{ id: "a", label: "A", text: "ok" }],
      correctAnswer: "a",
      explanation: "sentinel",
      sourceType: "original",
      reviewStatus: "approved",
    })
    .returning();

  try {
    const preview = await restoreTaitoOctober2SatSession({
      dryRun: true,
      courseId: course!.id,
      attachDiagnostic: false,
    });
    assert.equal(preview.dryRun, true);
    assert.deepEqual(preview.restoredSessionIds, [session!.id]);
    assert.equal(preview.created, false);

    const [stillCancelled] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, session!.id));
    assert.equal(stillCancelled?.bookingStatus, "cancelled");

    const restored = await restoreTaitoOctober2SatSession({
      courseId: course!.id,
      attachDiagnostic: false,
    });
    assert.equal(restored.dryRun, false);
    assert.equal(restored.created, false);
    assert.deepEqual(restored.restoredSessionIds, [session!.id]);
    assert.equal(restored.session?.sessionId, session!.id);
    assert.equal(restored.session?.status, "published");
    assert.equal(restored.session?.bookingStatus, "confirmed");
    assert.equal(restored.session?.clientEmail, "samapostgrad@gmail.com");
    assert.equal(restored.session?.tutorEmail, "eunice_chon@berkeley.edu");
    assert.equal(restored.session?.dateTime, "2026-10-02T12:00:00.000Z");
    assert.equal(restored.session?.assignmentCount, 1);
    assert.equal(restored.session?.hasActivePrework, true);
    assert.equal(restored.preworkAttached, false);
    assert.equal(restored.bankUntouched, true);

    const [live] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, session!.id));
    assert.equal(live?.status, "published");
    assert.equal(live?.bookingStatus, "confirmed");
    assert.equal(live?.cancelledAt, null);
    assert.equal(live?.cancellationReason, null);
    assert.equal(live?.clientUserId, sama.id);
    assert.equal(live?.tutorUserId, eunice.id);
    assert.equal(live?.hasHomework, true);
    assert.notEqual(live?.clientUserId, taito.id);
    assert.notEqual(live?.tutorUserId, xavier.id);

    const [keptHomework] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, homework!.id));
    assert.equal(keptHomework?.title, "Full-length SAT diagnostic — keep me");
    assert.equal(keptHomework?.status, "published");
    assert.equal(keptHomework?.sessionId, session!.id);

    const [keptBank] = await db
      .select({ id: questionsTable.id, prompt: questionsTable.prompt })
      .from(questionsTable)
      .where(eq(questionsTable.id, bankQuestion!.id));
    assert.equal(keptBank?.prompt, `Oct 2 restore bank sentinel ${suffix}`);

    const again = await restoreTaitoOctober2SatSession({
      courseId: course!.id,
      attachDiagnostic: false,
    });
    assert.equal(again.created, false);
    assert.deepEqual(again.restoredSessionIds, []);
    assert.equal(again.session?.sessionId, session!.id);
    assert.equal(again.session?.clientEmail, "samapostgrad@gmail.com");
  } finally {
    await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.courseId, course!.id));
    await db.delete(assignmentsTable).where(eq(assignmentsTable.courseId, course!.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course!.id));
    await db.delete(questionsTable).where(eq(questionsTable.id, bankQuestion!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
  }
});

test("recreates a missing Oct 2 SAT session for Sama with Xavier and skips Xavier capability rows", async () => {
  const suffix = randomUUID();
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Fall recreate fixture ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const sama = await createUser(
    "samapostgrad@gmail.com",
    "Sama Noori",
    "student",
    `oct2-recreate-sama:${suffix}`,
  );
  await createUser(
    "xaver.rmz6@gmail.com",
    "Xavier Morales",
    "tutor",
    `oct2-recreate-xavier:${suffix}`,
  );
  const [xavierSession] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      dateTime: new Date("2026-10-02T16:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title: XAVIER_SAT_CAPABILITY_SESSION_TITLE,
      status: "archived",
      bookingStatus: "cancelled",
      cancelledAt: new Date("2026-09-07T18:00:00.000Z"),
      cancellationReason: "capability fixture",
    })
    .returning();

  try {
    const created = await restoreTaitoOctober2SatSession({
      courseId: course!.id,
      attachDiagnostic: false,
    });
    assert.equal(created.created, true);
    assert.equal(created.session?.status, "published");
    assert.equal(created.session?.bookingStatus, "confirmed");
    assert.equal(created.session?.clientEmail, "samapostgrad@gmail.com");
    assert.equal(created.session?.tutorEmail, "xaver.rmz6@gmail.com");
    assert.equal(created.session?.dateTime, "2026-10-02T12:00:00.000Z");
    assert.notEqual(created.session?.sessionId, xavierSession!.id);
    assert.equal(created.session?.clientUserId, sama.id);

    const [xavier] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, xavierSession!.id));
    assert.equal(xavier?.bookingStatus, "cancelled");
    assert.equal(xavier?.status, "archived");

    const again = await restoreTaitoOctober2SatSession({
      courseId: course!.id,
      attachDiagnostic: false,
    });
    assert.equal(again.created, false);
    assert.equal(again.session?.sessionId, created.session?.sessionId);
    assert.equal(again.session?.clientEmail, "samapostgrad@gmail.com");

    const oct2Rows = await db
      .select({ id: sessionsTable.id, title: sessionsTable.title })
      .from(sessionsTable)
      .where(eq(sessionsTable.courseId, course!.id));
    assert.equal(
      oct2Rows.filter((row) => row.id === created.session?.sessionId).length,
      1,
    );
  } finally {
    await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.courseId, course!.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
  }
});

test("reconcile restores Oct 2 booking visibility without replacing the row or stealing homework", async () => {
  const suffix = randomUUID();
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Fall reconcile restore ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const [session] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      dateTime: taitoSessionDateTime("2026-10-02"),
      timezone: "Asia/Tokyo",
      subject: "SAT",
      title: "Taito’s SAT Session with Eunice",
      status: "published",
      bookingStatus: "cancelled",
      cancelledAt: new Date("2026-09-08T12:00:00.000Z"),
      cancellationReason: "Cancelled by client",
      hasHomework: true,
    })
    .returning();

  try {
    await reconcileTaitoSessions(course!.id);
    const [restored] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, session!.id));
    assert.equal(restored?.status, "published");
    assert.equal(restored?.bookingStatus, "confirmed");
    assert.equal(restored?.cancelledAt, null);
    assert.equal(restored?.cancellationReason, null);
    assert.equal(restored?.hasHomework, true);
  } finally {
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
  }
});
