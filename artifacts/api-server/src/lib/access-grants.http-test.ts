import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  db,
  portalAccessGrantsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { setProductionClerkUsersClientForTests } from "./clerk-production-users";
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
        sessionId: `access-grants-http-test:${user.id}`,
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

type MockUser = {
  id: string;
  primaryEmailAddress?: {
    id?: string;
    emailAddress?: string;
    verification?: { status?: string | null } | null;
  } | null;
  emailAddresses?: Array<{
    id: string;
    emailAddress: string;
    verification?: { status?: string | null } | null;
  }>;
};

function notFoundError() {
  return Object.assign(new Error("not found"), {
    status: 404,
    errors: [{ code: "resource_not_found" }],
  });
}

function installMockClerk(options: {
  usersById?: Record<string, MockUser>;
  usersByEmail?: Record<string, MockUser>;
  createdId: string;
}) {
  const calls = {
    getUser: [] as string[],
    getUserList: [] as string[][],
    createUser: [] as Array<Record<string, unknown>>,
    updateEmailAddress: [] as Array<{ id: string; verified: boolean }>,
    invitations: [] as unknown[],
  };
  const usersById = { ...(options.usersById ?? {}) };
  const usersByEmail = { ...(options.usersByEmail ?? {}) };

  setProductionClerkUsersClientForTests({
    async getUser(userId) {
      calls.getUser.push(userId);
      const user = usersById[userId];
      if (!user) throw notFoundError();
      return user;
    },
    async getUserList(params) {
      calls.getUserList.push(params.emailAddress);
      const matches = params.emailAddress
        .map((email) => usersByEmail[email.toLowerCase()])
        .filter((user): user is MockUser => Boolean(user));
      return { data: matches };
    },
    async createUser(params) {
      calls.createUser.push(params);
      const email = params.emailAddress[0]!;
      const created: MockUser = {
        id: options.createdId,
        primaryEmailAddress: {
          id: `idn_${options.createdId}`,
          emailAddress: email,
          verification: { status: "unverified" },
        },
        emailAddresses: [
          {
            id: `idn_${options.createdId}`,
            emailAddress: email,
            verification: { status: "unverified" },
          },
        ],
      };
      usersById[created.id] = created;
      usersByEmail[email.toLowerCase()] = created;
      return created;
    },
    async updateEmailAddress(emailAddressId, params) {
      calls.updateEmailAddress.push({
        id: emailAddressId,
        verified: params.verified,
      });
      return {};
    },
  });

  return calls;
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

async function createAdministrator() {
  const suffix = randomUUID();
  const [administrator] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `access-grant-admin:${suffix}`,
      email: `access-grant-admin-${suffix}@example.invalid`,
      displayName: "Access Grant Administrator",
      role: "administrator",
    })
    .returning();
  return administrator!;
}

test("provisions a student by email, creates Production Clerk user, and /api/me works without env allowlist", async () => {
  const snapshot = snapshotAllowlists();
  const administrator = await createAdministrator();
  const email = `sama-${randomUUID()}@gmail.com`;
  const productionId = `user_prod_${randomUUID()}`;
  const calls = installMockClerk({ createdId: productionId });
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator.clerkUserId;
  delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  delete process.env.ACCEPTED_STUDENT_EMAILS;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    adminServer = await startServer(administrator);
    const created = await postJson(
      adminServer.baseUrl,
      "/api/admin/access-grants",
      {
        email,
        displayName: "Sama Student",
        roleCategory: "student",
      },
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.clerkUserId, productionId);
    assert.equal(created.body.role, "student");
    assert.equal(created.body.warning ?? null, null);
    assert.equal(calls.createUser.length, 1);
    assert.equal(calls.invitations.length, 0);
    assert.deepEqual(calls.createUser[0]?.emailAddress, [email]);
    assert.equal(calls.createUser[0]?.skipPasswordRequirement, true);
    assert.ok(!JSON.stringify(calls.createUser).includes("invitation"));

    const [grant] = await db
      .select()
      .from(portalAccessGrantsTable)
      .where(eq(portalAccessGrantsTable.email, email))
      .limit(1);
    assert.equal(grant?.clerkUserId, productionId);

    const [student] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, productionId))
      .limit(1);
    assert.ok(student);
    assert.equal(student!.role, "student");

    studentServer = await startServer(student!);
    const me = await getJson(studentServer.baseUrl, "/api/me");
    assert.equal(me.response.status, 200);
    assert.equal(me.body.email, email);
    assert.equal(me.body.role, "student");
  } finally {
    setProductionClerkUsersClientForTests(null);
    restoreAllowlists(snapshot);
    await adminServer?.close();
    await studentServer?.close();
  }
});

test("replaces a pasted foreign Clerk ID via email lookup/create and surfaces a warning", async () => {
  const snapshot = snapshotAllowlists();
  const administrator = await createAdministrator();
  const email = `foreign-${randomUUID()}@example.com`;
  const productionId = `user_prod_${randomUUID()}`;
  const foreignId = `user_dev_${randomUUID()}`;
  const calls = installMockClerk({ createdId: productionId });
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator.clerkUserId;
  delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  delete process.env.ACCEPTED_STUDENT_EMAILS;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    adminServer = await startServer(administrator);
    const created = await postJson(
      adminServer.baseUrl,
      "/api/admin/access-grants",
      {
        email,
        displayName: "Foreign Id Student",
        roleCategory: "student",
        clerkUserId: foreignId,
      },
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.clerkUserId, productionId);
    assert.notEqual(created.body.clerkUserId, foreignId);
    assert.match(created.body.warning ?? "", /not found in the Production Clerk instance/);
    assert.deepEqual(calls.getUser, [foreignId]);
    assert.equal(calls.createUser.length, 1);
    assert.equal(calls.invitations.length, 0);

    const [student] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, productionId))
      .limit(1);
    assert.ok(student);
    studentServer = await startServer(student!);
    const me = await getJson(studentServer.baseUrl, "/api/me");
    assert.equal(me.response.status, 200);
    assert.equal(me.body.role, "student");
  } finally {
    setProductionClerkUsersClientForTests(null);
    restoreAllowlists(snapshot);
    await adminServer?.close();
    await studentServer?.close();
  }
});

test("does not send Clerk invitations when provisioning tutors or students", async () => {
  const snapshot = snapshotAllowlists();
  const administrator = await createAdministrator();
  const email = `tutor-${randomUUID()}@example.com`;
  const productionId = `user_prod_${randomUUID()}`;
  const calls = installMockClerk({ createdId: productionId });
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator.clerkUserId;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    adminServer = await startServer(administrator);
    const created = await postJson(
      adminServer.baseUrl,
      "/api/admin/access-grants",
      {
        email,
        displayName: "SAT Tutor",
        roleCategory: "sat_tutor",
      },
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.roleCategory, "sat_tutor");
    assert.equal(calls.invitations.length, 0);
    assert.equal(
      JSON.stringify(calls.createUser).includes("invitation"),
      false,
    );
  } finally {
    setProductionClerkUsersClientForTests(null);
    restoreAllowlists(snapshot);
    await adminServer?.close();
  }
});

test("administrator and viewer remain env-only and cannot be provisioned from People", async () => {
  const snapshot = snapshotAllowlists();
  const suffix = randomUUID();
  const [administrator] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `env-admin:${suffix}`,
      email: `env-admin-${suffix}@example.invalid`,
      displayName: "Env Administrator",
      role: "administrator",
    })
    .returning();
  const [unlistedAdmin] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `unlisted-admin:${suffix}`,
      email: `unlisted-admin-${suffix}@example.invalid`,
      displayName: "Unlisted Administrator",
      role: "administrator",
    })
    .returning();
  const [unlistedViewer] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `unlisted-viewer:${suffix}`,
      email: `unlisted-viewer-${suffix}@example.invalid`,
      displayName: "Unlisted Viewer",
      role: "viewer",
    })
    .returning();

  for (const key of allowlistKeys) delete process.env[key];
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator!.clerkUserId;
  const clerkUser = (
    user: AppUser,
  ): {
    id: string;
    primaryEmailAddress: {
      id: string;
      emailAddress: string;
      verification: { status: "verified" };
    };
    emailAddresses: Array<{
      id: string;
      emailAddress: string;
      verification: { status: "verified" };
    }>;
  } => ({
    id: user.clerkUserId,
    primaryEmailAddress: {
      id: `idn_${user.id}`,
      emailAddress: user.email,
      verification: { status: "verified" },
    },
    emailAddresses: [
      {
        id: `idn_${user.id}`,
        emailAddress: user.email,
        verification: { status: "verified" },
      },
    ],
  });
  const calls = installMockClerk({
    createdId: `user_prod_${suffix}`,
    usersById: {
      [administrator!.clerkUserId]: clerkUser(administrator!),
      [unlistedAdmin!.clerkUserId]: clerkUser(unlistedAdmin!),
      [unlistedViewer!.clerkUserId]: clerkUser(unlistedViewer!),
    },
    usersByEmail: {
      [administrator!.email]: clerkUser(administrator!),
      [unlistedAdmin!.email]: clerkUser(unlistedAdmin!),
      [unlistedViewer!.email]: clerkUser(unlistedViewer!),
    },
  });
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let unlistedAdminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let unlistedViewerServer: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    adminServer = await startServer(administrator!);
    const rejectedAdmin = await postJson(
      adminServer.baseUrl,
      "/api/admin/access-grants",
      {
        email: `cannot-admin-${suffix}@example.com`,
        displayName: "Cannot Admin",
        roleCategory: "administrator",
      },
    );
    assert.equal(rejectedAdmin.response.status, 400);

    const rejectedViewer = await postJson(
      adminServer.baseUrl,
      "/api/admin/access-grants",
      {
        email: `cannot-viewer-${suffix}@example.com`,
        displayName: "Cannot Viewer",
        roleCategory: "viewer",
      },
    );
    assert.equal(rejectedViewer.response.status, 400);
    assert.equal(calls.createUser.length, 0);

    const allowed = await getJson(adminServer.baseUrl, "/api/me");
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.body.role, "administrator");

    unlistedAdminServer = await startServer(unlistedAdmin!);
    const deniedAdmin = await getJson(unlistedAdminServer.baseUrl, "/api/me");
    assert.equal(deniedAdmin.response.status, 403);
    assert.equal(deniedAdmin.body.code, "IDENTITY_NOT_PROVISIONED");

    unlistedViewerServer = await startServer(unlistedViewer!);
    const deniedViewer = await getJson(unlistedViewerServer.baseUrl, "/api/me");
    assert.equal(deniedViewer.response.status, 403);
    assert.equal(deniedViewer.body.code, "IDENTITY_NOT_PROVISIONED");
  } finally {
    setProductionClerkUsersClientForTests(null);
    restoreAllowlists(snapshot);
    await adminServer?.close();
    await unlistedAdminServer?.close();
    await unlistedViewerServer?.close();
  }
});
