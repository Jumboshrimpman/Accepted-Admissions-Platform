import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  adminNotificationsTable,
  auditLogsTable,
  availabilityRulesTable,
  bookingSlotHoldsTable,
  calendarConnectionsTable,
  courseMembershipsTable,
  coursesTable,
  creditLedgerTable,
  db,
  invoicesTable,
  loginActivityTable,
  paymentsTable,
  portalAccessGrantsTable,
  satProductsTable,
  sessionsTable,
  stripeWebhookEventsTable,
  tutorAssignmentsTable,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import platformRouter from "../routes/platform";
import { processStripeWebhook } from "./payment-service";
import {
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  encryptCalendarToken,
} from "./google-calendar";

const RACE_START = "2026-10-27T19:00:00.000Z";
const PAID_START = "2026-10-28T19:00:00.000Z";
const TAKEN_START = "2026-10-29T19:00:00.000Z";
const EXPIRE_START = "2026-10-30T19:00:00.000Z";
const DUPLICATE_START = "2026-11-03T19:00:00.000Z";

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
        sessionId: `slot-hold-http:${user.id}`,
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
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function getJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as { slots?: string[] }) : {},
  };
}

test("direct checkout holds a slot until payment, expiry, or cancel", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for slot hold HTTP coverage");
    return;
  }
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousDouble = process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  process.env.SESSION_SECRET = previousSecret || "slot-hold-test-secret";
  process.env.STRIPE_CHECKOUT_TEST_DOUBLE = "1";
  process.env.APP_ORIGIN = "https://slot-hold.test";
  const originalFetch = globalThis.fetch.bind(globalThis);
  const appCalendarId = `app-cal-${suffix}`;
  let busyWindows: Array<{ start: string; end: string }> = [];
  let eventWriteDelayMs = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.includes("/calendar/v3/freeBusy")) {
      return Response.json({
        calendars: {
          primary: { busy: busyWindows },
          [appCalendarId]: { busy: busyWindows },
        },
      });
    }
    if (url.includes("/events")) {
      if (eventWriteDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, eventWriteDelayMs));
      }
      return Response.json({
        id: `evt-${randomUUID()}`,
        htmlLink: "https://calendar.google.com/calendar/event?eid=slot-hold",
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const createdUserIds: string[] = [];
  const createdPaymentIds: string[] = [];
  let courseId: string | undefined;
  let profileId: string | undefined;
  let serverA: Awaited<ReturnType<typeof startServer>> | undefined;
  let serverB: Awaited<ReturnType<typeof startServer>> | undefined;
  let serverTutor: Awaited<ReturnType<typeof startServer>> | undefined;
  let serverAdmin: Awaited<ReturnType<typeof startServer>> | undefined;
  let failure: unknown;
  let cleanupError: unknown;

  try {
    try {
    const [tutorUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `slot-hold-tutor:${suffix}`,
        email: `slot-hold-tutor-${suffix}@example.invalid`,
        displayName: "Xavier Morales",
        role: "tutor",
      })
      .returning();
    createdUserIds.push(tutorUser!.id);
    const [profile] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: tutorUser!.id,
        email: `slot-hold-xavier-${suffix}@example.invalid`,
        name: "Xavier Morales",
        title: "SAT Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
      })
      .returning();
    profileId = profile!.id;
    await db.insert(availabilityRulesTable).values({
      tutorProfileId: profileId,
      timezone: "America/New_York",
      weeklyHours: Object.fromEntries(
        ["0", "1", "2", "3", "4", "5", "6"].map((day) => [day, [{ start: "07:00", end: "21:00" }]]),
      ),
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    });
    await db.insert(calendarConnectionsTable).values({
      tutorProfileId: profileId,
      provider: "google",
      status: "connected",
      calendarId: "primary",
      appCalendarId,
      grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
      encryptedAccessToken: encryptCalendarToken(`slot-hold-access-${suffix}`),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      googleAccountEmail: `slot-hold-xavier-${suffix}@example.invalid`,
    });
    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Slot hold ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    courseId = course!.id;
    const [studentA] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `slot-hold-a:${suffix}`,
        email: `slot-hold-a-${suffix}@example.invalid`,
        displayName: `Ada ${suffix}`,
        role: "student",
      })
      .returning();
    const [studentB] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `slot-hold-b:${suffix}`,
        email: `slot-hold-b-${suffix}@example.invalid`,
        displayName: "Bea Holder",
        role: "student",
      })
      .returning();
    createdUserIds.push(studentA!.id, studentB!.id);
    await db.insert(portalAccessGrantsTable).values([
      {
        email: studentA!.email,
        clerkUserId: studentA!.clerkUserId,
        displayName: studentA!.displayName,
        roleCategory: "student",
        active: true,
        userId: studentA!.id,
      },
      {
        email: studentB!.email,
        clerkUserId: studentB!.clerkUserId,
        displayName: studentB!.displayName,
        roleCategory: "student",
        active: true,
        userId: studentB!.id,
      },
    ]);
    await db.insert(courseMembershipsTable).values([
      { courseId, userId: studentA!.id, membershipRole: "student", subject: "SAT" },
      { courseId, userId: studentB!.id, membershipRole: "student", subject: "SAT" },
      { courseId, userId: tutorUser!.id, membershipRole: "tutor", subject: "SAT" },
    ]);
    await db.insert(tutorAssignmentsTable).values({
      courseId,
      tutorUserId: tutorUser!.id,
      studentUserId: studentA!.id,
      subject: "SAT",
    });
    const [adminUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `slot-hold-admin:${suffix}`,
        email: `slot-hold-admin-${suffix}@example.invalid`,
        displayName: "Ada Admin",
        role: "administrator",
      })
      .returning();
    createdUserIds.push(adminUser!.id);
    await db.insert(portalAccessGrantsTable).values({
      email: tutorUser!.email,
      clerkUserId: tutorUser!.clerkUserId,
      displayName: tutorUser!.displayName,
      roleCategory: "tutor",
      active: true,
      userId: tutorUser!.id,
    });
    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = adminUser!.clerkUserId;
    const [xavierHour] = await db
      .select()
      .from(satProductsTable)
      .where(eq(satProductsTable.slug, "sat-xavier-60"))
      .limit(1);
    assert.ok(xavierHour);
    const [creditB] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: studentB!.id,
        productId: xavierHour.id,
        entryType: "original",
        hours: 4,
        note: `slot-hold-${suffix}`,
      })
      .returning();

    serverA = await startServer(studentA!);
    serverB = await startServer(studentB!);
    serverTutor = await startServer(tutorUser!);
    serverAdmin = await startServer(adminUser!);
    const checkoutBody = {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: RACE_START,
    };
    const raced = await Promise.all([
      postJson(serverA.baseUrl, "/api/payments/checkout", checkoutBody),
      postJson(serverB.baseUrl, "/api/payments/checkout", checkoutBody),
    ]);
    const winners = raced.filter((result) => result.status === 201);
    const losers = raced.filter((result) => result.status === 409);
    assert.equal(winners.length, 1, JSON.stringify(raced));
    assert.equal(losers.length, 1, JSON.stringify(raced));
    assert.equal(losers[0]?.body.code, "SLOT_HELD");
    assert.equal(typeof winners[0]?.body.url, "string");
    const winnerPaymentId = String(winners[0]?.body.paymentId);
    createdPaymentIds.push(winnerPaymentId);
    const [hold] = await db
      .select()
      .from(bookingSlotHoldsTable)
      .where(eq(bookingSlotHoldsTable.paymentId, winnerPaymentId));
    assert.ok(hold);
    assert.equal(hold.releasedAt, null);
    const holdSecondsLeft = (hold.expiresAt.getTime() - Date.now()) / 1000;
    assert.ok(holdSecondsLeft > 30 * 60 && holdSecondsLeft <= 31 * 60, String(holdSecondsLeft));
    const [winnerPayment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, winnerPaymentId));
    assert.equal(Number(winnerPayment?.amountCents), 20_000);

    const availability = await getJson(
      serverB.baseUrl,
      `/api/booking/availability?tutorProfileId=${profileId}&from=2026-10-27T18:00:00.000Z&to=2026-10-27T21:00:00.000Z&durationMinutes=60`,
    );
    assert.equal(availability.status, 200, JSON.stringify(availability.body));
    assert.equal(availability.body.slots?.includes(RACE_START), false);

    const blockedBooking = await postJson(serverB.baseUrl, "/api/booking/sessions", {
      tutorProfileId: profileId,
      startTime: RACE_START,
      durationMinutes: 60,
    });
    assert.equal(blockedBooking.status, 409, JSON.stringify(blockedBooking.body));
    assert.ok(blockedBooking.body.code === "SLOT_UNAVAILABLE" || blockedBooking.body.code === "SLOT_HELD");

    const secondTab = await postJson(serverA.baseUrl, "/api/payments/checkout", checkoutBody);
    assert.equal(secondTab.status, 409, JSON.stringify(secondTab.body));
    assert.equal(secondTab.body.code, "SLOT_HELD");

    await db
      .update(bookingSlotHoldsTable)
      .set({ expiresAt: new Date(Date.now() - 60_000), updatedAt: new Date() })
      .where(eq(bookingSlotHoldsTable.id, hold.id));
    const releasedAvailability = await getJson(
      serverB.baseUrl,
      `/api/booking/availability?tutorProfileId=${profileId}&from=2026-10-27T18:00:00.000Z&to=2026-10-27T21:00:00.000Z&durationMinutes=60`,
    );
    assert.equal(releasedAvailability.body.slots?.includes(RACE_START), true);
    const [releasedHold] = await db
      .select({ releasedAt: bookingSlotHoldsTable.releasedAt })
      .from(bookingSlotHoldsTable)
      .where(eq(bookingSlotHoldsTable.id, hold.id));
    assert.ok(releasedHold?.releasedAt);

    const paidCheckout = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: PAID_START,
    });
    assert.equal(paidCheckout.status, 201, JSON.stringify(paidCheckout.body));
    const paidPaymentId = String(paidCheckout.body.paymentId);
    createdPaymentIds.push(paidPaymentId);
    const paidEvent = {
      id: `evt_hold_paid_${suffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${paidPaymentId}`,
          payment_status: "paid",
          amount_total: 20_000,
          latest_charge: `ch_hold_${suffix}`,
          metadata: { payment_id: paidPaymentId },
          client_reference_id: paidPaymentId,
        },
      },
    };
    await processStripeWebhook(paidEvent);
    await processStripeWebhook(paidEvent);
    const paidSessions = await db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.clientUserId, studentA!.id),
          eq(sessionsTable.dateTime, new Date(PAID_START)),
        ),
      );
    assert.equal(paidSessions.length, 1);
    assert.equal(paidSessions[0]?.bookingStatus, "confirmed");
    const [paidRow] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paidPaymentId));
    assert.equal(
      (paidRow?.auditMetadata as { bookedSessionId?: string } | null)?.bookedSessionId,
      paidSessions[0]?.id,
    );

    eventWriteDelayMs = 400;
    const duplicateCheckout = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: DUPLICATE_START,
    });
    assert.equal(duplicateCheckout.status, 201, JSON.stringify(duplicateCheckout.body));
    const duplicatePaymentId = String(duplicateCheckout.body.paymentId);
    createdPaymentIds.push(duplicatePaymentId);
    const duplicateObject = {
      id: `cs_test_${duplicatePaymentId}`,
      payment_status: "paid",
      amount_total: 20_000,
      latest_charge: `ch_hold_dup_${suffix}`,
      metadata: { payment_id: duplicatePaymentId },
      client_reference_id: duplicatePaymentId,
    };
    await Promise.all([
      processStripeWebhook({
        id: `evt_hold_dup_checkout_${suffix}`,
        type: "checkout.session.completed",
        data: { object: duplicateObject },
      }),
      processStripeWebhook({
        id: `evt_hold_dup_intent_${suffix}`,
        type: "payment_intent.succeeded",
        data: { object: { ...duplicateObject, id: `pi_hold_dup_${suffix}` } },
      }),
    ]);
    eventWriteDelayMs = 0;
    const duplicateSessions = await db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.clientUserId, studentA!.id),
          eq(sessionsTable.dateTime, new Date(DUPLICATE_START)),
        ),
      );
    assert.equal(duplicateSessions.length, 1);
    assert.equal(duplicateSessions[0]?.bookingStatus, "confirmed");
    const duplicateRefusals = await db
      .select({ id: adminNotificationsTable.id })
      .from(adminNotificationsTable)
      .where(
        and(
          eq(adminNotificationsTable.kind, "calendar_reconnect_booking_refused"),
          eq(adminNotificationsTable.recipientUserId, adminUser!.id),
        ),
      );
    assert.equal(duplicateRefusals.length, 0);

    const takenCheckout = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: TAKEN_START,
    });
    assert.equal(takenCheckout.status, 201, JSON.stringify(takenCheckout.body));
    const takenPaymentId = String(takenCheckout.body.paymentId);
    createdPaymentIds.push(takenPaymentId);
    await db
      .update(bookingSlotHoldsTable)
      .set({ expiresAt: new Date(Date.now() - 60_000), updatedAt: new Date() })
      .where(eq(bookingSlotHoldsTable.paymentId, takenPaymentId));
    const takenByOther = await postJson(serverB.baseUrl, "/api/booking/sessions", {
      tutorProfileId: profileId,
      startTime: TAKEN_START,
      durationMinutes: 60,
    });
    assert.equal(takenByOther.status, 201, JSON.stringify(takenByOther.body));
    await processStripeWebhook({
      id: `evt_hold_late_${suffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${takenPaymentId}`,
          payment_status: "paid",
          amount_total: 20_000,
          latest_charge: `ch_hold_late_${suffix}`,
          metadata: { payment_id: takenPaymentId },
        },
      },
    });
    const lateSessions = await db
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.clientUserId, studentA!.id),
          eq(sessionsTable.dateTime, new Date(TAKEN_START)),
        ),
      );
    assert.equal(lateSessions.length, 0);
    const fallback = await postJson(serverA.baseUrl, "/api/booking/sessions/from-payment", {
      paymentId: takenPaymentId,
    });
    assert.equal(fallback.status, 409, JSON.stringify(fallback.body));
    assert.match(String(fallback.body.error), /hours are on your account/);
    let genuineRefusals: { id: string }[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      genuineRefusals = await db
        .select({ id: adminNotificationsTable.id })
        .from(adminNotificationsTable)
        .where(
          and(
            eq(adminNotificationsTable.kind, "calendar_reconnect_booking_refused"),
            eq(adminNotificationsTable.recipientUserId, adminUser!.id),
          ),
        );
      if (genuineRefusals.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(genuineRefusals.length, 1, JSON.stringify(fallback.body));
    const adaCredits = await db
      .select()
      .from(creditLedgerTable)
      .where(eq(creditLedgerTable.clientUserId, studentA!.id));
    const purchased = adaCredits
      .filter((row) => row.entryType === "original")
      .reduce((sum, row) => sum + Number(row.hours), 0);
    const debited = adaCredits
      .filter((row) => row.entryType === "debit")
      .reduce((sum, row) => sum + Number(row.hours), 0);
    assert.equal(purchased, 3);
    assert.equal(debited, 2);

    const expireCheckout = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: EXPIRE_START,
    });
    assert.equal(expireCheckout.status, 201, JSON.stringify(expireCheckout.body));
    const expirePaymentId = String(expireCheckout.body.paymentId);
    createdPaymentIds.push(expirePaymentId);
    const expiredEvent = {
      id: `evt_hold_expired_${suffix}`,
      type: "checkout.session.expired",
      data: { object: { id: `cs_test_${expirePaymentId}`, metadata: { payment_id: expirePaymentId } } },
    };
    await processStripeWebhook(expiredEvent);
    await processStripeWebhook(expiredEvent);
    const [expiredHold] = await db
      .select()
      .from(bookingSlotHoldsTable)
      .where(eq(bookingSlotHoldsTable.paymentId, expirePaymentId));
    assert.ok(expiredHold?.releasedAt);
    const afterExpire = await postJson(serverB.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: EXPIRE_START,
    });
    assert.equal(afterExpire.status, 201, JSON.stringify(afterExpire.body));
    createdPaymentIds.push(String(afterExpire.body.paymentId));

    const cancelCheckout = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: "2026-11-02T19:00:00.000Z",
    });
    assert.equal(cancelCheckout.status, 201, JSON.stringify(cancelCheckout.body));
    const cancelPaymentId = String(cancelCheckout.body.paymentId);
    createdPaymentIds.push(cancelPaymentId);
    const released = await postJson(serverA.baseUrl, "/api/booking/slot-holds/release", {
      paymentId: cancelPaymentId,
    });
    assert.equal(released.status, 200, JSON.stringify(released.body));
    assert.equal(released.body.released, true);
    const releasedAgain = await postJson(serverA.baseUrl, "/api/booking/slot-holds/release", {
      paymentId: cancelPaymentId,
    });
    assert.equal(releasedAgain.body.released, true);

    const paymentsBeforeReject = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.clientUserId, studentA!.id));
    const offGrid = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: "2026-11-06T19:30:00.000Z",
    });
    assert.equal(offGrid.status, 409, JSON.stringify(offGrid.body));
    assert.equal(offGrid.body.code, "SLOT_UNAVAILABLE");
    busyWindows = [{ start: "2026-11-09T19:00:00.000Z", end: "2026-11-09T20:00:00.000Z" }];
    const busy = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: "2026-11-09T19:00:00.000Z",
    });
    assert.equal(busy.status, 409, JSON.stringify(busy.body));
    assert.equal(busy.body.code, "SLOT_UNAVAILABLE");
    busyWindows = [];
    const paymentsAfterReject = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.clientUserId, studentA!.id));
    assert.equal(paymentsAfterReject.length, paymentsBeforeReject.length);

    const heldStart = "2026-11-10T19:00:00.000Z";
    const heldCheckout = await postJson(serverA.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profileId,
      durationMinutes: 60,
      startTime: heldStart,
    });
    assert.equal(heldCheckout.status, 201, JSON.stringify(heldCheckout.body));
    createdPaymentIds.push(String(heldCheckout.body.paymentId));
    const sessionBody = {
      courseId,
      clientUserId: studentA!.id,
      tutorUserId: tutorUser!.id,
      dateTime: heldStart,
      timezone: "America/New_York",
      subject: "SAT",
      durationMinutes: 60,
    };
    const tutorBlocked = await postJson(serverTutor.baseUrl, "/api/tutor/sessions", sessionBody);
    assert.equal(tutorBlocked.status, 409, JSON.stringify(tutorBlocked.body));
    assert.equal(tutorBlocked.body.code, "SLOT_HELD");
    const adminBlocked = await postJson(serverAdmin.baseUrl, "/api/admin/sessions", sessionBody);
    assert.equal(adminBlocked.status, 409, JSON.stringify(adminBlocked.body));
    assert.equal(adminBlocked.body.code, "SLOT_HELD");
    const heldSessions = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.tutorUserId, tutorUser!.id),
          eq(sessionsTable.dateTime, new Date(heldStart)),
        ),
      );
    assert.equal(heldSessions.length, 0);

    void creditB;
    } catch (error) {
      failure = error;
    }
  } finally {
    try {
    await serverA?.close();
    await serverB?.close();
    await serverTutor?.close();
    await serverAdmin?.close();
    globalThis.fetch = originalFetch;
    if (previousDouble === undefined) delete process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
    else process.env.STRIPE_CHECKOUT_TEST_DOUBLE = previousDouble;
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    if (previousAdminIds === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    await db
      .delete(stripeWebhookEventsTable)
      .where(
        inArray(stripeWebhookEventsTable.providerEventId, [
          `evt_hold_paid_${suffix}`,
          `evt_hold_late_${suffix}`,
          `evt_hold_expired_${suffix}`,
          `evt_hold_dup_checkout_${suffix}`,
          `evt_hold_dup_intent_${suffix}`,
        ]),
      );
    if (createdUserIds.length > 0) {
      const invoiceRows = await db
        .select({ id: invoicesTable.id })
        .from(invoicesTable)
        .where(inArray(invoicesTable.clientUserId, createdUserIds));
      const paymentRows = await db
        .select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(inArray(paymentsTable.clientUserId, createdUserIds));
      if (paymentRows.length > 0) {
        await db
          .delete(bookingSlotHoldsTable)
          .where(inArray(bookingSlotHoldsTable.paymentId, paymentRows.map((row) => row.id)));
        await db.delete(paymentsTable).where(inArray(paymentsTable.id, paymentRows.map((row) => row.id)));
      }
      if (invoiceRows.length > 0) {
        await db.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceRows.map((row) => row.id)));
      }
      const sessionUserIds = () => sql.join(createdUserIds.map((id) => sql`${id}::uuid`), sql`, `);
      await db.execute(sql`
        delete from admin_notifications
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
           or recipient_user_id in (${sessionUserIds()})
      `);
      await db.execute(sql`
        delete from session_prework_plans
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
      `);
      await db.execute(sql`
        delete from homework_weakness_groups
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
      `);
      await db.execute(sql`
        delete from remediation_retries
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
      `);
      await db.execute(sql`
        delete from adaptive_recommendations
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
      `);
      await db.execute(sql`
        delete from curriculum_blocks
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
      `);
      await db.execute(sql`
        delete from session_artifacts
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
      `);
      await db.execute(sql`
        delete from meeting_records
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
      `);
      await db.execute(sql`
        delete from tutor_payout_obligations
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
           or student_user_id in (${sessionUserIds()})
           or tutor_user_id in (${sessionUserIds()})
      `);
      await db.execute(sql`
        delete from question_reports
        where assignment_id in (
          select id from assignments
          where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
             or assigned_student_user_id in (${sessionUserIds()})
             or assigned_tutor_user_id in (${sessionUserIds()})
        )
      `);
      await db.execute(sql`
        delete from assignment_questions
        where assignment_id in (
          select id from assignments
          where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
             or assigned_student_user_id in (${sessionUserIds()})
             or assigned_tutor_user_id in (${sessionUserIds()})
        )
      `);
      await db.execute(sql`
        delete from attempts
        where assignment_id in (
          select id from assignments
          where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
             or assigned_student_user_id in (${sessionUserIds()})
             or assigned_tutor_user_id in (${sessionUserIds()})
        )
           or user_id in (${sessionUserIds()})
      `);
      await db.execute(sql`
        delete from assignments
        where session_id in (select id from sessions where client_user_id in (${sessionUserIds()}))
           or assigned_student_user_id in (${sessionUserIds()})
           or assigned_tutor_user_id in (${sessionUserIds()})
      `);
      await db.execute(sql`
        delete from tutor_assignments
        where student_user_id in (${sessionUserIds()})
           or tutor_user_id in (${sessionUserIds()})
      `);
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.clientUserId, createdUserIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.clientUserId, createdUserIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdUserIds));
    }
    if (courseId) {
      await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
    }
    if (profileId) {
      await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.tutorProfileId, profileId));
      await db.delete(availabilityRulesTable).where(eq(availabilityRulesTable.tutorProfileId, profileId));
      await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.id, profileId));
    }
    if (createdUserIds.length > 0) {
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdUserIds));
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, createdUserIds));
      await db.delete(portalAccessGrantsTable).where(inArray(portalAccessGrantsTable.userId, createdUserIds));
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
    } catch (error) {
      cleanupError = error;
    }
  }
  if (failure) throw failure;
  if (cleanupError) throw cleanupError;
});
