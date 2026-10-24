import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  generateAvailableSlots,
  parseDateHours,
  parseRecurringHours,
  selfSetHoursOpen,
  zonedDateTimeToUtc,
  type AvailabilityRule,
} from "./booking.ts";
import { selfServeRecurringError } from "./self-serve-availability.ts";

const migrationUrl = new URL("../../../../lib/db/drizzle/0078_nika_recurring_hours.sql", import.meta.url);
const journalUrl = new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url);

const closedSpan = {
  "2026-10-17": [] as { start: string; end: string }[],
  "2026-10-26": [{ start: "21:00", end: "22:00" }],
  "2026-11-09": [] as { start: string; end: string }[],
  "2099-12-31": [] as { start: string; end: string }[],
};

const mondayNights = {
  startDate: "2026-10-26",
  endDate: "2026-12-31",
  days: { "1": [{ start: "23:00", end: "24:00" }] },
};

function rule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    timezone: "America/New_York",
    weeklyHours: { "1": [{ start: "07:00", end: "21:00" }] },
    dateHours: closedSpan,
    recurringHours: mondayNights,
    bookingNoticeMinutes: 8 * 60,
    bufferMinutes: 15,
    blackoutDates: [],
    ...overrides,
  };
}

const now = new Date("2026-10-21T15:00:00.000Z");

function slotsOn(
  day: string,
  hours: AvailabilityRule,
  busy: { start: string; end: string }[] = [],
  booked: { start: string; end: string }[] = [],
) {
  const from = zonedDateTimeToUtc(day, "00:00", "America/New_York");
  return generateAvailableSlots(
    hours,
    from,
    new Date(from.getTime() + 24 * 60 * 60_000),
    60,
    busy,
    booked,
    now,
  );
}

test("a weekly Monday fills unset dates and loses to an explicit date", () => {
  const hours = rule();
  const late = zonedDateTimeToUtc("2026-11-02", "23:00", "America/New_York").toISOString();
  assert.deepEqual(slotsOn("2026-11-02", hours), [late]);
  assert.equal(selfSetHoursOpen(hours, new Date(late)), true);

  const explicit = zonedDateTimeToUtc("2026-10-26", "21:00", "America/New_York").toISOString();
  assert.deepEqual(slotsOn("2026-10-26", hours), [explicit]);
  assert.equal(slotsOn("2026-10-26", hours).includes(zonedDateTimeToUtc("2026-10-26", "23:00", "America/New_York").toISOString()), false);

  assert.deepEqual(slotsOn("2026-11-09", hours), []);
  assert.equal(selfSetHoursOpen(hours, zonedDateTimeToUtc("2026-11-09", "23:00", "America/New_York")), false);

  assert.deepEqual(slotsOn("2027-01-04", hours), []);
  assert.equal(selfSetHoursOpen(hours, zonedDateTimeToUtc("2027-01-04", "23:00", "America/New_York")), false);
});

test("an empty weekly schedule leaves the closed span closed", () => {
  const hours = rule({ recurringHours: { startDate: null, endDate: null, days: {} } });
  assert.deepEqual(slotsOn("2026-11-02", hours), []);
  assert.deepEqual(slotsOn("2026-10-26", hours), [
    zonedDateTimeToUtc("2026-10-26", "21:00", "America/New_York").toISOString(),
  ]);
  assert.equal(selfSetHoursOpen(hours, zonedDateTimeToUtc("2026-11-02", "23:00", "America/New_York")), false);
});

test("weekly hours ignore Google busy and still block a booking and the room", () => {
  const hours = rule({ bufferMinutes: 0 });
  const start = zonedDateTimeToUtc("2026-11-02", "23:00", "America/New_York").toISOString();
  const end = new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
  const busy = [{ start, end }];
  assert.deepEqual(slotsOn("2026-11-02", hours, busy, []), [start]);
  assert.deepEqual(slotsOn("2026-11-02", hours, [], busy), []);
  assert.deepEqual(
    generateAvailableSlots(
      hours,
      zonedDateTimeToUtc("2026-11-02", "00:00", "America/New_York"),
      new Date(zonedDateTimeToUtc("2026-11-02", "00:00", "America/New_York").getTime() + 24 * 60 * 60_000),
      60,
      [],
      [],
      now,
      busy,
    ),
    [],
  );
});

test("midnight is a valid end and overlapping windows are rejected", () => {
  const parsed = parseRecurringHours({
    startDate: "",
    endDate: null,
    days: { "1": [{ start: "23:00", end: "24:00" }] },
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.recurringHours.startDate, null);

  const overlap = parseDateHours({
    "2026-11-02": [
      { start: "21:00", end: "23:00" },
      { start: "22:00", end: "24:00" },
    ],
  });
  assert.equal(overlap.ok, false);
  if (!overlap.ok) assert.match(overlap.error, /overlap/);

  const touching = parseRecurringHours({
    days: {
      "1": [
        { start: "21:00", end: "22:00" },
        { start: "22:00", end: "24:00" },
      ],
    },
  });
  assert.equal(touching.ok, true);

  const badStart = parseRecurringHours({ days: { "1": [{ start: "24:00", end: "24:00" }] } });
  assert.equal(badStart.ok, false);

  assert.equal(
    selfServeRecurringError({
      startDate: null,
      endDate: null,
      days: { "1": [{ start: "21:07", end: "22:00" }] },
    }),
    "Weekly windows must start and end on a 15-minute mark.",
  );
  assert.equal(selfServeRecurringError(mondayNights), null);
});

test("the weekly column migration does not rewrite saved dates", async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.match(statements, /ADD COLUMN IF NOT EXISTS "recurring_hours"/);
  assert.doesNotMatch(statements, /UPDATE|date_hours|weekly_hours/i);
  const journal = JSON.parse(await readFile(fileURLToPath(journalUrl), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  const entry = journal.entries.find((item) => item.tag === "0078_nika_recurring_hours");
  const previous = journal.entries.find((item) => item.tag === "0077_ielts_routine_answer_spread");
  assert.ok(entry && previous);
  assert.equal(entry.idx, 78);
  assert.equal(entry.when, 1792820000000);
  assert.ok(entry.when > previous.when);
});
