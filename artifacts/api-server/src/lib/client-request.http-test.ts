import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { clientRequestsTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import express from "express";
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

async function startPublicServer() {
  const app = express();
  app.use(express.json());
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

async function postGuidance(baseUrl: string, body: unknown) {
  const response = await fetch(`${baseUrl}/api/public/client-requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test("public guidance submit fails closed when email is not configured", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  setTransactionalEmailTestTransport(undefined);
  const payload = guidancePayload();
  const server = await startPublicServer();
  try {
    const posted = await postGuidance(server.baseUrl, payload);
    assert.equal(posted.response.status, 503, JSON.stringify(posted.body));
    assert.equal(posted.body.code, "EMAIL_DELIVERY_UNAVAILABLE");
    assert.match(String(posted.body.error), /email delivery is unavailable/i);
    const leftover = await db
      .select({ id: clientRequestsTable.id })
      .from(clientRequestsTable)
      .where(eq(clientRequestsTable.email, String(payload.email)));
    assert.equal(leftover.length, 0);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});

test("public guidance submit emails the admin inbox then stores the request", async () => {
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
    assert.equal(input.required, true);
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
    await db.delete(clientRequestsTable).where(eq(clientRequestsTable.email, String(payload.email)));
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});
