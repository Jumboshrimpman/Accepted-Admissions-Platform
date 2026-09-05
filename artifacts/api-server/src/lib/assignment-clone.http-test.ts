import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  auditLogsTable,
  contentSourcesTable,
  loginActivityTable,
  courseMembershipsTable,
  coursesTable,
  db,
  questionsTable,
  sessionsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE } from "./content-source-text";
import platformRouter from "../routes/platform";

function testAuthMiddleware(user: AppUser) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = Object.assign(
      () => ({
        tokenType: "session_token",
        userId: user.clerkUserId,
        sessionClaims: {
          userId: user.clerkUserId,
          email: user.email,
          name: user.displayName,
        },
        sessionId: `assignment-clone-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startServer(user: AppUser) {
  const app = express();
  app.use(express.json());
  app.use(testAuthMiddleware(user));
  app.use("/api", platformRouter);
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

async function patchJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

async function createCloneFixture() {
  const suffix = randomUUID();
  const [administrator] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clone-admin:${suffix}`,
      email: `clone-admin-${suffix}@example.invalid`,
      displayName: "Clone Administrator",
      role: "administrator",
    })
    .returning();
  const [student] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clone-student:${suffix}`,
      email: `clone-student-${suffix}@example.invalid`,
      displayName: "Clone Student",
      role: "student",
    })
    .returning();
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Clone fixture ${suffix}`,
      subject: "SAT",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  await db.insert(courseMembershipsTable).values({
    courseId: course!.id,
    userId: student!.id,
    membershipRole: "student",
    subject: "SAT",
  });
  const first = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [sessionA] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: student!.id,
      dateTime: first,
      timezone: "America/New_York",
      subject: "SAT",
      title: "Session A",
      status: "published",
    })
    .returning();
  const [sessionB] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: student!.id,
      dateTime: new Date(first.getTime() + 60 * 60 * 1000),
      timezone: "America/New_York",
      subject: "SAT",
      title: "Session B",
      status: "published",
    })
    .returning();
  const [sourceAssignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: sessionA!.id,
      deliveryPhase: "before_session",
      title: "Reusable evidence quiz",
      subject: "SAT",
      instructions: "Complete before the meeting.",
      status: "published",
      timeLimitMinutes: 20,
      maxAttempts: 1,
    })
    .returning();
  const [question] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Reading",
      skill: "Evidence",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: "Which choice best supports the claim?",
      choices: [
        { id: "a", label: "A", text: "A specific relationship" },
        { id: "b", label: "B", text: "An unsupported list" },
      ],
      correctAnswer: "a",
      explanation: "The supported claim is transferable.",
      reviewStatus: "approved",
    })
    .returning();
  await db.insert(assignmentQuestionsTable).values({
    assignmentId: sourceAssignment!.id,
    questionId: question!.id,
    position: 3,
    predictionFirst: true,
  });
  const [attempt] = await db
    .insert(attemptsTable)
    .values({
      assignmentId: sourceAssignment!.id,
      userId: student!.id,
      status: "submitted",
      reviewStatus: "reviewed",
      submittedAt: new Date(),
      score: 80,
      result: { correct: 4, total: 5 },
      studentFeedback: "Keep the original feedback.",
      tutorNotes: "Historical tutor note.",
    })
    .returning();

  return {
    administrator: administrator!,
    student: student!,
    courseId: course!.id,
    sessionAId: sessionA!.id,
    sessionBId: sessionB!.id,
    sourceAssignmentId: sourceAssignment!.id,
    questionId: question!.id,
    attemptId: attempt!.id,
    cleanup: async (extraAssignmentIds: string[] = [], extraSessionIds: string[] = []) => {
      const assignmentIds = [sourceAssignment!.id, ...extraAssignmentIds];
      await db.delete(attemptsTable).where(inArray(attemptsTable.assignmentId, assignmentIds));
      await db
        .delete(assignmentQuestionsTable)
        .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds));
      await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, assignmentIds));
      await db.delete(questionsTable).where(eq(questionsTable.id, question!.id));
      await db
        .delete(sessionsTable)
        .where(inArray(sessionsTable.id, [sessionA!.id, sessionB!.id, ...extraSessionIds]));
      await db
        .delete(courseMembershipsTable)
        .where(eq(courseMembershipsTable.courseId, course!.id));
      await db
        .delete(loginActivityTable)
        .where(inArray(loginActivityTable.userId, [administrator!.id, student!.id]));
      await db
        .delete(auditLogsTable)
        .where(inArray(auditLogsTable.actorUserId, [administrator!.id, student!.id]));
      await db.delete(contentSourcesTable).where(eq(contentSourcesTable.courseId, course!.id));
      await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
      await db
        .delete(usersTable)
        .where(inArray(usersTable.id, [administrator!.id, student!.id]));
    },
  };
}

test("HTTP clone assigns a reusable quiz to two sessions without moving history", async () => {
  const fixture = await createCloneFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  const createdIds: string[] = [];
  const extraSessionIds: string[] = [];
  try {
    server = await startServer(fixture.administrator);
    const first = await postJson(
      server.baseUrl,
      `/api/admin/assignments/${fixture.sourceAssignmentId}/clone-to-session`,
      { sessionId: fixture.sessionBId },
    );
    assert.equal(first.response.status, 201);
    createdIds.push(first.body.id);
    assert.notEqual(first.body.id, fixture.sourceAssignmentId);
    assert.equal(first.body.sessionId, fixture.sessionBId);
    assert.equal(first.body.title, "Reusable evidence quiz");
    assert.equal(first.body.questionCount, 1);

    const secondSession = await db
      .insert(sessionsTable)
      .values({
        courseId: fixture.courseId,
        clientUserId: fixture.student.id,
        dateTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
        timezone: "America/New_York",
        subject: "SAT",
        title: "Session C",
        status: "published",
      })
      .returning();
    const sessionCId = secondSession[0]!.id;
    extraSessionIds.push(sessionCId);
    const second = await postJson(
      server.baseUrl,
      `/api/admin/assignments/${fixture.sourceAssignmentId}/clone-to-session`,
      { sessionId: sessionCId },
    );
    assert.equal(second.response.status, 201);
    createdIds.push(second.body.id);
    assert.notEqual(second.body.id, first.body.id);

    const duplicate = await postJson(
      server.baseUrl,
      `/api/admin/assignments/${fixture.sourceAssignmentId}/clone-to-session`,
      { sessionId: fixture.sessionBId },
    );
    assert.equal(duplicate.response.status, 409);

    const [original] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, fixture.sourceAssignmentId));
    assert.equal(original!.sessionId, fixture.sessionAId);
    assert.equal(original!.title, "Reusable evidence quiz");

    const [historical] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, fixture.attemptId));
    assert.equal(historical!.assignmentId, fixture.sourceAssignmentId);
    assert.equal(historical!.score, 80);
    assert.equal(historical!.studentFeedback, "Keep the original feedback.");
    assert.equal(historical!.tutorNotes, "Historical tutor note.");

    const sourceQuestions = await db
      .select()
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, fixture.sourceAssignmentId));
    const cloneQuestions = await db
      .select()
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, first.body.id));
    assert.equal(sourceQuestions[0]!.position, 3);
    assert.equal(sourceQuestions[0]!.predictionFirst, true);
    assert.equal(cloneQuestions[0]!.questionId, sourceQuestions[0]!.questionId);
    assert.equal(cloneQuestions[0]!.position, 3);
    assert.equal(cloneQuestions[0]!.predictionFirst, true);
    assert.notEqual(cloneQuestions[0]!.id, sourceQuestions[0]!.id);

    await patchJson(server.baseUrl, `/api/admin/assignments/${first.body.id}`, {
      title: "Edited clone B only",
      timeLimitMinutes: 45,
    });
    const reparent = await patchJson(
      server.baseUrl,
      `/api/admin/assignments/${fixture.sourceAssignmentId}`,
      { sessionId: fixture.sessionBId },
    );
    assert.equal(reparent.response.status, 409);

    const [originalAfter] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, fixture.sourceAssignmentId));
    const [cloneBAfter] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, first.body.id));
    const [cloneCAfter] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, second.body.id));
    assert.equal(originalAfter!.title, "Reusable evidence quiz");
    assert.equal(originalAfter!.sessionId, fixture.sessionAId);
    assert.equal(cloneBAfter!.title, "Edited clone B only");
    assert.equal(cloneBAfter!.timeLimitMinutes, 45);
    assert.equal(cloneCAfter!.title, "Reusable evidence quiz");
    assert.equal(cloneCAfter!.timeLimitMinutes, 20);

  } finally {
    await server?.close();
    if (previousAdminIds === undefined) {
      delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    }
    await fixture.cleanup(createdIds, extraSessionIds);
  }
});

test("HTTP content source import rejects URL-only and short extracted text", async () => {
  const fixture = await createCloneFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer(fixture.administrator);
    const urlOnly = await postJson(server.baseUrl, "/api/content-sources", {
      courseId: fixture.courseId,
      title: "URL only source",
      sourceKind: "html",
      sourceUrl: "https://example.invalid/lesson",
      authorizationNote: "Owned by Accepted Admissions.",
    });
    assert.equal(urlOnly.response.status, 400);
    assert.equal(urlOnly.body.error, SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE);

    const shortText = await postJson(server.baseUrl, "/api/content-sources", {
      courseId: fixture.courseId,
      title: "Short source",
      sourceKind: "text",
      extractedText: "too short",
      authorizationNote: "Owned by Accepted Admissions.",
    });
    assert.equal(shortText.response.status, 400);
    assert.equal(shortText.body.error, SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE);

    const [shortSource] = await db
      .insert(contentSourcesTable)
      .values({
        courseId: fixture.courseId,
        importedBy: fixture.administrator.id,
        subject: "SAT",
        title: "Existing short source",
        sourceKind: "text",
        sourceUrl: "https://example.invalid/ignored",
        authorizationNote: "Owned by Accepted Admissions.",
        extractedText: "short",
      })
      .returning();
    const generate = await postJson(
      server.baseUrl,
      `/api/content-sources/${shortSource!.id}/generate`,
      { focus: "evidence and inference", count: 3, difficulty: "medium" },
    );
    assert.equal(generate.response.status, 400);
    assert.equal(generate.body.error, SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE);
  } finally {
    await server?.close();
    if (previousAdminIds === undefined) {
      delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    }
    await fixture.cleanup();
  }
});
