import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { calendarEventPayload, generateAvailableSlots, overlapsBusyWindow, zonedDateTimeToUtc } from "./booking.ts";

const rule = {
  timezone: "America/New_York",
  weeklyHours: { "1": [{ start: "09:00", end: "12:00" }] },
  bookingNoticeMinutes: 0,
  bufferMinutes: 15,
  blackoutDates: [],
};

test("expands local tutor hours into UTC slots across a daylight-saving transition", () => {
  const slot = zonedDateTimeToUtc("2026-03-09", "09:00", rule.timezone);
  assert.equal(slot.toISOString(), "2026-03-09T13:00:00.000Z");
});

test("removes Google busy windows and adjacent buffered slots", () => {
  const slots = generateAvailableSlots(
    rule,
    new Date("2026-08-31T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
    60,
    [{ start: "2026-08-31T14:00:00.000Z", end: "2026-08-31T15:00:00.000Z" }],
    [],
    new Date("2026-08-30T00:00:00.000Z"),
  );
  assert.deepEqual(slots, []);
  assert.equal(
    overlapsBusyWindow(
      new Date("2026-08-31T15:00:00.000Z"),
      new Date("2026-08-31T16:00:00.000Z"),
      [{ start: "2026-08-31T14:00:00.000Z", end: "2026-08-31T15:00:00.000Z" }],
      15,
    ),
    true,
  );
});

test("treats adjacent unbuffered meetings as non-overlapping", () => {
  assert.equal(
    overlapsBusyWindow(
      new Date("2026-08-31T15:00:00.000Z"),
      new Date("2026-08-31T16:00:00.000Z"),
      [{ start: "2026-08-31T14:00:00.000Z", end: "2026-08-31T15:00:00.000Z" }],
    ),
    false,
  );
});

test("honors booking notice and blackout dates", () => {
  const slots = generateAvailableSlots(
    { ...rule, blackoutDates: ["2026-08-31"] },
    new Date("2026-08-31T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
    60,
    [],
    [],
    new Date("2026-08-30T00:00:00.000Z"),
  );
  assert.deepEqual(slots, []);
});

test("event payload contains only the approved session details", () => {
  const event = calendarEventPayload(
    "SAT session with Xavier Morales",
    new Date("2026-08-31T13:00:00.000Z"),
    60,
    "America/New_York",
    "michelle@example.com",
  );
  assert.equal(event.summary, "SAT session with Xavier Morales");
  assert.equal(event.start.dateTime, "2026-08-31T13:00:00.000Z");
  assert.deepEqual(event.attendees, [{ email: "michelle@example.com" }]);
  assert.equal("privateEventDetails" in event, false);
});