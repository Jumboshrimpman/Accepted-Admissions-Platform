import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
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
        sessionId: `in-session-feedback-http-test:${user.id}`,
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
  method: "GET" | "POST" | "PUT",
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

test("in-session check reveals one item; pre-work stays hidden until submit", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;

  const [preworkQuestion] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Reading and Writing",
      skill: "Transitions",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: "Which transition is best for the diagnostic?",
      choices: [
        { id: "a", label: "A", text: "However" },
        { id: "b", label: "B", text: "Therefore" },
      ],
      correctAnswer: "a",
      explanation: "Hidden until the diagnostic is submitted.",
      sourceType: "college_board",
      reviewStatus: "approved",
    })
    .returning({ id: questionsTable.id });
  const [practiceQuestion] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Reading and Writing",
      skill: "Transitions",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: "Which transition is best in session?",
      choices: [
        { id: "a", label: "A", text: "However" },
        { id: "b", label: "B", text: "Therefore" },
      ],
      correctAnswer: "a",
      explanation: "However signals contrast.",
      sourceType: "college_board",
      reviewStatus: "approved",
    })
    .returning({ id: questionsTable.id });
  const [prework] = await db
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
  const [practice] = await db
    .insert(assignmentsTable)
    .values({
      courseId: fixture.courseId,
      sessionId: fixture.sessionIds.studentSat,
      deliveryPhase: "during_session",
      title: "In-session practice",
      subject: "SAT",
      instructions: "Check each item as you work.",
      status: "published",
      timeLimitMinutes: 60,
      maxAttempts: 3,
    })
    .returning({ id: assignmentsTable.id });
  await db.insert(assignmentQuestionsTable).values([
    {
      assignmentId: prework!.id,
      questionId: preworkQuestion!.id,
      position: 0,
      predictionFirst: false,
    },
    {
      assignmentId: practice!.id,
      questionId: practiceQuestion!.id,
      position: 0,
      predictionFirst: false,
    },
  ]);

  try {
    studentServer = await startServer(fixture.student);

    const preworkAssignment = await jsonRequest(
      studentServer.baseUrl,
      `/api/assignments/${prework!.id}`,
      "GET",
    );
    assert.equal(preworkAssignment.response.status, 200, JSON.stringify(preworkAssignment.body));
    assert.equal("correctAnswer" in (preworkAssignment.body.questions?.[0] ?? {}), false);
    assert.equal("explanation" in (preworkAssignment.body.questions?.[0] ?? {}), false);

    const startedPrework = await jsonRequest(
      studentServer.baseUrl,
      `/api/assignments/${prework!.id}/attempts`,
      "POST",
    );
    assert.equal(startedPrework.response.status, 201, JSON.stringify(startedPrework.body));
    const preworkAttemptId = startedPrework.body.id as string;

    const leaked = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${preworkAttemptId}/responses`,
      "PUT",
      { questionId: preworkQuestion!.id, finalAnswer: "b", checkAnswer: true },
    );
    assert.equal(leaked.response.status, 409, JSON.stringify(leaked.body));
    assert.match(String(leaked.body.error ?? ""), /in-session practice/i);
    assert.equal(leaked.body.correctAnswer, undefined);
    assert.equal(leaked.body.explanation, undefined);

    const savedPrework = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${preworkAttemptId}/responses`,
      "PUT",
      { questionId: preworkQuestion!.id, finalAnswer: "b" },
    );
    assert.equal(savedPrework.response.status, 200, JSON.stringify(savedPrework.body));
    assert.equal(savedPrework.body.revealed, false);
    assert.equal(savedPrework.body.correctAnswer, null);
    assert.equal(savedPrework.body.explanation, null);

    const preworkAttempt = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${preworkAttemptId}`,
      "GET",
    );
    assert.equal(preworkAttempt.response.status, 200, JSON.stringify(preworkAttempt.body));
    assert.equal(preworkAttempt.body.responses?.[0]?.finalAnswer, "b");
    assert.equal(preworkAttempt.body.responses?.[0]?.revealed, false);
    assert.equal(preworkAttempt.body.responses?.[0]?.correctAnswer, null);
    assert.equal(preworkAttempt.body.responses?.[0]?.explanation, null);

    const startedPractice = await jsonRequest(
      studentServer.baseUrl,
      `/api/assignments/${practice!.id}/attempts`,
      "POST",
    );
    assert.equal(startedPractice.response.status, 201, JSON.stringify(startedPractice.body));
    const practiceAttemptId = startedPractice.body.id as string;

    const checked = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${practiceAttemptId}/responses`,
      "PUT",
      { questionId: practiceQuestion!.id, finalAnswer: "b", checkAnswer: true },
    );
    assert.equal(checked.response.status, 200, JSON.stringify(checked.body));
    assert.equal(checked.body.revealed, true);
    assert.equal(checked.body.correct, false);
    assert.equal(checked.body.correctAnswer, "a");
    assert.equal(checked.body.explanation, "However signals contrast.");

    const changed = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${practiceAttemptId}/responses`,
      "PUT",
      { questionId: practiceQuestion!.id, finalAnswer: "a", checkAnswer: true },
    );
    assert.equal(changed.response.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.finalAnswer, "b");
    assert.equal(changed.body.correct, false);
    assert.equal(changed.body.correctAnswer, "a");

    const reloaded = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${practiceAttemptId}`,
      "GET",
    );
    assert.equal(reloaded.response.status, 200, JSON.stringify(reloaded.body));
    assert.equal(reloaded.body.responses?.[0]?.revealed, true);
    assert.equal(reloaded.body.responses?.[0]?.correct, false);
    assert.equal(reloaded.body.responses?.[0]?.correctAnswer, "a");
    assert.equal(reloaded.body.responses?.[0]?.explanation, "However signals contrast.");
  } finally {
    await studentServer?.close();
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    const leftoverAttempts = await db
      .select({ id: attemptsTable.id })
      .from(attemptsTable)
      .where(inArray(attemptsTable.assignmentId, [prework!.id, practice!.id]));
    const leftoverIds = leftoverAttempts.map((row) => row.id);
    if (leftoverIds.length > 0) {
      await db.delete(timerEventsTable).where(inArray(timerEventsTable.attemptId, leftoverIds));
      await db.delete(responsesTable).where(inArray(responsesTable.attemptId, leftoverIds));
    }
    await db
      .delete(attemptsTable)
      .where(inArray(attemptsTable.assignmentId, [prework!.id, practice!.id]));
    await db
      .delete(assignmentQuestionsTable)
      .where(inArray(assignmentQuestionsTable.assignmentId, [prework!.id, practice!.id]));
    await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, [prework!.id, practice!.id]));
    await db
      .delete(questionsTable)
      .where(inArray(questionsTable.id, [preworkQuestion!.id, practiceQuestion!.id]));
    await fixture.cleanup();
  }
});
