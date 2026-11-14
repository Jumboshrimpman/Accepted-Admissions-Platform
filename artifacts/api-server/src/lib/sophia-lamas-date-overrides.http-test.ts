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
  curriculumBlocksTable,
  curriculumLibraryAssetsTable,
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
import { SOPHIA_LAMAS_TUTOR_PROFILE_ID } from "./self-serve-availability";
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
/**
 * First Monday on or after Sophia's Nov 16 start that is at least two days
 * out, so the suite keeps passing after that week has gone by.
 */
function upcomingMondayKey(now = new Date()): string {
  const floor = new Date(Math.max(Date.parse("2026-11-16T00:00:00.000Z"), now.getTime() + 2 * 24 * 60 * 60_000));
  const cursor = new Date(Date.UTC(floor.getUTCFullYear(), floor.getUTCMonth(), floor.getUTCDate()));
  while (cursor.getUTCDay() !== 1) cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString().slice(0, 10);
}
function addDaysKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const MONDAY_KEY = upcomingMondayKey();
const WEDNESDAY_KEY = addDaysKey(MONDAY_KEY, 2);
const MONDAY_START = zonedDateTimeToUtc(MONDAY_KEY, "18:00", "Asia/Dubai").toISOString();
const WEDNESDAY_START = zonedDateTimeToUtc(WEDNESDAY_KEY, "18:00", "Asia/Dubai").toISOString();
const AVAILABILITY_FROM = zonedDateTimeToUtc(MONDAY_KEY, "17:00", "Asia/Dubai").toISOString();
const THURSDAY_KEY = addDaysKey(MONDAY_KEY, 3);
const TUESDAY_KEY = addDaysKey(MONDAY_KEY, 1);
const TUESDAY_START = zonedDateTimeToUtc(TUESDAY_KEY, "18:00", "Asia/Dubai").toISOString();
const THURSDAY_START = zonedDateTimeToUtc(THURSDAY_KEY, "18:00", "Asia/Dubai").toISOString();
const AVAILABILITY_TO = zonedDateTimeToUtc(THURSDAY_KEY, "20:00", "Asia/Dubai").toISOString();
const AVAILABILITY_PATH = (tutorProfileId: string) =>
  `/api/booking/availability?tutorProfileId=${tutorProfileId}&from=${AVAILABILITY_FROM}&to=${AVAILABILITY_TO}&durationMinutes=60`;

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
        sessionId: `sophia-lamas-dates-http:${user.id}`,
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

async function putJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
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


test("Sophia Lamas closes a weekly date and opens an extra date, and Michelle sees both", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for Sophia Lamas date overrides");
    return;
  }
  const unlock = await lockSuite();
  const suffix = randomUUID().slice(0, 8);
  const previousSecret = process.env.SESSION_SECRET;
  const previousStudents = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  process.env.SESSION_SECRET = previousSecret || "sophia-lamas-dates-test-secret";
  const adminCalendarId = `sophia-dates-admin-${suffix}`;
  const calendar = installCalendarMock(adminCalendarId);
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const createdGrantIds: string[] = [];
  let createdCourseId: string | undefined;
  let createdMembershipId: string | undefined;
  let createdProduct = false;
  let originalRule: typeof availabilityRulesTable.$inferSelect | undefined;
  let restoreProfile: { userId: string | null } | undefined;
  const servers: Array<Awaited<ReturnType<typeof startServer>>> = [];

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

    // The dashboard editor is keyed to Sophia's real profile id.
    const [sophiaUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `sophia-lamas-dates:${suffix}`,
        email: `sophia-lamas-dates-${suffix}@example.invalid`,
        displayName: SOPHIA_LAMAS_TUTOR_NAME,
        role: "tutor",
      })
      .returning();
    createdUserIds.push(sophiaUser!.id);
    const [grant] = await db
      .insert(portalAccessGrantsTable)
      .values({
        email: sophiaUser!.email,
        clerkUserId: sophiaUser!.clerkUserId,
        displayName: sophiaUser!.displayName,
        roleCategory: "tutor",
        active: true,
        userId: sophiaUser!.id,
      })
      .returning();
    createdGrantIds.push(grant!.id);
    const [existingProfile] = await db
      .select()
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, SOPHIA_LAMAS_TUTOR_PROFILE_ID))
      .limit(1);
    if (existingProfile) {
      restoreProfile = { userId: existingProfile.userId };
      await db
        .update(tutorProfilesTable)
        .set({ userId: sophiaUser!.id })
        .where(eq(tutorProfilesTable.id, SOPHIA_LAMAS_TUTOR_PROFILE_ID));
    } else {
      await db.insert(tutorProfilesTable).values({
        id: SOPHIA_LAMAS_TUTOR_PROFILE_ID,
        userId: sophiaUser!.id,
        email: `sophia-lamas-dates-${suffix}@example.invalid`,
        name: SOPHIA_LAMAS_TUTOR_NAME,
        title: "SAT English Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
      });
      createdProfileIds.push(SOPHIA_LAMAS_TUTOR_PROFILE_ID);
    }
    const [sophia] = await db
      .select()
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, SOPHIA_LAMAS_TUTOR_PROFILE_ID))
      .limit(1);
    assert.ok(sophia);
    [originalRule] = await db
      .select()
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, SOPHIA_LAMAS_TUTOR_PROFILE_ID))
      .limit(1);
    const weekly = {
      startDate: "2026-11-16",
      endDate: null,
      days: {
        "1": [{ start: "18:00", end: "19:00" }],
        "2": [{ start: "18:00", end: "19:00" }],
        "3": [{ start: "18:00", end: "19:00" }],
      },
    };
    if (originalRule) {
      await db
        .update(availabilityRulesTable)
        .set({ dateHours: {}, recurringHours: weekly, bookingNoticeMinutes: 0, bufferMinutes: 0, blackoutDates: [] })
        .where(eq(availabilityRulesTable.id, originalRule.id));
    } else {
      await db.insert(availabilityRulesTable).values({
        tutorProfileId: SOPHIA_LAMAS_TUTOR_PROFILE_ID,
        timezone: "Asia/Dubai",
        weeklyHours: {},
        dateHours: {},
        recurringHours: weekly,
        bookingNoticeMinutes: 0,
        bufferMinutes: 0,
        blackoutDates: [],
      });
    }
    // Fixed-hours fallback: no Google grant, invites go out from admin@.
    await db
      .delete(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, SOPHIA_LAMAS_TUTOR_PROFILE_ID));

    let course = (
      await db.select().from(coursesTable).where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE)).limit(1)
    )[0];
    if (!course) {
      const [created] = await db
        .insert(coursesTable)
        .values({ title: FALL_SAT_COURSE_TITLE, subject: "SAT", term: "Fall 2026", status: "active" })
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
        .values({ courseId: course!.id, userId: michelle.id, membershipRole: "student", subject: "SAT" })
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
          clerkUserId: `sophia-dates-admin-cal:${suffix}`,
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
        email: `sophia-dates-admin-cal-${suffix}@example.invalid`,
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
        note: `sophia-lamas-dates-${suffix}`,
      })
      .returning();
    createdLedgerIds.push(credit!.id);

    const sophiaServer = await startServer(sophiaUser!);
    const michelleServer = await startServer(michelle);
    servers.push(sophiaServer, michelleServer);

    const before = await getJson(michelleServer.baseUrl, AVAILABILITY_PATH(SOPHIA_LAMAS_TUTOR_PROFILE_ID));
    assert.equal(before.status, 200, JSON.stringify(before.body));
    assert.equal(before.body.slots?.includes(MONDAY_START), true);
    assert.equal(before.body.slots?.includes(TUESDAY_START), true);
    assert.equal(before.body.slots?.includes(THURSDAY_START), false);

    const loaded = await getJson(sophiaServer.baseUrl, "/api/tutor/date-hours");
    assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
    assert.equal((loaded.body as Record<string, unknown>).timezone, "Asia/Dubai");

    // Block Tuesday and open Thursday 6–7 PM Dubai (10–11 AM ET).
    const closed = await putJson(sophiaServer.baseUrl, "/api/tutor/date-hours", {
      dateHours: { [TUESDAY_KEY]: [] },
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    const opened = await putJson(sophiaServer.baseUrl, "/api/tutor/date-hours", {
      dateHours: { [THURSDAY_KEY]: [{ start: "18:00", end: "19:00" }] },
    });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.deepEqual((opened.body.dateHours as Record<string, unknown>)[TUESDAY_KEY], []);

    const after = await getJson(michelleServer.baseUrl, AVAILABILITY_PATH(SOPHIA_LAMAS_TUTOR_PROFILE_ID));
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.equal(after.body.slots?.includes(MONDAY_START), true);
    assert.equal(after.body.slots?.includes(TUESDAY_START), false);
    assert.equal(after.body.slots?.includes(WEDNESDAY_START), true);
    assert.equal(after.body.slots?.includes(THURSDAY_START), true);

    const blockedBook = await postJson(michelleServer.baseUrl, "/api/booking/sessions", {
      tutorProfileId: SOPHIA_LAMAS_TUTOR_PROFILE_ID,
      startTime: TUESDAY_START,
      durationMinutes: 60,
    });
    assert.equal(blockedBook.status, 409, JSON.stringify(blockedBook.body));
    assert.equal(blockedBook.body.code, "SLOT_UNAVAILABLE");

    const booked = await postJson(michelleServer.baseUrl, "/api/booking/sessions", {
      tutorProfileId: SOPHIA_LAMAS_TUTOR_PROFILE_ID,
      startTime: THURSDAY_START,
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
      tutorEmail: sophia.email,
    });
    assert.equal(calendar.freeBusyCalls(), 0);

    // Reopening Tuesday puts the slot back.
    const reopened = await putJson(sophiaServer.baseUrl, "/api/tutor/date-hours", {
      dateHours: { [TUESDAY_KEY]: [{ start: "18:00", end: "19:00" }] },
    });
    assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
    const final = await getJson(michelleServer.baseUrl, AVAILABILITY_PATH(SOPHIA_LAMAS_TUTOR_PROFILE_ID));
    assert.equal(final.body.slots?.includes(TUESDAY_START), true);
  } finally {
    calendar.restore();
    await Promise.all(servers.map((server) => server.close()));
    if (createdSessionIds.length > 0) {
      await db.delete(adminNotificationsTable).where(inArray(adminNotificationsTable.sessionId, createdSessionIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.sessionId, createdSessionIds));
      await db.delete(curriculumBlocksTable).where(inArray(curriculumBlocksTable.sessionId, createdSessionIds));
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdMembershipId) {
      await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.id, createdMembershipId));
    }
    if (originalRule) {
      await db
        .update(availabilityRulesTable)
        .set({
          dateHours: originalRule.dateHours,
          recurringHours: originalRule.recurringHours,
          bookingNoticeMinutes: originalRule.bookingNoticeMinutes,
          bufferMinutes: originalRule.bufferMinutes,
          blackoutDates: originalRule.blackoutDates,
          updatedAt: originalRule.updatedAt,
        })
        .where(eq(availabilityRulesTable.id, originalRule.id));
    } else {
      await db
        .delete(availabilityRulesTable)
        .where(eq(availabilityRulesTable.tutorProfileId, SOPHIA_LAMAS_TUTOR_PROFILE_ID));
    }
    if (restoreProfile) {
      await db
        .update(tutorProfilesTable)
        .set({ userId: restoreProfile.userId })
        .where(eq(tutorProfilesTable.id, SOPHIA_LAMAS_TUTOR_PROFILE_ID));
    }
    await db.delete(auditLogsTable).where(eq(auditLogsTable.entityId, SOPHIA_LAMAS_TUTOR_PROFILE_ID));
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
    if (createdGrantIds.length > 0) {
      await db.delete(portalAccessGrantsTable).where(inArray(portalAccessGrantsTable.id, createdGrantIds));
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
      await db
        .update(curriculumLibraryAssetsTable)
        .set({ createdByUserId: null })
        .where(inArray(curriculumLibraryAssetsTable.createdByUserId, createdUserIds));
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
    process.env.SESSION_SECRET = previousSecret;
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudents;
    unlock();
  }
});
