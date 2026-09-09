import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  db,
  questionsTable,
  type AppUser,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createDashboardRoleFixture } from "./dashboard-fixtures";
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
        sessionId: `assignment-visibility-http-test:${user.id}`,
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

test("GET /assignments/:id opens a full-length diagnostic for admin and student without 500", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;

  const [question] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Reading and Writing",
      skill: "Transitions",
      questionType: "multiple_choice",
      difficulty: "unspecified",
      prompt: "Which choice completes the text?",
      choices: [
        { id: "a", label: "A", text: "however" },
        { id: "b", label: "B", text: "therefore" },
      ],
      correctAnswer: "a",
      explanation: "The sentence contrasts two ideas.",
      sourceType: "college_board",
      reviewStatus: "approved",
    })
    .returning({ id: questionsTable.id });
  const [diagnostic] = await db
    .insert(assignmentsTable)
    .values({
      courseId: fixture.courseId,
      sessionId: fixture.sessionIds.studentSat,
      deliveryPhase: "before_session",
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      subject: "SAT",
      instructions: "Complete this full-length College Board SAT practice test.",
      status: "published",
      timeLimitMinutes: 134,
      maxAttempts: 1,
    })
    .returning({ id: assignmentsTable.id });
  await db.insert(assignmentQuestionsTable).values({
    assignmentId: diagnostic!.id,
    questionId: question!.id,
    position: 0,
    predictionFirst: false,
  });

  try {
    adminServer = await startServer(fixture.administrator);
    studentServer = await startServer(fixture.student);
    const path = `/api/assignments/${diagnostic!.id}`;

    const admin = await getJson(adminServer.baseUrl, path);
    assert.equal(admin.response.status, 200, JSON.stringify(admin.body));
    assert.equal(admin.body.title, "Full-length SAT diagnostic — Taito’s SAT Session with Eunice");
    assert.equal(admin.body.questions[0]?.difficulty, "foundational");
    assert.equal(admin.body.questions[0]?.prompt, "Which choice completes the text?");

    const student = await getJson(studentServer.baseUrl, path);
    assert.equal(student.response.status, 200, JSON.stringify(student.body));
    assert.equal(student.body.id, diagnostic!.id);
    assert.equal(student.body.questions.length, 1);
    assert.equal("correctAnswer" in (student.body.questions[0] ?? {}), false);
    assert.equal("explanation" in (student.body.questions[0] ?? {}), false);
  } finally {
    await studentServer?.close();
    await adminServer?.close();
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    if (diagnostic?.id) {
      await db
        .delete(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, diagnostic.id));
      await db.delete(assignmentsTable).where(eq(assignmentsTable.id, diagnostic.id));
    }
    if (question?.id) {
      await db.delete(questionsTable).where(eq(questionsTable.id, question.id));
    }
    await fixture.cleanup();
  }
});

test("admin can persist session date, time, timezone, and duration", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  try {
    adminServer = await startServer(fixture.administrator);
    const response = await fetch(
      `${adminServer.baseUrl}/api/admin/sessions/${fixture.sessionIds.unassignedSat}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dateTime: "2026-10-03T10:30:00.000Z",
          timezone: "Asia/Tokyo",
          durationMinutes: 90,
        }),
      },
    );
    const body = (await response.json()) as Record<string, any>;
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(new Date(body.dateTime).toISOString(), "2026-10-03T10:30:00.000Z");
    assert.equal(body.timezone, "Asia/Tokyo");
    assert.equal(body.durationMinutes, 90);
  } finally {
    await adminServer?.close();
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    await fixture.cleanup();
  }
});
