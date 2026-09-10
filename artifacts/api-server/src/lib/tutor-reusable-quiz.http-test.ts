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
        sessionId: `tutor-quiz-builder-http-test:${user.id}`,
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

test("tutors can assemble a reusable MCQ quiz from the keyed bank; students cannot", async () => {
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
      practiceTestNumber: 4,
      title: `Tutor builder fixture ${suffix}`,
      slug: `tutor-builder-${suffix}`,
      extractStatus: "partial",
    })
    .returning();
  const [mcqA, mcqB, spr] = await db
    .insert(bankQuestionsTable)
    .values([
      {
        sourceKey: `tutor-builder-${suffix}-rw-1`,
        collectionId: collection!.id,
        examFamily: "sat",
        examVariant: "digital",
        practiceTestNumber: 94,
        section: "rw",
        module: 1,
        questionNumber: 1,
        position: 1,
        prompt: "Which choice best states the main idea of the passage?",
        choices: [
          { id: "a", label: "A", text: "A transferable claim" },
          { id: "b", label: "B", text: "An unsupported list" },
          { id: "c", label: "C", text: "A contradictory detail" },
          { id: "d", label: "D", text: "An unrelated anecdote" },
        ],
        correctAnswer: "a",
        officialExplanation: "The passage opens with a transferable claim.",
        figures: [],
        questionType: "mcq",
        estimatedSeconds: 60,
        sourceKind: "seed",
      },
      {
        sourceKey: `tutor-builder-${suffix}-math-2`,
        collectionId: collection!.id,
        examFamily: "sat",
        examVariant: "digital",
        practiceTestNumber: 94,
        section: "math",
        module: 1,
        questionNumber: 2,
        position: 2,
        prompt: "What is the value of x in this equation?",
        choices: [
          { id: "a", label: "A", text: "2" },
          { id: "b", label: "B", text: "4" },
          { id: "c", label: "C", text: "6" },
          { id: "d", label: "D", text: "8" },
        ],
        correctAnswer: "b",
        officialExplanation: "Solve 2x = 8.",
        figures: [{ url: "/media/sat-bank/pack/a.png", alt: "Number line" }],
        questionType: "mcq",
        estimatedSeconds: 75,
        sourceKind: "seed",
      },
      {
        sourceKey: `tutor-builder-${suffix}-math-3`,
        collectionId: collection!.id,
        examFamily: "sat",
        examVariant: "digital",
        practiceTestNumber: 94,
        section: "math",
        module: 1,
        questionNumber: 3,
        position: 3,
        prompt: "Enter the value of y.",
        choices: [],
        correctAnswer: "9",
        officialExplanation: "y = 9.",
        figures: [],
        questionType: "spr",
        estimatedSeconds: 90,
        sourceKind: "seed",
      },
    ])
    .returning();

  const createdAssignmentIds: string[] = [];
  let satServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    satServer = await startServer(fixture.satTutor);
    studentServer = await startServer(fixture.student);

    const studentList = await getJson(
      studentServer.baseUrl,
      "/api/admin/sat-bank/questions?includeKeys=true",
    );
    assert.equal(studentList.response.status, 403);

    const studentCreate = await postJson(studentServer.baseUrl, "/api/tutor/quizzes", {
      courseId: fixture.courseId,
      title: "Student should not build this",
      bankQuestionIds: [mcqA!.id],
    });
    assert.equal(studentCreate.response.status, 403);

    const keyed = await getJson(
      satServer.baseUrl,
      `/api/admin/sat-bank/questions?includeKeys=true&questionType=mcq&collectionId=${collection!.id}`,
    );
    assert.equal(keyed.response.status, 200, JSON.stringify(keyed.body));
    assert.equal(Array.isArray(keyed.body), true);
    assert.equal(
      keyed.body.some((row: { id: string }) => row.id === spr!.id),
      false,
    );
    const first = keyed.body.find((row: { id: string }) => row.id === mcqA!.id);
    assert.equal(first?.correctAnswer, "a");
    assert.match(String(first?.officialExplanation ?? ""), /transferable claim/);

    const unkeyed = await getJson(
      satServer.baseUrl,
      `/api/admin/sat-bank/questions?collectionId=${collection!.id}`,
    );
    assert.equal(unkeyed.response.status, 200);
    const unkeyedRow = unkeyed.body.find((row: { id: string }) => row.id === mcqA!.id);
    assert.equal(unkeyedRow?.correctAnswer, undefined);

    const sprRejected = await postJson(satServer.baseUrl, "/api/tutor/quizzes", {
      courseId: fixture.courseId,
      title: "SPR should fail",
      bankQuestionIds: [spr!.id],
    });
    assert.equal(sprRejected.response.status, 400);

    const created = await postJson(satServer.baseUrl, "/api/tutor/quizzes", {
      courseId: fixture.courseId,
      title: "Xavier custom bank quiz",
      bankQuestionIds: [mcqB!.id, mcqA!.id],
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    createdAssignmentIds.push(created.body.id);
    assert.equal(created.body.sessionId, null);
    assert.equal(created.body.deliveryPhase, "before_session");
    assert.equal(created.body.status, "published");
    assert.equal(created.body.questionCount, 2);
    assert.equal(created.body.title, "Xavier custom bank quiz");

    const attached = await db
      .select({
        questionId: assignmentQuestionsTable.questionId,
        position: assignmentQuestionsTable.position,
      })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, created.body.id));
    attached.sort((a, b) => a.position - b.position);
    assert.equal(attached.length, 2);
    const [firstLinked] = await db
      .select({ linkedQuestionId: bankQuestionsTable.linkedQuestionId })
      .from(bankQuestionsTable)
      .where(eq(bankQuestionsTable.id, mcqB!.id));
    const [secondLinked] = await db
      .select({ linkedQuestionId: bankQuestionsTable.linkedQuestionId })
      .from(bankQuestionsTable)
      .where(eq(bankQuestionsTable.id, mcqA!.id));
    assert.equal(attached[0]?.questionId, firstLinked?.linkedQuestionId);
    assert.equal(attached[1]?.questionId, secondLinked?.linkedQuestionId);

    const curriculum = await getJson(satServer.baseUrl, "/api/tutor/curriculum");
    assert.equal(curriculum.response.status, 200);
    assert.equal(
      curriculum.body.quizzes.some((quiz: { id: string }) => quiz.id === created.body.id),
      true,
    );
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

    const bankIds = [mcqA?.id, mcqB?.id, spr?.id].filter((id): id is string => Boolean(id));
    const linked = bankIds.length
      ? await db
          .select({
            id: bankQuestionsTable.id,
            linkedQuestionId: bankQuestionsTable.linkedQuestionId,
          })
          .from(bankQuestionsTable)
          .where(inArray(bankQuestionsTable.id, bankIds))
      : [];
    const questionIds = linked
      .map((row) => row.linkedQuestionId)
      .filter((id): id is string => Boolean(id));
    if (createdAssignmentIds.length > 0) {
      await db
        .delete(assignmentQuestionsTable)
        .where(inArray(assignmentQuestionsTable.assignmentId, createdAssignmentIds));
      await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, createdAssignmentIds));
    }
    if (bankIds.length > 0) {
      await db
        .update(bankQuestionsTable)
        .set({ linkedQuestionId: null })
        .where(inArray(bankQuestionsTable.id, bankIds));
    }
    if (questionIds.length > 0) {
      await db.delete(questionsTable).where(inArray(questionsTable.id, questionIds));
    }
    if (bankIds.length > 0) {
      await db.delete(bankQuestionsTable).where(inArray(bankQuestionsTable.id, bankIds));
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
