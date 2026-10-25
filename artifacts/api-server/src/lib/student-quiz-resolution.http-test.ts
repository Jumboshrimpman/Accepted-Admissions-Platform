import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { AppUser } from "@workspace/db";
import express, { type NextFunction, type Request, type Response } from "express";
import { createDashboardRoleFixture } from "./dashboard-fixtures.ts";
import platformRouter from "../routes/platform.ts";

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
        sessionId: `quiz-resolution-http-test:${user.id}`,
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

async function send(baseUrl: string, method: "POST" | "DELETE", assignmentId: string) {
  const response = await fetch(`${baseUrl}/api/assignments/${assignmentId}/resolution`, {
    method,
  });
  return {
    status: response.status,
    body: (await response.json()) as { error?: string },
  };
}

test("resolve and undo reject other roles and missing quizzes", async (t) => {
  if (!process.env.DATABASE_URL?.trim()) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const fixture = await createDashboardRoleFixture();
  const previous = {
    ACCEPTED_ADMIN_CLERK_USER_IDS: process.env.ACCEPTED_ADMIN_CLERK_USER_IDS,
    ACCEPTED_SAT_TUTOR_CLERK_USER_IDS: process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS,
    ACCEPTED_STUDENT_CLERK_USER_IDS: process.env.ACCEPTED_STUDENT_CLERK_USER_IDS,
    ACCEPTED_VIEWER_CLERK_USER_IDS: process.env.ACCEPTED_VIEWER_CLERK_USER_IDS,
  };
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId ?? "";
  process.env.ACCEPTED_SAT_TUTOR_CLERK_USER_IDS = fixture.satTutor.clerkUserId ?? "";
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId ?? "";
  process.env.ACCEPTED_VIEWER_CLERK_USER_IDS = fixture.viewer.clerkUserId ?? "";
  const servers = [];
  try {
    const student = await startServer(fixture.student);
    const administrator = await startServer(fixture.administrator);
    const tutor = await startServer(fixture.satTutor);
    const viewer = await startServer(fixture.viewer);
    servers.push(student, administrator, tutor, viewer);
    const missingId = randomUUID();

    for (const method of ["POST", "DELETE"] as const) {
      for (const [server, label, message] of [
        [administrator, "administrator", /Only the student can resolve a quiz/],
        [tutor, "tutor", /Only the student can resolve a quiz/],
        [viewer, "viewer", /view-only and cannot modify portal data/],
      ] as const) {
        const denied = await send(server.baseUrl, method, fixture.assignmentIds.published);
        assert.equal(denied.status, 403, `${label} ${method}`);
        assert.match(denied.body.error ?? "", message, `${label} ${method}`);
      }

      const missing = await send(student.baseUrl, method, missingId);
      assert.equal(missing.status, 404, `student ${method} missing`);
      assert.equal(missing.body.error, "Assignment not found");

      const draft = await send(student.baseUrl, method, fixture.assignmentIds.draft);
      assert.equal(draft.status, 404, `student ${method} draft`);
      assert.equal(draft.body.error, "Assignment not found");
    }
  } finally {
    for (const server of servers) await server.close();
    await fixture.cleanup();
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
