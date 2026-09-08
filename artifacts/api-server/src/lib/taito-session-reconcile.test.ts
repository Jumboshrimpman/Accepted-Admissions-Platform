import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  courseMembershipsTable,
  coursesTable,
  db,
  sessionPreworkPlansTable,
  questionsTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const privacyModule = await import("./session-privacy.ts");
const { reconcileTaitoSessions } = privacyModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const scheduleModule = await import("./session-schedule.ts");
const { TAITO_STUDENT_EMAIL, taitoSessionDateTime } = scheduleModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const bankModule = await import("./sat-bank-service.ts");
const { dedupeFullLengthDiagnostics } = bankModule;

test("reconcile does not duplicate Oct 2 or overwrite admin-edited clock fields", async () => {
  const suffix = randomUUID();
  const createdUserIds: string[] = [];
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Oct2 reconcile fixture ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const findOrCreateUser = async (
    email: string,
    displayName: string,
    role: "student" | "tutor",
    clerkUserId: string,
  ) => {
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
    createdUserIds.push(created!.id);
    return created!;
  };
  const student = await findOrCreateUser(
    TAITO_STUDENT_EMAIL,
    "Taito Goto",
    "student",
    `oct2-reconcile-student:${suffix}`,
  );
  const eunice = await findOrCreateUser(
    "eunice_chon@berkeley.edu",
    "Eunice Chon",
    "tutor",
    `oct2-reconcile-eunice:${suffix}`,
  );

  const editedStart = new Date("2026-10-02T13:00:00.000Z");
  const [keeper, duplicate] = await db
    .insert(sessionsTable)
    .values([
      {
        courseId: course!.id,
        clientUserId: student.id,
        tutorUserId: eunice.id,
        dateTime: editedStart,
        timezone: "Asia/Tokyo",
        subject: "SAT",
        title: "Taito’s SAT Session with Eunice",
        status: "published",
        bookingStatus: "confirmed",
        durationMinutes: 75,
        hasHomework: true,
      },
      {
        courseId: course!.id,
        clientUserId: student.id,
        tutorUserId: eunice.id,
        dateTime: taitoSessionDateTime("2026-10-02"),
        timezone: "Asia/Tokyo",
        subject: "SAT",
        title: "Taito’s SAT Session with Eunice (copy)",
        status: "published",
        bookingStatus: "confirmed",
        durationMinutes: 60,
        hasHomework: true,
      },
    ])
    .returning();

  try {
    await reconcileTaitoSessions(course!.id);
    await reconcileTaitoSessions(course!.id);

    const oct2 = await db
      .select()
      .from(sessionsTable)
      .where(
        and(eq(sessionsTable.courseId, course!.id), eq(sessionsTable.subject, "SAT")),
      );
    const liveOct2 = oct2.filter(
      (session) =>
        session.status !== "archived" && session.bookingStatus !== "cancelled",
    );
    const liveOnOct2 = liveOct2.filter(
      (session) =>
        session.dateTime.toISOString().startsWith("2026-10-02") ||
        session.id === keeper!.id ||
        session.id === duplicate!.id,
    );
    assert.equal(
      liveOnOct2.filter((session) => session.id === keeper!.id || session.id === duplicate!.id)
        .length,
      1,
      "exactly one live Taito/Eunice Oct 2 session remains",
    );
    const [kept] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, keeper!.id));
    assert.equal(kept?.dateTime.toISOString(), editedStart.toISOString());
    assert.equal(kept?.timezone, "Asia/Tokyo");
    assert.equal(kept?.durationMinutes, 75);
    const [extra] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, duplicate!.id));
    assert.equal(extra?.status, "archived");
  } finally {
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course!.id));
    await db
      .delete(courseMembershipsTable)
      .where(eq(courseMembershipsTable.courseId, course!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
    for (const userId of createdUserIds) {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  }
});

test("dedupeFullLengthDiagnostics archives extra copies and keeps the scored full-length quiz", async () => {
  const suffix = randomUUID();
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Oct2 diagnostic dedupe ${suffix}`,
      subject: "SAT",
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
      bookingStatus: "confirmed",
      hasHomework: true,
    })
    .returning();
  const [keeper, extra] = await db
    .insert(assignmentsTable)
    .values([
      {
        courseId: course!.id,
        sessionId: session!.id,
        deliveryPhase: "before_session",
        title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
        subject: "SAT",
        instructions: "Full length.",
        status: "published",
        timeLimitMinutes: 134,
        maxAttempts: 1,
      },
      {
        courseId: course!.id,
        sessionId: session!.id,
        deliveryPhase: "before_session",
        title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
        subject: "SAT",
        instructions: "Duplicate.",
        status: "published",
        timeLimitMinutes: 134,
        maxAttempts: 1,
      },
    ])
    .returning();
  const [question] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Reading",
      skill: "Evidence",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: `Keeper prompt ${suffix}`,
      choices: [{ id: "a", label: "A", text: "yes" }],
      correctAnswer: "a",
      explanation: "Because.",
      reviewStatus: "approved",
    })
    .returning({ id: questionsTable.id });
  await db.insert(assignmentQuestionsTable).values({
    assignmentId: keeper!.id,
    questionId: question!.id,
    position: 0,
  });
  await db.insert(sessionPreworkPlansTable).values({
    sessionId: session!.id,
    assignmentId: extra!.id,
    homeworkKind: "diagnostic",
    targetMinutes: 134,
    estimatedSeconds: 8000,
    status: "assigned",
  });

  try {
    const result = await dedupeFullLengthDiagnostics(course!.id);
    assert.equal(result.archivedAssignments, 1);
    const [kept] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, keeper!.id));
    const [archived] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, extra!.id));
    assert.equal(kept?.status, "published");
    assert.equal(archived?.status, "archived");
    const [plan] = await db
      .select()
      .from(sessionPreworkPlansTable)
      .where(eq(sessionPreworkPlansTable.sessionId, session!.id));
    assert.equal(plan?.assignmentId, keeper!.id);
  } finally {
    await db
      .delete(sessionPreworkPlansTable)
      .where(eq(sessionPreworkPlansTable.sessionId, session!.id));
    await db
      .delete(assignmentQuestionsTable)
      .where(inArray(assignmentQuestionsTable.assignmentId, [keeper!.id, extra!.id]));
    await db
      .delete(assignmentsTable)
      .where(inArray(assignmentsTable.id, [keeper!.id, extra!.id]));
    if (question?.id) {
      await db.delete(questionsTable).where(eq(questionsTable.id, question.id));
    }
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
  }
});
