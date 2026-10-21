import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  auditLogsTable,
  availabilityRulesTable,
  courseMembershipsTable,
  coursesTable,
  db,
  loginActivityTable,
  portalAccessGrantsTable,
  sessionsTable,
  tutorProfilesTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
} from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import platformRouter from "../routes/platform";
import { civilDateKey, zonedDateTimeToUtc } from "./booking";
import { setProductionClerkUsersClientForTests } from "./clerk-production-users";
import { NIKA_TUTOR_PROFILE_ID, shiftCivilDate } from "./self-serve-availability";

const NIKA_EMAIL = "nika.raiffe@gmail.com";
const ALIAS_EMAIL = "xsfam6@gmail.com";

type DateWindow = { start: string; end: string };
type DateHoursBody = {
  tutorProfileId?: string;
  timezone?: string;
  dateHours?: Record<string, DateWindow[]>;
  today?: string;
  editorDates?: string[];
  error?: string;
  code?: string;
};

type OfferedBody = {
  lengths?: Array<{ durationMinutes: number; slots: string[] }>;
  error?: string;
};

function testAuthMiddleware(user: { clerkUserId: string; email: string; displayName: string; id: string }) {
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
        sessionId: `self-serve-date-hours:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startServer(user: { clerkUserId: string; email: string; displayName: string; id: string }) {
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

async function requestJson(baseUrl: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as DateHoursBody & OfferedBody) : {},
  };
}

function putDate(baseUrl: string, dateHours: Record<string, DateWindow[]>) {
  return requestJson(baseUrl, "/api/tutor/date-hours", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dateHours }),
  });
}

async function overlappingSession(start: Date, end: Date) {
  const rows = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        sql`${sessionsTable.status} <> 'archived'`,
        sql`${sessionsTable.bookingStatus} <> 'cancelled'`,
        sql`${sessionsTable.dateTime} < ${end}`,
        sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${start}`,
      ),
    )
    .limit(1);
  return rows[0];
}

test("Nika edits her own date windows and everyone else is refused", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const suffix = randomUUID().slice(0, 8);
  const startedAt = new Date();
  const previousViewEmail = process.env.TEMP_NIKA_VIEW_EMAIL;
  const previousViewUntil = process.env.TEMP_NIKA_VIEW_UNTIL;
  delete process.env.TEMP_NIKA_VIEW_EMAIL;
  delete process.env.TEMP_NIKA_VIEW_UNTIL;
  const originalFetch = globalThis.fetch.bind(globalThis);
  let freeBusyCalls = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.includes("/calendar/v3/freeBusy")) {
      freeBusyCalls += 1;
      return Response.json({ calendars: { primary: { busy: [] } } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const createdUserIds: string[] = [];
  const createdGrantIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRuleIds: string[] = [];
  let createdSessionId: string | undefined;
  let createdNikaGrantId: string | undefined;
  const servers: Array<Awaited<ReturnType<typeof startServer>>> = [];
  let timezone = "America/New_York";
  let slotDate = "";
  let preservedDate = "";
  let windowStart = "";
  let windowEnd = "";
  let slotStart = "";
  let slotNext = "";
  let profileId = NIKA_TUTOR_PROFILE_ID;
  let originalDateHours: Record<string, DateWindow[]> | null = null;
  let originalUpdatedAt: Date | null = null;
  let restoreProfileUserId = false;
  let previousProfileUserId: string | null = null;

  try {
    const [existingProfile] = await db
      .select()
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, NIKA_TUTOR_PROFILE_ID))
      .limit(1);

    let nikaUser: AppUser;
    if (existingProfile?.userId) {
      const [linked] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, existingProfile.userId))
        .limit(1);
      assert.ok(linked);
      nikaUser = linked;
      profileId = existingProfile.id;
    } else if (existingProfile) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `self-serve-nika:${suffix}`,
          email: `self-serve-nika-${suffix}@example.invalid`,
          displayName: "Nika Raiffe",
          role: "tutor",
        })
        .returning();
      nikaUser = created!;
      createdUserIds.push(nikaUser.id);
      restoreProfileUserId = true;
      previousProfileUserId = existingProfile.userId;
      await db
        .update(tutorProfilesTable)
        .set({ userId: nikaUser.id, updatedAt: new Date() })
        .where(eq(tutorProfilesTable.id, existingProfile.id));
      profileId = existingProfile.id;
    } else {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `self-serve-nika:${suffix}`,
          email: `self-serve-nika-${suffix}@example.invalid`,
          displayName: "Nika Raiffe",
          role: "tutor",
        })
        .returning();
      nikaUser = created!;
      createdUserIds.push(nikaUser.id);
      const [profile] = await db
        .insert(tutorProfilesTable)
        .values({
          id: NIKA_TUTOR_PROFILE_ID,
          userId: nikaUser.id,
          email: `self-serve-nika-${suffix}@example.invalid`,
          name: "Nika Raiffe",
          title: "Admissions Tutor",
          subjects: ["College admissions"],
          active: true,
          bookingEligible: true,
          publicApproved: false,
        })
        .returning();
      createdProfileIds.push(profile!.id);
      profileId = profile!.id;
    }

    const [grantForNikaUser] = await db
      .select({ id: portalAccessGrantsTable.id })
      .from(portalAccessGrantsTable)
      .where(sql`lower(${portalAccessGrantsTable.email}) = ${nikaUser.email.toLowerCase()}`)
      .limit(1);
    if (!grantForNikaUser) {
      const [nikaGrant] = await db
        .insert(portalAccessGrantsTable)
        .values({
          email: nikaUser.email,
          clerkUserId: nikaUser.clerkUserId,
          displayName: nikaUser.displayName,
          roleCategory: "tutor",
          active: true,
          userId: nikaUser.id,
        })
        .returning();
      if (nikaGrant) createdGrantIds.push(nikaGrant.id);
    }

    const [existingRule] = await db
      .select()
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, profileId))
      .limit(1);
    if (existingRule) timezone = existingRule.timezone;

    const today = civilDateKey(new Date(), timezone);
    slotDate = "";
    for (const day of [10, 11, 12, 13]) {
      for (const start of ["16:00", "14:00", "18:00"]) {
        const date = shiftCivilDate(today, day);
        const endClock = `${String(Number(start.slice(0, 2)) + 2).padStart(2, "0")}:00`;
        const startAt = zonedDateTimeToUtc(date, start, timezone);
        const endAt = zonedDateTimeToUtc(date, endClock, timezone);
        if (await overlappingSession(startAt, endAt)) continue;
        slotDate = date;
        windowStart = start;
        windowEnd = endClock;
        slotStart = startAt.toISOString();
        slotNext = zonedDateTimeToUtc(
          date,
          `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:00`,
          timezone,
        ).toISOString();
        preservedDate = shiftCivilDate(date, 1);
        break;
      }
      if (slotDate) break;
    }
    assert.ok(slotDate, "expected an open two-hour window in the next two weeks");
    const savedWindow = [{ start: windowStart, end: windowEnd }];

    if (existingRule) {
      originalDateHours = (existingRule.dateHours ?? {}) as Record<string, DateWindow[]>;
      originalUpdatedAt = existingRule.updatedAt;
    } else {
      const [createdRule] = await db
        .insert(availabilityRulesTable)
        .values({
          tutorProfileId: profileId,
          timezone,
          weeklyHours: {},
          dateHours: {
            [preservedDate]: [{ start: "10:00", end: "11:00" }],
            "2099-12-31": [],
          },
          bookingNoticeMinutes: 8 * 60,
          bufferMinutes: 15,
          blackoutDates: [],
        })
        .returning();
      createdRuleIds.push(createdRule!.id);
      originalDateHours = null;
    }

    const other = await db
      .insert(usersTable)
      .values({
        clerkUserId: `self-serve-other:${suffix}`,
        email: `self-serve-other-${suffix}@example.invalid`,
        displayName: "Other Tutor",
        role: "tutor",
      })
      .returning();
    const student = await db
      .insert(usersTable)
      .values({
        clerkUserId: `self-serve-student:${suffix}`,
        email: `self-serve-student-${suffix}@example.invalid`,
        displayName: "Student Example",
        role: "student",
      })
      .returning();
    const viewer = await db
      .insert(usersTable)
      .values({
        clerkUserId: `self-serve-viewer:${suffix}`,
        email: `self-serve-viewer-${suffix}@example.invalid`,
        displayName: "Viewer Example",
        role: "viewer",
      })
      .returning();
    for (const user of [other[0]!, student[0]!, viewer[0]!]) createdUserIds.push(user.id);
    const otherGrant = await db
      .insert(portalAccessGrantsTable)
      .values([
        {
          email: other[0]!.email,
          clerkUserId: other[0]!.clerkUserId,
          displayName: other[0]!.displayName,
          roleCategory: "tutor" as const,
          active: true,
          userId: other[0]!.id,
        },
        {
          email: student[0]!.email,
          clerkUserId: student[0]!.clerkUserId,
          displayName: student[0]!.displayName,
          roleCategory: "student" as const,
          active: true,
          userId: student[0]!.id,
        },
        {
          email: viewer[0]!.email,
          clerkUserId: viewer[0]!.clerkUserId,
          displayName: viewer[0]!.displayName,
          roleCategory: "viewer" as const,
          linkedStudentEmail: student[0]!.email,
          active: true,
          userId: viewer[0]!.id,
        },
      ])
      .returning();
    createdGrantIds.push(...otherGrant.map((grant) => grant.id));
    const [otherProfile] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: other[0]!.id,
        email: other[0]!.email,
        name: "Other Tutor",
        title: "Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
        publicApproved: false,
      })
      .returning();
    createdProfileIds.push(otherProfile!.id);

    const [realNika] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${NIKA_EMAIL}`)
      .limit(1);
    if (realNika) {
      const [existingNikaGrant] = await db
        .select({ id: portalAccessGrantsTable.id })
        .from(portalAccessGrantsTable)
        .where(sql`lower(${portalAccessGrantsTable.email}) = ${NIKA_EMAIL}`)
        .limit(1);
      if (!existingNikaGrant) {
        const [created] = await db
          .insert(portalAccessGrantsTable)
          .values({
            email: NIKA_EMAIL,
            clerkUserId: realNika.clerkUserId,
            displayName: realNika.displayName,
            roleCategory: "tutor",
            active: true,
            userId: realNika.id,
          })
          .returning();
        createdNikaGrantId = created!.id;
      }
    }

    const nikaServer = await startServer(nikaUser);
    const otherServer = await startServer(other[0]!);
    const studentServer = await startServer(student[0]!);
    const viewerServer = await startServer(viewer[0]!);
    servers.push(nikaServer, otherServer, studentServer, viewerServer);

    try {
      const loaded = await requestJson(nikaServer.baseUrl, "/api/tutor/date-hours");
      assert.equal(loaded.status, 200);
      assert.equal(loaded.body.tutorProfileId, profileId);
      assert.equal(loaded.body.timezone, timezone);
      assert.equal(loaded.body.editorDates?.length, 56);
      assert.equal(JSON.stringify(loaded.body).includes("@"), false);

      for (const server of [otherServer, studentServer, viewerServer]) {
        const deniedGet = await requestJson(server.baseUrl, "/api/tutor/date-hours");
        const deniedPut = await putDate(server.baseUrl, {
          [slotDate]: savedWindow,
        });
        assert.equal(deniedGet.status, 403);
        assert.equal(deniedPut.status, 403);
      }

      if (realNika) {
        setProductionClerkUsersClientForTests({
          async getUser(userId: string) {
            return {
              id: userId,
              primaryEmailAddress: {
                emailAddress: ALIAS_EMAIL,
                verification: { status: "verified" },
              },
            };
          },
          async getUserList() {
            return { data: [] };
          },
          async createUser() {
            throw new Error("Clerk writes are not part of this test");
          },
          async updateEmailAddress() {
            throw new Error("Clerk writes are not part of this test");
          },
        });
        const aliasServer = await startServer({
          id: `alias-${suffix}`,
          clerkUserId: `self-serve-alias:${suffix}`,
          email: ALIAS_EMAIL,
          displayName: "Temporary view",
        });
        servers.push(aliasServer);
        const aliasGet = await requestJson(aliasServer.baseUrl, "/api/tutor/date-hours");
        const aliasPut = await putDate(aliasServer.baseUrl, { [slotDate]: savedWindow });
        assert.equal(aliasGet.status, 403);
        assert.equal(aliasGet.body.error, "You cannot edit booking availability.");
        assert.equal(aliasPut.status, 403);
      }

      const saved = await putDate(nikaServer.baseUrl, { [slotDate]: savedWindow });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body.dateHours?.[slotDate], savedWindow);
      const before = originalDateHours ?? {
        [preservedDate]: [{ start: "10:00", end: "11:00" }],
        "2099-12-31": [],
      };
      for (const [key, windows] of Object.entries(before)) {
        if (key === slotDate) continue;
        assert.deepEqual(saved.body.dateHours?.[key], windows, key);
      }

      const offered = await requestJson(nikaServer.baseUrl, "/api/tutor/offered-availability");
      assert.equal(offered.status, 200);
      const hourSlots =
        offered.body.lengths?.find((length) => length.durationMinutes === 60)?.slots ?? [];
      assert.equal(hourSlots.includes(slotStart), true);
      assert.equal(hourSlots.includes(slotNext), true);
      assert.equal(freeBusyCalls, 0);

      const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).limit(1);
      assert.ok(course);
      const [session] = await db
        .insert(sessionsTable)
        .values({
          courseId: course.id,
          clientUserId: student[0]!.id,
          tutorUserId: other[0]!.id,
          dateTime: new Date(slotStart),
          timezone,
          subject: "SAT",
          title: "Shared room hold",
          durationMinutes: 60,
          status: "published",
          bookingStatus: "confirmed",
        })
        .returning();
      createdSessionId = session!.id;
      const blocked = await requestJson(nikaServer.baseUrl, "/api/tutor/offered-availability");
      const blockedSlots =
        blocked.body.lengths?.find((length) => length.durationMinutes === 60)?.slots ?? [];
      assert.equal(blockedSlots.includes(slotStart), false);
      assert.equal(blockedSlots.includes(slotNext), true);
      assert.equal(freeBusyCalls, 0);

      const second = await putDate(nikaServer.baseUrl, {
        [preservedDate]: [{ start: "12:00", end: "13:00" }],
      });
      assert.equal(second.status, 200);
      assert.deepEqual(second.body.dateHours?.[slotDate], savedWindow);
      assert.deepEqual(second.body.dateHours?.[preservedDate], [{ start: "12:00", end: "13:00" }]);
      for (const [key, windows] of Object.entries(before)) {
        if (key === slotDate || key === preservedDate) continue;
        assert.deepEqual(second.body.dateHours?.[key], windows, key);
      }

      const unchanged = JSON.stringify(second.body.dateHours);
      const past = await putDate(nikaServer.baseUrl, {
        [shiftCivilDate(today, -1)]: [{ start: "16:00", end: "17:00" }],
      });
      const tooFar = await putDate(nikaServer.baseUrl, {
        [shiftCivilDate(today, 91)]: [{ start: "16:00", end: "17:00" }],
      });
      const offGrid = await putDate(nikaServer.baseUrl, {
        [slotDate]: [{ start: "16:05", end: "17:00" }],
      });
      const backwards = await putDate(nikaServer.baseUrl, {
        [slotDate]: [{ start: "17:00", end: "16:00" }],
      });
      assert.equal(past.status, 400);
      assert.equal(tooFar.status, 400);
      assert.equal(offGrid.status, 400);
      assert.equal(backwards.status, 400);
      assert.match(past.body.error ?? "", /past/);
      assert.match(tooFar.body.error ?? "", /90 days/);
      assert.match(offGrid.body.error ?? "", /15-minute/);
      assert.match(backwards.body.error ?? "", /end after/);
      const reread = await requestJson(nikaServer.baseUrl, "/api/tutor/date-hours");
      assert.equal(JSON.stringify(reread.body.dateHours), unchanged);

      const audits = await db
        .select({ metadata: auditLogsTable.metadata })
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityId, profileId),
            eq(auditLogsTable.action, "availability.date_hours_updated"),
            sql`${auditLogsTable.createdAt} >= ${startedAt}`,
          ),
        );
      assert.equal(
        audits.some((audit) =>
          ((audit.metadata as { dates?: string[] } | null)?.dates ?? []).includes(slotDate),
        ),
        true,
      );
      assert.equal(audits.some((audit) => JSON.stringify(audit.metadata ?? {}).includes("@")), false);
    } finally {
      await Promise.all(servers.map((server) => server.close()));
    }
  } finally {
    globalThis.fetch = originalFetch;
    setProductionClerkUsersClientForTests(null);
    if (previousViewEmail === undefined) delete process.env.TEMP_NIKA_VIEW_EMAIL;
    else process.env.TEMP_NIKA_VIEW_EMAIL = previousViewEmail;
    if (previousViewUntil === undefined) delete process.env.TEMP_NIKA_VIEW_UNTIL;
    else process.env.TEMP_NIKA_VIEW_UNTIL = previousViewUntil;

    if (createdSessionId) {
      await db.delete(sessionsTable).where(eq(sessionsTable.id, createdSessionId));
    }
    await db.delete(auditLogsTable).where(
      and(
        eq(auditLogsTable.entityId, profileId),
        eq(auditLogsTable.action, "availability.date_hours_updated"),
        sql`${auditLogsTable.createdAt} >= ${startedAt}`,
      ),
    );
    await db.delete(auditLogsTable).where(
      and(
        eq(auditLogsTable.action, "access.temporary_tutor_view"),
        sql`${auditLogsTable.createdAt} >= ${startedAt}`,
      ),
    );
    await db.delete(auditLogsTable).where(
      and(
        eq(auditLogsTable.action, "access.denied"),
        sql`${auditLogsTable.entityType} = 'temporary_tutor_view'`,
        sql`${auditLogsTable.createdAt} >= ${startedAt}`,
      ),
    );
    if (createdUserIds.length > 0) {
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, createdUserIds));
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdUserIds));
      await db.delete(viewerLinksTable).where(
        or(
          inArray(viewerLinksTable.viewerUserId, createdUserIds),
          inArray(viewerLinksTable.studentUserId, createdUserIds),
        ),
      );
      await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdUserIds));
    }
    if (originalDateHours) {
      await db
        .update(availabilityRulesTable)
        .set({ dateHours: originalDateHours, updatedAt: originalUpdatedAt ?? new Date() })
        .where(eq(availabilityRulesTable.tutorProfileId, profileId));
    }
    if (createdRuleIds.length > 0) {
      await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.id, createdRuleIds));
    }
    if (restoreProfileUserId && !createdProfileIds.includes(profileId)) {
      await db
        .update(tutorProfilesTable)
        .set({ userId: previousProfileUserId, updatedAt: new Date() })
        .where(eq(tutorProfilesTable.id, profileId));
    }
    if (createdProfileIds.length > 0) {
      await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
    }
    if (createdNikaGrantId) {
      await db.delete(portalAccessGrantsTable).where(eq(portalAccessGrantsTable.id, createdNikaGrantId));
    }
    if (createdGrantIds.length > 0) {
      await db.delete(portalAccessGrantsTable).where(inArray(portalAccessGrantsTable.id, createdGrantIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
  }
});
