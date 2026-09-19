import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  clientRequestsTable,
  db,
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
import { setTransactionalEmailTestTransport } from "./transactional-email";

function guidancePayload(overrides: Record<string, unknown> = {}) {
  return {
    guardianName: "Jordan Parent",
    studentName: "Alex Student",
    email: `guidance-${randomUUID()}@example.invalid`,
    phone: "4155551212",
    gradeOrGraduationYear: "11th grade",
    currentSchool: "Lincoln High",
    serviceRequested: "Private SAT tutoring",
    currentSatTotal: "1280",
    goals: "Raise the math score before October.",
    schedulingAvailability: "Weeknights after 6pm PT",
    referralSource: "School counselor",
    consentToContact: true,
    privacyAcknowledged: true,
    sourcePage: "/client-request",
    ...overrides,
  };
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
        sessionId: `guidance-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startPublicServer(user?: AppUser) {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  if (user) app.use(testAuthMiddleware(user));
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

async function postGuidance(baseUrl: string, body: unknown, forwardedFor = `203.0.113.${Math.floor(Math.random() * 200) + 1}`) {
  const response = await fetch(`${baseUrl}/api/public/client-requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": forwardedFor,
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function deleteByEmail(email: string) {
  await db.delete(clientRequestsTable).where(eq(clientRequestsTable.email, email));
}

test("public guidance submit succeeds without RESEND_API_KEY and stores the row", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  setTransactionalEmailTestTransport(undefined);
  const payload = guidancePayload();
  const server = await startPublicServer();
  try {
    const posted = await postGuidance(server.baseUrl, payload);
    assert.equal(posted.response.status, 201, JSON.stringify(posted.body));
    assert.equal(posted.body.status, "received");
    assert.notEqual(posted.body.code, "EMAIL_DELIVERY_UNAVAILABLE");
    assert.match(String(posted.body.message), /we received your request/i);
    const [saved] = await db
      .select({
        id: clientRequestsTable.id,
        studentName: clientRequestsTable.studentName,
        email: clientRequestsTable.email,
        status: clientRequestsTable.status,
      })
      .from(clientRequestsTable)
      .where(eq(clientRequestsTable.email, String(payload.email)));
    assert.equal(saved?.id, posted.body.id);
    assert.equal(saved?.studentName, "Alex Student");
    assert.equal(saved?.status, "new");
  } finally {
    await server.close();
    await deleteByEmail(String(payload.email));
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});

test("public guidance submit keeps the row when admin email fails", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  let sendAttempts = 0;
  setTransactionalEmailTestTransport(async () => {
    sendAttempts += 1;
    return { status: "failed", error: "domain not verified" };
  });
  const payload = guidancePayload({
    currentReadingWriting: "640",
    currentMath: "640",
  });
  const server = await startPublicServer();
  try {
    const posted = await postGuidance(server.baseUrl, payload);
    assert.equal(posted.response.status, 201, JSON.stringify(posted.body));
    assert.equal(posted.body.status, "received");
    assert.equal(sendAttempts, 1);
    const leftover = await db
      .select({ id: clientRequestsTable.id })
      .from(clientRequestsTable)
      .where(eq(clientRequestsTable.email, String(payload.email)));
    assert.equal(leftover.length, 1);
    assert.equal(leftover[0]?.id, posted.body.id);
  } finally {
    setTransactionalEmailTestTransport(undefined);
    await server.close();
    await deleteByEmail(String(payload.email));
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});

test("public guidance submit still emails the admin inbox as best-effort after save", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const payload = guidancePayload({
    currentReadingWriting: "640",
    currentMath: "640",
    targetSatScore: "1450",
    plannedTestDate: "2026-10-03",
  });
  let mailedTo: string | string[] | undefined;
  let replyTo: string | undefined;
  setTransactionalEmailTestTransport(async (input) => {
    mailedTo = input.to;
    replyTo = input.replyTo;
    assert.match(input.subject, /Alex Student/);
    assert.match(input.text, /Lincoln High/);
    assert.equal(input.required, false);
    return { status: "sent", id: "email_http_1" };
  });
  const server = await startPublicServer();
  try {
    const posted = await postGuidance(server.baseUrl, payload);
    assert.equal(posted.response.status, 201, JSON.stringify(posted.body));
    assert.equal(posted.body.status, "received");
    assert.equal(mailedTo, "admin@acceptedadmissions.org");
    assert.equal(replyTo, payload.email);
    const [saved] = await db
      .select({
        id: clientRequestsTable.id,
        studentName: clientRequestsTable.studentName,
        email: clientRequestsTable.email,
      })
      .from(clientRequestsTable)
      .where(eq(clientRequestsTable.email, String(payload.email)));
    assert.equal(saved?.id, posted.body.id);
    assert.equal(saved?.studentName, "Alex Student");
  } finally {
    setTransactionalEmailTestTransport(undefined);
    await server.close();
    await deleteByEmail(String(payload.email));
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});

test("admin overview lists a guidance submit that succeeded without RESEND_API_KEY", async () => {
  const previous = process.env.RESEND_API_KEY;
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  delete process.env.RESEND_API_KEY;
  setTransactionalEmailTestTransport(undefined);
  const fixture = await createDashboardRoleFixture();
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  const payload = guidancePayload({
    studentName: "Portal First Student",
    goals: "See this row in the admin portal without mail.",
  });
  const server = await startPublicServer(fixture.administrator);
  try {
    const posted = await postGuidance(server.baseUrl, payload);
    assert.equal(posted.response.status, 201, JSON.stringify(posted.body));

    const overviewResponse = await fetch(`${server.baseUrl}/api/admin/overview`);
    const overview = (await overviewResponse.json()) as {
      guidanceRequests?: Array<{
        id: string;
        studentName: string;
        email: string;
        goals: string;
        serviceRequested: string;
        status: string;
      }>;
    };
    assert.equal(overviewResponse.status, 200);
    const listed = overview.guidanceRequests?.find((request) => request.id === posted.body.id);
    assert.ok(listed, "admin overview should include the saved guidance request");
    assert.equal(listed.studentName, "Portal First Student");
    assert.equal(listed.email, payload.email);
    assert.equal(listed.goals, "See this row in the admin portal without mail.");
    assert.equal(listed.serviceRequested, "Private SAT tutoring");
    assert.equal(listed.status, "new");
  } finally {
    await server.close();
    await deleteByEmail(String(payload.email));
    await fixture.cleanup();
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
  }
});
