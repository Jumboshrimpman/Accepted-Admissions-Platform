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
  courseMembershipsTable,
  coursesTable,
  db,
  loginActivityTable,
  portalAccessGrantsTable,
  questionsTable,
  responsesTable,
  sessionPreworkPlansTable,
  sessionsTable,
  timerEventsTable,
  tutorAssignmentsTable,
  tutorProfilesTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { configuredAccess } from "./access-config";
import { setProductionClerkUsersClientForTests } from "./clerk-production-users";
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
        sessionId: `clear-homework-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

function installTestClerk(users: AppUser[]) {
  const byId = new Map(users.map((user) => [user.clerkUserId, user]));
  setProductionClerkUsersClientForTests({
    async getUser(userId) {
      const user = byId.get(userId);
      if (!user) {
        throw Object.assign(new Error("not found"), { status: 404 });
      }
      return {
        id: user.clerkUserId,
        primaryEmailAddress: {
          emailAddress: user.email,
          verification: { status: "verified" },
        },
        fullName: user.displayName,
      };
    },
    async getUserList() {
      return { data: [] };
    },
    async createUser() {
      throw new Error("Clerk invites are disabled in this test");
    },
    async updateEmailAddress() {
      return {};
    },
  });
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

async function postJson(baseUrl: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

const envKeys = [
  "ACCEPTED_ADMIN_CLERK_USER_IDS",
  "ACCEPTED_TUTOR_CLERK_USER_IDS",
  "ACCEPTED_STUDENT_CLERK_USER_IDS",
  "ACCEPTED_VIEWER_CLERK_USER_IDS",
  "ACCEPTED_ADMIN_EMAILS",
  "ACCEPTED_TUTOR_EMAILS",
  "ACCEPTED_STUDENT_EMAILS",
  "ACCEPTED_VIEWER_EMAILS",
] as const;

function snapshotEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

async function createFixture() {
  const suffix = randomUUID();
  const [administrator] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clear-hw-admin:${suffix}`,
      email: `clear-hw-admin-${suffix}@example.invalid`,
      displayName: "Clear Admin",
      role: "administrator",
    })
    .returning();
  const [tutor] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clear-hw-tutor:${suffix}`,
      email: `clear-hw-tutor-${suffix}@example.invalid`,
      displayName: "Assigned Tutor",
      role: "tutor",
    })
    .returning();
  const [unrelatedTutor] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clear-hw-unrelated:${suffix}`,
      email: `clear-hw-unrelated-${suffix}@example.invalid`,
      displayName: "Unrelated Tutor",
      role: "tutor",
    })
    .returning();
  const [student] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clear-hw-student:${suffix}`,
      email: `clear-hw-student-${suffix}@example.invalid`,
      displayName: "Homework Student",
      role: "student",
    })
    .returning();
  const [viewer] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `clear-hw-viewer:${suffix}`,
      email: `clear-hw-viewer-${suffix}@example.invalid`,
      displayName: "Homework Viewer",
      role: "viewer",
    })
    .returning();
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Clear homework ${suffix}`,
      subject: "SAT",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  await db.insert(courseMembershipsTable).values([
    {
      courseId: course!.id,
      userId: student!.id,
      membershipRole: "student",
      subject: "SAT",
    },
    {
      courseId: course!.id,
      userId: tutor!.id,
      membershipRole: "tutor",
      subject: "SAT",
    },
    {
      courseId: course!.id,
      userId: unrelatedTutor!.id,
      membershipRole: "tutor",
      subject: "SAT",
    },
  ]);
  await db.insert(tutorAssignmentsTable).values({
    courseId: course!.id,
    tutorUserId: tutor!.id,
    studentUserId: student!.id,
    subject: "SAT",
  });
  await db.insert(viewerLinksTable).values({
    viewerUserId: viewer!.id,
    studentUserId: student!.id,
    relationship: "parent",
    active: true,
  });
  const [session] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: student!.id,
      tutorUserId: tutor!.id,
      dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      timezone: "America/New_York",
      subject: "SAT",
      title: "Homework session",
      status: "published",
      hasHomework: true,
    })
    .returning();
  const [homework] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: session!.id,
      deliveryPhase: "before_session",
      title: "60-minute SAT pre-work",
      subject: "SAT",
      instructions: "Complete before the meeting.",
      status: "published",
      timeLimitMinutes: 60,
      maxAttempts: 1,
    })
    .returning();
  const [during] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: session!.id,
      deliveryPhase: "during_session",
      title: "In-session practice",
      subject: "SAT",
      instructions: "Work together in session.",
      status: "published",
      timeLimitMinutes: 60,
      maxAttempts: 3,
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
    assignmentId: homework!.id,
    questionId: question!.id,
    position: 1,
  });
  await db.insert(sessionPreworkPlansTable).values({
    sessionId: session!.id,
    assignmentId: homework!.id,
    homeworkKind: "routine",
    targetMinutes: 60,
    estimatedSeconds: 3600,
    status: "assigned",
  });
  const [attempt] = await db
    .insert(attemptsTable)
    .values({
      assignmentId: homework!.id,
      userId: student!.id,
      status: "submitted",
      submittedAt: new Date(),
      score: 0,
      result: { correct: 0, total: 1, items: [{ correct: false }] },
    })
    .returning();
  await db.insert(responsesTable).values({
    attemptId: attempt!.id,
    questionId: question!.id,
    finalAnswer: "b",
    correct: false,
  });
  await db.insert(timerEventsTable).values({
    attemptId: attempt!.id,
    type: "started",
  });
  const [duringAttempt] = await db
    .insert(attemptsTable)
    .values({
      assignmentId: during!.id,
      userId: student!.id,
      status: "active",
    })
    .returning();
  const userIds = [
    administrator!.id,
    tutor!.id,
    unrelatedTutor!.id,
    student!.id,
    viewer!.id,
  ];

  return {
    administrator: administrator!,
    tutor: tutor!,
    unrelatedTutor: unrelatedTutor!,
    student: student!,
    viewer: viewer!,
    sessionId: session!.id,
    homeworkId: homework!.id,
    duringId: during!.id,
    questionId: question!.id,
    attemptId: attempt!.id,
    duringAttemptId: duringAttempt!.id,
    applyAccessEnv() {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator!.clerkUserId;
      process.env.ACCEPTED_TUTOR_CLERK_USER_IDS = [
        tutor!.clerkUserId,
        unrelatedTutor!.clerkUserId,
      ].join(",");
      process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = student!.clerkUserId;
      process.env.ACCEPTED_VIEWER_CLERK_USER_IDS = viewer!.clerkUserId;
      process.env.ACCEPTED_ADMIN_EMAILS = administrator!.email;
      process.env.ACCEPTED_TUTOR_EMAILS = [tutor!.email, unrelatedTutor!.email].join(",");
      process.env.ACCEPTED_STUDENT_EMAILS = student!.email;
      process.env.ACCEPTED_VIEWER_EMAILS = viewer!.email;
    },
    cleanup: async () => {
      const leftoverAttempts = await db
        .select({ id: attemptsTable.id })
        .from(attemptsTable)
        .where(inArray(attemptsTable.assignmentId, [homework!.id, during!.id]));
      const leftoverIds = leftoverAttempts.map((row) => row.id);
      if (leftoverIds.length > 0) {
        await db.delete(timerEventsTable).where(inArray(timerEventsTable.attemptId, leftoverIds));
        await db.delete(responsesTable).where(inArray(responsesTable.attemptId, leftoverIds));
      }
      await db
        .delete(attemptsTable)
        .where(inArray(attemptsTable.assignmentId, [homework!.id, during!.id]));
      await db
        .delete(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, homework!.id));
      await db
        .delete(sessionPreworkPlansTable)
        .where(eq(sessionPreworkPlansTable.sessionId, session!.id));
      await db
        .delete(assignmentsTable)
        .where(inArray(assignmentsTable.id, [homework!.id, during!.id]));
      await db.delete(questionsTable).where(eq(questionsTable.id, question!.id));
      await db.delete(sessionsTable).where(eq(sessionsTable.id, session!.id));
      await db
        .delete(tutorAssignmentsTable)
        .where(
          inArray(tutorAssignmentsTable.tutorUserId, userIds),
        );
      await db
        .delete(courseMembershipsTable)
        .where(inArray(courseMembershipsTable.userId, userIds));
      await db.delete(viewerLinksTable).where(eq(viewerLinksTable.viewerUserId, viewer!.id));
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, userIds));
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, userIds));
      await db
        .delete(portalAccessGrantsTable)
        .where(inArray(portalAccessGrantsTable.userId, userIds));
      await db
        .delete(tutorProfilesTable)
        .where(inArray(tutorProfilesTable.userId, userIds));
      await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    },
  };
}

test("tutor of the student and admin can clear homework; unrelated tutor, student, and viewer cannot", async () => {
  const fixture = await createFixture();
  const previous = snapshotEnv();
  fixture.applyAccessEnv();
  installTestClerk([
    fixture.administrator,
    fixture.tutor,
    fixture.unrelatedTutor,
    fixture.student,
    fixture.viewer,
  ]);
  assert.equal(configuredAccess(fixture.student.clerkUserId).access?.role, "student");
  assert.equal(configuredAccess(fixture.tutor.clerkUserId).access?.role, "tutor");
  assert.equal(configuredAccess(fixture.administrator.clerkUserId).access?.role, "administrator");
  const servers: Array<Awaited<ReturnType<typeof startServer>>> = [];
  try {
    const studentServer = await startServer(fixture.student);
    const viewerServer = await startServer(fixture.viewer);
    const unrelatedServer = await startServer(fixture.unrelatedTutor);
    const tutorServer = await startServer(fixture.tutor);
    servers.push(studentServer, viewerServer, unrelatedServer, tutorServer);

    const studentDenied = await postJson(
      studentServer.baseUrl,
      `/api/sessions/${fixture.sessionId}/clear-prework`,
    );
    assert.equal(studentDenied.response.status, 403, JSON.stringify(studentDenied.body));

    const viewerDenied = await postJson(
      viewerServer.baseUrl,
      `/api/sessions/${fixture.sessionId}/clear-prework`,
    );
    assert.equal(viewerDenied.response.status, 403, JSON.stringify(viewerDenied.body));

    const unrelatedDenied = await postJson(
      unrelatedServer.baseUrl,
      `/api/sessions/${fixture.sessionId}/clear-prework`,
    );
    assert.equal(unrelatedDenied.response.status, 403, JSON.stringify(unrelatedDenied.body));

    const cleared = await postJson(
      tutorServer.baseUrl,
      `/api/sessions/${fixture.sessionId}/clear-prework`,
    );
    assert.equal(cleared.response.status, 200);
    assert.equal(cleared.body.deletedAttempts, 1);
    assert.equal(cleared.body.keptAssignments, 1);
    assert.deepEqual(cleared.body.assignmentIds, [fixture.homeworkId]);

    const [homework] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, fixture.homeworkId));
    assert.equal(homework?.status, "published");
    const questions = await db
      .select()
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, fixture.homeworkId));
    assert.equal(questions.length, 1);
    const [plan] = await db
      .select()
      .from(sessionPreworkPlansTable)
      .where(eq(sessionPreworkPlansTable.sessionId, fixture.sessionId));
    assert.equal(plan?.assignmentId, fixture.homeworkId);
    const leftover = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, fixture.homeworkId));
    assert.equal(leftover.length, 0);
    const [duringAttempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, fixture.duringAttemptId));
    assert.equal(duringAttempt?.status, "active");
    const [session] = await db
      .select({ hasHomework: sessionsTable.hasHomework })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, fixture.sessionId));
    assert.equal(session?.hasHomework, true);

    const started = await postJson(
      studentServer.baseUrl,
      `/api/assignments/${fixture.homeworkId}/attempts`,
    );
    assert.equal(started.response.status, 201);
    assert.equal(started.body.status, "active");
    assert.notEqual(started.body.id, fixture.attemptId);
  } finally {
    await Promise.all(servers.map((server) => server.close()));
    setProductionClerkUsersClientForTests(null);
    restoreEnv(previous);
    await fixture.cleanup();
  }
});

test("admin can clear an empty glitched homework attempt so the student can start again", async () => {
  const fixture = await createFixture();
  const previous = snapshotEnv();
  fixture.applyAccessEnv();
  installTestClerk([
    fixture.administrator,
    fixture.tutor,
    fixture.unrelatedTutor,
    fixture.student,
    fixture.viewer,
  ]);
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    await db.delete(timerEventsTable).where(eq(timerEventsTable.attemptId, fixture.attemptId));
    await db.delete(responsesTable).where(eq(responsesTable.attemptId, fixture.attemptId));
    await db
      .update(attemptsTable)
      .set({ status: "submitted", result: null, score: null, submittedAt: new Date() })
      .where(eq(attemptsTable.id, fixture.attemptId));

    adminServer = await startServer(fixture.administrator);
    studentServer = await startServer(fixture.student);
    const cleared = await postJson(
      adminServer.baseUrl,
      `/api/sessions/${fixture.sessionId}/clear-prework`,
    );
    assert.equal(cleared.response.status, 200);
    assert.equal(cleared.body.deletedAttempts, 1);
    const leftover = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, fixture.homeworkId));
    assert.equal(leftover.length, 0);
    const started = await postJson(
      studentServer.baseUrl,
      `/api/assignments/${fixture.homeworkId}/attempts`,
    );
    assert.equal(started.response.status, 201);
    assert.equal(started.body.status, "active");
  } finally {
    await adminServer?.close();
    await studentServer?.close();
    setProductionClerkUsersClientForTests(null);
    restoreEnv(previous);
    await fixture.cleanup();
  }
});
