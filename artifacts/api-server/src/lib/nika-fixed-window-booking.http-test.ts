import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
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
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import platformRouter from "../routes/platform";
import { notifyAdministratorsOfBooking } from "./booking-service";
import { zonedDateTimeToUtc } from "./booking";
import { manualCalendarInviteMessage } from "./admin-calendar-fallback";
import {
  COLLEGE_CONSULTING_COURSE_ID,
  NEEL_DHARNI_USER_ID,
  VICTORIA_PLACEHOLDER_EMAIL,
} from "./college-consulting";
import { CANONICAL_XAVIER_EMAIL } from "./xavier-identity";
import { processStripeWebhook } from "./payment-service";
import {
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  encryptCalendarToken,
} from "./google-calendar";

const NIKA_EMAIL = "nika.raiffe@gmail.com";
const ADMIN_EMAIL = "admin@acceptedadmissions.org";
const NIKA_START = zonedDateTimeToUtc("2026-10-21", "18:05", "America/New_York").toISOString();
const CLOSED_START = zonedDateTimeToUtc("2026-10-20", "16:00", "America/New_York").toISOString();
const CLOSED_MORNING = zonedDateTimeToUtc("2026-10-17", "07:00", "America/New_York").toISOString();

type CapturedWrite = {
  method: string;
  url: string;
  attendees: string[];
  conference: boolean;
  calendarId: string;
};

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
        sessionId: `fixed-window-http:${user.id}`,
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

async function patchJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
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

function installCalendarMock(appCalendarId: string) {
  const writes: CapturedWrite[] = [];
  let freeBusyCalls = 0;
  let googleCalls = 0;
  let emailCalls = 0;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.includes("api.resend.com")) {
      emailCalls += 1;
      return Response.json({ id: "email-should-not-send" });
    }
    if (url.includes("/calendar/v3/")) {
      googleCalls += 1;
      if (url.includes("/freeBusy")) {
        freeBusyCalls += 1;
        return Response.json({
          calendars: {
            primary: { busy: [] },
            [appCalendarId]: { busy: [] },
          },
        });
      }
      if (url.includes("/events")) {
        let attendees: string[] = [];
        let conference = false;
        if (typeof init?.body === "string") {
          const parsed = JSON.parse(init.body) as {
            attendees?: { email: string }[];
            conferenceData?: { createRequest?: { conferenceSolutionKey?: { type?: string } } };
          };
          attendees = (parsed.attendees ?? []).map((attendee) => attendee.email);
          conference = parsed.conferenceData?.createRequest?.conferenceSolutionKey?.type === "hangoutsMeet";
        }
        const calendarMatch = url.match(/\/calendars\/([^/]+)\/events/);
        writes.push({
          method: init?.method ?? "POST",
          url,
          attendees,
          conference,
          calendarId: calendarMatch ? decodeURIComponent(calendarMatch[1]!) : "",
        });
        if ((init?.method ?? "POST") === "DELETE") return new Response(null, { status: 204 });
        return Response.json({
          id: `evt-${randomUUID()}`,
          htmlLink: "https://calendar.google.com/calendar/event?eid=fixed-window",
          hangoutLink: "https://meet.google.com/admin-fallback-meet",
        });
      }
      return Response.json({});
    }
    return original(input, init);
  }) as typeof fetch;
  return {
    writes,
    freeBusyCalls: () => freeBusyCalls,
    googleCalls: () => googleCalls,
    emailCalls: () => emailCalls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

async function nikaDateHours() {
  const migration = await readFile(
    path.resolve(process.cwd(), "../../lib/db/drizzle/0062_availability_date_hours.sql"),
    "utf8",
  );
  const marker = `SET "date_hours" = '`;
  const jsonStart = migration.indexOf(marker) + marker.length;
  return JSON.parse(migration.slice(jsonStart, migration.indexOf("'::jsonb", jsonStart))) as Record<
    string,
    { start: string; end: string }[]
  >;
}

async function deleteCreatedUsers(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, ids));
  await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.recipientUserId, ids));
  await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, ids));
  await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.clientUserId, ids));
  await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.clientUserId, ids));
  await db.delete(paymentsTable).where(inArray(paymentsTable.clientUserId, ids));
  await db.delete(invoicesTable).where(inArray(invoicesTable.clientUserId, ids));
  await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, ids));
  await db.delete(portalAccessGrantsTable).where(inArray(portalAccessGrantsTable.userId, ids));
  await db.delete(usersTable).where(inArray(usersTable.id, ids));
}

let nikaTurn: Promise<void> = Promise.resolve();

function lockNika(): Promise<() => void> {
  let unlock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const previous = nikaTurn;
  nikaTurn = gate;
  return previous.then(() => unlock);
}

async function noticeCount(sessionId: string, title: string) {
  const rows = await db
    .select({ id: adminNotificationsTable.id })
    .from(adminNotificationsTable)
    .where(
      and(
        eq(adminNotificationsTable.sessionId, sessionId),
        eq(adminNotificationsTable.title, title),
      ),
    );
  return rows.length;
}

test("Neel books Nika's fixed Wednesday window: offered, held, confirmed, invite targets", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for the fixed-window booking");
    return;
  }
  const unlockNika = await lockNika();
  assert.equal(VICTORIA_PLACEHOLDER_EMAIL, "samakubba@icloud.com");
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousDouble = process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
  const previousOrigin = process.env.APP_ORIGIN;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousAdmins = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  process.env.SESSION_SECRET = previousSecret || "fixed-window-test-secret";
  process.env.STRIPE_CHECKOUT_TEST_DOUBLE = "1";
  process.env.APP_ORIGIN = "https://fixed-window.test";
  const appCalendarId = `fixed-window-${suffix}`;
  const calendar = installCalendarMock(appCalendarId);
  const createdUserIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdLedgerIds: string[] = [];
  let createdCourse = false;
  let createdMembership = false;
  let createdRuleId: string | undefined;
  let createdConnectionId: string | undefined;
  let removedConnection: typeof calendarConnectionsTable.$inferSelect | undefined;
  let ruleSnapshot: typeof availabilityRulesTable.$inferSelect | undefined;
  let nikaEmailSnapshot: string | undefined;
  let nikaUserId: string | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    const dateHours = await nikaDateHours();
    let neel = (
      await db.select().from(usersTable).where(eq(usersTable.id, NEEL_DHARNI_USER_ID)).limit(1)
    )[0];
    if (!neel) {
      const [created] = await db
        .insert(usersTable)
        .values({
          id: NEEL_DHARNI_USER_ID,
          clerkUserId: `fixed-window-neel:${suffix}`,
          email: `fixed-window-neel-${suffix}@example.invalid`,
          displayName: "Neel Dharni",
          role: "student",
        })
        .returning();
      neel = created;
      createdUserIds.push(neel!.id);
    }
    assert.ok(neel);
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = neel.clerkUserId;

    let nikaUser = (
      await db.select().from(usersTable).where(eq(usersTable.email, NIKA_EMAIL)).limit(1)
    )[0];
    if (!nikaUser) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `fixed-window-nika:${suffix}`,
          email: NIKA_EMAIL,
          displayName: "Nika Raiffe",
          role: "tutor",
        })
        .returning();
      nikaUser = created;
      createdUserIds.push(nikaUser!.id);
    }
    assert.ok(nikaUser);
    nikaUserId = nikaUser.id;
    if (nikaUser.email !== NIKA_EMAIL) {
      nikaEmailSnapshot = nikaUser.email;
      await db.update(usersTable).set({ email: NIKA_EMAIL }).where(eq(usersTable.id, nikaUser.id));
    }

    let profile = (
      await db.select().from(tutorProfilesTable).where(eq(tutorProfilesTable.email, NIKA_EMAIL)).limit(1)
    )[0];
    if (!profile) {
      const [created] = await db
        .insert(tutorProfilesTable)
        .values({
          userId: nikaUser.id,
          email: NIKA_EMAIL,
          name: "Nika Raiffe",
          title: "Admissions Tutor",
          subjects: ["College Consulting"],
          active: true,
          bookingEligible: true,
        })
        .returning();
      profile = created;
    }
    assert.ok(profile);
    assert.equal(profile.email, NIKA_EMAIL);

    const [existingRule] = await db
      .select()
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, profile.id))
      .limit(1);
    if (existingRule) {
      ruleSnapshot = existingRule;
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: "America/New_York",
          dateHours,
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          updatedAt: new Date(),
        })
        .where(eq(availabilityRulesTable.id, existingRule.id));
    } else {
      const [created] = await db
        .insert(availabilityRulesTable)
        .values({
          tutorProfileId: profile.id,
          timezone: "America/New_York",
          weeklyHours: {
            "0": [{ start: "07:00", end: "21:00" }],
            "1": [{ start: "07:00", end: "21:00" }],
            "2": [{ start: "07:00", end: "21:00" }],
            "3": [{ start: "07:00", end: "21:00" }],
            "4": [{ start: "07:00", end: "21:00" }],
            "5": [{ start: "07:00", end: "21:00" }],
            "6": [{ start: "07:00", end: "21:00" }],
          },
          dateHours,
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          blackoutDates: [],
        })
        .returning();
      createdRuleId = created!.id;
    }

    const [course] = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID))
      .limit(1);
    if (!course) {
      await db.insert(coursesTable).values({
        id: COLLEGE_CONSULTING_COURSE_ID,
        title: "College Consulting",
        subject: "College Consulting",
        term: "Fall 2026",
        status: "active",
      });
      createdCourse = true;
    }
    const [membership] = await db
      .select({ id: courseMembershipsTable.id })
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.courseId, COLLEGE_CONSULTING_COURSE_ID),
          eq(courseMembershipsTable.userId, neel.id),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .limit(1);
    if (!membership) {
      await db.insert(courseMembershipsTable).values({
        courseId: COLLEGE_CONSULTING_COURSE_ID,
        userId: neel.id,
        membershipRole: "student",
        subject: "College Consulting",
      });
      createdMembership = true;
    }

    const [admin] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `fixed-window-admin:${suffix}`,
        email: `fixed-window-admin-${suffix}@example.invalid`,
        displayName: "Fixed Window Admin",
        role: "administrator",
      })
      .returning();
    createdUserIds.push(admin!.id);
    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = admin!.clerkUserId;

    server = await startServer(neel);
    const [storedConnection] = await db
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, profile.id),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      )
      .limit(1);
    if (storedConnection) {
      removedConnection = storedConnection;
      await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, storedConnection.id));
    }

    const refusedCheckout = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profile.id,
      durationMinutes: 60,
      startTime: CLOSED_START,
    });
    assert.equal(refusedCheckout.status, 409, JSON.stringify(refusedCheckout.body));
    assert.equal(refusedCheckout.body.code, "SLOT_UNAVAILABLE");
    assert.equal(String(refusedCheckout.body.error).toLowerCase().includes("disconnected"), false);

    const [hour] = await db
      .select()
      .from(satProductsTable)
      .where(eq(satProductsTable.slug, "college-consulting-nika-hour"))
      .limit(1);
    assert.ok(hour);
    const [credit] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: neel.id,
        productId: hour.id,
        entryType: "original",
        hours: 1,
        note: `fixed-window-${suffix}`,
      })
      .returning();
    createdLedgerIds.push(credit!.id);
    const refusedBooking = await postJson(server.baseUrl, "/api/booking/sessions", {
      tutorProfileId: profile.id,
      startTime: CLOSED_MORNING,
      durationMinutes: 60,
    });
    assert.equal(refusedBooking.status, 409, JSON.stringify(refusedBooking.body));
    assert.equal(refusedBooking.body.code, "SLOT_UNAVAILABLE");
    assert.equal(String(refusedBooking.body.error).toLowerCase().includes("disconnected"), false);

    const offered = await getJson(
      server.baseUrl,
      `/api/booking/availability?tutorProfileId=${profile.id}&from=2026-10-21T21:00:00.000Z&to=2026-10-22T02:00:00.000Z&durationMinutes=60`,
    );
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
    assert.equal(offered.body.slots?.includes(NIKA_START), true);

    const [connection] = await db
      .insert(calendarConnectionsTable)
      .values({
        tutorProfileId: profile.id,
        provider: "google",
        status: "connected",
        calendarId: "primary",
        appCalendarId,
        grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
        encryptedAccessToken: encryptCalendarToken(`fixed-window-access-${suffix}`),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        googleAccountEmail: NIKA_EMAIL,
      })
      .returning();
    createdConnectionId = connection!.id;

    const checkout = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profile.id,
      durationMinutes: 60,
      startTime: NIKA_START,
    });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    const paymentId = String(checkout.body.paymentId);
    createdPaymentIds.push(paymentId);
    const held = await getJson(
      server.baseUrl,
      `/api/booking/availability?tutorProfileId=${profile.id}&from=2026-10-21T21:00:00.000Z&to=2026-10-22T02:00:00.000Z&durationMinutes=60`,
    );
    assert.equal(held.body.slots?.includes(NIKA_START), false);

    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    assert.ok(payment);
    await processStripeWebhook({
      id: `evt_fixed_${suffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_fixed_${suffix}`,
          payment_status: "paid",
          amount_total: Number(payment.amountCents),
          latest_charge: `ch_fixed_${suffix}`,
          metadata: { payment_id: paymentId },
          client_reference_id: paymentId,
        },
      },
    });
    await processStripeWebhook({
      id: `evt_fixed_${suffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_fixed_${suffix}`,
          payment_status: "paid",
          amount_total: Number(payment.amountCents),
          latest_charge: `ch_fixed_${suffix}`,
          metadata: { payment_id: paymentId },
          client_reference_id: paymentId,
        },
      },
    });

    const booked = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.clientUserId, neel.id), eq(sessionsTable.dateTime, new Date(NIKA_START))));
    assert.equal(booked.length, 1);
    assert.equal(booked[0]?.bookingStatus, "confirmed");
    assert.equal(booked[0]?.subject, "College Consulting");
    createdSessionIds.push(booked[0]!.id);
    const invite = calendar.writes.find((write) => write.method === "POST");
    assert.ok(invite, JSON.stringify(calendar.writes));
    assert.match(invite.url, /sendUpdates=all$/);
    assert.deepEqual(invite.attendees, [neel.email, NIKA_EMAIL, ADMIN_EMAIL]);

    const title = "College Consulting booking confirmed";
    const firstNotices = await noticeCount(booked[0]!.id, title);
    assert.ok(firstNotices > 0);
    await notifyAdministratorsOfBooking({
      kind: "booking_confirmed",
      sessionId: booked[0]!.id,
      title,
      message: "second run",
    });
    assert.equal(await noticeCount(booked[0]!.id, title), firstNotices);
  } finally {
    calendar.restore();
    if (server) await server.close();
    if (createdSessionIds.length > 0) {
      await db
        .delete(adminNotificationsTable)
        .where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdPaymentIds.length > 0) {
      await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
    }
    if (createdConnectionId) {
      await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, createdConnectionId));
    }
    if (removedConnection) {
      await db.insert(calendarConnectionsTable).values(removedConnection);
    }
    if (createdRuleId) {
      await db.delete(availabilityRulesTable).where(eq(availabilityRulesTable.id, createdRuleId));
    } else if (ruleSnapshot) {
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: ruleSnapshot.timezone,
          weeklyHours: ruleSnapshot.weeklyHours,
          dateHours: ruleSnapshot.dateHours,
          bookingNoticeMinutes: ruleSnapshot.bookingNoticeMinutes,
          bufferMinutes: ruleSnapshot.bufferMinutes,
          blackoutDates: ruleSnapshot.blackoutDates,
          updatedAt: ruleSnapshot.updatedAt,
        })
        .where(eq(availabilityRulesTable.id, ruleSnapshot.id));
    }
    if (createdMembership) {
      await db
        .delete(courseMembershipsTable)
        .where(
          and(
            eq(courseMembershipsTable.courseId, COLLEGE_CONSULTING_COURSE_ID),
            eq(courseMembershipsTable.userId, NEEL_DHARNI_USER_ID),
          ),
        );
    }
    if (createdCourse) {
      await db.delete(coursesTable).where(eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID));
    }
    if (nikaEmailSnapshot && nikaUserId) {
      await db.update(usersTable).set({ email: nikaEmailSnapshot }).where(eq(usersTable.id, nikaUserId));
    }
    await deleteCreatedUsers(createdUserIds);
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    if (previousDouble === undefined) delete process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
    else process.env.STRIPE_CHECKOUT_TEST_DOUBLE = previousDouble;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    if (previousStudents === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    if (previousAdmins === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdmins;
    unlockNika();
  }
});

test("Neel books a fixed Nika slot with a blank app calendar and no admin grant", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for the manual invite confirmation");
    return;
  }
  const unlockNika = await lockNika();
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousDouble = process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
  const previousOrigin = process.env.APP_ORIGIN;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousAdmins = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  process.env.SESSION_SECRET = previousSecret || "fixed-window-test-secret";
  process.env.STRIPE_CHECKOUT_TEST_DOUBLE = "1";
  process.env.APP_ORIGIN = "https://fixed-window.test";
  const appCalendarId = `reconnect-window-${suffix}`;
  const calendar = installCalendarMock(appCalendarId);
  const createdUserIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const webhookEventId = `evt_reconnect_${suffix}`;
  let manualInviteMessage = "";
  let createdCourse = false;
  let createdMembership = false;
  let createdRuleId: string | undefined;
  let createdConnectionId: string | undefined;
  let removedConnection: typeof calendarConnectionsTable.$inferSelect | undefined;
  let ruleSnapshot: typeof availabilityRulesTable.$inferSelect | undefined;
  let nikaEmailSnapshot: string | undefined;
  let nikaUserId: string | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    const dateHours = await nikaDateHours();
    let neel = (
      await db.select().from(usersTable).where(eq(usersTable.id, NEEL_DHARNI_USER_ID)).limit(1)
    )[0];
    if (!neel) {
      const [created] = await db
        .insert(usersTable)
        .values({
          id: NEEL_DHARNI_USER_ID,
          clerkUserId: `reconnect-neel:${suffix}`,
          email: `reconnect-neel-${suffix}@example.invalid`,
          displayName: "Neel Dharni",
          role: "student",
        })
        .returning();
      neel = created;
      createdUserIds.push(neel!.id);
    }
    assert.ok(neel);
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = neel.clerkUserId;

    let nikaUser = (
      await db.select().from(usersTable).where(eq(usersTable.email, NIKA_EMAIL)).limit(1)
    )[0];
    if (!nikaUser) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `reconnect-nika:${suffix}`,
          email: NIKA_EMAIL,
          displayName: "Nika Raiffe",
          role: "tutor",
        })
        .returning();
      nikaUser = created;
      createdUserIds.push(nikaUser!.id);
    }
    assert.ok(nikaUser);
    nikaUserId = nikaUser.id;
    if (nikaUser.email !== NIKA_EMAIL) {
      nikaEmailSnapshot = nikaUser.email;
      await db.update(usersTable).set({ email: NIKA_EMAIL }).where(eq(usersTable.id, nikaUser.id));
    }

    let profile = (
      await db.select().from(tutorProfilesTable).where(eq(tutorProfilesTable.email, NIKA_EMAIL)).limit(1)
    )[0];
    if (!profile) {
      const [created] = await db
        .insert(tutorProfilesTable)
        .values({
          userId: nikaUser.id,
          email: NIKA_EMAIL,
          name: "Nika Raiffe",
          title: "Admissions Tutor",
          subjects: ["College Consulting"],
          active: true,
          bookingEligible: true,
        })
        .returning();
      profile = created;
    }
    assert.ok(profile);

    const [existingRule] = await db
      .select()
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, profile.id))
      .limit(1);
    if (existingRule) {
      ruleSnapshot = existingRule;
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: "America/New_York",
          dateHours,
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          updatedAt: new Date(),
        })
        .where(eq(availabilityRulesTable.id, existingRule.id));
    } else {
      const [created] = await db
        .insert(availabilityRulesTable)
        .values({
          tutorProfileId: profile.id,
          timezone: "America/New_York",
          weeklyHours: {
            "0": [{ start: "07:00", end: "21:00" }],
            "1": [{ start: "07:00", end: "21:00" }],
            "2": [{ start: "07:00", end: "21:00" }],
            "3": [{ start: "07:00", end: "21:00" }],
            "4": [{ start: "07:00", end: "21:00" }],
            "5": [{ start: "07:00", end: "21:00" }],
            "6": [{ start: "07:00", end: "21:00" }],
          },
          dateHours,
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          blackoutDates: [],
        })
        .returning();
      createdRuleId = created!.id;
    }

    const [course] = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID))
      .limit(1);
    if (!course) {
      await db.insert(coursesTable).values({
        id: COLLEGE_CONSULTING_COURSE_ID,
        title: "College Consulting",
        subject: "College Consulting",
        term: "Fall 2026",
        status: "active",
      });
      createdCourse = true;
    }
    const [membership] = await db
      .select({ id: courseMembershipsTable.id })
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.courseId, COLLEGE_CONSULTING_COURSE_ID),
          eq(courseMembershipsTable.userId, neel.id),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .limit(1);
    if (!membership) {
      await db.insert(courseMembershipsTable).values({
        courseId: COLLEGE_CONSULTING_COURSE_ID,
        userId: neel.id,
        membershipRole: "student",
        subject: "College Consulting",
      });
      createdMembership = true;
    }

    const [admin] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `reconnect-admin:${suffix}`,
        email: `reconnect-admin-${suffix}@example.invalid`,
        displayName: "Reconnect Admin",
        role: "administrator",
      })
      .returning();
    createdUserIds.push(admin!.id);
    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = admin!.clerkUserId;

    const [storedConnection] = await db
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, profile.id),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      )
      .limit(1);
    if (storedConnection) {
      removedConnection = storedConnection;
      await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, storedConnection.id));
    }
    const [connection] = await db
      .insert(calendarConnectionsTable)
      .values({
        tutorProfileId: profile.id,
        provider: "google",
        status: "connected",
        calendarId: "primary",
        appCalendarId: null,
        grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
        encryptedAccessToken: encryptCalendarToken(`reconnect-access-${suffix}`),
        encryptedRefreshToken: encryptCalendarToken(`reconnect-refresh-${suffix}`),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        googleAccountEmail: NIKA_EMAIL,
      })
      .returning();
    createdConnectionId = connection!.id;

    server = await startServer(neel);
    const paymentsBefore = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.clientUserId, neel.id));
    const outside = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profile.id,
      durationMinutes: 60,
      startTime: CLOSED_START,
    });
    assert.equal(outside.status, 409, JSON.stringify(outside.body));
    assert.equal(outside.body.code, "SLOT_UNAVAILABLE");
    const paymentsAfterOutside = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.clientUserId, neel.id));
    assert.equal(paymentsAfterOutside.length, paymentsBefore.length);

    const checkout = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profile.id,
      durationMinutes: 60,
      startTime: NIKA_START,
    });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    const paymentId = String(checkout.body.paymentId);
    createdPaymentIds.push(paymentId);
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    assert.ok(payment);
    if (payment.invoiceId) createdInvoiceIds.push(payment.invoiceId);
    const googleBeforeConfirm = calendar.googleCalls();
    const emailBeforeConfirm = calendar.emailCalls();
    await processStripeWebhook({
      id: webhookEventId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_manual_invite_${suffix}`,
          payment_status: "paid",
          amount_total: Number(payment.amountCents),
          latest_charge: `ch_manual_invite_${suffix}`,
          metadata: { payment_id: paymentId },
          client_reference_id: paymentId,
        },
      },
    });

    const booked = await db
      .select()
      .from(sessionsTable)
      .where(
        and(eq(sessionsTable.clientUserId, neel.id), eq(sessionsTable.dateTime, new Date(NIKA_START))),
      );
    assert.equal(booked.length, 1);
    assert.equal(booked[0]?.bookingStatus, "confirmed");
    assert.equal(booked[0]?.providerEventId, null);
    assert.equal(booked[0]?.providerCalendarId, null);
    createdSessionIds.push(booked[0]!.id);
    assert.equal(calendar.googleCalls(), googleBeforeConfirm);
    assert.equal(calendar.emailCalls(), emailBeforeConfirm);
    assert.equal(calendar.writes.length, 0);

    manualInviteMessage = manualCalendarInviteMessage({
      bookerName: neel.displayName,
      bookerEmail: neel.email,
      tutorName: profile.name,
      tutorEmail: profile.email,
      start: new Date(NIKA_START),
      durationMinutes: 60,
    });
    const administrators = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "administrator"));
    const alerts = await db
      .select({
        recipientUserId: adminNotificationsTable.recipientUserId,
        kind: adminNotificationsTable.kind,
        title: adminNotificationsTable.title,
        message: adminNotificationsTable.message,
        status: adminNotificationsTable.status,
        sessionId: adminNotificationsTable.sessionId,
      })
      .from(adminNotificationsTable)
      .where(eq(adminNotificationsTable.message, manualInviteMessage));
    assert.ok(administrators.length > 0);
    assert.equal(alerts.length, administrators.length);
    for (const alert of alerts) {
      assert.equal(alert.kind, "manual_calendar_invite");
      assert.equal(alert.title, "Send calendar invite manually");
      assert.equal(alert.status, "unread");
      assert.equal(alert.sessionId, booked[0]!.id);
      assert.equal(alert.message, manualInviteMessage);
    }
  } finally {
    calendar.restore();
    if (server) await server.close();
    if (manualInviteMessage) {
      await db
        .delete(adminNotificationsTable)
        .where(eq(adminNotificationsTable.message, manualInviteMessage));
    }
    if (createdSessionIds.length > 0) {
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    await db
      .delete(stripeWebhookEventsTable)
      .where(eq(stripeWebhookEventsTable.providerEventId, webhookEventId));
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdPaymentIds.length > 0) {
      const paymentLedger = await db
        .select({ id: creditLedgerTable.id })
        .from(creditLedgerTable)
        .where(inArray(creditLedgerTable.referenceId, createdPaymentIds));
      if (paymentLedger.length > 0) {
        await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, paymentLedger.map((row) => row.id)));
      }
      await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.paymentId, createdPaymentIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
    }
    if (createdInvoiceIds.length > 0) {
      await db.delete(invoicesTable).where(inArray(invoicesTable.id, createdInvoiceIds));
    }
    if (createdConnectionId) {
      await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, createdConnectionId));
    }
    if (removedConnection) {
      await db.insert(calendarConnectionsTable).values(removedConnection);
    }
    if (createdRuleId) {
      await db.delete(availabilityRulesTable).where(eq(availabilityRulesTable.id, createdRuleId));
    } else if (ruleSnapshot) {
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: ruleSnapshot.timezone,
          weeklyHours: ruleSnapshot.weeklyHours,
          dateHours: ruleSnapshot.dateHours,
          bookingNoticeMinutes: ruleSnapshot.bookingNoticeMinutes,
          bufferMinutes: ruleSnapshot.bufferMinutes,
          blackoutDates: ruleSnapshot.blackoutDates,
          updatedAt: ruleSnapshot.updatedAt,
        })
        .where(eq(availabilityRulesTable.id, ruleSnapshot.id));
    }
    if (createdMembership) {
      await db
        .delete(courseMembershipsTable)
        .where(
          and(
            eq(courseMembershipsTable.courseId, COLLEGE_CONSULTING_COURSE_ID),
            eq(courseMembershipsTable.userId, NEEL_DHARNI_USER_ID),
          ),
        );
    }
    if (createdCourse) {
      await db.delete(coursesTable).where(eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID));
    }
    if (nikaEmailSnapshot && nikaUserId) {
      await db.update(usersTable).set({ email: nikaEmailSnapshot }).where(eq(usersTable.id, nikaUserId));
    }
    await deleteCreatedUsers(createdUserIds);
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    if (previousDouble === undefined) delete process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
    else process.env.STRIPE_CHECKOUT_TEST_DOUBLE = previousDouble;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    if (previousStudents === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    if (previousAdmins === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdmins;
    unlockNika();
  }
});

test("Victoria and Xavier consulting writes stay silent with no tutor guest", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for consulting invite coverage");
    return;
  }
  const cases = [
    {
      email: VICTORIA_PLACEHOLDER_EMAIL,
      name: "Victoria Wijerathnayapa",
      slug: "college-consulting-victoria-hour",
      start: zonedDateTimeToUtc("2027-06-08", "10:00", "America/New_York").toISOString(),
      next: zonedDateTimeToUtc("2027-06-08", "11:00", "America/New_York").toISOString(),
    },
    {
      email: CANONICAL_XAVIER_EMAIL,
      name: "Xavier Morales",
      slug: "college-consulting-xavier-hour",
      start: zonedDateTimeToUtc("2027-06-09", "10:00", "America/New_York").toISOString(),
      next: zonedDateTimeToUtc("2027-06-09", "11:00", "America/New_York").toISOString(),
    },
  ] as const;

  for (const item of cases) {
    const suffix = randomUUID().slice(0, 8);
    const previousSecret = process.env.SESSION_SECRET;
    const previousDouble = process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
    const previousOrigin = process.env.APP_ORIGIN;
    const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    const previousAdmins = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    process.env.SESSION_SECRET = previousSecret || "fixed-window-test-secret";
    process.env.STRIPE_CHECKOUT_TEST_DOUBLE = "1";
    process.env.APP_ORIGIN = "https://fixed-window.test";
    const appCalendarId = `silent-${suffix}`;
    const calendar = installCalendarMock(appCalendarId);
    const createdUserIds: string[] = [];
    const createdProfileIds: string[] = [];
    const createdSessionIds: string[] = [];
    const createdPaymentIds: string[] = [];
    let createdRuleId: string | undefined;
    let createdConnectionId: string | undefined;
    let ruleSnapshot: typeof availabilityRulesTable.$inferSelect | undefined;
    let connectionSnapshot: typeof calendarConnectionsTable.$inferSelect | undefined;
    let server: Awaited<ReturnType<typeof startServer>> | undefined;
    let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
    try {
      let neel = (
        await db.select().from(usersTable).where(eq(usersTable.id, NEEL_DHARNI_USER_ID)).limit(1)
      )[0];
      if (!neel) {
        const [created] = await db
          .insert(usersTable)
          .values({
            id: NEEL_DHARNI_USER_ID,
            clerkUserId: `silent-neel:${suffix}`,
            email: `silent-neel-${suffix}@example.invalid`,
            displayName: "Neel Dharni",
            role: "student",
          })
          .returning();
        neel = created;
        createdUserIds.push(neel!.id);
      }
      assert.ok(neel);
      process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = neel.clerkUserId;

      let profile = (
        await db.select().from(tutorProfilesTable).where(eq(tutorProfilesTable.email, item.email)).limit(1)
      )[0];
      if (!profile) {
        let tutorUser = (
          await db.select().from(usersTable).where(eq(usersTable.email, item.email)).limit(1)
        )[0];
        if (!tutorUser) {
          const [createdTutor] = await db
            .insert(usersTable)
            .values({
              clerkUserId: `silent-tutor:${suffix}`,
              email: item.email,
              displayName: item.name,
              role: "tutor",
            })
            .returning();
          tutorUser = createdTutor;
          createdUserIds.push(tutorUser!.id);
        }
        const [createdProfile] = await db
          .insert(tutorProfilesTable)
          .values({
            userId: tutorUser!.id,
            email: item.email,
            name: item.name,
            title: "Tutor",
            subjects: ["College Consulting"],
            active: true,
            bookingEligible: true,
          })
          .returning();
        profile = createdProfile;
        createdProfileIds.push(profile!.id);
      }
      assert.ok(profile);
      const weeklyHours = {
        "0": [{ start: "07:00", end: "21:00" }],
        "1": [{ start: "07:00", end: "21:00" }],
        "2": [{ start: "07:00", end: "21:00" }],
        "3": [{ start: "07:00", end: "21:00" }],
        "4": [{ start: "07:00", end: "21:00" }],
        "5": [{ start: "07:00", end: "21:00" }],
        "6": [{ start: "07:00", end: "21:00" }],
      };
      const [existingRule] = await db
        .select()
        .from(availabilityRulesTable)
        .where(eq(availabilityRulesTable.tutorProfileId, profile.id))
        .limit(1);
      if (existingRule) {
        ruleSnapshot = existingRule;
        await db
          .update(availabilityRulesTable)
          .set({
            timezone: "America/New_York",
            weeklyHours,
            dateHours: {},
            bookingNoticeMinutes: 0,
            bufferMinutes: 0,
            updatedAt: new Date(),
          })
          .where(eq(availabilityRulesTable.id, existingRule.id));
      } else {
        const [rule] = await db
          .insert(availabilityRulesTable)
          .values({
            tutorProfileId: profile.id,
            timezone: "America/New_York",
            weeklyHours,
            dateHours: {},
            bookingNoticeMinutes: 0,
            bufferMinutes: 0,
            blackoutDates: [],
          })
          .returning();
        createdRuleId = rule!.id;
      }
      const [existingConnection] = await db
        .select()
        .from(calendarConnectionsTable)
        .where(
          and(
            eq(calendarConnectionsTable.tutorProfileId, profile.id),
            eq(calendarConnectionsTable.provider, "google"),
          ),
        )
        .limit(1);
      if (existingConnection) {
        connectionSnapshot = existingConnection;
        await db
          .update(calendarConnectionsTable)
          .set({
            status: "connected",
            calendarId: "primary",
            appCalendarId,
            grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
            encryptedAccessToken: encryptCalendarToken(`silent-access-${suffix}`),
            accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
            googleAccountEmail: item.email,
            updatedAt: new Date(),
          })
          .where(eq(calendarConnectionsTable.id, existingConnection.id));
      } else {
        const [connection] = await db
          .insert(calendarConnectionsTable)
          .values({
            tutorProfileId: profile.id,
            provider: "google",
            status: "connected",
            calendarId: "primary",
            appCalendarId,
            grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
            encryptedAccessToken: encryptCalendarToken(`silent-access-${suffix}`),
            accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
            googleAccountEmail: item.email,
          })
          .returning();
        createdConnectionId = connection!.id;
      }
      const [course] = await db
        .select({ id: coursesTable.id })
        .from(coursesTable)
        .where(eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID))
        .limit(1);
      if (!course) {
        await db.insert(coursesTable).values({
          id: COLLEGE_CONSULTING_COURSE_ID,
          title: "College Consulting",
          subject: "College Consulting",
          term: "Fall 2026",
          status: "active",
        });
      }
      await db
        .insert(courseMembershipsTable)
        .values({
          courseId: COLLEGE_CONSULTING_COURSE_ID,
          userId: neel.id,
          membershipRole: "student",
          subject: "College Consulting",
        })
        .onConflictDoNothing();
      const [admin] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `silent-admin:${suffix}`,
          email: `silent-admin-${suffix}@example.invalid`,
          displayName: "Silent Admin",
          role: "administrator",
        })
        .returning();
      createdUserIds.push(admin!.id);
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = admin!.clerkUserId;
      server = await startServer(neel);
      adminServer = await startServer(admin!);

      const checkout = await postJson(server.baseUrl, "/api/payments/checkout", {
        tutorProfileId: profile!.id,
        durationMinutes: 60,
        startTime: item.start,
      });
      assert.equal(checkout.status, 201, `${item.email} ${JSON.stringify(checkout.body)}`);
      const paymentId = String(checkout.body.paymentId);
      createdPaymentIds.push(paymentId);
      const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
      assert.ok(payment);
      await processStripeWebhook({
        id: `evt_silent_${suffix}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_silent_${suffix}`,
            payment_status: "paid",
            amount_total: Number(payment.amountCents),
            latest_charge: `ch_silent_${suffix}`,
            metadata: { payment_id: paymentId },
            client_reference_id: paymentId,
          },
        },
      });
      const [session] = await db
        .select()
        .from(sessionsTable)
        .where(and(eq(sessionsTable.clientUserId, neel.id), eq(sessionsTable.dateTime, new Date(item.start))));
      assert.ok(session, item.email);
      createdSessionIds.push(session.id);
      const createdWrite = calendar.writes.find((write) => write.method === "POST");
      assert.ok(createdWrite, JSON.stringify(calendar.writes));
      assert.match(createdWrite.url, /sendUpdates=none$/);
      assert.equal(createdWrite.attendees.includes(item.email), false);
      assert.deepEqual(createdWrite.attendees, [neel.email, ADMIN_EMAIL]);

      calendar.writes.length = 0;
      const rescheduled = await postJson(server.baseUrl, `/api/booking/sessions/${session.id}/reschedule`, {
        startTime: item.next,
      });
      assert.equal(rescheduled.status, 200, `${item.email} ${JSON.stringify(rescheduled.body)}`);
      const rescheduleWrite = calendar.writes.find((write) => write.method === "PATCH");
      assert.ok(rescheduleWrite, JSON.stringify(calendar.writes));
      assert.match(rescheduleWrite.url, /sendUpdates=none$/);
      assert.equal(rescheduleWrite.attendees.includes(item.email), false);

      calendar.writes.length = 0;
      const edited = await patchJson(adminServer.baseUrl, `/api/admin/sessions/${session.id}`, {
        durationMinutes: 90,
      });
      assert.equal(edited.status, 200, `${item.email} ${JSON.stringify(edited.body)}`);
      const editWrite = calendar.writes.find((write) => write.method === "PATCH");
      assert.ok(editWrite, JSON.stringify(calendar.writes));
      assert.match(editWrite.url, /sendUpdates=none$/);
      assert.equal(editWrite.attendees.includes(item.email), false);

      calendar.writes.length = 0;
      const cancelled = await postJson(server.baseUrl, `/api/booking/sessions/${session.id}/cancel`, {
        reason: "test",
      });
      assert.equal(cancelled.status, 200, `${item.email} ${JSON.stringify(cancelled.body)}`);
      const cancelWrite = calendar.writes.find((write) => write.method === "DELETE");
      assert.ok(cancelWrite, JSON.stringify(calendar.writes));
      assert.match(cancelWrite.url, /sendUpdates=none$/);
      assert.equal(item.slug.includes("college-consulting"), true);
    } finally {
      calendar.restore();
      if (server) await server.close();
      if (adminServer) await adminServer.close();
      if (createdSessionIds.length > 0) {
        await db
          .delete(adminNotificationsTable)
          .where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
        await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
        await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
      }
      if (createdPaymentIds.length > 0) {
        await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
      }
      if (createdRuleId) {
        await db.delete(availabilityRulesTable).where(eq(availabilityRulesTable.id, createdRuleId));
      } else if (ruleSnapshot) {
        await db
          .update(availabilityRulesTable)
          .set({
            timezone: ruleSnapshot.timezone,
            weeklyHours: ruleSnapshot.weeklyHours,
            dateHours: ruleSnapshot.dateHours,
            bookingNoticeMinutes: ruleSnapshot.bookingNoticeMinutes,
            bufferMinutes: ruleSnapshot.bufferMinutes,
            blackoutDates: ruleSnapshot.blackoutDates,
            updatedAt: ruleSnapshot.updatedAt,
          })
          .where(eq(availabilityRulesTable.id, ruleSnapshot.id));
      }
      if (createdConnectionId) {
        await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, createdConnectionId));
      } else if (connectionSnapshot) {
        await db
          .update(calendarConnectionsTable)
          .set({
            status: connectionSnapshot.status,
            calendarId: connectionSnapshot.calendarId,
            appCalendarId: connectionSnapshot.appCalendarId,
            grantedScopes: connectionSnapshot.grantedScopes,
            encryptedAccessToken: connectionSnapshot.encryptedAccessToken,
            encryptedRefreshToken: connectionSnapshot.encryptedRefreshToken,
            accessTokenExpiresAt: connectionSnapshot.accessTokenExpiresAt,
            googleAccountEmail: connectionSnapshot.googleAccountEmail,
            updatedAt: connectionSnapshot.updatedAt,
          })
          .where(eq(calendarConnectionsTable.id, connectionSnapshot.id));
      }
      if (createdProfileIds.length > 0) {
        await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
      }
      await deleteCreatedUsers(createdUserIds);
      if (previousSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSecret;
      if (previousDouble === undefined) delete process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
      else process.env.STRIPE_CHECKOUT_TEST_DOUBLE = previousDouble;
      if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = previousOrigin;
      if (previousStudents === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
      else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
      if (previousAdmins === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
      else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdmins;
    }
  }
});

test("Neel books a disconnected Nika fixed window on the admin calendar", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for the admin calendar fallback");
    return;
  }
  const unlockNika = await lockNika();
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousDouble = process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
  const previousOrigin = process.env.APP_ORIGIN;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousAdmins = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  process.env.SESSION_SECRET = previousSecret || "admin-fallback-test-secret";
  process.env.STRIPE_CHECKOUT_TEST_DOUBLE = "1";
  process.env.APP_ORIGIN = "https://admin-fallback.test";
  const adminCalendarId = `admin-cal-${suffix}`;
  const calendar = installCalendarMock(adminCalendarId);
  const createdUserIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const createdProfileIds: string[] = [];
  let createdCourse = false;
  let createdMembership = false;
  let createdRuleId: string | undefined;
  let createdConnectionId: string | undefined;
  let removedConnection: typeof calendarConnectionsTable.$inferSelect | undefined;
  let ruleSnapshot: typeof availabilityRulesTable.$inferSelect | undefined;
  let nikaEmailSnapshot: string | undefined;
  let nikaUserId: string | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let refusalMessage = "";
  const refusalWebhookId = `evt_admin_fallback_refusal_${suffix}`;
  const successWebhookId = `evt_admin_fallback_success_${suffix}`;
  const laterStart = zonedDateTimeToUtc("2026-10-22", "16:00", "America/New_York").toISOString();

  try {
    const dateHours = await nikaDateHours();
    let neel = (
      await db.select().from(usersTable).where(eq(usersTable.id, NEEL_DHARNI_USER_ID)).limit(1)
    )[0];
    if (!neel) {
      const [created] = await db
        .insert(usersTable)
        .values({
          id: NEEL_DHARNI_USER_ID,
          clerkUserId: `admin-fallback-neel:${suffix}`,
          email: `admin-fallback-neel-${suffix}@example.invalid`,
          displayName: "Neel Dharni",
          role: "student",
        })
        .returning();
      neel = created;
      createdUserIds.push(neel!.id);
    }
    assert.ok(neel);
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = neel.clerkUserId;

    let nikaUser = (
      await db.select().from(usersTable).where(eq(usersTable.email, NIKA_EMAIL)).limit(1)
    )[0];
    if (!nikaUser) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `admin-fallback-nika:${suffix}`,
          email: NIKA_EMAIL,
          displayName: "Nika Raiffe",
          role: "tutor",
        })
        .returning();
      nikaUser = created;
      createdUserIds.push(nikaUser!.id);
    }
    assert.ok(nikaUser);
    nikaUserId = nikaUser.id;
    if (nikaUser.email !== NIKA_EMAIL) {
      nikaEmailSnapshot = nikaUser.email;
      await db.update(usersTable).set({ email: NIKA_EMAIL }).where(eq(usersTable.id, nikaUser.id));
    }

    let profile = (
      await db.select().from(tutorProfilesTable).where(eq(tutorProfilesTable.email, NIKA_EMAIL)).limit(1)
    )[0];
    if (!profile) {
      const [created] = await db
        .insert(tutorProfilesTable)
        .values({
          userId: nikaUser.id,
          email: NIKA_EMAIL,
          name: "Nika Raiffe",
          title: "Admissions Tutor",
          subjects: ["College Consulting"],
          active: true,
          bookingEligible: true,
        })
        .returning();
      profile = created;
    }
    assert.ok(profile);

    const [existingRule] = await db
      .select()
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, profile.id))
      .limit(1);
    if (existingRule) {
      ruleSnapshot = existingRule;
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: "America/New_York",
          dateHours,
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          updatedAt: new Date(),
        })
        .where(eq(availabilityRulesTable.id, existingRule.id));
    } else {
      const [created] = await db
        .insert(availabilityRulesTable)
        .values({
          tutorProfileId: profile.id,
          timezone: "America/New_York",
          weeklyHours: {
            "0": [{ start: "07:00", end: "21:00" }],
            "1": [{ start: "07:00", end: "21:00" }],
            "2": [{ start: "07:00", end: "21:00" }],
            "3": [{ start: "07:00", end: "21:00" }],
            "4": [{ start: "07:00", end: "21:00" }],
            "5": [{ start: "07:00", end: "21:00" }],
            "6": [{ start: "07:00", end: "21:00" }],
          },
          dateHours,
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          blackoutDates: [],
        })
        .returning();
      createdRuleId = created!.id;
    }

    const [course] = await db
      .select({ id: coursesTable.id })
      .from(coursesTable)
      .where(eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID))
      .limit(1);
    if (!course) {
      await db.insert(coursesTable).values({
        id: COLLEGE_CONSULTING_COURSE_ID,
        title: "College Consulting",
        subject: "College Consulting",
        term: "Fall 2026",
        status: "active",
      });
      createdCourse = true;
    }
    const [membership] = await db
      .select({ id: courseMembershipsTable.id })
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.courseId, COLLEGE_CONSULTING_COURSE_ID),
          eq(courseMembershipsTable.userId, neel.id),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .limit(1);
    if (!membership) {
      await db.insert(courseMembershipsTable).values({
        courseId: COLLEGE_CONSULTING_COURSE_ID,
        userId: neel.id,
        membershipRole: "student",
        subject: "College Consulting",
      });
      createdMembership = true;
    }

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `admin-fallback-admin:${suffix}`,
        email: `admin-fallback-admin-${suffix}@example.invalid`,
        displayName: "Fallback Admin",
        role: "administrator",
      })
      .returning();
    createdUserIds.push(adminUser!.id);
    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = adminUser!.clerkUserId;

    const [storedConnection] = await db
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, profile.id),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      )
      .limit(1);
    if (storedConnection) {
      removedConnection = storedConnection;
      await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, storedConnection.id));
    }

    server = await startServer(neel);
    const offered = await getJson(
      server.baseUrl,
      `/api/booking/availability?tutorProfileId=${profile.id}&from=2026-10-21T20:00:00.000Z&to=2026-10-22T22:00:00.000Z&durationMinutes=60`,
    );
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
    assert.equal(offered.body.slots?.includes(NIKA_START), true);
    assert.equal(offered.body.slots?.includes(CLOSED_START), false);
    assert.equal(offered.body.slots?.includes(laterStart), true);
    assert.equal(calendar.freeBusyCalls(), 0);

    const outside = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profile.id,
      durationMinutes: 60,
      startTime: CLOSED_START,
    });
    assert.equal(outside.status, 409, JSON.stringify(outside.body));
    assert.equal(outside.body.code, "SLOT_UNAVAILABLE");

    const [hour] = await db
      .select()
      .from(satProductsTable)
      .where(eq(satProductsTable.slug, "college-consulting-nika-hour"))
      .limit(1);
    assert.ok(hour);
    const [nikaConnection] = await db
      .insert(calendarConnectionsTable)
      .values({
        tutorProfileId: profile.id,
        provider: "google",
        status: "connected",
        calendarId: "primary",
        appCalendarId: `nika-own-${suffix}`,
        grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
        encryptedAccessToken: encryptCalendarToken(`nika-access-${suffix}`),
        encryptedRefreshToken: encryptCalendarToken(`nika-refresh-${suffix}`),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        googleAccountEmail: NIKA_EMAIL,
      })
      .returning();
    createdConnectionId = nikaConnection!.id;
    const paidCheckout = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profile.id,
      durationMinutes: 60,
      startTime: laterStart,
    });
    assert.equal(paidCheckout.status, 201, JSON.stringify(paidCheckout.body));
    const refusedPaymentId = String(paidCheckout.body.paymentId);
    createdPaymentIds.push(refusedPaymentId);
    await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, nikaConnection!.id));
    createdConnectionId = undefined;
    const [refusedPayment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, refusedPaymentId));
    assert.ok(refusedPayment);
    await processStripeWebhook({
      id: refusalWebhookId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_admin_fallback_refusal_${suffix}`,
          payment_status: "paid",
          amount_total: Number(refusedPayment.amountCents),
          latest_charge: `ch_admin_fallback_refusal_${suffix}`,
          metadata: { payment_id: refusedPaymentId },
          client_reference_id: refusedPaymentId,
        },
      },
    });
    const manualSessions = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.clientUserId, neel.id), eq(sessionsTable.dateTime, new Date(laterStart))));
    assert.equal(manualSessions.length, 1);
    assert.equal(manualSessions[0]?.bookingStatus, "confirmed");
    assert.equal(manualSessions[0]?.providerEventId, null);
    createdSessionIds.push(manualSessions[0]!.id);
    refusalMessage = manualCalendarInviteMessage({
      bookerName: neel.displayName,
      bookerEmail: neel.email,
      tutorName: profile.name,
      tutorEmail: profile.email,
      start: new Date(laterStart),
      durationMinutes: 60,
    });
    const notices = await db
      .select({ id: adminNotificationsTable.id, kind: adminNotificationsTable.kind, title: adminNotificationsTable.title })
      .from(adminNotificationsTable)
      .where(eq(adminNotificationsTable.message, refusalMessage));
    assert.ok(notices.length > 0);
    assert.equal(notices[0]?.kind, "manual_calendar_invite");
    assert.equal(notices[0]?.title, "Send calendar invite manually");
    assert.equal(calendar.writes.length, 0);
    assert.equal(calendar.emailCalls(), 0);

    const [adminProfile] = await db
      .insert(tutorProfilesTable)
      .values({
        email: `admin-calendar-${suffix}@example.invalid`,
        name: "Admin Calendar",
        title: "Calendar",
        subjects: ["College Consulting"],
        active: true,
        bookingEligible: false,
      })
      .returning();
    createdProfileIds.push(adminProfile!.id);
    const [adminConnection] = await db
      .insert(calendarConnectionsTable)
      .values({
        tutorProfileId: adminProfile!.id,
        provider: "google",
        status: "connected",
        calendarId: "primary",
        appCalendarId: adminCalendarId,
        grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
        encryptedAccessToken: encryptCalendarToken(`admin-access-${suffix}`),
        encryptedRefreshToken: encryptCalendarToken(`admin-refresh-${suffix}`),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        googleAccountEmail: ADMIN_EMAIL,
      })
      .returning();
    createdConnectionId = adminConnection!.id;

    const busyBefore = calendar.freeBusyCalls();
    const writesBefore = calendar.writes.length;
    const openAfterAdmin = await getJson(
      server.baseUrl,
      `/api/booking/availability?tutorProfileId=${profile.id}&from=2026-10-21T20:00:00.000Z&to=2026-10-22T22:00:00.000Z&durationMinutes=60`,
    );
    assert.equal(openAfterAdmin.body.slots?.includes(NIKA_START), true);
    assert.equal(openAfterAdmin.body.slots?.includes(CLOSED_START), false);
    assert.equal(calendar.freeBusyCalls(), busyBefore);

    const checkout = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: profile.id,
      durationMinutes: 60,
      startTime: NIKA_START,
    });
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
    const paymentId = String(checkout.body.paymentId);
    createdPaymentIds.push(paymentId);
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    assert.ok(payment);
    await processStripeWebhook({
      id: successWebhookId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_admin_fallback_${suffix}`,
          payment_status: "paid",
          amount_total: Number(payment.amountCents),
          latest_charge: `ch_admin_fallback_${suffix}`,
          metadata: { payment_id: paymentId },
          client_reference_id: paymentId,
        },
      },
    });

    const booked = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.clientUserId, neel.id), eq(sessionsTable.dateTime, new Date(NIKA_START))));
    assert.equal(booked.length, 1);
    assert.equal(booked[0]?.bookingStatus, "confirmed");
    assert.equal(booked[0]?.providerCalendarId, adminCalendarId);
    assert.equal(booked[0]?.providerEventUrl, "https://meet.google.com/admin-fallback-meet");
    createdSessionIds.push(booked[0]!.id);
    const invite = calendar.writes.slice(writesBefore).find((write) => write.method === "POST");
    assert.ok(invite, JSON.stringify(calendar.writes.slice(writesBefore)));
    assert.equal(invite.calendarId, adminCalendarId);
    assert.match(invite.url, /sendUpdates=all/);
    assert.match(invite.url, /conferenceDataVersion=1/);
    assert.equal(invite.conference, true);
    assert.deepEqual(invite.attendees, [neel.email, NIKA_EMAIL, ADMIN_EMAIL]);
    assert.equal(
      calendar.writes.slice(writesBefore).some((write) => write.calendarId.includes("nika-own")),
      false,
    );
    assert.equal(calendar.freeBusyCalls(), busyBefore);
  } finally {
    calendar.restore();
    if (server) await server.close();
    if (refusalMessage) {
      await db.delete(adminNotificationsTable).where(eq(adminNotificationsTable.message, refusalMessage));
    }
    if (createdSessionIds.length > 0) {
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    await db.delete(stripeWebhookEventsTable).where(inArray(stripeWebhookEventsTable.providerEventId, [refusalWebhookId, successWebhookId]));
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdPaymentIds.length > 0) {
      const paymentLedger = await db
        .select({ id: creditLedgerTable.id })
        .from(creditLedgerTable)
        .where(inArray(creditLedgerTable.referenceId, createdPaymentIds));
      if (paymentLedger.length > 0) {
        await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, paymentLedger.map((row) => row.id)));
      }
      await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.paymentId, createdPaymentIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
    }
    if (createdConnectionId) {
      await db.delete(calendarConnectionsTable).where(eq(calendarConnectionsTable.id, createdConnectionId));
    }
    if (createdProfileIds.length > 0) {
      await db.delete(calendarConnectionsTable).where(inArray(calendarConnectionsTable.tutorProfileId, createdProfileIds));
      await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.tutorProfileId, createdProfileIds));
      await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
    }
    if (removedConnection) {
      await db.insert(calendarConnectionsTable).values(removedConnection);
    }
    if (createdRuleId) {
      await db.delete(availabilityRulesTable).where(eq(availabilityRulesTable.id, createdRuleId));
    } else if (ruleSnapshot) {
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: ruleSnapshot.timezone,
          weeklyHours: ruleSnapshot.weeklyHours,
          dateHours: ruleSnapshot.dateHours,
          bookingNoticeMinutes: ruleSnapshot.bookingNoticeMinutes,
          bufferMinutes: ruleSnapshot.bufferMinutes,
          blackoutDates: ruleSnapshot.blackoutDates,
          updatedAt: ruleSnapshot.updatedAt,
        })
        .where(eq(availabilityRulesTable.id, ruleSnapshot.id));
    }
    if (createdMembership) {
      await db
        .delete(courseMembershipsTable)
        .where(
          and(
            eq(courseMembershipsTable.courseId, COLLEGE_CONSULTING_COURSE_ID),
            eq(courseMembershipsTable.userId, NEEL_DHARNI_USER_ID),
          ),
        );
    }
    if (createdCourse) {
      await db.delete(coursesTable).where(eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID));
    }
    if (nikaEmailSnapshot && nikaUserId) {
      await db.update(usersTable).set({ email: nikaEmailSnapshot }).where(eq(usersTable.id, nikaUserId));
    }
    await deleteCreatedUsers(createdUserIds);
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    if (previousDouble === undefined) delete process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
    else process.env.STRIPE_CHECKOUT_TEST_DOUBLE = previousDouble;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    if (previousStudents === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    if (previousAdmins === undefined) delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    else process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdmins;
    unlockNika();
  }
});
