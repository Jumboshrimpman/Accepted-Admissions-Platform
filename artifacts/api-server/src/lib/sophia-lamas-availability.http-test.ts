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
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import platformRouter from "../routes/platform";
import {
  ADMIN_CALENDAR_ACCOUNT_EMAIL,
  ADMIN_CALENDAR_PROFILE_TITLE,
  SOPHIA_LAMAS_TUTOR_EMAIL,
  SOPHIA_LAMAS_TUTOR_NAME,
} from "./admin-calendar-fallback";
import {
  MICHELLE_MAKAREM_CLERK_USER_ID,
  MICHELLE_MAKAREM_EMAIL,
} from "./calendar-pair-attendees";
import { zonedDateTimeToUtc } from "./booking";
import {
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  encryptCalendarToken,
} from "./google-calendar";
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients";
import {
  SOPHIA_LAMAS_MEET_URL,
  SOPHIA_SLEIMAN_MEET_URL,
} from "./session-meeting-url";
import { SHARED_FALL_MEETING_URL } from "./session-schedule";

const NIKA_NAME = "Nika Raiffe";
const FALL_SAT_COURSE_TITLE = "Fall 2026 SAT & IELTS";
const MONDAY_START = zonedDateTimeToUtc("2026-11-16", "18:00", "Asia/Dubai").toISOString();
const WEDNESDAY_START = zonedDateTimeToUtc("2026-11-18", "18:00", "Asia/Dubai").toISOString();
const AVAILABILITY_PATH = (tutorProfileId: string) =>
  `/api/booking/availability?tutorProfileId=${tutorProfileId}&from=2026-11-16T13:00:00.000Z&to=2026-11-18T16:00:00.000Z&durationMinutes=60`;

type CapturedWrite = {
  method: string;
  url: string;
  attendees: string[];
  location?: string;
  description?: string;
  conferenceUri?: string;
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
        sessionId: `sophia-lamas-avail-http:${user.id}`,
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

function installCalendarMock(
  appCalendarId: string,
  busy: { start: string; end: string }[] = [],
) {
  const writes: CapturedWrite[] = [];
  let freeBusyCalls = 0;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.includes("api.resend.com")) {
      return Response.json({ id: "email-should-not-send" });
    }
    if (url.includes("/calendar/v3/")) {
      if (url.includes("/freeBusy")) {
        freeBusyCalls += 1;
        return Response.json({
          calendars: {
            primary: { busy },
            [appCalendarId]: { busy },
          },
        });
      }
      if (url.includes("/events")) {
        let attendees: string[] = [];
        let location: string | undefined;
        let description: string | undefined;
        let conferenceUri: string | undefined;
        if (typeof init?.body === "string") {
          const parsed = JSON.parse(init.body) as {
            attendees?: { email: string }[];
            location?: string;
            description?: string;
            conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
          };
          attendees = (parsed.attendees ?? []).map((attendee) => attendee.email);
          location = parsed.location;
          description = parsed.description;
          conferenceUri = parsed.conferenceData?.entryPoints?.find(
            (entry) => entry.entryPointType === "video",
          )?.uri;
        }
        const calendarMatch = url.match(/\/calendars\/([^/]+)\/events/);
        writes.push({
          method: init?.method ?? "POST",
          url,
          attendees,
          location,
          description,
          conferenceUri,
          calendarId: calendarMatch ? decodeURIComponent(calendarMatch[1]!) : "",
        });
        if ((init?.method ?? "POST") === "DELETE") return new Response(null, { status: 204 });
        return Response.json({
          id: `evt-${randomUUID()}`,
          htmlLink: "https://calendar.google.com/calendar/event?eid=sophia-lamas-avail",
          hangoutLink: "https://meet.google.com/should-not-use-generated-meet",
        });
      }
      return Response.json({});
    }
    return original(input, init);
  }) as typeof fetch;
  return {
    writes,
    freeBusyCalls: () => freeBusyCalls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function assertSophiaInvite(write: CapturedWrite, args: {
  adminCalendarId: string;
  studentEmail: string;
  tutorEmail: string;
}) {
  assert.equal(write.calendarId, args.adminCalendarId);
  assert.equal(write.location, SOPHIA_LAMAS_MEET_URL);
  assert.equal(write.description, SOPHIA_LAMAS_MEET_URL);
  assert.equal(write.conferenceUri, SOPHIA_LAMAS_MEET_URL);
  assert.notEqual(write.location, SOPHIA_SLEIMAN_MEET_URL);
  assert.notEqual(write.location, SHARED_FALL_MEETING_URL);
  assert.notEqual(write.conferenceUri, SOPHIA_SLEIMAN_MEET_URL);
  assert.notEqual(write.conferenceUri, SHARED_FALL_MEETING_URL);
  assert.deepEqual(write.attendees, [args.studentEmail, args.tutorEmail, ADMIN_CALENDAR_ACCOUNT_EMAIL]);
}

async function ensureProduct(slug: string, name: string, priceCents: number) {
  const [existing] = await db.select().from(satProductsTable).where(eq(satProductsTable.slug, slug)).limit(1);
  if (existing) return { product: existing, created: false };
  const [created] = await db
    .insert(satProductsTable)
    .values({
      slug,
      name,
      description: `${name} test product`,
      durationHours: 1,
      totalPriceCents: priceCents,
      effectiveHourlyRateCents: priceCents,
      active: true,
    })
    .returning();
  return { product: created!, created: true };
}

let suiteTurn: Promise<void> = Promise.resolve();

function lockSuite(): Promise<() => void> {
  let unlock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const previous = suiteTurn;
  suiteTurn = gate;
  return previous.then(() => unlock);
}

test("disconnected Sophia Lamas offers fixed hours with no free/busy and writes admin invites", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for Sophia Lamas availability");
    return;
  }
  const unlock = await lockSuite();
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousDouble = process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
  process.env.SESSION_SECRET = previousSecret || "sophia-lamas-avail-test-secret";
  process.env.STRIPE_CHECKOUT_TEST_DOUBLE = "1";
  const adminCalendarId = `sophia-admin-${suffix}`;
  const calendar = installCalendarMock(adminCalendarId);
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const createdPaymentIds: string[] = [];
  let createdCourseId: string | undefined;
  let createdMembershipId: string | undefined;
  let createdProduct = false;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    const monday = MONDAY_START;
    assert.equal(monday, "2026-11-16T14:00:00.000Z");
    assert.equal(WEDNESDAY_START, "2026-11-18T14:00:00.000Z");

    let michelle = (
      await db
        .select()
        .from(usersTable)
        .where(
          or(
            eq(usersTable.id, MICHELLE_MAKAREM_USER_ID),
            eq(usersTable.clerkUserId, MICHELLE_MAKAREM_CLERK_USER_ID),
            eq(usersTable.email, MICHELLE_MAKAREM_EMAIL),
          ),
        )
        .limit(1)
    )[0];
    if (michelle) {
      reusedMichelle = true;
    } else {
      const [created] = await db
        .insert(usersTable)
        .values({
          id: MICHELLE_MAKAREM_USER_ID,
          clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
          email: MICHELLE_MAKAREM_EMAIL,
          displayName: "Michelle Makarem",
          role: "student",
        })
        .returning();
      michelle = created;
      createdUserIds.push(michelle!.id);
    }
    assert.ok(michelle);
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = michelle.clerkUserId;

    const [sophiaUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `sophia-lamas-avail:${suffix}`,
        email: `sophia-lamas-avail-${suffix}@example.invalid`,
        displayName: SOPHIA_LAMAS_TUTOR_NAME,
        role: "tutor",
      })
      .returning();
    createdUserIds.push(sophiaUser!.id);
    const [sophia] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: sophiaUser!.id,
        email: `sophia-lamas-avail-${suffix}@example.invalid`,
        name: SOPHIA_LAMAS_TUTOR_NAME,
        title: "SAT English Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
      })
      .returning();
    createdProfileIds.push(sophia!.id);
    await db.insert(availabilityRulesTable).values({
      tutorProfileId: sophia!.id,
      timezone: "Asia/Dubai",
      weeklyHours: {},
      dateHours: {},
      recurringHours: {
        startDate: "2026-11-16",
        endDate: null,
        days: {
          "1": [{ start: "18:00", end: "19:00" }],
          "2": [{ start: "18:00", end: "19:00" }],
          "3": [{ start: "18:00", end: "19:00" }],
        },
      },
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    });

    let course = (
      await db.select().from(coursesTable).where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE)).limit(1)
    )[0];
    if (!course) {
      const [created] = await db
        .insert(coursesTable)
        .values({
          title: FALL_SAT_COURSE_TITLE,
          subject: "SAT",
          term: "Fall 2026",
          status: "active",
        })
        .returning();
      course = created;
      createdCourseId = created!.id;
    }
    const [membership] = await db
      .select()
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.courseId, course!.id),
          eq(courseMembershipsTable.userId, michelle.id),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .limit(1);
    if (!membership) {
      const [created] = await db.insert(courseMembershipsTable).values({
        courseId: course!.id,
        userId: michelle.id,
        membershipRole: "student",
        subject: "SAT",
      }).returning();
      createdMembershipId = created!.id;
    }

    let adminUser = (
      await db.select().from(usersTable).where(eq(usersTable.email, ADMIN_CALENDAR_ACCOUNT_EMAIL)).limit(1)
    )[0];
    if (!adminUser) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `sophia-admin-cal:${suffix}`,
          email: ADMIN_CALENDAR_ACCOUNT_EMAIL,
          displayName: "Admin Calendar",
          role: "administrator",
        })
        .returning();
      adminUser = created;
      createdUserIds.push(adminUser!.id);
    }
    const [adminProfile] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: adminUser!.id,
        email: `sophia-admin-cal-${suffix}@example.invalid`,
        name: "Admin Calendar",
        title: ADMIN_CALENDAR_PROFILE_TITLE,
        subjects: [],
        active: true,
        bookingEligible: false,
      })
      .returning();
    createdProfileIds.push(adminProfile!.id);
    await db.insert(calendarConnectionsTable).values({
      tutorProfileId: adminProfile!.id,
      provider: "google",
      status: "connected",
      calendarId: "primary",
      appCalendarId: adminCalendarId,
      grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
      encryptedAccessToken: encryptCalendarToken(`admin-access-${suffix}`),
      encryptedRefreshToken: encryptCalendarToken(`admin-refresh-${suffix}`),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      googleAccountEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    });

    const product = await ensureProduct("sat-sophia-lamas-60", "SAT 1 hour with Sophia", 18_000);
    createdProduct = product.created;
    const [credit] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: michelle.id,
        productId: product.product.id,
        entryType: "original",
        hours: 2,
        note: `sophia-lamas-avail-${suffix}`,
      })
      .returning();
    createdLedgerIds.push(credit!.id);

    server = await startServer(michelle);
    const offered = await getJson(server.baseUrl, AVAILABILITY_PATH(sophia!.id));
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
    assert.equal(offered.body.slots?.includes(monday), true);
    assert.equal(offered.body.slots?.includes(WEDNESDAY_START), true);
    assert.equal(calendar.freeBusyCalls(), 0);

    const booked = await postJson(server.baseUrl, "/api/booking/sessions", {
      tutorProfileId: sophia!.id,
      startTime: monday,
      durationMinutes: 60,
    });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    createdSessionIds.push(String(booked.body.id));
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, String(booked.body.id)));
    assert.ok(session);
    assert.equal(session.providerCalendarId, adminCalendarId);
    assert.equal(session.providerEventUrl, SOPHIA_LAMAS_MEET_URL);
    const invite = calendar.writes.find((write) => write.method === "POST");
    assert.ok(invite, JSON.stringify(calendar.writes));
    assertSophiaInvite(invite, {
      adminCalendarId,
      studentEmail: michelle.email,
      tutorEmail: sophia!.email,
    });
    assert.equal(calendar.freeBusyCalls(), 0);
  } finally {
    calendar.restore();
    if (server) await server.close();
    if (createdSessionIds.length > 0) {
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    if (createdPaymentIds.length > 0) {
      await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.paymentId, createdPaymentIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
    }
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdMembershipId) {
      await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.id, createdMembershipId));
    }
    if (createdProfileIds.length > 0) {
      await db.delete(calendarConnectionsTable).where(inArray(calendarConnectionsTable.tutorProfileId, createdProfileIds));
      await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.tutorProfileId, createdProfileIds));
      await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
    }
    if (createdCourseId) {
      await db.delete(coursesTable).where(eq(coursesTable.id, createdCourseId));
    }
    if (createdProduct) {
      await db.delete(satProductsTable).where(eq(satProductsTable.slug, "sat-sophia-lamas-60"));
    }
    if (createdUserIds.length > 0) {
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdUserIds));
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.recipientUserId, createdUserIds));
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, createdUserIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.clientUserId, createdUserIds));
      await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.clientUserId, createdUserIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.clientUserId, createdUserIds));
      await db.delete(invoicesTable).where(inArray(invoicesTable.clientUserId, createdUserIds));
      await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdUserIds));
      await db.delete(portalAccessGrantsTable).where(inArray(portalAccessGrantsTable.userId, createdUserIds));
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
    process.env.SESSION_SECRET = previousSecret;
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    process.env.STRIPE_CHECKOUT_TEST_DOUBLE = previousDouble;
    unlock();
  }
});

test("connected Sophia Lamas hides a busy hour, books a free hour on the admin calendar, and a free/busy-only grant still books", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for Sophia Lamas availability");
    return;
  }
  const unlock = await lockSuite();
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousDouble = process.env.STRIPE_CHECKOUT_TEST_DOUBLE;
  process.env.SESSION_SECRET = previousSecret || "sophia-lamas-avail-test-secret";
  process.env.STRIPE_CHECKOUT_TEST_DOUBLE = "1";
  const adminCalendarId = `sophia-admin-busy-${suffix}`;
  const sophiaAppCalendarId = `sophia-own-${suffix}`;
  const mondayEnd = new Date(new Date(MONDAY_START).getTime() + 60 * 60_000).toISOString();
  const calendar = installCalendarMock(adminCalendarId, [{ start: MONDAY_START, end: mondayEnd }]);
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const createdPaymentIds: string[] = [];
  let createdCourseId: string | undefined;
  let createdMembershipId: string | undefined;
  let createdProduct = false;
  let sophiaConnectionId: string | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    let michelle = (
      await db
        .select()
        .from(usersTable)
        .where(
          or(
            eq(usersTable.id, MICHELLE_MAKAREM_USER_ID),
            eq(usersTable.clerkUserId, MICHELLE_MAKAREM_CLERK_USER_ID),
            eq(usersTable.email, MICHELLE_MAKAREM_EMAIL),
          ),
        )
        .limit(1)
    )[0];
    if (!michelle) {
      const [created] = await db
        .insert(usersTable)
        .values({
          id: MICHELLE_MAKAREM_USER_ID,
          clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
          email: MICHELLE_MAKAREM_EMAIL,
          displayName: "Michelle Makarem",
          role: "student",
        })
        .returning();
      michelle = created;
      createdUserIds.push(michelle!.id);
    }
    assert.ok(michelle);
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = michelle.clerkUserId;

    const [sophiaUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `sophia-lamas-busy:${suffix}`,
        email: `sophia-lamas-busy-${suffix}@example.invalid`,
        displayName: SOPHIA_LAMAS_TUTOR_NAME,
        role: "tutor",
      })
      .returning();
    createdUserIds.push(sophiaUser!.id);
    const [sophia] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: sophiaUser!.id,
        email: `sophia-lamas-busy-${suffix}@example.invalid`,
        name: SOPHIA_LAMAS_TUTOR_NAME,
        title: "SAT English Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
      })
      .returning();
    createdProfileIds.push(sophia!.id);
    await db.insert(availabilityRulesTable).values({
      tutorProfileId: sophia!.id,
      timezone: "Asia/Dubai",
      weeklyHours: {},
      dateHours: {},
      recurringHours: {
        startDate: "2026-11-16",
        endDate: null,
        days: {
          "1": [{ start: "18:00", end: "19:00" }],
          "2": [{ start: "18:00", end: "19:00" }],
          "3": [{ start: "18:00", end: "19:00" }],
        },
      },
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    });

    let course = (
      await db.select().from(coursesTable).where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE)).limit(1)
    )[0];
    if (!course) {
      const [created] = await db
        .insert(coursesTable)
        .values({
          title: FALL_SAT_COURSE_TITLE,
          subject: "SAT",
          term: "Fall 2026",
          status: "active",
        })
        .returning();
      course = created;
      createdCourseId = created!.id;
    }
    const [membership] = await db
      .select()
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.courseId, course!.id),
          eq(courseMembershipsTable.userId, michelle.id),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .limit(1);
    if (!membership) {
      const [created] = await db
        .insert(courseMembershipsTable)
        .values({
          courseId: course!.id,
          userId: michelle.id,
          membershipRole: "student",
          subject: "SAT",
        })
        .returning();
      createdMembershipId = created!.id;
    }

    let adminUser = (
      await db.select().from(usersTable).where(eq(usersTable.email, ADMIN_CALENDAR_ACCOUNT_EMAIL)).limit(1)
    )[0];
    if (!adminUser) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `sophia-admin-busy:${suffix}`,
          email: ADMIN_CALENDAR_ACCOUNT_EMAIL,
          displayName: "Admin Calendar",
          role: "administrator",
        })
        .returning();
      adminUser = created;
      createdUserIds.push(adminUser!.id);
    }
    const [adminProfile] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: adminUser!.id,
        email: `sophia-admin-busy-${suffix}@example.invalid`,
        name: "Admin Calendar",
        title: ADMIN_CALENDAR_PROFILE_TITLE,
        subjects: [],
        active: true,
        bookingEligible: false,
      })
      .returning();
    createdProfileIds.push(adminProfile!.id);
    await db.insert(calendarConnectionsTable).values({
      tutorProfileId: adminProfile!.id,
      provider: "google",
      status: "connected",
      calendarId: "primary",
      appCalendarId: adminCalendarId,
      grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
      encryptedAccessToken: encryptCalendarToken(`admin-busy-access-${suffix}`),
      encryptedRefreshToken: encryptCalendarToken(`admin-busy-refresh-${suffix}`),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      googleAccountEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    });

    const [sophiaConnection] = await db
      .insert(calendarConnectionsTable)
      .values({
        tutorProfileId: sophia!.id,
        provider: "google",
        status: "connected",
        calendarId: "primary",
        appCalendarId: sophiaAppCalendarId,
        grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
        encryptedAccessToken: encryptCalendarToken(`sophia-access-${suffix}`),
        encryptedRefreshToken: encryptCalendarToken(`sophia-refresh-${suffix}`),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        googleAccountEmail: SOPHIA_LAMAS_TUTOR_EMAIL,
      })
      .returning();
    sophiaConnectionId = sophiaConnection!.id;

    const product = await ensureProduct("sat-sophia-lamas-60", "SAT 1 hour with Sophia", 18_000);
    createdProduct = product.created;
    const [credit] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: michelle.id,
        productId: product.product.id,
        entryType: "original",
        hours: 3,
        note: `sophia-lamas-busy-${suffix}`,
      })
      .returning();
    createdLedgerIds.push(credit!.id);

    server = await startServer(michelle);
    const offered = await getJson(server.baseUrl, AVAILABILITY_PATH(sophia!.id));
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
    assert.equal(offered.body.slots?.includes(MONDAY_START), false);
    assert.equal(offered.body.slots?.includes(WEDNESDAY_START), true);
    assert.ok(calendar.freeBusyCalls() > 0);

    const busyCheckout = await postJson(server.baseUrl, "/api/payments/checkout", {
      tutorProfileId: sophia!.id,
      startTime: MONDAY_START,
      durationMinutes: 60,
    });
    assert.equal(busyCheckout.status, 409, JSON.stringify(busyCheckout.body));
    assert.equal(busyCheckout.body.code, "SLOT_UNAVAILABLE");
    const busyBook = await postJson(server.baseUrl, "/api/booking/sessions", {
      tutorProfileId: sophia!.id,
      startTime: MONDAY_START,
      durationMinutes: 60,
    });
    assert.equal(busyBook.status, 409, JSON.stringify(busyBook.body));
    assert.equal(busyBook.body.code, "SLOT_UNAVAILABLE");

    const writesBefore = calendar.writes.length;
    const booked = await postJson(server.baseUrl, "/api/booking/sessions", {
      tutorProfileId: sophia!.id,
      startTime: WEDNESDAY_START,
      durationMinutes: 60,
    });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    createdSessionIds.push(String(booked.body.id));
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, String(booked.body.id)));
    assert.ok(session);
    assert.equal(session.providerCalendarId, adminCalendarId);
    assert.notEqual(session.providerCalendarId, sophiaAppCalendarId);
    assert.equal(session.providerEventUrl, SOPHIA_LAMAS_MEET_URL);
    const invite = calendar.writes.slice(writesBefore).find((write) => write.method === "POST");
    assert.ok(invite, JSON.stringify(calendar.writes.slice(writesBefore)));
    assertSophiaInvite(invite, {
      adminCalendarId,
      studentEmail: michelle.email,
      tutorEmail: sophia!.email,
    });
    assert.equal(
      calendar.writes.some((write) => write.calendarId === sophiaAppCalendarId),
      false,
    );

    await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
    await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
    await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    createdSessionIds.length = 0;

    await db
      .update(calendarConnectionsTable)
      .set({
        appCalendarId: null,
        grantedScopes: GOOGLE_CALENDAR_FREEBUSY_SCOPE,
        updatedAt: new Date(),
      })
      .where(eq(calendarConnectionsTable.id, sophiaConnectionId!));

    const busyBeforeFbOnly = calendar.freeBusyCalls();
    const offeredFbOnly = await getJson(server.baseUrl, AVAILABILITY_PATH(sophia!.id));
    assert.equal(offeredFbOnly.status, 200, JSON.stringify(offeredFbOnly.body));
    assert.equal(offeredFbOnly.body.slots?.includes(MONDAY_START), false);
    assert.equal(offeredFbOnly.body.slots?.includes(WEDNESDAY_START), true);
    assert.ok(calendar.freeBusyCalls() > busyBeforeFbOnly);

    const writesBeforeFbOnly = calendar.writes.length;
    const bookedFbOnly = await postJson(server.baseUrl, "/api/booking/sessions", {
      tutorProfileId: sophia!.id,
      startTime: WEDNESDAY_START,
      durationMinutes: 60,
    });
    assert.equal(bookedFbOnly.status, 201, JSON.stringify(bookedFbOnly.body));
    assert.notEqual(bookedFbOnly.body.code, "CALENDAR_RECONNECT_REQUIRED");
    createdSessionIds.push(String(bookedFbOnly.body.id));
    const [fbSession] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, String(bookedFbOnly.body.id)));
    assert.ok(fbSession);
    assert.equal(fbSession.providerCalendarId, adminCalendarId);
    assert.equal(fbSession.providerEventUrl, SOPHIA_LAMAS_MEET_URL);
    const fbInvite = calendar.writes.slice(writesBeforeFbOnly).find((write) => write.method === "POST");
    assert.ok(fbInvite, JSON.stringify(calendar.writes.slice(writesBeforeFbOnly)));
    assertSophiaInvite(fbInvite, {
      adminCalendarId,
      studentEmail: michelle.email,
      tutorEmail: sophia!.email,
    });
  } finally {
    calendar.restore();
    if (server) await server.close();
    if (createdSessionIds.length > 0) {
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    if (createdPaymentIds.length > 0) {
      await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.paymentId, createdPaymentIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
    }
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdMembershipId) {
      await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.id, createdMembershipId));
    }
    if (createdProfileIds.length > 0) {
      await db.delete(calendarConnectionsTable).where(inArray(calendarConnectionsTable.tutorProfileId, createdProfileIds));
      await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.tutorProfileId, createdProfileIds));
      await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
    }
    if (createdCourseId) {
      await db.delete(coursesTable).where(eq(coursesTable.id, createdCourseId));
    }
    if (createdProduct) {
      await db.delete(satProductsTable).where(eq(satProductsTable.slug, "sat-sophia-lamas-60"));
    }
    if (createdUserIds.length > 0) {
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdUserIds));
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.recipientUserId, createdUserIds));
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, createdUserIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.clientUserId, createdUserIds));
      await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.clientUserId, createdUserIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.clientUserId, createdUserIds));
      await db.delete(invoicesTable).where(inArray(invoicesTable.clientUserId, createdUserIds));
      await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdUserIds));
      await db.delete(portalAccessGrantsTable).where(inArray(portalAccessGrantsTable.userId, createdUserIds));
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
    process.env.SESSION_SECRET = previousSecret;
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    process.env.STRIPE_CHECKOUT_TEST_DOUBLE = previousDouble;
    unlock();
  }
});

test("Nika still skips free/busy when disconnected and writes her own calendar when connected", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for the Nika regression");
    return;
  }
  const unlock = await lockSuite();
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  process.env.SESSION_SECRET = previousSecret || "nika-regression-test-secret";
  const adminCalendarId = `nika-reg-admin-${suffix}`;
  const nikaAppCalendarId = `nika-reg-own-${suffix}`;
  const nikaMonday = zonedDateTimeToUtc("2026-11-16", "18:00", "Asia/Dubai").toISOString();
  const nikaWednesday = zonedDateTimeToUtc("2026-11-18", "18:00", "Asia/Dubai").toISOString();
  const calendar = installCalendarMock(adminCalendarId);
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdLedgerIds: string[] = [];
  let createdCourseId: string | undefined;
  let createdMembershipId: string | undefined;
  let createdProduct = false;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    let michelle = (
      await db
        .select()
        .from(usersTable)
        .where(
          or(
            eq(usersTable.id, MICHELLE_MAKAREM_USER_ID),
            eq(usersTable.clerkUserId, MICHELLE_MAKAREM_CLERK_USER_ID),
            eq(usersTable.email, MICHELLE_MAKAREM_EMAIL),
          ),
        )
        .limit(1)
    )[0];
    if (!michelle) {
      const [created] = await db
        .insert(usersTable)
        .values({
          id: MICHELLE_MAKAREM_USER_ID,
          clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
          email: MICHELLE_MAKAREM_EMAIL,
          displayName: "Michelle Makarem",
          role: "student",
        })
        .returning();
      michelle = created;
      createdUserIds.push(michelle!.id);
    }
    assert.ok(michelle);
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = michelle.clerkUserId;

    const [nikaUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `nika-reg:${suffix}`,
        email: `nika-reg-${suffix}@example.invalid`,
        displayName: NIKA_NAME,
        role: "tutor",
      })
      .returning();
    createdUserIds.push(nikaUser!.id);
    const [nika] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: nikaUser!.id,
        email: `nika-reg-${suffix}@example.invalid`,
        name: NIKA_NAME,
        title: "Admissions Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
      })
      .returning();
    createdProfileIds.push(nika!.id);
    await db.insert(availabilityRulesTable).values({
      tutorProfileId: nika!.id,
      timezone: "Asia/Dubai",
      weeklyHours: {},
      dateHours: {},
      recurringHours: {
        startDate: "2026-11-16",
        endDate: null,
        days: {
          "1": [{ start: "18:00", end: "19:00" }],
          "3": [{ start: "18:00", end: "19:00" }],
        },
      },
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    });

    let course = (
      await db.select().from(coursesTable).where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE)).limit(1)
    )[0];
    if (!course) {
      const [created] = await db
        .insert(coursesTable)
        .values({
          title: FALL_SAT_COURSE_TITLE,
          subject: "SAT",
          term: "Fall 2026",
          status: "active",
        })
        .returning();
      course = created;
      createdCourseId = created!.id;
    }
    const [membership] = await db
      .select()
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.courseId, course!.id),
          eq(courseMembershipsTable.userId, michelle.id),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .limit(1);
    if (!membership) {
      const [created] = await db
        .insert(courseMembershipsTable)
        .values({
          courseId: course!.id,
          userId: michelle.id,
          membershipRole: "student",
          subject: "SAT",
        })
        .returning();
      createdMembershipId = created!.id;
    }

    let adminUser = (
      await db.select().from(usersTable).where(eq(usersTable.email, ADMIN_CALENDAR_ACCOUNT_EMAIL)).limit(1)
    )[0];
    if (!adminUser) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `nika-reg-admin:${suffix}`,
          email: ADMIN_CALENDAR_ACCOUNT_EMAIL,
          displayName: "Admin Calendar",
          role: "administrator",
        })
        .returning();
      adminUser = created;
      createdUserIds.push(adminUser!.id);
    }
    const [adminProfile] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: adminUser!.id,
        email: `nika-reg-admin-${suffix}@example.invalid`,
        name: "Admin Calendar",
        title: ADMIN_CALENDAR_PROFILE_TITLE,
        subjects: [],
        active: true,
        bookingEligible: false,
      })
      .returning();
    createdProfileIds.push(adminProfile!.id);
    await db.insert(calendarConnectionsTable).values({
      tutorProfileId: adminProfile!.id,
      provider: "google",
      status: "connected",
      calendarId: "primary",
      appCalendarId: adminCalendarId,
      grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
      encryptedAccessToken: encryptCalendarToken(`nika-admin-access-${suffix}`),
      encryptedRefreshToken: encryptCalendarToken(`nika-admin-refresh-${suffix}`),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      googleAccountEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    });

    const product = await ensureProduct("sat-nika-60", "SAT 1 hour with Nika", 13_000);
    createdProduct = product.created;
    const [credit] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: michelle.id,
        productId: product.product.id,
        entryType: "original",
        hours: 2,
        note: `nika-reg-${suffix}`,
      })
      .returning();
    createdLedgerIds.push(credit!.id);

    server = await startServer(michelle);
    const offered = await getJson(server.baseUrl, AVAILABILITY_PATH(nika!.id));
    assert.equal(offered.status, 200, JSON.stringify(offered.body));
    assert.equal(offered.body.slots?.includes(nikaMonday), true);
    assert.equal(calendar.freeBusyCalls(), 0);

    const disconnectedBook = await postJson(server.baseUrl, "/api/booking/sessions", {
      tutorProfileId: nika!.id,
      startTime: nikaMonday,
      durationMinutes: 60,
    });
    assert.equal(disconnectedBook.status, 201, JSON.stringify(disconnectedBook.body));
    createdSessionIds.push(String(disconnectedBook.body.id));
    const [disconnectedSession] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, String(disconnectedBook.body.id)));
    assert.equal(disconnectedSession?.providerCalendarId, adminCalendarId);
    const disconnectedInvite = calendar.writes.find((write) => write.method === "POST");
    assert.ok(disconnectedInvite);
    assert.equal(disconnectedInvite.calendarId, adminCalendarId);
    assert.equal(calendar.freeBusyCalls(), 0);

    await db.insert(calendarConnectionsTable).values({
      tutorProfileId: nika!.id,
      provider: "google",
      status: "connected",
      calendarId: "primary",
      appCalendarId: nikaAppCalendarId,
      grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
      encryptedAccessToken: encryptCalendarToken(`nika-own-access-${suffix}`),
      encryptedRefreshToken: encryptCalendarToken(`nika-own-refresh-${suffix}`),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      googleAccountEmail: `nika-reg-${suffix}@example.invalid`,
    });

    const writesBefore = calendar.writes.length;
    const connectedBook = await postJson(server.baseUrl, "/api/booking/sessions", {
      tutorProfileId: nika!.id,
      startTime: nikaWednesday,
      durationMinutes: 60,
    });
    assert.equal(connectedBook.status, 201, JSON.stringify(connectedBook.body));
    createdSessionIds.push(String(connectedBook.body.id));
    const [connectedSession] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, String(connectedBook.body.id)));
    assert.equal(connectedSession?.providerCalendarId, nikaAppCalendarId);
    const connectedInvite = calendar.writes.slice(writesBefore).find((write) => write.method === "POST");
    assert.ok(connectedInvite, JSON.stringify(calendar.writes.slice(writesBefore)));
    assert.equal(connectedInvite.calendarId, nikaAppCalendarId);
  } finally {
    calendar.restore();
    if (server) await server.close();
    if (createdSessionIds.length > 0) {
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdMembershipId) {
      await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.id, createdMembershipId));
    }
    if (createdProfileIds.length > 0) {
      await db.delete(calendarConnectionsTable).where(inArray(calendarConnectionsTable.tutorProfileId, createdProfileIds));
      await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.tutorProfileId, createdProfileIds));
      await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
    }
    if (createdCourseId) {
      await db.delete(coursesTable).where(eq(coursesTable.id, createdCourseId));
    }
    if (createdProduct) {
      await db.delete(satProductsTable).where(eq(satProductsTable.slug, "sat-nika-60"));
    }
    if (createdUserIds.length > 0) {
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdUserIds));
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.recipientUserId, createdUserIds));
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, createdUserIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.clientUserId, createdUserIds));
      await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.clientUserId, createdUserIds));
      await db.delete(paymentsTable).where(inArray(paymentsTable.clientUserId, createdUserIds));
      await db.delete(invoicesTable).where(inArray(invoicesTable.clientUserId, createdUserIds));
      await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdUserIds));
      await db.delete(portalAccessGrantsTable).where(inArray(portalAccessGrantsTable.userId, createdUserIds));
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
    process.env.SESSION_SECRET = previousSecret;
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    unlock();
  }
});
