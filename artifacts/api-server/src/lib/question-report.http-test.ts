import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
  questionReportsTable,
  questionsTable,
  responsesTable,
  timerEventsTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
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
        sessionId: `question-report-http-test:${user.id}`,
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

async function jsonRequest(
  baseUrl: string,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH",
  body?: unknown,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

test("students can report a question and flagged items are excluded from scoring", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousResend = process.env.RESEND_API_KEY;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;
  delete process.env.RESEND_API_KEY;

  const insertedQuestions = await db
    .insert(questionsTable)
    .values([
      {
        subject: "SAT",
        domain: "Reading and Writing",
        skill: "Transitions",
        questionType: "multiple_choice",
        difficulty: "medium",
        prompt: "Which transition is best?",
        choices: [
          { id: "a", label: "A", text: "However" },
          { id: "b", label: "B", text: "Therefore" },
          { id: "c", label: "C", text: "Meanwhile" },
          { id: "d", label: "D", text: "Similarly" },
        ],
        correctAnswer: "a",
        explanation: "Hidden until submit.",
        sourceType: "college_board",
        reviewStatus: "approved",
      },
      {
        subject: "SAT",
        domain: "Reading and Writing",
        skill: "Words in Context",
        questionType: "multiple_choice",
        difficulty: "medium",
        prompt: "Which word is most precise?",
        choices: [
          { id: "a", label: "A", text: "collected" },
          { id: "b", label: "B", text: "attached" },
          { id: "c", label: "C", text: "created" },
          { id: "d", label: "D", text: "decided" },
        ],
        correctAnswer: "b",
        explanation: "Hidden until submit.",
        sourceType: "college_board",
        reviewStatus: "approved",
      },
    ])
    .returning({ id: questionsTable.id });
  const firstQuestion = insertedQuestions[0]!;
  const secondQuestion = insertedQuestions[1]!;
  const [homework] = await db
    .insert(assignmentsTable)
    .values({
      courseId: fixture.courseId,
      sessionId: fixture.sessionIds.studentSat,
      deliveryPhase: "before_session",
      title: "Full-length SAT diagnostic",
      subject: "SAT",
      instructions: "Complete this timed diagnostic.",
      status: "published",
      timeLimitMinutes: 134,
      maxAttempts: 1,
    })
    .returning({ id: assignmentsTable.id });
  await db.insert(assignmentQuestionsTable).values([
    {
      assignmentId: homework!.id,
      questionId: firstQuestion.id,
      position: 0,
      predictionFirst: false,
    },
    {
      assignmentId: homework!.id,
      questionId: secondQuestion.id,
      position: 1,
      predictionFirst: false,
    },
  ]);

  try {
    studentServer = await startServer(fixture.student);
    adminServer = await startServer(fixture.administrator);

    const started = await jsonRequest(
      studentServer.baseUrl,
      `/api/assignments/${homework!.id}/attempts`,
      "POST",
    );
    assert.equal(started.response.status, 201, JSON.stringify(started.body));
    const attemptId = started.body.id as string;

    const reported = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}/question-reports`,
      "POST",
      {
        questionId: firstQuestion.id,
        reason: "bug",
        note: "Table is smashed",
      },
    );
    assert.equal(reported.response.status, 201, JSON.stringify(reported.body));
    assert.equal(reported.body.reason, "bug");
    assert.equal(reported.body.emailDelivery.status, "skipped");

    const afterReport = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}`,
      "GET",
    );
    assert.equal(afterReport.response.status, 200, JSON.stringify(afterReport.body));
    assert.equal(afterReport.body.status, "active");

    await jsonRequest(studentServer.baseUrl, `/api/attempts/${attemptId}/responses`, "PUT", {
      questionId: firstQuestion.id,
      finalAnswer: "a",
      flagged: true,
    });
    await jsonRequest(studentServer.baseUrl, `/api/attempts/${attemptId}/responses`, "PUT", {
      questionId: secondQuestion.id,
      finalAnswer: "a",
      flagged: false,
    });

    const submitted = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}/submit`,
      "POST",
      { confirm: true },
    );
    assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.correctCount, 0);
    assert.equal(submitted.body.totalCount, 1);
    assert.equal(submitted.body.score, 0);

    const queue = await jsonRequest(adminServer.baseUrl, "/api/admin/question-reports", "GET");
    assert.equal(queue.response.status, 200, JSON.stringify(queue.body));
    assert.equal(queue.body.reports.length, 1);
    assert.equal(queue.body.reports[0].note, "Table is smashed");
    assert.equal(queue.body.reports[0].reason, "bug");
    assert.match(queue.body.reports[0].stemSnippet, /transition/i);
  } finally {
    await studentServer?.close();
    await adminServer?.close();
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    if (previousResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResend;
    const leftoverAttempts = await db
      .select({ id: attemptsTable.id })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, homework!.id));
    const leftoverIds = leftoverAttempts.map((row: { id: string }) => row.id);
    if (leftoverIds.length > 0) {
      await db.delete(questionReportsTable).where(inArray(questionReportsTable.attemptId, leftoverIds));
      await db.delete(timerEventsTable).where(inArray(timerEventsTable.attemptId, leftoverIds));
      await db.delete(responsesTable).where(inArray(responsesTable.attemptId, leftoverIds));
    }
    await db.delete(attemptsTable).where(eq(attemptsTable.assignmentId, homework!.id));
    await db
      .delete(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, homework!.id));
    await db.delete(assignmentsTable).where(eq(assignmentsTable.id, homework!.id));
    await db
      .delete(questionsTable)
      .where(inArray(questionsTable.id, [firstQuestion.id, secondQuestion.id]));
    await fixture.cleanup();
  }
});
