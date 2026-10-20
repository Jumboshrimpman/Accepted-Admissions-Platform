import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { generateAvailableSlots, zonedDateTimeToUtc } from "./booking.ts";

const migrationUrl = new URL(
  "../../../../lib/db/drizzle/0074_close_nika_after_oct25.sql",
  import.meta.url,
);

const fixedThroughOct25 = {
  "2026-10-17": [],
  "2026-10-18": [],
  "2026-10-19": [{ start: "21:00", end: "22:00" }],
  "2026-10-20": [],
  "2026-10-21": [{ start: "18:05", end: "19:30" }],
  "2026-10-22": [
    { start: "16:00", end: "17:00" },
    { start: "18:00", end: "19:00" },
  ],
  "2026-10-23": [{ start: "16:00", end: "20:00" }],
  "2026-10-24": [{ start: "13:00", end: "20:00" }],
  "2026-10-25": [{ start: "13:00", end: "20:00" }],
};

function closedSuffix(sql: string): Record<string, { start: string; end: string }[]> {
  const marker = `|| '`;
  const start = sql.indexOf(marker);
  assert.ok(start > 0);
  const jsonStart = start + marker.length;
  const jsonEnd = sql.indexOf("'::jsonb", jsonStart);
  return JSON.parse(sql.slice(jsonStart, jsonEnd)) as Record<string, { start: string; end: string }[]>;
}

function applyClose(
  dateHours: Record<string, { start: string; end: string }[]>,
  suffix: Record<string, { start: string; end: string }[]>,
) {
  const kept = Object.fromEntries(
    Object.entries(dateHours).filter(([key]) => key < "2026-10-26"),
  );
  return { ...kept, ...suffix };
}

after(async () => {
  await pool.end();
});

test("closing Nika after Oct 25 keeps the fixed windows and offers no later slots", async () => {
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  assert.match(sql, /entry\.key < '2026-10-26'/);
  assert.match(sql, /tp\."name" = 'Nika Raiffe'/);
  assert.match(sql, /"2099-12-31": \[\]/);
  assert.doesNotMatch(sql, /SET "weekly_hours"/);
  assert.doesNotMatch(sql, /UPDATE "sessions"|UPDATE "booking_slot_holds"/);
  const suffix = closedSuffix(sql);
  assert.deepEqual(suffix["2026-10-26"], []);
  assert.deepEqual(suffix["2026-11-15"], []);
  assert.deepEqual(suffix["2099-12-31"], []);
  for (const key of Object.keys(fixedThroughOct25)) {
    assert.equal(Object.prototype.hasOwnProperty.call(suffix, key), false);
  }

  const openedBy0072 = {
    ...fixedThroughOct25,
    "2026-12-01": [{ start: "10:00", end: "12:00" }],
  };
  const dateHours = applyClose(openedBy0072, suffix);
  for (const [key, windows] of Object.entries(fixedThroughOct25)) {
    assert.deepEqual(dateHours[key], windows);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(dateHours, "2026-12-01"), false);

  const at = (day: string, time: string) =>
    zonedDateTimeToUtc(day, time, "America/New_York").toISOString();
  const hours = (day: string, fromHour: number, toHourInclusive: number) =>
    Array.from({ length: toHourInclusive - fromHour + 1 }, (_, index) =>
      at(day, `${String(fromHour + index).padStart(2, "0")}:00`),
    );
  const rule = {
    timezone: "America/New_York",
    weeklyHours: { "1": [{ start: "07:00", end: "21:00" }] },
    dateHours,
    bookingNoticeMinutes: 0,
    bufferMinutes: 0,
    blackoutDates: [],
  };
  const now = new Date("2026-10-01T15:00:00.000Z");
  const throughOct25 = generateAvailableSlots(
    rule,
    new Date("2026-10-17T04:00:00.000Z"),
    new Date("2026-10-26T04:00:00.000Z"),
    60,
    [{ start: at("2026-10-26", "07:00"), end: at("2026-10-26", "08:00") }],
    [],
    now,
  );
  assert.deepEqual(throughOct25, [
    at("2026-10-19", "21:00"),
    at("2026-10-21", "18:05"),
    at("2026-10-22", "16:00"),
    at("2026-10-22", "18:00"),
    ...hours("2026-10-23", 16, 19),
    ...hours("2026-10-24", 13, 19),
    ...hours("2026-10-25", 13, 19),
  ]);
  const afterOct25 = generateAvailableSlots(
    rule,
    new Date("2026-10-26T04:00:00.000Z"),
    new Date("2026-11-16T05:00:00.000Z"),
    60,
    [],
    [],
    now,
  );
  assert.deepEqual(afterOct25, []);
  const nextYear = generateAvailableSlots(
    rule,
    new Date("2027-03-01T05:00:00.000Z"),
    new Date("2027-03-08T05:00:00.000Z"),
    60,
    [],
    [],
    now,
  );
  assert.deepEqual(nextYear, []);
});

test("0074 writes Nika's closed span and leaves Oct 17–25 and other tutors", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  const client = await pool.connect();
  const suffix = `close-oct25-${Date.now()}`;
  try {
    await client.query("BEGIN");
    const nika = await client.query<{ id: string }>(
      `insert into tutor_profiles (email, name, title, active)
       values ($1, 'Nika Raiffe', 'Tutor', true)
       returning id`,
      [`${suffix}-nika@example.invalid`],
    );
    const other = await client.query<{ id: string }>(
      `insert into tutor_profiles (email, name, title, active)
       values ($1, 'Other Tutor', 'Tutor', true)
       returning id`,
      [`${suffix}-other@example.invalid`],
    );
    const nikaId = nika.rows[0]!.id;
    const otherId = other.rows[0]!.id;
    const opened = {
      ...fixedThroughOct25,
      "2026-12-01": [{ start: "10:00", end: "12:00" }],
    };
    await client.query(
      `insert into availability_rules (tutor_profile_id, timezone, weekly_hours, date_hours)
       values ($1, 'America/New_York', '{"1":[{"start":"07:00","end":"21:00"}]}'::jsonb, $2::jsonb),
              ($3, 'America/New_York', '{"1":[{"start":"07:00","end":"21:00"}]}'::jsonb, $2::jsonb)`,
      [nikaId, JSON.stringify(opened), otherId],
    );
    await client.query(sql);
    await client.query(sql);
    const closed = await client.query<{
      date_hours: Record<string, { start: string; end: string }[]>;
      weekly_hours: Record<string, unknown>;
    }>(
      `select date_hours, weekly_hours from availability_rules where tutor_profile_id = $1`,
      [nikaId],
    );
    const dateHours = closed.rows[0]?.date_hours ?? {};
    for (const [key, windows] of Object.entries(fixedThroughOct25)) {
      assert.deepEqual(dateHours[key], windows);
    }
    assert.deepEqual(dateHours["2026-10-26"], []);
    assert.deepEqual(dateHours["2026-11-15"], []);
    assert.deepEqual(dateHours["2099-12-31"], []);
    assert.equal(Object.prototype.hasOwnProperty.call(dateHours, "2026-12-01"), false);
    assert.deepEqual(closed.rows[0]?.weekly_hours, { "1": [{ start: "07:00", end: "21:00" }] });
    const afterOct25 = generateAvailableSlots(
      {
        timezone: "America/New_York",
        weeklyHours: { "1": [{ start: "07:00", end: "21:00" }] },
        dateHours,
        bookingNoticeMinutes: 0,
        bufferMinutes: 0,
        blackoutDates: [],
      },
      new Date("2026-10-26T04:00:00.000Z"),
      new Date("2026-10-27T04:00:00.000Z"),
      60,
      [],
      [],
      new Date("2026-10-01T15:00:00.000Z"),
    );
    assert.deepEqual(afterOct25, []);
    const untouched = await client.query<{ date_hours: Record<string, unknown> }>(
      `select date_hours from availability_rules where tutor_profile_id = $1`,
      [otherId],
    );
    assert.deepEqual(untouched.rows[0]?.date_hours, opened);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
