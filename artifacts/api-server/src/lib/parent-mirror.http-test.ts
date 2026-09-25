import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  auditLogsTable,
  db,
  loginActivityTable,
  portalAccessGrantsTable,
  sessionArtifactsTable,
  usersTable,
  viewerLinksTable,
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
import {
  RYO_PARENT_CLERK_USER_ID,
  RYO_PARENT_EMAIL,
  ensureRyoTaitoParentMirror,
} from "./parent-mirror";
import { TAITO_STUDENT_EMAIL } from "./session-schedule";
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
        sessionId: `parent-mirror-http-test:${user.id}:${randomUUID()}`,
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

async function sendJson(
  baseUrl: string,
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

const allowlistKeys = [
  "ACCEPTED_ADMIN_CLERK_USER_IDS",
  "ACCEPTED_SAT_TUTOR_CLERK_USER_IDS",
  "ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS",
  "ACCEPTED_TUTOR_CLERK_USER_IDS",
  "ACCEPTED_STUDENT_CLERK_USER_IDS",
  "ACCEPTED_VIEWER_CLERK_USER_IDS",
  "ACCEPTED_ADMIN_EMAILS",
  "ACCEPTED_SAT_TUTOR_EMAILS",
  "ACCEPTED_ENGLISH_TUTOR_EMAILS",
  "ACCEPTED_TUTOR_EMAILS",
  "ACCEPTED_STUDENT_EMAILS",
  "ACCEPTED_VIEWER_EMAILS",
] as const;

function snapshotAllowlists() {
  return Object.fromEntries(
    allowlistKeys.map((key) => [key, process.env[key]]),
  ) as Record<(typeof allowlistKeys)[number], string | undefined>;
}

function restoreAllowlists(
  snapshot: Record<(typeof allowlistKeys)[number], string | undefined>,
) {
  for (const key of allowlistKeys) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test("parent viewer database grant mirrors one student and blocks writes", async () => {
  const snapshot = snapshotAllowlists();
  for (const key of allowlistKeys) delete process.env[key];
  const fixture = await createDashboardRoleFixture();
  await db.insert(portalAccessGrantsTable).values({
    email: fixture.viewer.email,
    clerkUserId: fixture.viewer.clerkUserId,
    displayName: fixture.viewer.displayName,
    roleCategory: "viewer",
    linkedStudentEmail: fixture.student.email,
    active: true,
    userId: fixture.viewer.id,
  });
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;
  let viewerServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    viewerServer = await startServer(fixture.viewer);
    const me = await getJson(viewerServer.baseUrl, "/api/me");
    assert.equal(me.response.status, 200);
    assert.equal(me.body.role, "viewer");
    assert.equal(me.body.email, fixture.viewer.email);
    assert.equal(me.body.viewingAs.email, fixture.student.email);
    assert.equal(me.body.viewingAs.id, fixture.student.id);
    assert.notEqual(me.body.viewingAs.id, fixture.otherStudent.id);

    const dashboard = await getJson(viewerServer.baseUrl, "/api/dashboard");
    assert.equal(dashboard.response.status, 200);
    const serialized = JSON.stringify(dashboard.body);
    assert.equal(serialized.includes(fixture.sessionIds.studentSat), true);
    assert.equal(serialized.includes(fixture.sessionIds.studentEnglish), true);
    assert.equal(serialized.includes(fixture.sessionIds.otherStudentSat), false);
    assert.equal(serialized.includes(fixture.otherStudent.displayName), false);
    assert.equal(dashboard.body.credits.readOnly, true);

    const hidden = await getJson(
      viewerServer.baseUrl,
      `/api/sessions/${fixture.sessionIds.otherStudentSat}`,
    );
    assert.equal(hidden.response.status, 404);
    const visible = await getJson(
      viewerServer.baseUrl,
      `/api/sessions/${fixture.sessionIds.studentSat}`,
    );
    assert.equal(visible.response.status, 200);

    const mutation = await sendJson(viewerServer.baseUrl, "/api/me", "PATCH", {
      displayName: "Should not save",
    });
    assert.equal(mutation.response.status, 403);
    assert.equal(mutation.body.code, "VIEW_ONLY");

    studentServer = await startServer(fixture.student);
    const studentMe = await getJson(studentServer.baseUrl, "/api/me");
    assert.equal(studentMe.response.status, 200);
    assert.equal(studentMe.body.role, "student");
    assert.equal(studentMe.body.viewingAs, null);
    const studentDashboard = await getJson(studentServer.baseUrl, "/api/dashboard");
    assert.equal(
      JSON.stringify(studentDashboard.body).includes(fixture.sessionIds.otherStudentSat),
      false,
    );
  } finally {
    await viewerServer?.close();
    await studentServer?.close();
    await db
      .delete(portalAccessGrantsTable)
      .where(eq(portalAccessGrantsTable.email, fixture.viewer.email));
    await db.delete(sessionArtifactsTable).where(
      inArray(sessionArtifactsTable.createdBy, [
        fixture.viewer.id,
        fixture.student.id,
        fixture.otherStudent.id,
        fixture.administrator.id,
        fixture.satTutor.id,
        fixture.englishTutor.id,
      ]),
    );
    restoreAllowlists(snapshot);
    await fixture.cleanup();
  }
});

test("People can provision a parent viewer without a Clerk invitation", async () => {
  const snapshot = snapshotAllowlists();
  for (const key of allowlistKeys) delete process.env[key];
  const fixture = await createDashboardRoleFixture();
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  const parentEmail = `parent-${randomUUID()}@example.com`;
  const createdClerkId = `user_parent_${randomUUID().replace(/-/g, "")}`;
  const calls = {
    createUser: [] as Array<Record<string, unknown>>,
    invitations: [] as unknown[],
  };
  setProductionClerkUsersClientForTests({
    async getUser() {
      throw Object.assign(new Error("not found"), {
        status: 404,
        errors: [{ code: "resource_not_found" }],
      });
    },
    async getUserList() {
      return { data: [] };
    },
    async createUser(params) {
      calls.createUser.push(params);
      return {
        id: createdClerkId,
        primaryEmailAddress: {
          id: `idn_${createdClerkId}`,
          emailAddress: params.emailAddress[0],
          verification: { status: "unverified" },
        },
        emailAddresses: [
          {
            id: `idn_${createdClerkId}`,
            emailAddress: params.emailAddress[0]!,
            verification: { status: "unverified" },
          },
        ],
      };
    },
    async updateEmailAddress() {
      return {};
    },
  });
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let parentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    adminServer = await startServer(fixture.administrator);
    const created = await sendJson(
      adminServer.baseUrl,
      "/api/admin/access-grants",
      "POST",
      {
        email: parentEmail,
        displayName: "Parent Example",
        roleCategory: "viewer",
        linkedStudentEmail: fixture.student.email,
      },
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.roleCategory, "viewer");
    assert.equal(created.body.role, "viewer");
    assert.equal(created.body.linkedStudentEmail, fixture.student.email);
    assert.equal(created.body.subject, `student:${fixture.student.email}`);
    assert.equal(calls.invitations.length, 0);
    assert.equal(JSON.stringify(calls.createUser).includes("invitation"), false);
    assert.equal(calls.createUser.length, 1);

    const [parent] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, parentEmail))
      .limit(1);
    assert.ok(parent);
    assert.equal(parent.role, "viewer");
    for (const key of allowlistKeys) delete process.env[key];
    parentServer = await startServer(parent);
    const me = await getJson(parentServer.baseUrl, "/api/me");
    assert.equal(me.response.status, 200);
    assert.equal(me.body.viewingAs.email, fixture.student.email);
    const hidden = await getJson(
      parentServer.baseUrl,
      `/api/sessions/${fixture.sessionIds.otherStudentSat}`,
    );
    assert.equal(hidden.response.status, 404);
  } finally {
    setProductionClerkUsersClientForTests(null);
    await adminServer?.close();
    await parentServer?.close();
    const [parent] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, parentEmail))
      .limit(1);
    if (parent) {
      await db.delete(viewerLinksTable).where(eq(viewerLinksTable.viewerUserId, parent.id));
      await db.delete(loginActivityTable).where(eq(loginActivityTable.userId, parent.id));
      await db.delete(auditLogsTable).where(eq(auditLogsTable.actorUserId, parent.id));
    }
    await db
      .delete(portalAccessGrantsTable)
      .where(eq(portalAccessGrantsTable.email, parentEmail));
    if (parent) {
      await db.delete(usersTable).where(eq(usersTable.id, parent.id));
    }
    restoreAllowlists(snapshot);
    await fixture.cleanup();
  }
});

test("startup upsert keeps the Ryo to Taito grant without sending an invitation", async () => {
  const result = await ensureRyoTaitoParentMirror();
  assert.equal(result.grantEmail, RYO_PARENT_EMAIL);
  const [grant] = await db
    .select()
    .from(portalAccessGrantsTable)
    .where(eq(portalAccessGrantsTable.email, RYO_PARENT_EMAIL))
    .limit(1);
  assert.ok(grant);
  assert.equal(grant.roleCategory, "viewer");
  assert.equal(grant.linkedStudentEmail, TAITO_STUDENT_EMAIL);
  assert.equal(grant.clerkUserId, RYO_PARENT_CLERK_USER_ID);
  assert.equal(grant.active, true);
  const [taito] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, TAITO_STUDENT_EMAIL))
    .limit(1);
  if (taito?.role === "student") {
    const [ryo] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, RYO_PARENT_EMAIL))
      .limit(1);
    if (ryo) {
      const links = await db
        .select()
        .from(viewerLinksTable)
        .where(eq(viewerLinksTable.viewerUserId, ryo.id));
      const active = links.filter((link) => link.active);
      assert.equal(active.length, 1);
      assert.equal(active[0]?.studentUserId, taito.id);
      assert.equal(
        links.some(
          (link) => link.active && link.studentUserId !== taito.id,
        ),
        false,
      );
    }
  }
});
