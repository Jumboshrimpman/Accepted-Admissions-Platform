import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { db, usersTable, type AppUser } from "@workspace/db";
import { eq } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import platformRouter from "../routes/platform";

function testAuthMiddleware(user: AppUser, claimsName?: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = Object.assign(
      () => ({
        tokenType: "session_token",
        userId: user.clerkUserId,
        sessionClaims: {
          userId: user.clerkUserId,
          email: user.email,
          name: claimsName ?? user.displayName,
        },
        sessionId: `user-profile-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startServer(user: AppUser, claimsName?: string) {
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use(testAuthMiddleware(user, claimsName));
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

async function patchJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

async function createStudent(displayName: string) {
  const suffix = randomUUID();
  const [student] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `user-profile-student:${suffix}`,
      email: `user-profile-student-${suffix}@example.invalid`,
      displayName,
      role: "student",
    })
    .returning();
  return student!;
}

test("GET /me shows the Clerk name instead of Accepted Admissions User", async () => {
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const student = await createStudent("Accepted Admissions user");
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = student.clerkUserId;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer(student, "Sama Noori");
    const me = await getJson(server.baseUrl, "/api/me");
    assert.equal(me.response.status, 200);
    assert.equal(me.body.displayName, "Sama Noori");
    assert.notEqual(me.body.displayName, "Accepted Admissions User");
    assert.notEqual(me.body.displayName, "Accepted Admissions user");

    const [reloaded] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, student.id))
      .limit(1);
    assert.equal(reloaded?.displayName, "Sama Noori");
  } finally {
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    await server?.close();
  }
});

test("PATCH /me persists title and picture for the signed-in user only", async () => {
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const student = await createStudent("Michelle Chen");
  const other = await createStudent("Other Student");
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = [
    student.clerkUserId,
    other.clerkUserId,
  ].join(",");
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let otherServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let reloadedServer: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    studentServer = await startServer(student);
    const rejected = await patchJson(studentServer.baseUrl, "/api/me", {
      avatarUrl: "javascript:alert(1)",
    });
    assert.equal(rejected.response.status, 400);

    const updated = await patchJson(studentServer.baseUrl, "/api/me", {
      id: other.id,
      displayName: "Michelle Chen",
      title: "SAT Student",
      avatarUrl: "https://example.com/michelle.jpg",
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.displayName, "Michelle Chen");
    assert.equal(updated.body.title, "SAT Student");
    assert.equal(updated.body.avatarUrl, "https://example.com/michelle.jpg");

    const me = await getJson(studentServer.baseUrl, "/api/me");
    assert.equal(me.response.status, 200);
    assert.equal(me.body.title, "SAT Student");
    assert.equal(me.body.avatarUrl, "https://example.com/michelle.jpg");

    const [persisted] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, student.id))
      .limit(1);
    assert.equal(persisted?.title, "SAT Student");
    assert.equal(persisted?.avatarUrl, "https://example.com/michelle.jpg");

    const [untouched] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, other.id))
      .limit(1);
    assert.equal(untouched?.title ?? null, null);
    assert.equal(untouched?.avatarUrl ?? null, null);
    assert.equal(untouched?.displayName, "Other Student");

    otherServer = await startServer(other);
    const otherMe = await getJson(otherServer.baseUrl, "/api/me");
    assert.equal(otherMe.body.displayName, "Other Student");
    assert.equal(otherMe.body.title ?? null, null);
    assert.equal(otherMe.body.avatarUrl ?? null, null);

    reloadedServer = await startServer(persisted!);
    const reloaded = await getJson(reloadedServer.baseUrl, "/api/me");
    assert.equal(reloaded.response.status, 200);
    assert.equal(reloaded.body.displayName, "Michelle Chen");
    assert.equal(reloaded.body.title, "SAT Student");
    assert.equal(reloaded.body.avatarUrl, "https://example.com/michelle.jpg");
  } finally {
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    await studentServer?.close();
    await otherServer?.close();
    await reloadedServer?.close();
  }
});
