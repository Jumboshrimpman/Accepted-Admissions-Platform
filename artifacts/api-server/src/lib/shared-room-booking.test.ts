import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { generateAvailableSlots } from "./booking.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  assertNoScheduleConflict,
  BookingServiceError,
  listGlobalRoomBusyWindows,
} from "./booking-service.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { claimBookingSlotHold } from "./booking-slot-hold.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NEEL_NIKA_MEET_URL } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { sessionClaimsSharedFallMeet } from "./shared-meet-conflict.ts";

const ROOM_START = new Date("2035-06-02T15:00:00.000Z");
const ROOM_END = new Date("2035-06-02T16:00:00.000Z");
const BACK_TO_BACK = new Date("2035-06-02T16:00:00.000Z");
const HOLD_START = new Date("2035-06-02T18:00:00.000Z");
const DIFFERENT_ROOM = "https://meet.google.com/different-room";

test("the shared room blocks an overlapping hour and still allows the next hour to start on time", () => {
  const rule = {
    timezone: "UTC",
    weeklyHours: { "1": [{ start: "15:00", end: "17:00" }] },
    bookingNoticeMinutes: 0,
    bufferMinutes: 15,
    blackoutDates: [],
  };
  const from = new Date("2026-11-02T00:00:00.000Z");
  const to = new Date("2026-11-03T00:00:00.000Z");
  const now = new Date("2026-10-01T00:00:00.000Z");
  const occupied = [{ start: "2026-11-02T15:00:00.000Z", end: "2026-11-02T16:00:00.000Z" }];
  assert.deepEqual(
    generateAvailableSlots(rule, from, to, 60, [], [], now, occupied),
    ["2026-11-02T16:00:00.000Z"],
  );
  assert.deepEqual(
    generateAvailableSlots(rule, from, to, 60, [], occupied, now, []),
    [],
  );
});

test("every booking invite is pinned to the one Meet link", async () => {
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const eventStart = platform.indexOf("function neelNikaCalendarEvent");
  const eventEnd = platform.indexOf("async function pinnedNeelNikaMeet");
  const event = platform.slice(eventStart, eventEnd);
  assert.match(event, /const meetUrl = SHARED_FALL_MEETING_URL/);
  assert.match(event, /location: meetUrl/);
  assert.match(event, /description: meetUrl/);
  assert.match(event, /conferenceData: existingGoogleMeetConference\(meetUrl\)/);
  assert.doesNotMatch(event, /neelNikaMeetUrl\(/);
  assert.doesNotMatch(event, /createRequest/);
  assert.equal(NEEL_NIKA_MEET_URL, "https://meet.google.com/rih-iayt-okb");
});

type DatabaseModule = typeof import("@workspace/db");
let database: DatabaseModule | null = null;

async function loadDb(): Promise<DatabaseModule> {
  if (!database) database = await import("@workspace/db");
  return database;
}

after(async () => {
  if (database?.pool) await database.pool.end();
});

test("a session or hold for any tutor blocks the shared room, including a different Meet subject", async () => {
  assert.equal(
    sessionClaimsSharedFallMeet({
      term: "Spring 2027",
      subject: "IELTS",
      courseMeetUrl: DIFFERENT_ROOM,
    }),
    false,
  );
  const db = await loadDb();
  const suffix = randomUUID().slice(0, 8);
  const studentA = randomUUID();
  const studentB = randomUUID();
  const tutorA = randomUUID();
  const tutorB = randomUUID();
  const courseId = randomUUID();
  const profileA = randomUUID();
  const profileB = randomUUID();
  const paymentId = randomUUID();
  const sessionId = randomUUID();
  const userIds = [studentA, studentB, tutorA, tutorB];

  await db.db.insert(db.usersTable).values([
    {
      id: studentA,
      clerkUserId: `room-student-a-${suffix}`,
      email: `room-student-a-${suffix}@example.invalid`,
      displayName: "Room Student A",
      role: "student",
    },
    {
      id: studentB,
      clerkUserId: `room-student-b-${suffix}`,
      email: `room-student-b-${suffix}@example.invalid`,
      displayName: "Room Student B",
      role: "student",
    },
    {
      id: tutorA,
      clerkUserId: `room-tutor-a-${suffix}`,
      email: `room-tutor-a-${suffix}@example.invalid`,
      displayName: "Room Tutor A",
      role: "tutor",
    },
    {
      id: tutorB,
      clerkUserId: `room-tutor-b-${suffix}`,
      email: `room-tutor-b-${suffix}@example.invalid`,
      displayName: "Room Tutor B",
      role: "tutor",
    },
  ]);
  await db.db.insert(db.coursesTable).values({
    id: courseId,
    title: `Room course ${suffix}`,
    subject: "IELTS",
    term: "Spring 2027",
    status: "published",
    meetUrl: DIFFERENT_ROOM,
  });
  await db.db.insert(db.tutorProfilesTable).values([
    {
      id: profileA,
      userId: tutorA,
      email: `room-tutor-a-${suffix}@example.invalid`,
      name: "Room Tutor A",
      bookingEligible: true,
    },
    {
      id: profileB,
      userId: tutorB,
      email: `room-tutor-b-${suffix}@example.invalid`,
      name: "Room Tutor B",
      bookingEligible: true,
    },
  ]);
  await db.db.insert(db.sessionsTable).values({
    id: sessionId,
    courseId,
    clientUserId: studentA,
    tutorUserId: tutorA,
    dateTime: ROOM_START,
    timezone: "America/New_York",
    subject: "IELTS",
    title: "Room session",
    status: "published",
    durationMinutes: 60,
    bookingStatus: "confirmed",
  });
  await db.db.insert(db.paymentsTable).values({
    id: paymentId,
    clientUserId: studentA,
    amountCents: 100,
    status: "pending",
  });
  await db.db.insert(db.bookingSlotHoldsTable).values({
    tutorProfileId: profileA,
    clientUserId: studentA,
    paymentId,
    startTime: HOLD_START,
    durationMinutes: 60,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });

  try {
    await assert.rejects(
      () =>
        db.db.transaction(async (tx) => {
          await assertNoScheduleConflict(tx, {
            participantIds: [studentB, tutorB],
            start: new Date(ROOM_START.getTime() + 30 * 60_000),
            end: new Date(ROOM_END.getTime() + 30 * 60_000),
          });
        }),
      (error: unknown) =>
        error instanceof BookingServiceError && error.code === "SCHEDULE_CONFLICT",
    );
    await db.db.transaction(async (tx) => {
      await assertNoScheduleConflict(tx, {
        participantIds: [studentB, tutorB],
        start: BACK_TO_BACK,
        end: new Date(BACK_TO_BACK.getTime() + 60 * 60_000),
      });
    });
    await assert.rejects(
      () =>
        db.db.transaction(async (tx) => {
          await assertNoScheduleConflict(tx, {
            participantIds: [studentB, tutorB],
            start: new Date(HOLD_START.getTime() + 15 * 60_000),
            end: new Date(HOLD_START.getTime() + 75 * 60_000),
          });
        }),
      (error: unknown) =>
        error instanceof BookingServiceError && error.code === "SCHEDULE_CONFLICT",
    );
    await db.db.transaction(async (tx) => {
      await assertNoScheduleConflict(tx, {
        participantIds: [studentB, tutorB],
        start: HOLD_START,
        end: new Date(HOLD_START.getTime() + 60 * 60_000),
        ignoreHoldPaymentId: paymentId,
      });
    });
    const windows = await listGlobalRoomBusyWindows({
      start: ROOM_START,
      end: new Date(HOLD_START.getTime() + 60 * 60_000),
    });
    assert.equal(
      windows.some((window) => window.start === ROOM_START.toISOString() && window.end === ROOM_END.toISOString()),
      true,
    );
    assert.equal(
      windows.some((window) => window.start === HOLD_START.toISOString()),
      true,
    );
    const ignored = await listGlobalRoomBusyWindows({
      start: HOLD_START,
      end: new Date(HOLD_START.getTime() + 60 * 60_000),
      ignoreHoldPaymentId: paymentId,
    });
    assert.equal(
      ignored.some((window) => window.start === HOLD_START.toISOString()),
      false,
    );
    await assert.rejects(
      () =>
        db.db.transaction(async (tx) => {
          await claimBookingSlotHold(tx, {
            tutorProfileId: profileB,
            tutorUserId: tutorB,
            clientUserId: studentB,
            paymentId,
            start: ROOM_START,
            durationMinutes: 60,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          });
        }),
      (error: unknown) =>
        error instanceof BookingServiceError && error.code === "SCHEDULE_CONFLICT",
    );
    const openPaymentId = randomUUID();
    await db.db.insert(db.paymentsTable).values({
      id: openPaymentId,
      clientUserId: studentB,
      amountCents: 100,
      status: "pending",
    });
    await db.db.transaction(async (tx) => {
      await claimBookingSlotHold(tx, {
        tutorProfileId: profileB,
        tutorUserId: tutorB,
        clientUserId: studentB,
        paymentId: openPaymentId,
        start: BACK_TO_BACK,
        durationMinutes: 60,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
    });
  } finally {
    const payments = await db.db
      .select({ id: db.paymentsTable.id })
      .from(db.paymentsTable)
      .where(inArray(db.paymentsTable.clientUserId, [studentA, studentB]));
    const paymentIds = payments.map((payment) => payment.id);
    if (paymentIds.length > 0) {
      await db.db
        .delete(db.bookingSlotHoldsTable)
        .where(inArray(db.bookingSlotHoldsTable.paymentId, paymentIds));
      await db.db.delete(db.paymentsTable).where(inArray(db.paymentsTable.id, paymentIds));
    }
    await db.db.delete(db.sessionsTable).where(eq(db.sessionsTable.id, sessionId));
    await db.db.delete(db.tutorProfilesTable).where(inArray(db.tutorProfilesTable.id, [profileA, profileB]));
    await db.db.delete(db.coursesTable).where(eq(db.coursesTable.id, courseId));
    await db.db.delete(db.usersTable).where(inArray(db.usersTable.id, userIds));
  }
});
