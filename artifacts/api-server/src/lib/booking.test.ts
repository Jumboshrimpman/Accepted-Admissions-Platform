import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { pool } from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { paidBookingReconnectRefusalMessage } from "./booking-service.ts";

after(async () => {
  await pool.end();
});
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  bookingCalendarEventPayload,
  bookingNoticeMinutesForTutor,
  calendarEventPayload,
  calendarInviteIncludesTutor,
  missingCalendarInviteMessage,
  MISSING_CALENDAR_INVITE_TITLE,
  DEFAULT_BOOKING_NOTICE_MINUTES,
  fixedDateHoursOpen,
  generateAvailableSlots,
  isBookablePortalDuration,
  NIKA_BOOKING_NOTICE_MINUTES,
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

test("Nika needs 8 hours of notice and every other tutor needs 4", () => {
  assert.equal(NIKA_BOOKING_NOTICE_MINUTES, 8 * 60);
  assert.equal(DEFAULT_BOOKING_NOTICE_MINUTES, 4 * 60);
  assert.equal(bookingNoticeMinutesForTutor("Nika Raiffe"), 480);
  for (const name of ["Eunice Chon", "Victoria", "Xavier Morales", "New Tutor"]) {
    assert.equal(bookingNoticeMinutesForTutor(name), 240);
  }

  const now = new Date("2026-10-19T12:00:00.000Z");
  const mondayHours = {
    timezone: "America/New_York",
    weeklyHours: { "1": [{ start: "07:00", end: "21:00" }] },
    bufferMinutes: 0,
    blackoutDates: [],
  };
  const offered = (bookingNoticeMinutes: number) =>
    generateAvailableSlots(
      { ...mondayHours, bookingNoticeMinutes },
      now,
      new Date(now.getTime() + 24 * 60 * 60 * 1000),
      60,
      [],
      [],
      now,
    );

  const nika = offered(480);
  assert.equal(nika[0], "2026-10-19T20:00:00.000Z");
  assert.equal(nika.includes("2026-10-19T19:00:00.000Z"), false);
  assert.ok(nika.every((slot) => slot >= "2026-10-19T20:00:00.000Z"));

  const others = offered(240);
  assert.equal(others[0], "2026-10-19T16:00:00.000Z");
  assert.equal(others.includes("2026-10-19T15:00:00.000Z"), false);
  assert.ok(others.every((slot) => slot >= "2026-10-19T16:00:00.000Z"));
});

test("Nika's fixed week offers only those windows and ignores Google busy", async () => {
  const at = (day: string, time: string) =>
    zonedDateTimeToUtc(day, time, "America/New_York").toISOString();
  const hours = (day: string, fromHour: number, toHourInclusive: number, minute = 0) =>
    Array.from({ length: toHourInclusive - fromHour + 1 }, (_, index) =>
      at(day, `${String(fromHour + index).padStart(2, "0")}:${String(minute).padStart(2, "0")}`),
    );
  const migration = await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0062_availability_date_hours.sql", import.meta.url)),
    "utf8",
  );
  const marker = `SET "date_hours" = '`;
  const jsonStart = migration.indexOf(marker) + marker.length;
  const dateHours = JSON.parse(migration.slice(jsonStart, migration.indexOf("'::jsonb", jsonStart))) as Record<
    string,
    { start: string; end: string }[]
  >;
  assert.equal(fixedDateHoursOpen(dateHours, "America/New_York", new Date(at("2026-10-21", "18:05"))), true);
  assert.equal(fixedDateHoursOpen(dateHours, "America/New_York", new Date(at("2026-10-20", "16:00"))), false);
  assert.equal(fixedDateHoursOpen(dateHours, "America/New_York", new Date(at("2026-11-16", "07:00"))), false);
  assert.deepEqual(dateHours["2026-10-17"], []);
  assert.deepEqual(dateHours["2026-10-18"], []);
  assert.deepEqual(dateHours["2026-10-26"], []);
  assert.deepEqual(dateHours["2026-11-15"], []);
  assert.deepEqual(dateHours["2099-12-31"], []);

  const rule = {
    timezone: "America/New_York",
    weeklyHours: XAVIER_BOOKING_WEEKLY_HOURS,
    dateHours,
    bookingNoticeMinutes: 480,
    bufferMinutes: 15,
    blackoutDates: [],
  };
  const now = new Date("2026-10-17T15:00:00.000Z");
  const from = new Date("2026-10-19T04:00:00.000Z");
  const weekEnd = new Date("2026-10-26T04:00:00.000Z");
  const googleBusy = [{ start: at("2026-10-21", "18:00"), end: at("2026-10-21", "19:30") }];
  const offered = (duration: number, booked: { start: string; end: string }[] = []) =>
    generateAvailableSlots(rule, from, weekEnd, duration, googleBusy, booked, now);

  assert.deepEqual(offered(60), [
    at("2026-10-19", "21:00"),
    at("2026-10-21", "18:05"),
    at("2026-10-22", "16:00"),
    at("2026-10-22", "18:00"),
    ...hours("2026-10-23", 16, 19),
    ...hours("2026-10-24", 13, 19),
    ...hours("2026-10-25", 13, 19),
  ]);
  assert.deepEqual(offered(90), [
    at("2026-10-23", "16:00"),
    at("2026-10-23", "17:30"),
    at("2026-10-24", "13:00"),
    at("2026-10-24", "14:30"),
    at("2026-10-24", "16:00"),
    at("2026-10-24", "17:30"),
    at("2026-10-25", "13:00"),
    at("2026-10-25", "14:30"),
    at("2026-10-25", "16:00"),
    at("2026-10-25", "17:30"),
  ]);
  assert.deepEqual(offered(120), [
    at("2026-10-23", "16:00"),
    at("2026-10-23", "18:00"),
    at("2026-10-24", "13:00"),
    at("2026-10-24", "15:00"),
    at("2026-10-24", "17:00"),
    at("2026-10-25", "13:00"),
    at("2026-10-25", "15:00"),
    at("2026-10-25", "17:00"),
  ]);
  const held = offered(60, [{ start: at("2026-10-21", "18:05"), end: at("2026-10-21", "19:05") }]);
  assert.equal(held.includes(at("2026-10-21", "18:05")), false);

  const hidden = generateAvailableSlots(
    rule,
    new Date("2026-10-26T04:00:00.000Z"),
    new Date("2026-11-16T05:00:00.000Z"),
    60,
    [],
    [],
    now,
  );
  assert.deepEqual(hidden, []);

  const closedBefore = generateAvailableSlots(
    rule,
    new Date("2026-10-17T04:00:00.000Z"),
    new Date("2026-10-19T04:00:00.000Z"),
    60,
    [],
    [],
    new Date("2026-10-01T15:00:00.000Z"),
  );
  assert.deepEqual(closedBefore, []);
  const stayedClosed = generateAvailableSlots(
    rule,
    new Date("2026-11-16T05:00:00.000Z"),
    new Date("2026-11-18T05:00:00.000Z"),
    60,
    [],
    [],
    now,
  );
  assert.deepEqual(stayedClosed, []);
  const stillClosedNextYear = generateAvailableSlots(
    rule,
    new Date("2027-03-01T05:00:00.000Z"),
    new Date("2027-03-03T05:00:00.000Z"),
    60,
    [],
    [],
    now,
  );
  assert.deepEqual(stillClosedNextYear, []);

  const insideNotice = new Date("2026-10-19T17:01:00.000Z");
  const tooSoon = generateAvailableSlots(rule, from, weekEnd, 60, [], [], insideNotice);
  assert.equal(tooSoon.includes(at("2026-10-19", "21:00")), false);
});

test("one closed date does not turn the rest of the week off", () => {
  const closedChristmas = generateAvailableSlots(
    {
      timezone: "America/New_York",
      weeklyHours: XAVIER_BOOKING_WEEKLY_HOURS,
      dateHours: { "2026-12-25": [] },
      bookingNoticeMinutes: 0,
      bufferMinutes: 0,
      blackoutDates: [],
    },
    new Date("2026-12-25T05:00:00.000Z"),
    new Date("2026-12-27T05:00:00.000Z"),
    60,
    [],
    [],
    new Date("2026-12-01T00:00:00.000Z"),
  );
  assert.equal(
    closedChristmas.includes(zonedDateTimeToUtc("2026-12-25", "10:00", "America/New_York").toISOString()),
    false,
  );
  assert.equal(
    closedChristmas.includes(zonedDateTimeToUtc("2026-12-26", "10:00", "America/New_York").toISOString()),
    true,
  );
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
  assert.deepEqual(event.attendees, [
    { email: "michelle@example.com" },
    { email: "admin@acceptedadmissions.org" },
  ]);
  assert.equal("privateEventDetails" in event, false);
});

test("portal bookings accept 60, 90, and 120 minutes and block the full length", () => {
  assert.equal(isBookablePortalDuration(60), true);
  assert.equal(isBookablePortalDuration(90), true);
  assert.equal(isBookablePortalDuration(120), true);
  assert.equal(isBookablePortalDuration(30), false);
  assert.equal(isBookablePortalDuration(180), false);
  const start = new Date("2026-11-02T15:00:00.000Z");
  const event = bookingCalendarEventPayload({
    title: "Taito’s SAT Session with Xavier",
    start,
    durationMinutes: 90,
    timeZone: "America/New_York",
    attendeeEmail: "student@example.com",
    student: { email: "student@example.com", name: "Taito Goto" },
    tutor: { email: "tutor@example.com", name: "Xavier Morales" },
  });
  assert.equal(event.end.dateTime, new Date(start.getTime() + 90 * 60_000).toISOString());
  assert.deepEqual(
    event.attendees.map((attendee) => attendee.email),
    ["student@example.com", "admin@acceptedadmissions.org"],
  );
});

test("College Consulting invites the student, Nika, and admin on her calendar", () => {
  const event = bookingCalendarEventPayload({
    title: "Neel’s College Consulting Session with Nika",
    start: new Date("2026-10-20T01:00:00.000Z"),
    durationMinutes: 60,
    timeZone: "America/New_York",
    attendeeEmail: "ndharni300@gmail.com",
    location: "https://meet.google.com/rih-iayt-okb",
    student: { email: "ndharni300@gmail.com" },
    tutor: { email: "nika.raiffe@gmail.com" },
    inviteTutor: true,
  });
  assert.equal(event.location, "https://meet.google.com/rih-iayt-okb");
  assert.equal(event.description, "Accepted Admissions tutoring session");
  const pinned = bookingCalendarEventPayload({
    title: "Neel’s College Consulting Session with Nika",
    start: new Date("2026-10-20T01:00:00.000Z"),
    durationMinutes: 60,
    timeZone: "America/New_York",
    attendeeEmail: "ndharni300@gmail.com",
    location: "https://meet.google.com/rih-iayt-okb",
    description: "https://meet.google.com/rih-iayt-okb",
    student: { email: "ndharni300@gmail.com" },
    tutor: { email: "nika.raiffe@gmail.com" },
    inviteTutor: true,
  });
  assert.equal(pinned.description, "https://meet.google.com/rih-iayt-okb");
  assert.equal(pinned.location, "https://meet.google.com/rih-iayt-okb");
  assert.deepEqual(
    event.attendees.map((attendee) => attendee.email),
    ["ndharni300@gmail.com", "nika.raiffe@gmail.com", "admin@acceptedadmissions.org"],
  );
  assert.equal(
    calendarInviteIncludesTutor("College Consulting", { tutorEmail: "nika.raiffe@gmail.com" }),
    true,
  );
  assert.equal(
    calendarInviteIncludesTutor("College Consulting", { tutorEmail: "samakubba@icloud.com" }),
    false,
  );
  assert.equal(
    calendarInviteIncludesTutor("College Consulting", { tutorEmail: "xaver.rmz6@gmail.com" }),
    false,
  );
  assert.equal(calendarInviteIncludesTutor("College Consulting"), false);
  assert.equal(calendarInviteIncludesTutor("SAT", { tutorEmail: "nika.raiffe@gmail.com" }), false);
  for (const email of ["samakubba@icloud.com", "xaver.rmz6@gmail.com"]) {
    const quiet = bookingCalendarEventPayload({
      title: "Consulting session",
      start: new Date("2026-12-02T15:00:00.000Z"),
      durationMinutes: 60,
      timeZone: "America/New_York",
      attendeeEmail: "neel@example.invalid",
      student: { email: "neel@example.invalid" },
      tutor: { email },
      inviteTutor: calendarInviteIncludesTutor("College Consulting", { tutorEmail: email }),
    });
    assert.equal(
      quiet.attendees.some((attendee) => attendee.email === email),
      false,
    );
    assert.deepEqual(
      quiet.attendees.map((attendee) => attendee.email),
      ["neel@example.invalid", "admin@acceptedadmissions.org"],
    );
  }
  assert.equal(
    missingCalendarInviteMessage({
      studentName: "Neel Dharni",
      sessionTitle: event.summary,
      startIso: "2026-10-20T01:00:00.000Z",
      meetingUrl: "https://meet.google.com/rih-iayt-okb",
    }),
    "Neel Dharni booked Neel’s College Consulting Session with Nika at 2026-10-20T01:00:00.000Z. The session is confirmed. Meet: https://meet.google.com/rih-iayt-okb. Google Calendar was not updated, so no invite went to the student, the tutor, or admin@acceptedadmissions.org.",
  );
  assert.equal(MISSING_CALENDAR_INVITE_TITLE, "No Google Calendar invite was sent");
});

test("a connected fixed-window booking writes her calendar and a disconnected one alerts admins", async () => {
  const platformSource = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const start = platformSource.indexOf("async function respondWithPrepaidBooking");
  const end = platformSource.indexOf('router.post("/booking/slot-holds/release"');
  const slice = platformSource.slice(start, end);
  assert.match(slice, /createGoogleEvent\(\s*token,\s*adminWriter\.appCalendarId/);
  assert.doesNotMatch(slice, /adminCalendarMeetConference\(/);
  assert.match(slice, /createGoogleEventWithMeetFallback\(\s*token,\s*adminWriter\.appCalendarId/);
  assert.match(slice, /manualCalendarInviteMessage\(\{[\s\S]*?meetUrl: SHARED_FALL_MEETING_URL/);
  assert.match(slice, /neelNikaCalendarEvent\(\{[\s\S]*?clientUserId: req\.appUser!\.id/);
  assert.match(slice, /createGoogleEvent\(\s*token,\s*appCalendarId/);
  const reconnectBeforeDebit = slice.indexOf(
    "adminCalendarForFixedWindowBooking(access, fixedWindow, tutor)",
  );
  const debit = slice.indexOf("insertConfirmedBookingWithDebit");
  const write = slice.indexOf("createGoogleEvent(");
  assert.ok(reconnectBeforeDebit > 0 && reconnectBeforeDebit < debit && debit < write);
  assert.match(slice, /error\.code === "CALENDAR_RECONNECT_REQUIRED"/);
  assert.match(slice, /if \(!appCalendarId\) \{\s*throw new BookingError\(\s*409,\s*"CALENDAR_RECONNECT_REQUIRED"/);
  assert.match(
    slice,
    /if \(error instanceof BookingServiceError\) \{\s*return new BookingError\(error\.status, error\.code, error\.message\);\s*\}/,
  );
  const checkoutStart = platformSource.indexOf("async function assertDirectCheckoutSlotOpen");
  const checkoutSlice = platformSource.slice(
    checkoutStart,
    platformSource.indexOf("type SessionWriteTx"),
  );
  assert.match(checkoutSlice, /adminCalendarForFixedWindowBooking\(access, fixedWindow, tutor\)/);
  const payStart = platformSource.indexOf('"/payments/checkout"');
  const paySlice = platformSource.slice(payStart, platformSource.indexOf("createCheckoutSession", payStart));
  assert.ok(paySlice.indexOf("assertDirectCheckoutSlotOpen") > 0);
  assert.ok(paySlice.indexOf("assertDirectCheckoutSlotOpen") < paySlice.length);
  assert.match(slice, /calendarInviteIncludesTutor\(/);
  assert.match(slice, /tutorEmail: tutor\.email/);
  assert.match(slice, /await confirmBookedSession\(confirmed, true\)/);
  assert.match(slice, /MISSING_CALENDAR_INVITE_TITLE/);
  assert.match(slice, /calendarPlan\.mode === "manual"/);
  assert.match(slice, /kind: "manual_calendar_invite"/);
  assert.match(slice, /calendarPlan\.mode === "manual"[\s\S]{0,900}confirmBookedSession\(created, true\)/);
  assert.match(slice, /await confirmBookedSession\(created, false\)/);
  const nikaGates = platformSource.match(
    /isNikaTutorProfile\(\{\s*name: tutor\.name,\s*portalEmail: tutor\.email,?\s*\}\)/g,
  );
  assert.equal(nikaGates?.length, 2);
  const liveCheck = slice.indexOf("if (!fixedWindow) {");
  assert.ok(liveCheck > 0 && liveCheck < write);
  assert.match(slice.slice(liveCheck, write), /listGoogleBusyWindows/);
  const unpaidStart = platformSource.indexOf('router.post("/booking/sessions"');
  const unpaidSlice = platformSource.slice(unpaidStart, start);
  assert.doesNotMatch(unpaidSlice, /notifyPaid/);
  const paidStart = platformSource.indexOf('router.post("/booking/sessions/from-payment"');
  const paidSlice = platformSource.slice(
    paidStart,
    platformSource.indexOf("setHeldCheckoutBooker(", paidStart),
  );
  const webhookAt = paidSlice.indexOf("async function bookActiveHoldForPayment");
  const returnSlice = paidSlice.slice(0, webhookAt);
  const webhookSlice = paidSlice.slice(webhookAt);
  assert.match(
    platformSource,
    /const PAID_BOOKING_REFUSAL_CODES = new Set\(\[\s*"SCHEDULE_CONFLICT",\s*"SLOT_UNAVAILABLE",\s*"BOOKING_UNAVAILABLE",\s*"CALENDAR_RECONNECT_REQUIRED",\s*\]\)/,
  );
  assert.match(returnSlice, /PAID_BOOKING_REFUSAL_CODES\.has\(refusal\.code\)/);
  assert.match(returnSlice, /await notifyPaidReconnectRefusal\(/);
  assert.match(webhookSlice, /PAID_BOOKING_REFUSAL_CODES\.has\(refusal\.code\)/);
  assert.match(webhookSlice, /await notifyPaidReconnectRefusal\(/);
  assert.match(returnSlice, /try \{\s*await notifyPaidReconnectRefusal\(/);
  assert.doesNotMatch(webhookSlice, /try \{\s*await notifyPaidReconnectRefusal\(/);
  assert.doesNotMatch(paidSlice, /sendEmail|mailto:|resend|nodemailer/);
});

test("a paid reconnect refusal notice stays in the app and fires once", async () => {
  const source = await readFile(
    fileURLToPath(new URL("./booking-service.ts", import.meta.url)),
    "utf8",
  );
  const start = source.indexOf("export const PAID_BOOKING_RECONNECT_REFUSAL_KIND");
  const slice = source.slice(start, source.indexOf("export function requireStudentBooker"));
  assert.match(slice, /calendar_reconnect_booking_refused/);
  assert.match(slice, /Paid booking kept the credit/);
  assert.match(slice, /Hours stay on the account; rebook manually/);
  assert.match(slice, /formatSessionInstantEt\(new Date\(args\.slotStartIso\)\)/);
  assert.match(slice, /calendarReconnectRefusalNotified/);
  assert.match(slice, /for update/);
  assert.match(slice, /if \(administrators\.length === 0\) return/);
  assert.doesNotMatch(slice, /sendEmail|mailto:|resend|nodemailer/);
  assert.equal(
    paidBookingReconnectRefusalMessage({
      clientName: "Neel Dharni",
      slotStartIso: "2026-10-21T22:05:00.000Z",
    }),
    "Paid booking refused: Neel Dharni Oct 21, 2026, 6:05 PM ET. Hours stay on the account; rebook manually.",
  );
});