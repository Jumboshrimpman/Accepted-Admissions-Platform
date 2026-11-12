import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  availabilityRulesTable,
  courseMembershipsTable,
  creditLedgerTable,
  db,
  loginActivityTable,
  satProductsTable,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import platformRouter from "../routes/platform";
import {
  MICHELLE_MAKAREM_CLERK_USER_ID,
  MICHELLE_MAKAREM_EMAIL,
} from "./calendar-pair-attendees";
import {
  SOPHIA_LAMAS_TUTOR_EMAIL,
  SOPHIA_LAMAS_TUTOR_NAME,
} from "./admin-calendar-fallback";

const NIKA_NAME = "Nika Raiffe";
const NIKA_EMAIL = "nika.raiffe@gmail.com";
const SOPHIA_RECURRING_HOURS = {
  startDate: "2026-11-16",
  endDate: null,
  days: {
    "1": [{ start: "18:00", end: "19:00" }],
    "2": [{ start: "18:00", end: "19:00" }],
    "3": [{ start: "18:00", end: "19:00" }],
  },
};

type TutorListRow = {
  id: string;
  name: string;
  calendarStatus?: string;
  providerStatus?: string;
  bookable?: boolean;
  comingSoon?: boolean;
  prepaidHours?: number;
  hourlyRateCents?: number | null;
  email?: string;
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
        sessionId: `sophia-lamas-sat-list:${user.id}`,
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

async function getTutors(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/booking/tutors`);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as TutorListRow[]) : [],
  };
}

test("GET /api/booking/tutors marks disconnected Sophia Lamas bookable for Michelle when her hours are set", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for Sophia Lamas SAT tutor-list coverage");
    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdLedgerIds: string[] = [];
  let reusedMichelleId: string | undefined;
  let sophiaSnapshot: typeof tutorProfilesTable.$inferSelect | undefined;
  let nikaSnapshot: typeof tutorProfilesTable.$inferSelect | undefined;
  let sophiaRuleSnapshot: typeof availabilityRulesTable.$inferSelect | undefined;
  let nikaRuleSnapshot: typeof availabilityRulesTable.$inferSelect | undefined;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;

  try {
    const existingMichelle = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.email, MICHELLE_MAKAREM_EMAIL),
          eq(usersTable.clerkUserId, MICHELLE_MAKAREM_CLERK_USER_ID),
        ),
      );
    let michelle =
      existingMichelle.find(
        (user) =>
          user.clerkUserId === MICHELLE_MAKAREM_CLERK_USER_ID &&
          user.email === MICHELLE_MAKAREM_EMAIL,
      ) ?? existingMichelle[0];
    if (michelle) {
      reusedMichelleId = michelle.id;
    } else {
      const [created] = await db
        .insert(usersTable)
        .values({
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

    const [existingSophia] = await db
      .select()
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.name, SOPHIA_LAMAS_TUTOR_NAME))
      .limit(1);
    let sophia = existingSophia;
    if (sophia) {
      sophiaSnapshot = sophia;
    } else {
      const [created] = await db
        .insert(tutorProfilesTable)
        .values({
          email: SOPHIA_LAMAS_TUTOR_EMAIL,
          name: SOPHIA_LAMAS_TUTOR_NAME,
          title: "SAT English Tutor",
          subjects: ["SAT"],
          active: true,
          bookingEligible: true,
          calendarStatus: "disconnected",
        })
        .returning();
      sophia = created;
      createdProfileIds.push(sophia!.id);
    }
    assert.ok(sophia);

    const [existingNika] = await db
      .select()
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.name, NIKA_NAME))
      .limit(1);
    let nika = existingNika;
    if (nika) {
      nikaSnapshot = nika;
    } else {
      const [created] = await db
        .insert(tutorProfilesTable)
        .values({
          email: NIKA_EMAIL,
          name: NIKA_NAME,
          title: "SAT Tutor",
          subjects: ["SAT"],
          active: true,
          bookingEligible: true,
          calendarStatus: "disconnected",
        })
        .returning();
      nika = created;
      createdProfileIds.push(nika!.id);
    }
    assert.ok(nika);

    await db
      .update(tutorProfilesTable)
      .set({
        active: true,
        bookingEligible: true,
        calendarStatus: "disconnected",
        updatedAt: new Date(),
      })
      .where(inArray(tutorProfilesTable.id, [sophia.id, nika.id]));

    const [sophiaRule] = await db
      .select()
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, sophia.id))
      .limit(1);
    if (sophiaRule) {
      sophiaRuleSnapshot = sophiaRule;
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: "Asia/Dubai",
          recurringHours: SOPHIA_RECURRING_HOURS,
          updatedAt: new Date(),
        })
        .where(eq(availabilityRulesTable.id, sophiaRule.id));
    } else {
      const [created] = await db
        .insert(availabilityRulesTable)
        .values({
          tutorProfileId: sophia.id,
          timezone: "Asia/Dubai",
          weeklyHours: {},
          dateHours: {},
          recurringHours: SOPHIA_RECURRING_HOURS,
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          blackoutDates: [],
        })
        .returning();
      createdRuleIds.push(created!.id);
    }

    const [nikaRule] = await db
      .select()
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, nika.id))
      .limit(1);
    if (nikaRule) {
      nikaRuleSnapshot = nikaRule;
      await db
        .update(availabilityRulesTable)
        .set({
          dateHours: { "2026-11-16": [{ start: "09:00", end: "10:00" }] },
          recurringHours: nikaRule.recurringHours,
          updatedAt: new Date(),
        })
        .where(eq(availabilityRulesTable.id, nikaRule.id));
    } else {
      const [created] = await db
        .insert(availabilityRulesTable)
        .values({
          tutorProfileId: nika.id,
          timezone: "America/New_York",
          weeklyHours: {},
          dateHours: { "2026-11-16": [{ start: "09:00", end: "10:00" }] },
          bookingNoticeMinutes: 0,
          bufferMinutes: 0,
          blackoutDates: [],
        })
        .returning();
      createdRuleIds.push(created!.id);
    }

    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = michelle.clerkUserId;
    server = await startServer(michelle);

    const seeded = await getTutors(server.baseUrl);
    assert.equal(seeded.status, 200, JSON.stringify(seeded.body));

    const [sophiaHour] = await db
      .select({ id: satProductsTable.id, slug: satProductsTable.slug })
      .from(satProductsTable)
      .where(eq(satProductsTable.slug, "sat-sophia-lamas-60"))
      .limit(1);
    assert.ok(sophiaHour, "sat-sophia-lamas-60 product is required");

    const beforeById = new Map(seeded.body.map((tutor) => [tutor.id, tutor]));
    const [ledger] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: michelle.id,
        productId: sophiaHour.id,
        entryType: "original",
        hours: 1,
        note: `sophia-lamas-sat-list-${suffix}`,
      })
      .returning();
    createdLedgerIds.push(ledger!.id);

    const listed = await getTutors(server.baseUrl);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(
      listed.body.some((tutor) => tutor.email),
      false,
      "SAT tutor list must not include portal emails",
    );

    const sophiaRow = listed.body.find((tutor) => tutor.id === sophia.id);
    const nikaRow = listed.body.find((tutor) => tutor.id === nika.id);
    assert.ok(sophiaRow, "Sophia Lamas should appear on Michelle's SAT tutor list");
    assert.ok(nikaRow, "Nika should appear on Michelle's SAT tutor list");
    assert.equal(sophiaRow.bookable, true);
    assert.equal(sophiaRow.providerStatus, "disconnected");
    assert.equal(sophiaRow.comingSoon, false);
    assert.equal(Number(sophiaRow.prepaidHours), Number(beforeById.get(sophia.id)?.prepaidHours ?? 0) + 1);

    assert.equal(nikaRow.bookable, false);
    assert.equal(nikaRow.providerStatus, "disconnected");
    assert.equal(Number(nikaRow.prepaidHours), Number(beforeById.get(nika.id)?.prepaidHours ?? 0));

    for (const tutor of listed.body) {
      if (tutor.id === sophia.id) continue;
      assert.equal(
        Number(tutor.prepaidHours),
        Number(beforeById.get(tutor.id)?.prepaidHours ?? 0),
        `${tutor.name} must not receive Sophia Lamas prepaid hours`,
      );
      if (tutor.id === nika.id) continue;
      const expectedBookable = tutor.comingSoon ? false : tutor.providerStatus === "connected";
      assert.equal(tutor.bookable, expectedBookable, `${tutor.name} bookable should be unchanged`);
    }
  } finally {
    await server?.close();
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;

    if (createdLedgerIds.length) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdRuleIds.length) {
      await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.id, createdRuleIds));
    }
    if (sophiaRuleSnapshot) {
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: sophiaRuleSnapshot.timezone,
          weeklyHours: sophiaRuleSnapshot.weeklyHours,
          dateHours: sophiaRuleSnapshot.dateHours,
          recurringHours: sophiaRuleSnapshot.recurringHours,
          bookingNoticeMinutes: sophiaRuleSnapshot.bookingNoticeMinutes,
          bufferMinutes: sophiaRuleSnapshot.bufferMinutes,
          blackoutDates: sophiaRuleSnapshot.blackoutDates,
          updatedAt: sophiaRuleSnapshot.updatedAt,
        })
        .where(eq(availabilityRulesTable.id, sophiaRuleSnapshot.id));
    }
    if (nikaRuleSnapshot) {
      await db
        .update(availabilityRulesTable)
        .set({
          timezone: nikaRuleSnapshot.timezone,
          weeklyHours: nikaRuleSnapshot.weeklyHours,
          dateHours: nikaRuleSnapshot.dateHours,
          recurringHours: nikaRuleSnapshot.recurringHours,
          bookingNoticeMinutes: nikaRuleSnapshot.bookingNoticeMinutes,
          bufferMinutes: nikaRuleSnapshot.bufferMinutes,
          blackoutDates: nikaRuleSnapshot.blackoutDates,
          updatedAt: nikaRuleSnapshot.updatedAt,
        })
        .where(eq(availabilityRulesTable.id, nikaRuleSnapshot.id));
    }
    if (sophiaSnapshot) {
      await db
        .update(tutorProfilesTable)
        .set({
          active: sophiaSnapshot.active,
          bookingEligible: sophiaSnapshot.bookingEligible,
          calendarStatus: sophiaSnapshot.calendarStatus,
          updatedAt: sophiaSnapshot.updatedAt,
        })
        .where(eq(tutorProfilesTable.id, sophiaSnapshot.id));
    }
    if (nikaSnapshot) {
      await db
        .update(tutorProfilesTable)
        .set({
          active: nikaSnapshot.active,
          bookingEligible: nikaSnapshot.bookingEligible,
          calendarStatus: nikaSnapshot.calendarStatus,
          updatedAt: nikaSnapshot.updatedAt,
        })
        .where(eq(tutorProfilesTable.id, nikaSnapshot.id));
    }
    if (createdProfileIds.length) {
      await db.delete(availabilityRulesTable).where(inArray(availabilityRulesTable.tutorProfileId, createdProfileIds));
      await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
    }
    for (const userId of createdUserIds) {
      if (reusedMichelleId && userId === reusedMichelleId) continue;
      await db.delete(loginActivityTable).where(eq(loginActivityTable.userId, userId));
      await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  }
});
