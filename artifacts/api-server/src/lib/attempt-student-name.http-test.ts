import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  attemptsTable,
  db,
  sessionArtifactsTable,
  usersTable,
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

const FULL_NAME = "Ava Student";

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
        sessionId: `attempt-student-name-http-test:${user.id}`,
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

function storedResult(attemptId: string, assignmentId: string) {
  return {
    attemptId,
    assignmentId,
    assignmentTitle: "Published SAT practice",
    studentUserId: "stored-user",
    studentName: FULL_NAME,
    sessionId: null,
    sessionDateTime: null,
    status: "submitted",
    submittedAt: new Date().toISOString(),
    score: 100,
    correctCount: 1,
    totalCount: 1,
    activeSeconds: 12,
    pausedSeconds: 0,
    breakdown: [],
    items: [
      {
        questionId: randomUUID(),
        correct: true,
        prediction: null,
        finalAnswer: "a",
        correctAnswer: "a",
        explanation: "The supported choice is A.",
        skill: "Transitions",
        questionType: "multiple_choice",
        difficulty: "medium",
        timeSpentSeconds: 12,
        flagged: false,
        prompt: "Which transition is best?",
        stimulus: null,
        choices: [{ id: "a", label: "A", text: "However" }],
      },
    ],
    analysis: {
      source: "deterministic",
      label: "Stored",
      strengths: [],
      weaknesses: [],
      mistakePatterns: [],
      nextFocus: [],
      feedback: "Stored feedback.",
    },
    studentFeedback: "Stored feedback.",
  };
}

test("GET /attempts/:attemptId shows tutors the student's first name and admins the full name", async () => {
  const fixture = await createDashboardRoleFixture();
  const previous = {
    admin: process.env.ACCEPTED_ADMIN_CLERK_USER_IDS,
    sat: process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS,
  };
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS = fixture.satTutor.clerkUserId;

  await db
    .update(usersTable)
    .set({ displayName: FULL_NAME })
    .where(eq(usersTable.id, fixture.student.id));

  const attemptId = randomUUID();
  await db.insert(attemptsTable).values({
    id: attemptId,
    assignmentId: fixture.assignmentIds.published,
    userId: fixture.student.id,
    status: "submitted",
    submittedAt: new Date(),
    score: 100,
    result: storedResult(attemptId, fixture.assignmentIds.published),
  });

  let tutorServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let failure: unknown;
  try {
    tutorServer = await startServer(fixture.satTutor);
    adminServer = await startServer(fixture.administrator);

    const tutorResponse = await fetch(
      `${tutorServer.baseUrl}/api/attempts/${attemptId}`,
    );
    const tutorBody = (await tutorResponse.json()) as {
      result?: { studentName?: string };
    };
    assert.equal(tutorResponse.status, 200);
    assert.equal(tutorBody.result?.studentName, "Ava");
    assert.equal(JSON.stringify(tutorBody).includes(FULL_NAME), false);

    const adminResponse = await fetch(
      `${adminServer.baseUrl}/api/attempts/${attemptId}`,
    );
    const adminBody = (await adminResponse.json()) as {
      result?: { studentName?: string };
    };
    assert.equal(adminResponse.status, 200);
    assert.equal(adminBody.result?.studentName, FULL_NAME);

    const [stored] = await db
      .select({ result: attemptsTable.result })
      .from(attemptsTable)
      .where(eq(attemptsTable.id, attemptId));
    assert.equal(
      (stored?.result as { studentName?: string } | null)?.studentName,
      FULL_NAME,
    );
  } catch (error) {
    failure = error;
  } finally {
    await tutorServer?.close();
    await adminServer?.close();
    await db.delete(attemptsTable).where(eq(attemptsTable.id, attemptId));
    await db.delete(sessionArtifactsTable).where(
      inArray(sessionArtifactsTable.createdBy, [
        fixture.student.id,
        fixture.otherStudent.id,
        fixture.administrator.id,
        fixture.viewer.id,
        fixture.satTutor.id,
        fixture.englishTutor.id,
      ]),
    );
    if (previous.admin === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previous.admin;
    if (previous.sat === undefined) delete process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS;
    else process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS = previous.sat;
    await fixture.cleanup();
  }
  if (failure) throw failure;
});
