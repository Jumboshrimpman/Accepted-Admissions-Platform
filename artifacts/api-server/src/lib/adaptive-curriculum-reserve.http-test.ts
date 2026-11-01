import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  assignmentsTable,
  coursesTable,
  curriculumBlocksTable,
  db,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { adaptiveCurriculumForSession } from "../routes/platform";

test("adaptiveCurriculumForSession returns the practice assignment when the reserve is older", async () => {
  const suffix = randomUUID();
  const [student] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `adaptive-student-${suffix}`,
      email: `adaptive-student-${suffix}@example.invalid`,
      displayName: "Plain Student",
      role: "student",
    })
    .returning();
  const [tutor] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `adaptive-tutor-${suffix}`,
      email: `adaptive-tutor-${suffix}@example.invalid`,
      displayName: "Plain Tutor",
      role: "administrator",
    })
    .returning();
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Adaptive reserve ${suffix}`,
      subject: "SAT",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const [session] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: student!.id,
      dateTime: new Date("2026-11-04T15:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title: "Plain Student’s SAT Session with Eunice",
      status: "published",
    })
    .returning();
  const [reserve] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: session!.id,
      deliveryPhase: "during_session",
      title: "Hard challenge set (5) — Plain Student’s SAT Session with Eunice",
      subject: "SAT",
      instructions: "Held for the tutor.",
      status: "draft",
      timeLimitMinutes: 30,
      maxAttempts: 1,
      hardChallengeReserve: true,
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
    })
    .returning();
  const [practice] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: session!.id,
      deliveryPhase: "during_session",
      title: "During session practice — Plain Student’s SAT Session with Eunice",
      subject: "SAT",
      instructions: "Practice with the tutor.",
      status: "draft",
      timeLimitMinutes: 30,
      maxAttempts: 1,
      hardChallengeReserve: false,
      createdAt: new Date("2026-11-01T00:05:00.000Z"),
    })
    .returning();
  const [block] = await db
    .insert(curriculumBlocksTable)
    .values({
      sessionId: session!.id,
      kind: "adaptive_prep",
      position: 0,
      visibility: "tutor",
      status: "published",
      config: {
        mode: "awaiting_homework",
        text: "Practice is ready.",
        needsQuestions: false,
      },
    })
    .returning();

  try {
    const view = await adaptiveCurriculumForSession(session!, tutor!);
    assert.equal(view.sessionPrep?.duringAssignmentId, practice!.id);
    assert.notEqual(view.sessionPrep?.duringAssignmentId, reserve!.id);
  } finally {
    await db.delete(curriculumBlocksTable).where(eq(curriculumBlocksTable.id, block!.id));
    await db.delete(assignmentsTable).where(eq(assignmentsTable.sessionId, session!.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
    await db.delete(usersTable).where(eq(usersTable.id, student!.id));
    await db.delete(usersTable).where(eq(usersTable.id, tutor!.id));
  }
});
