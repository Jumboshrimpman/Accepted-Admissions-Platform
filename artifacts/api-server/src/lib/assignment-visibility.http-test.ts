import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  db,
  questionsTable,
  sessionsTable,
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
        { id: "c", label: "C", text: "meanwhile" },
        { id: "d", label: "D", text: "instead" },
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
    assert.equal(
      admin.body.title,
      "SAT diagnostic (1 clean questions) — Taito’s SAT Session with Eunice",
    );
    assert.equal(admin.body.questions[0]?.difficulty, "foundational");
    assert.equal(admin.body.questions[0]?.prompt, "Which choice completes the text?");

    const student = await getJson(studentServer.baseUrl, path);
    assert.equal(student.response.status, 200, JSON.stringify(student.body));
    assert.equal(student.body.id, diagnostic!.id);
    assert.equal(
      student.body.title,
      "SAT diagnostic (1 clean questions) — Taito’s SAT Session with Eunice",
    );
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

test("student and admin preview lists hide Xavier capability quizzes and rewrite short diagnostic titles", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;

  await db
    .update(sessionsTable)
    .set({ title: "SAT capability test — Xavier" })
    .where(eq(sessionsTable.id, fixture.sessionIds.otherStudentSat));
  const [capability] = await db
    .insert(assignmentsTable)
    .values({
      courseId: fixture.courseId,
      sessionId: fixture.sessionIds.otherStudentSat,
      deliveryPhase: "before_session",
      title: "60-minute SAT pre-work — SAT capability test — Xavier",
      subject: "SAT",
      instructions: "Xavier capability-test scaffolding.",
      status: "published",
      timeLimitMinutes: 60,
      maxAttempts: 1,
    })
    .returning({ id: assignmentsTable.id });
  const [question] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Reading and Writing",
      skill: "Transitions",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: "Which choice completes the text?",
      choices: [
        { id: "a", label: "A", text: "however" },
        { id: "b", label: "B", text: "therefore" },
        { id: "c", label: "C", text: "meanwhile" },
        { id: "d", label: "D", text: "instead" },
      ],
      correctAnswer: "a",
      explanation: "Contrast.",
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
      title: "Full-length SAT diagnostic — Student SAT session",
      subject: "SAT",
      instructions: "Complete this full-length College Board SAT practice test.",
      status: "published",
      timeLimitMinutes: 120,
      maxAttempts: 1,
    })
    .returning({ id: assignmentsTable.id });
  await db.insert(assignmentQuestionsTable).values([
    {
      assignmentId: diagnostic!.id,
      questionId: question!.id,
      position: 0,
      predictionFirst: false,
    },
  ]);

  try {
    adminServer = await startServer(fixture.administrator);
    studentServer = await startServer(fixture.student);

    const studentList = await getJson(studentServer.baseUrl, "/api/assignments");
    assert.equal(studentList.response.status, 200, JSON.stringify(studentList.body));
    const listed = studentList.body as Array<{
      id: string;
      title: string;
      questionCount: number;
    }>;
    assert.equal(
      listed.some((item) => item.id === capability!.id || item.title.includes("SAT capability test — Xavier")),
      false,
      JSON.stringify(listed),
    );
    const live = listed.find((item) => item.id === diagnostic!.id);
    assert.ok(live, JSON.stringify(listed));
    assert.equal(live!.questionCount, 1);
    assert.equal(
      live!.title,
      "SAT diagnostic (1 clean questions) — Student SAT session",
    );
    assert.equal(live!.title.includes("Full-length"), false);

    const hidden = await getJson(
      studentServer.baseUrl,
      `/api/assignments/${capability!.id}`,
    );
    assert.equal(hidden.response.status, 404);

    const studentDashboard = await getJson(studentServer.baseUrl, "/api/dashboard");
    assert.equal(studentDashboard.response.status, 200);
    const dashboardAssignments = studentDashboard.body.assignments as Array<{
      id: string;
      title: string;
    }>;
    assert.equal(
      dashboardAssignments.some(
        (item) => item.id === capability!.id || item.title.includes("SAT capability test — Xavier"),
      ),
      false,
      JSON.stringify(dashboardAssignments),
    );
    assert.equal(
      dashboardAssignments.find((item) => item.id === diagnostic!.id)?.title,
      "SAT diagnostic (1 clean questions) — Student SAT session",
    );
    const satSession = (
      studentDashboard.body.curriculumSessions as Array<{
        id: string;
        preparation?: { id?: string; title?: string } | null;
      }>
    ).find((session) => session.id === fixture.sessionIds.studentSat);
    if (satSession?.preparation?.id === diagnostic!.id) {
      assert.equal(
        satSession.preparation.title,
        "SAT diagnostic (1 clean questions) — Student SAT session",
      );
    }

    const preview = await getJson(
      adminServer.baseUrl,
      `/api/admin/clients/${fixture.student.id}/dashboard`,
    );
    assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
    const previewAssignments = preview.body.assignments as Array<{
      id: string;
      title: string;
    }>;
    assert.equal(
      previewAssignments.some(
        (item) => item.id === capability!.id || item.title.includes("SAT capability test — Xavier"),
      ),
      false,
      JSON.stringify(previewAssignments),
    );
    assert.equal(
      previewAssignments.find((item) => item.id === diagnostic!.id)?.title,
      "SAT diagnostic (1 clean questions) — Student SAT session",
    );

    const adminOpen = await getJson(
      adminServer.baseUrl,
      `/api/assignments/${diagnostic!.id}`,
    );
    assert.equal(adminOpen.response.status, 200);
    assert.equal(
      adminOpen.body.title,
      "SAT diagnostic (1 clean questions) — Student SAT session",
    );
  } finally {
    await studentServer?.close();
    await adminServer?.close();
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    if (capability?.id) {
      await db
        .delete(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, capability.id));
      await db.delete(assignmentsTable).where(eq(assignmentsTable.id, capability.id));
    }
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
