import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { generateAvailableSlots } from "./booking.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEETING_URL, taitoSessionDateTime } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { sessionClaimsSharedFallMeet, sessionsOverlap, sharedMeetOccupancyWindows } from "./shared-meet-conflict.ts";

const michelleXavierStart = new Date("2026-10-02T12:00:00.000Z");
const michelleXavierEnd = new Date("2026-10-02T13:00:00.000Z");

test("allows a slot when no other session overlaps the shared Meet", () => {
  const taitoStart = taitoSessionDateTime("2026-10-02");
  const taitoEnd = new Date(taitoStart.getTime() + 60 * 60_000);
  const laterStart = new Date(taitoEnd.getTime());
  const laterEnd = new Date(laterStart.getTime() + 60 * 60_000);
  assert.equal(sessionsOverlap(taitoStart, taitoEnd, laterStart, laterEnd), false);
  assert.deepEqual(
    sharedMeetOccupancyWindows([
      {
        dateTime: taitoStart,
        durationMinutes: 60,
        term: "Fall 2026",
        subject: "SAT",
      },
    ]),
    [{ start: taitoStart.toISOString(), end: taitoEnd.toISOString() }],
  );
  const slots = generateAvailableSlots(
    {
      timezone: "UTC",
      weeklyHours: { "5": [{ start: "14:00", end: "16:00" }] },
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    new Date("2026-10-02T00:00:00.000Z"),
    new Date("2026-10-03T00:00:00.000Z"),
    60,
    [],
    [{ start: taitoStart.toISOString(), end: taitoEnd.toISOString() }],
    new Date("2026-09-01T00:00:00.000Z"),
  );
  assert.deepEqual(slots, [
    "2026-10-02T14:00:00.000Z",
    "2026-10-02T15:00:00.000Z",
  ]);
});

test("rejects overlap when another booked session already claims the shared Meet", () => {
  const taitoStart = taitoSessionDateTime("2026-10-02");
  const taitoEnd = new Date(taitoStart.getTime() + 60 * 60_000);
  const overlapStart = new Date(taitoStart.getTime() + 30 * 60_000);
  const overlapEnd = new Date(overlapStart.getTime() + 60 * 60_000);
  assert.equal(sessionsOverlap(taitoStart, taitoEnd, overlapStart, overlapEnd), true);
  const slots = generateAvailableSlots(
    {
      timezone: "UTC",
      weeklyHours: { "5": [{ start: "12:00", end: "14:00" }] },
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    new Date("2026-10-02T00:00:00.000Z"),
    new Date("2026-10-03T00:00:00.000Z"),
    60,
    [],
    [{ start: taitoStart.toISOString(), end: taitoEnd.toISOString() }],
    new Date("2026-09-01T00:00:00.000Z"),
  );
  assert.equal(slots.includes("2026-10-02T12:00:00.000Z"), false);
  assert.deepEqual(slots, ["2026-10-02T13:00:00.000Z"]);
});

test("Michelle SAT self-serve cannot claim the shared Meet during Taito's Fall session", () => {
  const taitoStart = taitoSessionDateTime("2026-10-02");
  const taitoEnd = new Date(taitoStart.getTime() + 60 * 60_000);
  assert.equal(taitoStart.toISOString(), michelleXavierStart.toISOString());
  assert.equal(
    sessionClaimsSharedFallMeet({ term: "Fall 2026", subject: "SAT" }),
    true,
  );
  assert.equal(
    sessionClaimsSharedFallMeet({ term: "Fall 2026", subject: "IELTS" }),
    true,
  );
  assert.equal(
    sessionClaimsSharedFallMeet({
      term: "Spring 2027",
      subject: "SAT",
      courseMeetUrl: null,
    }),
    true,
  );
  assert.equal(
    sessionClaimsSharedFallMeet({
      term: "Spring 2027",
      subject: "IELTS",
      courseMeetUrl: null,
    }),
    false,
  );
  assert.equal(
    sessionClaimsSharedFallMeet({
      term: "Spring 2027",
      subject: "IELTS",
      courseMeetUrl: SHARED_FALL_MEETING_URL,
    }),
    true,
  );
  assert.equal(
    sessionsOverlap(taitoStart, taitoEnd, michelleXavierStart, michelleXavierEnd),
    true,
  );
  const slots = generateAvailableSlots(
    {
      timezone: "UTC",
      weeklyHours: { "5": [{ start: "12:00", end: "13:00" }] },
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    new Date("2026-10-02T00:00:00.000Z"),
    new Date("2026-10-03T00:00:00.000Z"),
    60,
    [],
    sharedMeetOccupancyWindows([
      {
        dateTime: taitoStart,
        durationMinutes: 60,
        term: "Fall 2026",
        subject: "IELTS",
      },
    ]),
    new Date("2026-09-01T00:00:00.000Z"),
  );
  assert.deepEqual(slots, []);
});
