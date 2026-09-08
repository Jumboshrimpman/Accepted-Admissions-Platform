import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { db, sessionsTable, type AppUser } from "@workspace/db";
import { eq } from "drizzle-orm";
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
        sessionId: `session-schedule-guard-http-test:${user.id}`,
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
    body: (await response.json()) as Record<string, unknown>,
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
    body: (await response.json()) as Record<string, unknown>,
  };
}

test("client, tutor, and admin cannot cancel or reschedule a past session", async () => {
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

  const pastId = randomUUID();
  const futureId = randomUUID();
  const extraIds = [pastId, futureId];
  await db.insert(sessionsTable).values([
    {
      id: pastId,
      courseId: fixture.courseId,
      clientUserId: fixture.student.id,
      tutorUserId: fixture.satTutor.id,
      dateTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
      timezone: "America/New_York",
      subject: "SAT",
      title: "Past SAT session",
      status: "published",
      durationMinutes: 60,
      bookingStatus: "confirmed",
    },
    {
      id: futureId,
      courseId: fixture.courseId,
      clientUserId: fixture.student.id,
      tutorUserId: fixture.satTutor.id,
      dateTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      timezone: "America/New_York",
      subject: "SAT",
      title: "Future SAT session",
      status: "published",
      durationMinutes: 60,
      bookingStatus: "confirmed",
    },
  ]);

  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let tutorServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    studentServer = await startServer(fixture.student);
    tutorServer = await startServer(fixture.satTutor);
    adminServer = await startServer(fixture.administrator);

    const futureStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const actors = [
      ["client", studentServer.baseUrl],
      ["tutor", tutorServer.baseUrl],
      ["admin", adminServer.baseUrl],
    ] as const;

    for (const [label, baseUrl] of actors) {
      const cancelled = await postJson(baseUrl, `/api/booking/sessions/${pastId}/cancel`, {
        reason: `${label} cancel`,
      });
      assert.equal(cancelled.response.status, 409, `${label} cancel`);
      assert.equal(cancelled.body.code, "SESSION_IN_THE_PAST");
      assert.match(String(cancelled.body.error), /past session cannot be cancelled/i);

      const rescheduled = await postJson(
        baseUrl,
        `/api/booking/sessions/${pastId}/reschedule`,
        { startTime: futureStart },
      );
      assert.equal(rescheduled.response.status, 409, `${label} reschedule`);
      assert.equal(rescheduled.body.code, "SESSION_IN_THE_PAST");
      assert.match(String(rescheduled.body.error), /past session cannot be rescheduled/i);
    }

    const adminCancel = await patchJson(adminServer.baseUrl, `/api/admin/sessions/${pastId}`, {
      bookingStatus: "cancelled",
    });
    assert.equal(adminCancel.response.status, 409);
    assert.equal(adminCancel.body.code, "SESSION_IN_THE_PAST");
    assert.match(String(adminCancel.body.error), /past session cannot be cancelled/i);

    const adminReschedule = await patchJson(adminServer.baseUrl, `/api/admin/sessions/${pastId}`, {
      dateTime: futureStart,
    });
    assert.equal(adminReschedule.response.status, 409);
    assert.equal(adminReschedule.body.code, "SESSION_IN_THE_PAST");
    assert.match(String(adminReschedule.body.error), /past session cannot be rescheduled/i);

    const adminComplete = await patchJson(adminServer.baseUrl, `/api/admin/sessions/${pastId}`, {
      status: "completed",
    });
    assert.equal(adminComplete.response.status, 200);
    assert.equal(adminComplete.body.status, "completed");
    assert.equal(adminComplete.body.bookingStatus, "confirmed");

    const futureCancel = await postJson(
      studentServer.baseUrl,
      `/api/booking/sessions/${futureId}/cancel`,
      { reason: "Cancelled by student" },
    );
    assert.equal(futureCancel.response.status, 200);
    assert.equal(futureCancel.body.bookingStatus, "cancelled");

    const futureReschedule = await patchJson(
      adminServer.baseUrl,
      `/api/admin/sessions/${fixture.sessionIds.studentEnglish}`,
      { dateTime: futureStart },
    );
    assert.equal(futureReschedule.response.status, 200);
    assert.equal(new Date(String(futureReschedule.body.dateTime)).toISOString(), futureStart);
  } finally {
    await studentServer?.close();
    await tutorServer?.close();
    await adminServer?.close();
    await db.delete(sessionsTable).where(eq(sessionsTable.id, pastId));
    await db.delete(sessionsTable).where(eq(sessionsTable.id, futureId));
    await fixture.cleanup();
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
    void extraIds;
  }
});
