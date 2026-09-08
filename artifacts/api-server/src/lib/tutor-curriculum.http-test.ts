import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  assignmentsTable,
  auditLogsTable,
  db,
  loginActivityTable,
  sessionsTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { setProductionClerkUsersClientForTests } from "./clerk-production-users";
import { createDashboardRoleFixture } from "./dashboard-fixtures";
import platformRouter from "../routes/platform";

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
        sessionId: `tutor-curriculum-http-test:${user.id}`,
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

async function getJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    response,
    body: (await response.json()) as Record<string, any>,
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

test("tutors can author sessions and assign work only for linked students", async () => {
  const fixture = await createDashboardRoleFixture();
  const previous = {
    admin: process.env.ACCEPTED_ADMIN_CLERK_USER_IDS,
    sat: process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS,
    english: process.env.ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS,
    student: process.env.ACCEPTED_STUDENT_CLERK_USER_IDS,
    viewer: process.env.ACCEPTED_VIEWER_CLERK_USER_IDS,
  };
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS = fixture.satTutor.clerkUserId;
  process.env.ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS = fixture.englishTutor.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = [
    fixture.student.clerkUserId,
    fixture.otherStudent.clerkUserId,
  ].join(",");
  process.env.ACCEPTED_VIEWER_CLERK_USER_IDS = fixture.viewer.clerkUserId;
  installTestClerk([
    fixture.administrator,
    fixture.satTutor,
    fixture.englishTutor,
    fixture.student,
    fixture.otherStudent,
    fixture.viewer,
  ]);

  const createdSessionIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  let satServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let englishServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let viewerServer: Awaited<ReturnType<typeof startServer>> | undefined;

  const [bankQuiz] = await db
    .insert(assignmentsTable)
    .values({
      courseId: fixture.courseId,
      sessionId: null,
      deliveryPhase: "before_session",
      title: `Reusable SAT quiz ${randomUUID()}`,
      subject: "SAT",
      instructions: "Bank quiz for tutor assign.",
      status: "published",
      timeLimitMinutes: 20,
      maxAttempts: 1,
    })
    .returning();
  createdAssignmentIds.push(bankQuiz!.id);

  try {
    satServer = await startServer(fixture.satTutor);
    englishServer = await startServer(fixture.englishTutor);
    studentServer = await startServer(fixture.student);
    viewerServer = await startServer(fixture.viewer);

    const studentDashboard = await getJson(studentServer.baseUrl, "/api/dashboard");
    assert.equal(studentDashboard.response.status, 200);
    assert.equal(studentDashboard.body.credits.twelveSessionPlan, false);
    assert.equal(studentDashboard.body.credits.selfServeSatBooking, true);
    assert.equal(
      studentDashboard.body.welcomeMessage.includes("Twelve focused"),
      false,
    );

    const tutorDashboard = await getJson(satServer.baseUrl, "/api/dashboard");
    assert.equal(tutorDashboard.response.status, 200);
    assert.equal(
      tutorDashboard.body.credits.selfServeSatBooking,
      false,
      "Tutor accounts must not advertise student SAT checkout",
    );

    const studentForbidden = await getJson(studentServer.baseUrl, "/api/tutor/curriculum");
    assert.equal(studentForbidden.response.status, 403);

    const viewerForbidden = await postJson(viewerServer.baseUrl, "/api/tutor/sessions", {
      courseId: fixture.courseId,
      clientUserId: fixture.student.id,
      dateTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      timezone: "America/New_York",
      subject: "SAT",
      durationMinutes: 60,
    });
    assert.equal(viewerForbidden.response.status, 403);

    const studentBank = await getJson(
      studentServer.baseUrl,
      "/api/admin/sat-bank/collections",
    );
    assert.equal(studentBank.response.status, 403);

    const tutorBank = await getJson(
      satServer.baseUrl,
      "/api/admin/sat-bank/collections",
    );
    assert.equal(tutorBank.response.status, 200);
    assert.equal(Array.isArray(tutorBank.body), true);

    const scoped = await getJson(satServer.baseUrl, "/api/tutor/curriculum");
    assert.equal(scoped.response.status, 200);
    assert.deepEqual(
      scoped.body.students.map((student: { id: string }) => student.id),
      [fixture.student.id],
    );
    assert.equal(
      scoped.body.sessions.some((session: { id: string }) => session.id === fixture.sessionIds.studentSat),
      true,
    );
    assert.equal(
      scoped.body.sessions.some((session: { id: string }) => session.id === fixture.sessionIds.otherStudentSat),
      false,
    );
    assert.equal(
      scoped.body.sessions.some((session: { id: string }) => session.id === fixture.sessionIds.studentEnglish),
      false,
    );
    assert.equal(
      scoped.body.quizzes.some((quiz: { id: string }) => quiz.id === bankQuiz!.id),
      true,
    );

    const unlinked = await postJson(satServer.baseUrl, "/api/tutor/sessions", {
      courseId: fixture.courseId,
      clientUserId: fixture.otherStudent.id,
      dateTime: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
      timezone: "America/New_York",
      subject: "SAT",
      durationMinutes: 60,
    });
    assert.equal(unlinked.response.status, 404);

    const wrongSubject = await postJson(englishServer.baseUrl, "/api/tutor/sessions", {
      courseId: fixture.courseId,
      clientUserId: fixture.student.id,
      dateTime: new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString(),
      timezone: "America/New_York",
      subject: "SAT",
      durationMinutes: 60,
    });
    assert.equal(wrongSubject.response.status, 404);

    const created = await postJson(satServer.baseUrl, "/api/tutor/sessions", {
      courseId: fixture.courseId,
      clientUserId: fixture.student.id,
      dateTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      timezone: "America/New_York",
      subject: "SAT",
      durationMinutes: 60,
    });
    assert.equal(created.response.status, 201);
    createdSessionIds.push(created.body.id);
    assert.equal(created.body.tutor.id, fixture.satTutor.id);
    assert.equal(created.body.student.id, fixture.student.id);
    assert.equal(created.body.status, "published");

    const cloneOwn = await postJson(
      satServer.baseUrl,
      `/api/admin/assignments/${bankQuiz!.id}/clone-to-session`,
      { sessionId: created.body.id },
    );
    assert.equal(cloneOwn.response.status, 201);
    createdAssignmentIds.push(cloneOwn.body.id);
    assert.equal(cloneOwn.body.sessionId, created.body.id);

    const cloneForeign = await postJson(
      satServer.baseUrl,
      `/api/admin/assignments/${bankQuiz!.id}/clone-to-session`,
      { sessionId: fixture.sessionIds.studentEnglish },
    );
    assert.equal(cloneForeign.response.status, 404);

    const bankOwn = await postJson(
      satServer.baseUrl,
      `/api/admin/sessions/${created.body.id}/prework-from-bank`,
      { homeworkKind: "routine", targetMinutes: 60 },
    );
    assert.notEqual(bankOwn.response.status, 403);
    assert.notEqual(bankOwn.response.status, 401);
    if (bankOwn.response.status === 201 && bankOwn.body.assignmentId) {
      createdAssignmentIds.push(bankOwn.body.assignmentId);
    }

    const bankForeign = await postJson(
      satServer.baseUrl,
      `/api/admin/sessions/${fixture.sessionIds.studentEnglish}/prework-from-bank`,
      { homeworkKind: "routine", targetMinutes: 60 },
    );
    assert.equal(bankForeign.response.status, 404);
  } finally {
    await satServer?.close();
    await englishServer?.close();
    await studentServer?.close();
    await viewerServer?.close();
    setProductionClerkUsersClientForTests(null);
    if (previous.admin === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previous.admin;
    if (previous.sat === undefined) delete process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS;
    else process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS = previous.sat;
    if (previous.english === undefined) delete process.env.ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS;
    else process.env.ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS = previous.english;
    if (previous.student === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previous.student;
    if (previous.viewer === undefined) delete process.env.ACCEPTED_VIEWER_CLERK_USER_IDS;
    else process.env.ACCEPTED_VIEWER_CLERK_USER_IDS = previous.viewer;

    const actorIds = [
      fixture.satTutor.id,
      fixture.englishTutor.id,
      fixture.student.id,
      fixture.viewer.id,
    ];
    if (createdAssignmentIds.length > 0) {
      await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, createdAssignmentIds));
    }
    if (createdSessionIds.length > 0) {
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, actorIds));
    await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, actorIds));
    await fixture.cleanup();
  }
});
