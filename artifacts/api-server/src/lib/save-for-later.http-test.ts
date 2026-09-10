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
        sessionId: `save-for-later-http-test:${user.id}`,
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

test("save for later pauses an attempt and resume restores answers, flags, and question index", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;

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

    const started = await jsonRequest(
      studentServer.baseUrl,
      `/api/assignments/${homework!.id}/attempts`,
      "POST",
    );
    assert.equal(started.response.status, 201, JSON.stringify(started.body));
    const attemptId = started.body.id as string;
    assert.equal(started.body.currentQuestionIndex, 0);
    assert.equal(started.body.status, "active");

    const savedFirst = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}/responses`,
      "PUT",
      {
        questionId: firstQuestion.id,
        finalAnswer: "a",
        flagged: true,
        currentQuestionIndex: 0,
      },
    );
    assert.equal(savedFirst.response.status, 200, JSON.stringify(savedFirst.body));

    const savedPlace = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}/responses`,
      "PUT",
      {
        questionId: secondQuestion.id,
        finalAnswer: "b",
        flagged: false,
        currentQuestionIndex: 1,
      },
    );
    assert.equal(savedPlace.response.status, 200, JSON.stringify(savedPlace.body));

    const paused = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}/pause`,
      "POST",
      { currentQuestionIndex: 1 },
    );
    assert.equal(paused.response.status, 200, JSON.stringify(paused.body));
    assert.equal(paused.body.status, "paused");
    assert.equal(paused.body.currentQuestionIndex, 1);
    assert.equal(paused.body.responses?.length, 2);
    const flagged = paused.body.responses.find(
      (response: { questionId: string }) => response.questionId === firstQuestion.id,
    );
    const second = paused.body.responses.find(
      (response: { questionId: string }) => response.questionId === secondQuestion.id,
    );
    assert.equal(flagged?.finalAnswer, "a");
    assert.equal(flagged?.flagged, true);
    assert.equal(second?.finalAnswer, "b");

    const reopened = await jsonRequest(
      studentServer.baseUrl,
      `/api/assignments/${homework!.id}/attempts`,
      "POST",
    );
    assert.equal(reopened.response.status, 201, JSON.stringify(reopened.body));
    assert.equal(reopened.body.id, attemptId);
    assert.equal(reopened.body.status, "paused");
    assert.equal(reopened.body.currentQuestionIndex, 1);

    const resumed = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}/resume`,
      "POST",
    );
    assert.equal(resumed.response.status, 200, JSON.stringify(resumed.body));
    assert.equal(resumed.body.status, "active");
    assert.equal(resumed.body.currentQuestionIndex, 1);
    assert.equal(resumed.body.responses?.length, 2);

    const submitted = await jsonRequest(
      studentServer.baseUrl,
      `/api/attempts/${attemptId}/submit`,
      "POST",
      { confirm: true },
    );
    assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.status, "submitted");
    assert.ok(submitted.body.correctCount >= 1);
  } finally {
    await studentServer?.close();
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    const leftoverAttempts = await db
      .select({ id: attemptsTable.id })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, homework!.id));
    const leftoverIds = leftoverAttempts.map((row) => row.id);
    if (leftoverIds.length > 0) {
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
