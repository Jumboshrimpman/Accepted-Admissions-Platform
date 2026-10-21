import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  auditLogsTable,
  availabilityRulesTable,
  bookingSlotHoldsTable,
  calendarConnectionsTable,
  courseMembershipsTable,
  coursesTable,
  db,
  loginActivityTable,
  paymentsTable,
  portalAccessGrantsTable,
  sessionsTable,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import platformRouter from "../routes/platform";
import { zonedDateTimeToUtc } from "./booking";
import {
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  encryptCalendarToken,
} from "./google-calendar";

const TIMEZONE = "America/New_York";

type OfferedLength = { durationMinutes: number; slots: string[] };
type OfferedBody = {
  from?: string;
  to?: string;
  timezone?: string;
  providerStatus?: string;
  offeredToClients?: boolean;
  availabilityDependsOnClient?: boolean;
  usesAdminCalendarFallback?: boolean;
  lengths?: OfferedLength[];
  slots?: string[];
  tutor?: { timezone?: string };
  error?: string;
};

function localDateKey(daysAhead: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  utc.setUTCDate(utc.getUTCDate() + daysAhead);
  return utc.toISOString().slice(0, 10);
}

function localSlot(daysAhead: number, time: string): string {
  return zonedDateTimeToUtc(localDateKey(daysAhead), time, TIMEZONE).toISOString();
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
        sessionId: `offered-availability-http:${user.id}`,
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

async function getJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: text ? (JSON.parse(text) as OfferedBody) : {},
  };
}

function availabilityPath(profileId: string, from: string, to: string, durationMinutes: number) {
  const params = new URLSearchParams({
    tutorProfileId: profileId,
    from,
    to,
    durationMinutes: String(durationMinutes),
  });
  return `/api/booking/availability?${params.toString()}`;
}

function stableSlots(slots: string[] | undefined, now = Date.now()): string[] {
  return (slots ?? []).filter((slot) => Date.parse(slot) > now + 2 * 60_000);
}

function offeredSlots(body: OfferedBody, durationMinutes: number): string[] {
  return body.lengths?.find((length) => length.durationMinutes === durationMinutes)?.slots ?? [];
}

test("tutors see only their own client-offered slots, with no client details", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for offered availability HTTP coverage");
    return;
  }
  const suffix = randomUUID().slice(0, 8);
  const piiToken = `quinlan-piihold-${suffix}`;
  const piiEmail = `${piiToken}@example.invalid`;
  const bookedStart = localSlot(3, "15:00");
  const heldStart = localSlot(4, "12:00");
  const busyStart = localSlot(5, "11:00");
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = previousSecret || "offered-availability-test-secret";
  const originalFetch = globalThis.fetch.bind(globalThis);
  const busyWindows = [{ start: busyStart, end: new Date(Date.parse(busyStart) + 60 * 60_000).toISOString() }];
  let freeBusyCalls = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.includes("/calendar/v3/freeBusy")) {
      freeBusyCalls += 1;
      return Response.json({
        calendars: {
          primary: { busy: busyWindows },
        },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const createdUserIds: string[] = [];
  const profileIds: string[] = [];
  const paymentIds: string[] = [];
  let courseId: string | undefined;
  let xavierServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let euniceServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let nikaServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let fixedServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let reconnectServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let inactiveServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let ineligibleServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let failure: unknown;
  let cleanupError: unknown;

  const weeklyHours = (start: string, end: string) =>
    Object.fromEntries(
      ["0", "1", "2", "3", "4", "5", "6"].map((day) => [day, [{ start, end }]]),
    );

  try {
    const createUser = async (
      role: AppUser["role"],
      displayName: string,
      email: string,
      roleCategory: "tutor" | "student",
    ) => {
      const [user] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `offered-${role}:${email}`,
          email,
          displayName,
          role,
        })
        .returning();
      createdUserIds.push(user!.id);
      await db.insert(portalAccessGrantsTable).values({
        email,
        clerkUserId: user!.clerkUserId,
        displayName,
        roleCategory,
        active: true,
        userId: user!.id,
      });
      return user!;
    };

    const xavierUser = await createUser(
      "tutor",
      "Roster Wide Tutor",
      `offered-wide-${suffix}@example.invalid`,
      "tutor",
    );
    const euniceUser = await createUser(
      "tutor",
      "Eunice Chon",
      `offered-eunice-${suffix}@example.invalid`,
      "tutor",
    );
    const nikaUser = await createUser(
      "tutor",
      "Nika Raiffe",
      `offered-nika-${suffix}@example.invalid`,
      "tutor",
    );
    const fixedUser = await createUser(
      "tutor",
      "Eunice Chon",
      `offered-fixed-${suffix}@example.invalid`,
      "tutor",
    );
    const reconnectUser = await createUser(
      "tutor",
      "Roster Reconnect Tutor",
      `offered-reconnect-${suffix}@example.invalid`,
      "tutor",
    );
    const inactiveUser = await createUser(
      "tutor",
      "Roster Inactive Tutor",
      `offered-inactive-${suffix}@example.invalid`,
      "tutor",
    );
    const ineligibleUser = await createUser(
      "tutor",
      "Roster Ineligible Tutor",
      `offered-ineligible-${suffix}@example.invalid`,
      "tutor",
    );
    const student = await createUser(
      "student",
      "Portal Student",
      `offered-student-${suffix}@example.invalid`,
      "student",
    );
    const [piiStudent] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `offered-pii:${piiEmail}`,
        email: piiEmail,
        displayName: "Quinlan Piihold",
        role: "student",
      })
      .returning();
    createdUserIds.push(piiStudent!.id);

    const connectCalendar = async (
      profileId: string,
      email: string,
      appCalendarId: string | null,
    ) => {
      await db.insert(calendarConnectionsTable).values({
        tutorProfileId: profileId,
        provider: "google",
        status: "connected",
        calendarId: "primary",
        appCalendarId,
        grantedScopes: `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`,
        encryptedAccessToken: encryptCalendarToken(`offered-access-${profileId}`),
        encryptedRefreshToken: appCalendarId
          ? null
          : encryptCalendarToken(`offered-refresh-${profileId}`),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        googleAccountEmail: email,
      });
    };

    const createProfile = async (
      user: AppUser,
      name: string,
      hours: { start: string; end: string },
      connect: boolean | "reconnect",
      options?: {
        dateHours?: Record<string, { start: string; end: string }[]>;
        bookingNoticeMinutes?: number;
        active?: boolean;
        bookingEligible?: boolean;
      },
    ) => {
      const [profile] = await db
        .insert(tutorProfilesTable)
        .values({
          userId: user.id,
          email: user.email,
          name,
          title: "SAT Tutor",
          subjects: ["SAT"],
          active: options?.active ?? true,
          bookingEligible: options?.bookingEligible ?? true,
        })
        .returning();
      profileIds.push(profile!.id);
      await db.insert(availabilityRulesTable).values({
        tutorProfileId: profile!.id,
        timezone: TIMEZONE,
        weeklyHours: weeklyHours(hours.start, hours.end),
        dateHours: options?.dateHours ?? {},
        bookingNoticeMinutes: options?.bookingNoticeMinutes ?? 0,
        bufferMinutes: 0,
        blackoutDates: [],
      });
      if (connect === "reconnect") await connectCalendar(profile!.id, user.email, null);
      else if (connect) await connectCalendar(profile!.id, user.email, `app-cal-${profile!.id.slice(0, 8)}`);
      return profile!.id;
    };

    const xavierProfileId = await createProfile(
      xavierUser,
      "Eunice Chon",
      { start: "07:00", end: "21:00" },
      true,
    );
    const euniceProfileId = await createProfile(
      euniceUser,
      "Eunice Chon",
      { start: "07:00", end: "08:00" },
      true,
    );
    const nikaProfileId = await createProfile(nikaUser, "Nika Raiffe", { start: "07:00", end: "21:00" }, false);
    const openDay = localDateKey(2);
    const closedDay = localDateKey(3);
    const fixedProfileId = await createProfile(
      fixedUser,
      "Eunice Chon",
      { start: "07:00", end: "21:00" },
      false,
      {
        bookingNoticeMinutes: 480,
        dateHours: {
          [localDateKey(0)]: [{ start: "00:00", end: "23:59" }],
          [openDay]: [{ start: "10:00", end: "13:00" }],
          [closedDay]: [],
          "2099-01-01": [],
        },
      },
    );
    const reconnectProfileId = await createProfile(
      reconnectUser,
      "Eunice Chon",
      { start: "07:00", end: "21:00" },
      "reconnect",
      { bookingNoticeMinutes: 240 },
    );
    const inactiveProfileId = await createProfile(
      inactiveUser,
      "Eunice Chon",
      { start: "07:00", end: "21:00" },
      true,
      { active: false },
    );
    const ineligibleProfileId = await createProfile(
      ineligibleUser,
      "Eunice Chon",
      { start: "07:00", end: "21:00" },
      true,
      { bookingEligible: false },
    );
    // Tutor login re-enables bookingEligible on the profile that shares the
    // user email. Keep this row unmatched so the flag stays false.
    await db
      .update(tutorProfilesTable)
      .set({ email: `offered-ineligible-profile-${suffix}@example.invalid` })
      .where(eq(tutorProfilesTable.id, ineligibleProfileId));

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Offered availability ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    courseId = course!.id;
    await db.insert(sessionsTable).values({
      courseId,
      clientUserId: piiStudent!.id,
      tutorUserId: xavierUser.id,
      dateTime: new Date(bookedStart),
      timezone: TIMEZONE,
      subject: "SAT",
      title: `SAT with Quinlan Piihold ${piiEmail}`,
      status: "published",
      durationMinutes: 60,
      bookingStatus: "confirmed",
    });
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        clientUserId: piiStudent!.id,
        tutorProfileId: xavierProfileId,
        amountCents: 100,
        status: "pending",
        internalNote: piiEmail,
      })
      .returning();
    paymentIds.push(payment!.id);
    await db.insert(bookingSlotHoldsTable).values({
      tutorProfileId: xavierProfileId,
      clientUserId: piiStudent!.id,
      paymentId: payment!.id,
      startTime: new Date(heldStart),
      durationMinutes: 60,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    xavierServer = await startServer(xavierUser);
    euniceServer = await startServer(euniceUser);
    nikaServer = await startServer(nikaUser);
    fixedServer = await startServer(fixedUser);
    reconnectServer = await startServer(reconnectUser);
    inactiveServer = await startServer(inactiveUser);
    ineligibleServer = await startServer(ineligibleUser);
    studentServer = await startServer(student);

    const xavierOffered = await getJson(
      xavierServer.baseUrl,
      `/api/tutor/offered-availability?tutorProfileId=${euniceProfileId}`,
    );
    const euniceOffered = await getJson(
      euniceServer.baseUrl,
      `/api/tutor/offered-availability?tutorProfileId=${xavierProfileId}`,
    );
    const nikaOffered = await getJson(
      nikaServer.baseUrl,
      `/api/tutor/offered-availability?tutorProfileId=${xavierProfileId}`,
    );
    const fixedOffered = await getJson(fixedServer.baseUrl, "/api/tutor/offered-availability");
    const reconnectOffered = await getJson(reconnectServer.baseUrl, "/api/tutor/offered-availability");
    const inactiveOffered = await getJson(inactiveServer.baseUrl, "/api/tutor/offered-availability");
    const ineligibleOffered = await getJson(ineligibleServer.baseUrl, "/api/tutor/offered-availability");
    const studentOffered = await getJson(
      studentServer.baseUrl,
      `/api/tutor/offered-availability?tutorProfileId=${xavierProfileId}`,
    );

    await t.test("a tutor cannot read another tutor's offered slots", () => {
      assert.equal(studentOffered.status, 403, studentOffered.text);
      assert.equal(xavierOffered.status, 200, xavierOffered.text);
      assert.equal(euniceOffered.status, 200, euniceOffered.text);
      assert.equal(xavierOffered.body.providerStatus, "connected");
      assert.equal(euniceOffered.body.providerStatus, "connected");
      const xavierStable = stableSlots(offeredSlots(xavierOffered.body, 60));
      const euniceStable = stableSlots(offeredSlots(euniceOffered.body, 60));
      assert.ok(xavierStable.length > euniceStable.length);
      assert.equal(xavierStable.includes(bookedStart), false);
      assert.equal(euniceStable.includes(bookedStart), false);
      assert.notDeepEqual(xavierStable, euniceStable);
      assert.equal(xavierOffered.text.includes(euniceProfileId), false);
      assert.equal(euniceOffered.text.includes(xavierProfileId), false);
      assert.equal(nikaOffered.text.includes(xavierProfileId), false);
    });

    await t.test("offered slots match the client availability endpoint for the same range", async () => {
      for (const [offered, profileId] of [
        [xavierOffered, xavierProfileId],
        [euniceOffered, euniceProfileId],
      ] as const) {
        assert.equal(offered.body.timezone, TIMEZONE);
        assert.deepEqual(
          offered.body.lengths?.map((length) => length.durationMinutes),
          [60, 90, 120],
        );
        for (const length of offered.body.lengths ?? []) {
          const client = await getJson(
            studentServer!.baseUrl,
            availabilityPath(profileId, offered.body.from!, offered.body.to!, length.durationMinutes),
          );
          assert.equal(client.status, 200, client.text);
          assert.equal(client.body.providerStatus, offered.body.providerStatus);
          assert.deepEqual(stableSlots(client.body.slots), stableSlots(length.slots));
        }
      }
      const clientNika = await getJson(
        studentServer!.baseUrl,
        availabilityPath(nikaProfileId, nikaOffered.body.from!, nikaOffered.body.to!, 60),
      );
      assert.equal(clientNika.status, 404);
    });

    await t.test("a disconnected fixed window matches the client slots for the same tutor and time", async () => {
      assert.equal(fixedOffered.status, 200, fixedOffered.text);
      assert.equal(fixedOffered.body.providerStatus, "disconnected");
      assert.equal(fixedOffered.body.timezone, TIMEZONE);
      const noticeFloor = Date.now() + 480 * 60_000 - 60_000;
      const openSlot = localSlot(2, "10:00");
      assert.equal(offeredSlots(fixedOffered.body, 60).includes(openSlot), true);
      assert.equal(offeredSlots(fixedOffered.body, 60).includes(localSlot(3, "10:00")), false);
      assert.equal(offeredSlots(fixedOffered.body, 60).includes(localSlot(1, "10:00")), false);
      for (const length of fixedOffered.body.lengths ?? []) {
        assert.ok(length.slots.length > 0, `expected open fixed-window slots for ${length.durationMinutes}`);
        for (const slot of length.slots) {
          assert.ok(Date.parse(slot) >= noticeFloor, slot);
        }
        const client = await getJson(
          studentServer!.baseUrl,
          availabilityPath(fixedProfileId, fixedOffered.body.from!, fixedOffered.body.to!, length.durationMinutes),
        );
        assert.equal(client.status, 200, client.text);
        assert.equal(client.body.providerStatus, fixedOffered.body.providerStatus);
        assert.deepEqual(stableSlots(client.body.slots), stableSlots(length.slots));
      }
    });

    await t.test("a missing app calendar hides slots students cannot actually book", async () => {
      assert.equal(reconnectOffered.status, 200, reconnectOffered.text);
      assert.equal(reconnectOffered.body.providerStatus, "reconnect");
      assert.equal(reconnectOffered.body.timezone, TIMEZONE);
      for (const length of reconnectOffered.body.lengths ?? []) {
        assert.deepEqual(length.slots, []);
        const client = await getJson(
          studentServer!.baseUrl,
          availabilityPath(
            reconnectProfileId,
            reconnectOffered.body.from!,
            reconnectOffered.body.to!,
            length.durationMinutes,
          ),
        );
        assert.equal(client.status, 200, client.text);
        assert.equal(client.body.providerStatus, "connected");
        const clientSlots = stableSlots(client.body.slots);
        assert.ok(clientSlots.length > 0, `students still list ${length.durationMinutes} minute slots`);
        assert.notDeepEqual(clientSlots, length.slots);
      }
    });

    await t.test("a disconnected calendar offers no slots", () => {
      assert.equal(nikaOffered.status, 200, nikaOffered.text);
      assert.equal(nikaOffered.body.providerStatus, "disconnected");
      assert.equal(nikaOffered.body.offeredToClients, true);
      assert.equal(nikaOffered.body.availabilityDependsOnClient, true);
      assert.equal(nikaOffered.body.timezone, TIMEZONE);
      for (const length of nikaOffered.body.lengths ?? []) {
        assert.deepEqual(length.slots, []);
      }
    });

    await t.test("an inactive tutor and a tutor who is not booking eligible see no slots", () => {
      for (const offered of [inactiveOffered, ineligibleOffered]) {
        assert.equal(offered.status, 200, offered.text);
        assert.equal(offered.body.offeredToClients, false, offered.text);
        assert.equal(offered.body.availabilityDependsOnClient, false);
        for (const length of offered.body.lengths ?? []) {
          assert.deepEqual(length.slots, []);
        }
      }
      assert.equal(inactiveOffered.text.includes(inactiveProfileId), false);
      assert.equal(ineligibleOffered.text.includes(ineligibleProfileId), false);
    });

    await t.test("one tutor load reads free/busy once for every session length", async () => {
      freeBusyCalls = 0;
      const again = await getJson(xavierServer!.baseUrl, "/api/tutor/offered-availability");
      assert.equal(again.status, 200, again.text);
      assert.equal(freeBusyCalls, 1);
      freeBusyCalls = 0;
      const hidden = await getJson(inactiveServer!.baseUrl, "/api/tutor/offered-availability");
      assert.equal(hidden.status, 200, hidden.text);
      assert.equal(freeBusyCalls, 0);
    });

    await t.test("held and booked times are omitted and the response has no client details", () => {
      const serialized = `${xavierOffered.text}${euniceOffered.text}${nikaOffered.text}${fixedOffered.text}${reconnectOffered.text}${inactiveOffered.text}${ineligibleOffered.text}`;
      assert.equal(serialized.toLowerCase().includes("quinlan"), false);
      assert.equal(serialized.toLowerCase().includes(piiToken), false);
      assert.equal(serialized.includes(piiEmail), false);
      assert.equal(serialized.includes(payment!.id), false);
      assert.equal(serialized.includes("Xavier Morales"), false);
      assert.equal(xavierOffered.body.offeredToClients, true);
      assert.equal(xavierOffered.body.availabilityDependsOnClient, false);
      assert.equal(xavierOffered.body.usesAdminCalendarFallback, false);
      assert.equal(nikaOffered.body.usesAdminCalendarFallback, true);
      assert.equal(fixedOffered.body.usesAdminCalendarFallback, false);
      assert.deepEqual(Object.keys(xavierOffered.body).sort(), [
        "availabilityDependsOnClient",
        "from",
        "lengths",
        "offeredToClients",
        "providerStatus",
        "timezone",
        "to",
        "usesAdminCalendarFallback",
      ]);
      for (const length of xavierOffered.body.lengths ?? []) {
        assert.deepEqual(Object.keys(length).sort(), ["durationMinutes", "slots"]);
      }
      const xavierHour = offeredSlots(xavierOffered.body, 60);
      assert.equal(xavierHour.includes(bookedStart), false);
      assert.equal(xavierHour.includes(heldStart), false);
      assert.equal(xavierHour.includes(busyStart), false);
    });
  } catch (error) {
    failure = error;
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    await xavierServer?.close().catch(() => undefined);
    await euniceServer?.close().catch(() => undefined);
    await nikaServer?.close().catch(() => undefined);
    await fixedServer?.close().catch(() => undefined);
    await reconnectServer?.close().catch(() => undefined);
    await inactiveServer?.close().catch(() => undefined);
    await ineligibleServer?.close().catch(() => undefined);
    await studentServer?.close().catch(() => undefined);
    try {
      if (profileIds.length > 0) {
        await db.delete(bookingSlotHoldsTable).where(inArray(bookingSlotHoldsTable.tutorProfileId, profileIds));
      }
      if (paymentIds.length > 0) {
        await db.delete(paymentsTable).where(inArray(paymentsTable.id, paymentIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(sessionsTable).where(inArray(sessionsTable.clientUserId, createdUserIds));
        await db.delete(sessionsTable).where(inArray(sessionsTable.tutorUserId, createdUserIds));
        await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdUserIds));
      }
      if (courseId) await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
      if (profileIds.length > 0) {
        await db.delete(calendarConnectionsTable).where(inArray(calendarConnectionsTable.tutorProfileId, profileIds));
        await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.tutorProfileId, profileIds));
        await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, profileIds));
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
