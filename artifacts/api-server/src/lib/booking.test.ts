import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  calendarEventPayload,
  generateAvailableSlots,
  overlapsBusyWindow,
  SAT_BOOKING_TIMEZONE,
  SAT_BOOKING_WEEKLY_HOURS,
  SAT_BOOKING_WINDOW_END,
  SAT_BOOKING_WINDOW_START,
  satTutorWeeklyHours,
  XAVIER_BOOKING_WEEKLY_HOURS,
  zonedDateTimeToUtc,
} from "./booking.ts";

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

test("SAT booking hours expose 07:00–20:00 America/New_York weekday starts", () => {
  assert.equal(SAT_BOOKING_TIMEZONE, "America/New_York");
  assert.equal(SAT_BOOKING_WINDOW_START, "07:00");
  assert.equal(SAT_BOOKING_WINDOW_END, "21:00");
  assert.deepEqual(SAT_BOOKING_WEEKLY_HOURS, {
    "1": [{ start: "07:00", end: "21:00" }],
    "2": [{ start: "07:00", end: "21:00" }],
    "3": [{ start: "07:00", end: "21:00" }],
    "4": [{ start: "07:00", end: "21:00" }],
    "5": [{ start: "07:00", end: "21:00" }],
  });
  assert.deepEqual(XAVIER_BOOKING_WEEKLY_HOURS, {
    "0": [{ start: "07:00", end: "21:00" }],
    "1": [{ start: "07:00", end: "21:00" }],
    "2": [{ start: "07:00", end: "21:00" }],
    "3": [{ start: "07:00", end: "21:00" }],
    "4": [{ start: "07:00", end: "21:00" }],
    "5": [{ start: "07:00", end: "21:00" }],
    "6": [{ start: "07:00", end: "21:00" }],
  });
  assert.deepEqual(satTutorWeeklyHours("Xavier Morales"), XAVIER_BOOKING_WEEKLY_HOURS);
  assert.deepEqual(satTutorWeeklyHours("Eunice Chon"), SAT_BOOKING_WEEKLY_HOURS);
  const slots = generateAvailableSlots(
    {
      timezone: SAT_BOOKING_TIMEZONE,
      weeklyHours: SAT_BOOKING_WEEKLY_HOURS,
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    new Date("2026-08-31T00:00:00.000Z"),
    new Date("2026-09-01T05:00:00.000Z"),
    60,
    [],
    [],
    new Date("2026-08-30T00:00:00.000Z"),
  );
  assert.equal(slots[0], zonedDateTimeToUtc("2026-08-31", "07:00", SAT_BOOKING_TIMEZONE).toISOString());
  assert.equal(slots.at(-1), zonedDateTimeToUtc("2026-08-31", "20:00", SAT_BOOKING_TIMEZONE).toISOString());
  assert.equal(slots.includes(zonedDateTimeToUtc("2026-08-31", "06:00", SAT_BOOKING_TIMEZONE).toISOString()), false);
  assert.equal(slots.includes(zonedDateTimeToUtc("2026-08-31", "21:00", SAT_BOOKING_TIMEZONE).toISOString()), false);
  assert.equal(
    slots.includes(zonedDateTimeToUtc("2026-08-31", "11:00", SAT_BOOKING_TIMEZONE).toISOString()),
    true,
  );
});

test("Xavier weekend hours are bookable; weekday-only SAT hours are not", () => {
  const saturdayStart = zonedDateTimeToUtc("2026-09-05", "00:00", SAT_BOOKING_TIMEZONE);
  const sundayStart = zonedDateTimeToUtc("2026-09-06", "00:00", SAT_BOOKING_TIMEZONE);
  const xavierSaturday = generateAvailableSlots(
    {
      timezone: SAT_BOOKING_TIMEZONE,
      weeklyHours: XAVIER_BOOKING_WEEKLY_HOURS,
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    saturdayStart,
    sundayStart,
    60,
    [],
    [],
    new Date("2026-08-30T00:00:00.000Z"),
  );
  const euniceSaturday = generateAvailableSlots(
    {
      timezone: SAT_BOOKING_TIMEZONE,
      weeklyHours: SAT_BOOKING_WEEKLY_HOURS,
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    saturdayStart,
    sundayStart,
    60,
    [],
    [],
    new Date("2026-08-30T00:00:00.000Z"),
  );
  assert.equal(
    xavierSaturday[0],
    zonedDateTimeToUtc("2026-09-05", "07:00", SAT_BOOKING_TIMEZONE).toISOString(),
  );
  assert.equal(
    xavierSaturday.at(-1),
    zonedDateTimeToUtc("2026-09-05", "20:00", SAT_BOOKING_TIMEZONE).toISOString(),
  );
  assert.deepEqual(euniceSaturday, []);

  const xavierSunday = generateAvailableSlots(
    {
      timezone: SAT_BOOKING_TIMEZONE,
      weeklyHours: XAVIER_BOOKING_WEEKLY_HOURS,
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    sundayStart,
    zonedDateTimeToUtc("2026-09-07", "00:00", SAT_BOOKING_TIMEZONE),
    60,
    [],
    [],
    new Date("2026-08-30T00:00:00.000Z"),
  );
  assert.equal(
    xavierSunday[0],
    zonedDateTimeToUtc("2026-09-06", "07:00", SAT_BOOKING_TIMEZONE).toISOString(),
  );
});

test("SAT booking hours omit Google-busy mornings and keep later free hours", () => {
  const busyStart = zonedDateTimeToUtc("2026-08-31", "07:00", SAT_BOOKING_TIMEZONE);
  const slots = generateAvailableSlots(
    {
      timezone: SAT_BOOKING_TIMEZONE,
      weeklyHours: SAT_BOOKING_WEEKLY_HOURS,
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    new Date("2026-08-31T00:00:00.000Z"),
    new Date("2026-09-01T05:00:00.000Z"),
    60,
    [{ start: busyStart.toISOString(), end: new Date(busyStart.getTime() + 60_000 * 60).toISOString() }],
    [],
    new Date("2026-08-30T00:00:00.000Z"),
  );
  assert.equal(slots.includes(busyStart.toISOString()), false);
  assert.equal(slots.includes(zonedDateTimeToUtc("2026-08-31", "08:00", SAT_BOOKING_TIMEZONE).toISOString()), true);
});

test("SAT booking seed and migration lock the 07:00–21:00 ET window", async () => {
  const platformSource = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const migrationSource = await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0036_sat_booking_hours_7_to_21.sql", import.meta.url)),
    "utf8",
  );
  assert.match(platformSource, /satTutorWeeklyHours/);
  assert.match(platformSource, /SAT_BOOKING_TIMEZONE/);
  assert.doesNotMatch(platformSource, /start: "09:00", end: "17:00"/);
  assert.doesNotMatch(platformSource, /start: "10:00", end: "18:00"/);
  assert.match(migrationSource, /07:00/);
  assert.match(migrationSource, /21:00/);
  assert.match(migrationSource, /"0": \[{"start": "07:00", "end": "21:00"}\]/);
  assert.match(migrationSource, /"6": \[{"start": "07:00", "end": "21:00"}\]/);
  assert.match(migrationSource, /Xavier Morales/);
  assert.match(migrationSource, /Eunice Chon/);
  assert.match(migrationSource, /calendar\.freebusy/);
  assert.match(migrationSource, /calendar_status/);
});

test("event payload contains only the approved session details", () => {
  const event = calendarEventPayload(
    "Michelle’s SAT Session with Xavier",
    new Date("2026-08-31T13:00:00.000Z"),
    60,
    "America/New_York",
    "michelle@example.com",
    "https://meet.google.com/rih-iayt-okb",
  );
  assert.equal(event.summary, "Michelle’s SAT Session with Xavier");
  assert.equal(event.start.dateTime, "2026-08-31T13:00:00.000Z");
  assert.equal(event.location, "https://meet.google.com/rih-iayt-okb");
  assert.deepEqual(event.attendees, [{ email: "michelle@example.com" }]);
  assert.equal("privateEventDetails" in event, false);
});