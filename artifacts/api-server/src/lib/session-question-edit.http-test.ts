import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  auditLogsTable,
  bankQuestionsTable,
  db,
  examSourceCollectionsTable,
  loginActivityTable,
  questionsTable,
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
        sessionId: `session-question-edit-http-test:${user.id}`,
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

async function jsonRequest(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  return {
    response,
    body: text ? (JSON.parse(text) as Record<string, any>) : {},
  };
}

test("session quiz edits change only the session snapshot, not the bank or reusable quiz", async () => {
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

  const suffix = randomUUID();
  const [collection] = await db
    .insert(examSourceCollectionsTable)
    .values({
      examFamily: "sat",
      examVariant: "digital",
      practiceTestNumber: 5,
      title: `Session edit fixture ${suffix}`,
      slug: `session-edit-${suffix}`,
      extractStatus: "partial",
    })
    .returning();
  const [mcq] = await db
    .insert(bankQuestionsTable)
    .values({
      sourceKey: `session-edit-${suffix}-rw-1`,
      collectionId: collection!.id,
      examFamily: "sat",
      examVariant: "digital",
      practiceTestNumber: 95,
      section: "rw",
      module: 1,
      questionNumber: 1,
      position: 1,
      prompt: "Which choice best states the main idea of the passage?",
      choices: [
        { id: "a", label: "A", text: "A transferable claim" },
        { id: "b", label: "B", text: "An unsupported list" },
      ],
      correctAnswer: "a",
      officialExplanation: "The passage opens with a transferable claim.",
      figures: [],
      questionType: "mcq",
      estimatedSeconds: 60,
      sourceKind: "seed",
    })
    .returning();

  const createdAssignmentIds: string[] = [];
  let satServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    satServer = await startServer(fixture.satTutor);
    studentServer = await startServer(fixture.student);

    const created = await jsonRequest(satServer.baseUrl, "/api/tutor/quizzes", {
      method: "POST",
      body: JSON.stringify({
        courseId: fixture.courseId,
        title: "Session edit source quiz",
        bankQuestionIds: [mcq!.id],
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    createdAssignmentIds.push(created.body.id);

    const cloned = await jsonRequest(
      satServer.baseUrl,
      `/api/admin/assignments/${created.body.id}/clone-to-session`,
      {
        method: "POST",
        body: JSON.stringify({ sessionId: fixture.sessionIds.studentSat }),
      },
    );
    assert.equal(cloned.response.status, 201, JSON.stringify(cloned.body));
    createdAssignmentIds.push(cloned.body.id);

    const sourceDetail = await jsonRequest(
      satServer.baseUrl,
      `/api/assignments/${created.body.id}`,
    );
    const cloneDetail = await jsonRequest(
      satServer.baseUrl,
      `/api/assignments/${cloned.body.id}`,
    );
    assert.equal(sourceDetail.response.status, 200);
    assert.equal(cloneDetail.response.status, 200);
    assert.equal(sourceDetail.body.questions[0]?.correctAnswer, "a");
    assert.equal(cloneDetail.body.questions[0]?.correctAnswer, "a");
    assert.notEqual(sourceDetail.body.questions[0]?.id, cloneDetail.body.questions[0]?.id);

    const studentClone = await jsonRequest(
      studentServer.baseUrl,
      `/api/assignments/${cloned.body.id}`,
    );
    assert.equal(studentClone.response.status, 200);
    assert.equal(studentClone.body.questions[0]?.correctAnswer, undefined);
    assert.equal(studentClone.body.questions[0]?.explanation, undefined);

    const sharedEdit = await jsonRequest(
      satServer.baseUrl,
      `/api/assignments/${created.body.id}/questions/${sourceDetail.body.questions[0].id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ prompt: "Should not mutate the reusable quiz" }),
      },
    );
    assert.equal(sharedEdit.response.status, 403);

    const edited = await jsonRequest(
      satServer.baseUrl,
      `/api/assignments/${cloned.body.id}/questions/${cloneDetail.body.questions[0].id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          prompt: "Edited only on the session copy",
          choices: [
            { id: "a", label: "A", text: "Session-local A" },
            { id: "b", label: "B", text: "Session-local B" },
          ],
          correctAnswer: "b",
          explanation: "Tutors changed the session snapshot.",
        }),
      },
    );
    assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.prompt, "Edited only on the session copy");
    assert.equal(edited.body.correctAnswer, "b");

    const sourceAfter = await jsonRequest(
      satServer.baseUrl,
      `/api/assignments/${created.body.id}`,
    );
    const cloneAfter = await jsonRequest(
      satServer.baseUrl,
      `/api/assignments/${cloned.body.id}`,
    );
    assert.equal(
      sourceAfter.body.questions[0]?.prompt,
      "Which choice best states the main idea of the passage?",
    );
    assert.equal(sourceAfter.body.questions[0]?.correctAnswer, "a");
    assert.equal(cloneAfter.body.questions[0]?.prompt, "Edited only on the session copy");
    assert.equal(cloneAfter.body.questions[0]?.correctAnswer, "b");

    const [bankAfter] = await db
      .select({
        linkedQuestionId: bankQuestionsTable.linkedQuestionId,
      })
      .from(bankQuestionsTable)
      .where(eq(bankQuestionsTable.id, mcq!.id));
    assert.equal(bankAfter?.linkedQuestionId, sourceAfter.body.questions[0]?.id);
    assert.notEqual(bankAfter?.linkedQuestionId, cloneAfter.body.questions[0]?.id);

    const added = await jsonRequest(
      satServer.baseUrl,
      `/api/tutor/assignments/${cloned.body.id}/questions`,
      { method: "POST", body: JSON.stringify({}) },
    );
    assert.equal(added.response.status, 201, JSON.stringify(added.body));
    assert.equal(added.body.questionType, "multiple_choice");

    const addToShared = await jsonRequest(
      satServer.baseUrl,
      `/api/tutor/assignments/${created.body.id}/questions`,
      { method: "POST", body: JSON.stringify({}) },
    );
    assert.equal(addToShared.response.status, 403);
  } finally {
    await satServer?.close();
    await studentServer?.close();
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

    const questionRows =
      createdAssignmentIds.length > 0
        ? await db
            .select({ questionId: assignmentQuestionsTable.questionId })
            .from(assignmentQuestionsTable)
            .where(inArray(assignmentQuestionsTable.assignmentId, createdAssignmentIds))
        : [];
    const questionIds = questionRows.map((row) => row.questionId);
    if (createdAssignmentIds.length > 0) {
      await db
        .delete(assignmentQuestionsTable)
        .where(inArray(assignmentQuestionsTable.assignmentId, createdAssignmentIds));
      await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, createdAssignmentIds));
    }
    if (mcq) {
      await db
        .update(bankQuestionsTable)
        .set({ linkedQuestionId: null })
        .where(eq(bankQuestionsTable.id, mcq.id));
    }
    if (questionIds.length > 0) {
      await db.delete(questionsTable).where(inArray(questionsTable.id, questionIds));
    }
    if (mcq) {
      await db.delete(bankQuestionsTable).where(eq(bankQuestionsTable.id, mcq.id));
    }
    if (collection) {
      await db
        .delete(examSourceCollectionsTable)
        .where(eq(examSourceCollectionsTable.id, collection.id));
    }
    await db
      .delete(auditLogsTable)
      .where(inArray(auditLogsTable.actorUserId, [fixture.satTutor.id, fixture.student.id]));
    await db
      .delete(loginActivityTable)
      .where(inArray(loginActivityTable.userId, [fixture.satTutor.id, fixture.student.id]));
    await fixture.cleanup();
  }
});
