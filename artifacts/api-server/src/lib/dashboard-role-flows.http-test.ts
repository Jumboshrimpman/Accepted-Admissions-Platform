import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { AppUser } from "@workspace/db";
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
        sessionId: `dashboard-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startDashboardHttpServer(user: AppUser) {
  const app = express();
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

test("HTTP client dashboard preview is administrator-only, student-scoped, and privacy-safe", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  let administratorServer:
    | Awaited<ReturnType<typeof startDashboardHttpServer>>
    | undefined;
  let studentServer:
    | Awaited<ReturnType<typeof startDashboardHttpServer>>
    | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS =
    fixture.administrator.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;
  try {
    administratorServer = await startDashboardHttpServer(
      fixture.administrator,
    );
    studentServer = await startDashboardHttpServer(fixture.student);
    const previewPath = `/api/admin/clients/${fixture.student.id}/dashboard`;

    const forbidden = await getJson(studentServer.baseUrl, previewPath);
    assert.equal(forbidden.response.status, 403);
    assert.deepEqual(forbidden.body, { error: "Insufficient permission" });

    const malformed = await getJson(
      administratorServer.baseUrl,
      "/api/admin/clients/malformed-client-id/dashboard",
    );
    assert.equal(malformed.response.status, 400);
    assert.deepEqual(malformed.body, { error: "Invalid client ID" });

    for (const clientId of [randomUUID(), fixture.satTutor.id]) {
      const notFound = await getJson(
        administratorServer.baseUrl,
        `/api/admin/clients/${encodeURIComponent(clientId)}/dashboard`,
      );
      assert.equal(notFound.response.status, 404);
      assert.deepEqual(notFound.body, { error: "Client not found" });
    }

    const preview = await getJson(
      administratorServer.baseUrl,
      previewPath,
    );
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.adminPreview, true);
    assert.equal(preview.body.user.id, fixture.student.id);
    assert.equal(preview.body.user.displayName, fixture.student.displayName);
    assert.equal(preview.body.user.role, "student");
    assert.deepEqual(
      preview.body.upcomingSessions.map(
        (session: { id: string }) => session.id,
      ),
      [fixture.sessionIds.studentSat, fixture.sessionIds.studentEnglish],
    );

    const serializedPreview = JSON.stringify(preview.body);
    assert.equal(serializedPreview.includes(fixture.otherStudent.id), false);
    assert.equal(
      serializedPreview.includes(fixture.otherStudent.displayName),
      false,
    );
    assert.equal(
      serializedPreview.includes(fixture.sessionIds.otherStudentSat),
      false,
    );
    assert.equal(serializedPreview.includes("private-event:"), false);
    assert.equal(serializedPreview.includes("private-sat-room"), false);
    assert.equal(serializedPreview.includes("providerEventId"), false);
  } finally {
    await studentServer?.close();
    await administratorServer?.close();
    if (previousAdminIds === undefined) {
      delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    }
    if (previousStudentIds === undefined) {
      delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    }
    await fixture.cleanup();
  }
});