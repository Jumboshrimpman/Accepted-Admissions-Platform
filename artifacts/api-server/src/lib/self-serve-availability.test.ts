import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAvailableSlots, zonedDateTimeToUtc } from "./booking.ts";
import {
  NIKA_TUTOR_PROFILE_ID,
  SELF_SERVE_AVAILABILITY_EDITOR_DAYS,
  SELF_SERVE_AVAILABILITY_MAX_DAYS,
  SELF_SERVE_AVAILABILITY_TUTOR_IDS,
  editorDatesFromToday,
  mergeDateHours,
  selfServeDateHoursError,
  shiftCivilDate,
  tutorMayEditOwnDateHours,
} from "./self-serve-availability.ts";

const platformUrl = new URL("../routes/platform.ts", import.meta.url);

test("only the Nika profile id may edit its own date windows", () => {
  assert.deepEqual(SELF_SERVE_AVAILABILITY_TUTOR_IDS, [NIKA_TUTOR_PROFILE_ID]);
  assert.equal(tutorMayEditOwnDateHours(NIKA_TUTOR_PROFILE_ID), true);
  assert.equal(tutorMayEditOwnDateHours("bbca73b6-331d-48f0-ac03-7b98ae438856"), false);
  assert.equal(tutorMayEditOwnDateHours(null), false);
  assert.equal(SELF_SERVE_AVAILABILITY_EDITOR_DAYS, 56);
  assert.equal(SELF_SERVE_AVAILABILITY_MAX_DAYS, 90);
});

test("a self-serve save replaces one date and leaves the rest", () => {
  const existing = {
    "2026-11-15": [] as { start: string; end: string }[],
    "2026-11-20": [{ start: "10:00", end: "11:00" }],
    "2099-12-31": [] as { start: string; end: string }[],
  };
  const merged = mergeDateHours(existing, {
    "2026-11-18": [{ start: "16:00", end: "18:00" }],
  });
  assert.deepEqual(merged["2026-11-18"], [{ start: "16:00", end: "18:00" }]);
  assert.deepEqual(merged["2026-11-20"], [{ start: "10:00", end: "11:00" }]);
  assert.deepEqual(merged["2026-11-15"], []);
  assert.deepEqual(merged["2099-12-31"], []);
  assert.equal(editorDatesFromToday("2026-10-22").length, 56);
  assert.equal(shiftCivilDate("2026-10-22", 90), "2027-01-20");
});

test("self-serve dates reject the past, dates past 90 days, and off-grid times", () => {
  const now = new Date("2026-10-21T20:00:00.000Z");
  const options = { timeZone: "America/New_York", now };
  assert.equal(
    selfServeDateHoursError({ "2026-10-22": [{ start: "16:00", end: "17:00" }] }, options),
    null,
  );
  assert.match(
    selfServeDateHoursError({ "2026-10-20": [{ start: "16:00", end: "17:00" }] }, options) ?? "",
    /past/,
  );
  assert.equal(selfServeDateHoursError({ "2027-01-19": [] }, options), null);
  assert.match(
    selfServeDateHoursError({ "2027-01-20": [] }, options) ?? "",
    /90 days/,
  );
  assert.match(
    selfServeDateHoursError({ "2026-10-22": [{ start: "16:05", end: "17:00" }] }, options) ?? "",
    /15-minute/,
  );
});

test("a fixed window ignores calendar busy time and still blocks the shared room", () => {
  const date = "2026-11-02";
  const rule = {
    timezone: "America/New_York",
    weeklyHours: {},
    dateHours: { [date]: [{ start: "16:00", end: "18:00" }] },
    bookingNoticeMinutes: 8 * 60,
    bufferMinutes: 15,
    blackoutDates: [],
  };
  const from = zonedDateTimeToUtc(date, "00:00", "America/New_York");
  const to = zonedDateTimeToUtc("2026-11-03", "00:00", "America/New_York");
  const now = new Date("2026-10-21T20:00:00.000Z");
  const first = zonedDateTimeToUtc(date, "16:00", "America/New_York").toISOString();
  const second = zonedDateTimeToUtc(date, "17:00", "America/New_York").toISOString();
  const calendarBusy = [
    {
      start: first,
      end: zonedDateTimeToUtc(date, "18:00", "America/New_York").toISOString(),
    },
  ];
  assert.deepEqual(
    generateAvailableSlots(rule, from, to, 60, calendarBusy, [], now, []),
    [first, second],
  );
  const room = [{ start: first, end: second }];
  assert.deepEqual(
    generateAvailableSlots(rule, from, to, 60, calendarBusy, [], now, room),
    [second],
  );
});

test("startup seed does not write date windows", async () => {
  const source = await readFile(fileURLToPath(platformUrl), "utf8");
  const start = source.indexOf("async function ensureUpgradeSeedData");
  const end = source.indexOf("async function loadActiveDatabaseAccessGrants");
  assert.ok(start > 0 && end > start);
  const seed = source.slice(start, end);
  assert.doesNotMatch(seed, /dateHours\s*:/);
  assert.doesNotMatch(seed, /date_hours/);
  assert.match(source, /mergeDateHours\(/);
  assert.match(source, /tutorMayEditOwnDateHours\(/);
  const allowlist = await readFile(fileURLToPath(new URL("./self-serve-availability.ts", import.meta.url)), "utf8");
  assert.match(allowlist, /SELF_SERVE_AVAILABILITY_TUTOR_IDS: readonly string\[\] = \[NIKA_TUTOR_PROFILE_ID\]/);
});
