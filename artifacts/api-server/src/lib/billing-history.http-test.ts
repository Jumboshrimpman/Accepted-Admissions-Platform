import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  auditLogsTable,
  courseMembershipsTable,
  coursesTable,
  creditLedgerTable,
  db,
  loginActivityTable,
  paymentsTable,
  satProductsTable,
  sessionsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import platformRouter from "../routes/platform";
// @ts-expect-error Native Node test execution requires the source extension.
import { COLLEGE_CONSULTING_NIKA_SLUG } from "./college-consulting.ts";

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
        sessionId: `billing-history-http:${user.id}`,
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
  const body = (await response.json()) as Record<string, unknown>;
  return { response, body };
}

test("billing history is limited to the caller, with an empty list when nothing is stored", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for billing history HTTP coverage");
    return;
  }

  const suffix = randomUUID();
  const secretEmail = `billing-history-secret-${suffix}@example.invalid`;
  const secretCharge = `ch_billing_${suffix}`;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousAdmins = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const createdUserIds: string[] = [];
  let createdProductId: string | null = null;
  let createdCourseId: string | null = null;
  let ownerServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let otherServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let emptyServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;

  const createUser = async (role: AppUser["role"], displayName: string) => {
    const [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `billing-history-${role}:${suffix}:${displayName}`,
        email: `billing-history-${role}-${suffix}-${displayName.replace(/\s+/g, "-").toLowerCase()}@example.invalid`,
        displayName,
        role,
      })
      .returning();
    createdUserIds.push(user!.id);
    return user!;
  };

  try {
    const owner = await createUser("student", "Billing Owner");
    const other = await createUser("student", "Billing Other");
    const empty = await createUser("student", "Billing Empty");
    const admin = await createUser("administrator", "Billing Admin");
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = [owner.clerkUserId, other.clerkUserId, empty.clerkUserId].join(
      ",",
    );
    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = admin.clerkUserId;

    const [existingProduct] = await db
      .select({ id: satProductsTable.id })
      .from(satProductsTable)
      .where(eq(satProductsTable.slug, COLLEGE_CONSULTING_NIKA_SLUG))
      .limit(1);
    let productId = existingProduct?.id ?? null;
    if (!productId) {
      const [created] = await db
        .insert(satProductsTable)
        .values({
          slug: `billing-history-nika-${suffix}`,
          name: "College Consulting hour with Nika",
          description: "Billing history fixture",
          durationHours: 1,
          totalPriceCents: 10000,
          effectiveHourlyRateCents: 10000,
          active: false,
        })
        .returning({ id: satProductsTable.id });
      productId = created!.id;
      createdProductId = productId;
    }

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Billing history ${suffix}`,
        subject: "College Consulting",
        term: "Ongoing",
        status: "active",
      })
      .returning({ id: coursesTable.id });
    createdCourseId = course!.id;
    const [session] = await db
      .insert(sessionsTable)
      .values({
        courseId: course!.id,
        clientUserId: owner.id,
        dateTime: new Date("2026-10-20T16:00:00.000Z"),
        timezone: "America/New_York",
        subject: "College Consulting",
        title: "Neel’s College Consulting Session with Nika",
        status: "published",
        durationMinutes: 60,
        bookingStatus: "confirmed",
      })
      .returning({ id: sessionsTable.id });
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        clientUserId: owner.id,
        productId,
        amountCents: 10000,
        status: "paid",
        method: "stripe_checkout",
        paidAt: new Date("2026-10-20T16:00:00.000Z"),
        auditMetadata: {
          customerEmail: secretEmail,
          providerChargeId: secretCharge,
          card: { number: "4242424242424242" },
          offer: COLLEGE_CONSULTING_NIKA_SLUG,
          bookingIntent: {
            tutorProfileId: "tutor-nika",
            startTime: "2026-10-20T16:00:00.000Z",
            durationMinutes: 60,
          },
          bookedSessionId: session!.id,
        },
      })
      .returning({ id: paymentsTable.id });
    await db.insert(creditLedgerTable).values({
      clientUserId: owner.id,
      productId,
      entryType: "original",
      hours: 1,
      referenceType: "payment",
      referenceId: payment!.id,
      fulfillmentKey: `payment:${payment!.id}`,
    });
    const [otherPayment] = await db
      .insert(paymentsTable)
      .values({
        clientUserId: other.id,
        productId,
        amountCents: 20000,
        status: "paid",
        method: "stripe_checkout",
        auditMetadata: { customerEmail: `other-${secretEmail}` },
      })
      .returning({ id: paymentsTable.id });

    ownerServer = await startServer(owner);
    const own = await getJson(ownerServer.baseUrl, "/api/billing-history");
    assert.equal(own.response.status, 200);
    assert.equal(own.body.readOnly, false);
    const ownPayments = own.body.payments as Array<Record<string, unknown>>;
    assert.equal(ownPayments.length, 1);
    assert.equal(ownPayments[0]?.id, payment!.id);
    assert.equal(ownPayments[0]?.status, "paid");
    assert.equal(ownPayments[0]?.amountCents, 10000);
    assert.equal(ownPayments[0]?.tutorName, "Nika");
    assert.equal(ownPayments[0]?.hours, 1);
    assert.equal(ownPayments[0]?.sessionTitle, "Neel’s College Consulting Session with Nika");
    assert.equal(ownPayments[0]?.sessionStart, "2026-10-20T16:00:00.000Z");
    const ownSerialized = JSON.stringify(own.body);
    assert.equal(ownSerialized.includes(secretEmail), false);
    assert.equal(ownSerialized.includes(secretCharge), false);
    assert.equal(ownSerialized.includes("4242424242424242"), false);
    assert.equal(ownSerialized.includes(otherPayment!.id), false);

    const crossed = await getJson(ownerServer.baseUrl, `/api/billing-history?clientId=${other.id}`);
    assert.equal(crossed.response.status, 403);
    assert.equal(JSON.stringify(crossed.body).includes(otherPayment!.id), false);

    emptyServer = await startServer(empty);
    const emptyHistory = await getJson(emptyServer.baseUrl, "/api/billing-history");
    assert.equal(emptyHistory.response.status, 200);
    assert.deepEqual(emptyHistory.body.payments, []);

    adminServer = await startServer(admin);
    const preview = await getJson(adminServer.baseUrl, `/api/billing-history?clientId=${owner.id}`);
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.readOnly, true);
    const previewPayments = preview.body.payments as Array<Record<string, unknown>>;
    assert.equal(previewPayments.length, 1);
    assert.equal(previewPayments[0]?.id, payment!.id);
    const adminOwn = await getJson(adminServer.baseUrl, "/api/billing-history");
    assert.deepEqual(adminOwn.body.payments, []);

    otherServer = await startServer(other);
    const otherHistory = await getJson(otherServer.baseUrl, "/api/billing-history");
    const otherPayments = otherHistory.body.payments as Array<Record<string, unknown>>;
    assert.equal(otherPayments.length, 1);
    assert.equal(otherPayments[0]?.id, otherPayment!.id);
    assert.equal(JSON.stringify(otherHistory.body).includes(payment!.id), false);
  } finally {
    if (previousStudents === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    if (previousAdmins === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdmins;
    await ownerServer?.close();
    await otherServer?.close();
    await emptyServer?.close();
    await adminServer?.close();
    if (createdUserIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.clientUserId, createdUserIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.clientUserId, createdUserIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.clientUserId, createdUserIds));
      await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdUserIds));
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdUserIds));
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, createdUserIds));
    }
    if (createdCourseId) {
      await db.delete(coursesTable).where(eq(coursesTable.id, createdCourseId));
    }
    if (createdProductId) {
      await db.delete(satProductsTable).where(eq(satProductsTable.id, createdProductId));
    }
    if (createdUserIds.length > 0) {
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
  }
});
