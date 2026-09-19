import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  coursesTable,
  db,
  questionsTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  reconcileClientQuizLabels,
  retitleShortCleanDiagnostics,
  unassignTaitoFromXavierCapabilitySessions,
} from "./client-quiz-labels.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { XAVIER_SAT_CAPABILITY_SESSION_TITLE } from "./xavier-sat-capability-session.ts";

test("Cos reconcile unassigns Taito from Xavier capability sessions and retitles short diagnostics", async () => {
  const suffix = randomUUID();
  const taitoEmail = `taito-labels-${suffix}@example.invalid`;
  const samaEmail = `sama-labels-${suffix}@example.invalid`;
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Client quiz labels ${suffix}`,
      subject: "SAT",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const [xavier] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `labels-xavier:${suffix}`,
      email: `xavier-labels-${suffix}@example.invalid`,
      displayName: "Xavier Morales",
      role: "tutor",
    })
    .returning();
  const [taito] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `labels-taito:${suffix}`,
      email: taitoEmail,
      displayName: "Taito Goto",
      role: "student",
    })
    .returning();
  const [michelle] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `labels-michelle:${suffix}`,
      email: `michelle-labels-${suffix}@example.invalid`,
      displayName: "Michelle Makarem",
      role: "student",
    })
    .returning();
  const [capability] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: taito!.id,
      tutorUserId: xavier!.id,
      dateTime: new Date("2026-09-08T20:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title: `${XAVIER_SAT_CAPABILITY_SESSION_TITLE} ${suffix}`,
      status: "published",
      bookingStatus: "confirmed",
    })
    .returning();
  const [michelleSession] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: michelle!.id,
      tutorUserId: xavier!.id,
      dateTime: new Date("2026-10-03T16:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title: "Michelle’s SAT Session with Xavier",
      status: "published",
      bookingStatus: "confirmed",
    })
    .returning();
  const [diagnostic] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: michelleSession!.id,
      deliveryPhase: "before_session",
      title: "Full-length SAT diagnostic — Michelle’s SAT Session with Xavier",
      subject: "SAT",
      instructions: "Complete this full-length College Board SAT practice test.",
      status: "published",
      timeLimitMinutes: 120,
      maxAttempts: 1,
    })
    .returning();
  const [question] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Reading and Writing",
      skill: "Transitions",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: "Which choice completes the text?",
      choices: [
        { id: "a", label: "A", text: "however" },
        { id: "b", label: "B", text: "therefore" },
      ],
      correctAnswer: "a",
      explanation: "Contrast.",
      sourceType: "college_board",
      reviewStatus: "approved",
    })
    .returning();
  await db.insert(assignmentQuestionsTable).values({
    assignmentId: diagnostic!.id,
    questionId: question!.id,
    position: 0,
  });

  try {
    const unassigned = await unassignTaitoFromXavierCapabilitySessions({
      taitoEmail,
      samaEmail,
    });
    assert.deepEqual(unassigned.sessionIds, [capability!.id]);
    assert.equal(unassigned.nextClientUserId, null);
    const [capabilityAfter] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, capability!.id));
    assert.equal(capabilityAfter?.clientUserId, null);
    const [michelleAfter] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, michelleSession!.id));
    assert.equal(michelleAfter?.clientUserId, michelle!.id);

    const retitled = await retitleShortCleanDiagnostics({ courseId: course!.id });
    const changed = retitled.find((row) => row.id === diagnostic!.id);
    assert.equal(changed?.questionCount, 1);
    assert.equal(
      changed?.to,
      "SAT diagnostic (1 clean questions) — Michelle’s SAT Session with Xavier",
    );
    const [stored] = await db
      .select({ title: assignmentsTable.title })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, diagnostic!.id));
    assert.equal(
      stored?.title,
      "SAT diagnostic (1 clean questions) — Michelle’s SAT Session with Xavier",
    );

    const second = await reconcileClientQuizLabels({
      taitoEmail,
      samaEmail,
      courseId: course!.id,
    });
    assert.deepEqual(second.unassignedCapabilitySessions.sessionIds, []);
    assert.equal(
      second.retitledDiagnostics.some((row) => row.id === diagnostic!.id),
      false,
    );
  } finally {
    await db
      .delete(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, diagnostic!.id));
    await db.delete(assignmentsTable).where(eq(assignmentsTable.id, diagnostic!.id));
    await db.delete(questionsTable).where(eq(questionsTable.id, question!.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, [xavier!.id, taito!.id, michelle!.id]));
  }
});
