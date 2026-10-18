import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const migrationUrl = new URL(
  "../../../../lib/db/drizzle/0072_open_nika_availability_oct26.sql",
  import.meta.url,
);

const fixedWeek = {
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
  "2026-10-26": [],
  "2026-11-15": [],
  "2099-12-31": [],
};

after(async () => {
  await pool.end();
});

test("0072 drops Nika's date hours from Oct 26 only when weekly hours are open", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  assert.match(sql, /entry\.key < '2026-10-26'/);
  assert.match(sql, /tp\."name" = 'Nika Raiffe'/);
  assert.doesNotMatch(sql, /SET "weekly_hours"/);
  const client = await pool.connect();
  const suffix = `oct26-${Date.now()}`;
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
    await client.query(
      `insert into availability_rules (tutor_profile_id, timezone, weekly_hours, date_hours)
       values ($1, 'America/New_York', '{}'::jsonb, $2::jsonb),
              ($3, 'America/New_York', '{"1":[{"start":"07:00","end":"21:00"}]}'::jsonb, $2::jsonb)`,
      [nikaId, JSON.stringify(fixedWeek), otherId],
    );
    await client.query(sql);
    const closed = await client.query<{ date_hours: Record<string, unknown> }>(
      `select date_hours from availability_rules where tutor_profile_id = $1`,
      [nikaId],
    );
    assert.deepEqual(closed.rows[0]?.date_hours, fixedWeek);
    await client.query(
      `update availability_rules
       set weekly_hours = '{"1":[{"start":"21:00","end":"09:00"}]}'::jsonb
       where tutor_profile_id = $1`,
      [nikaId],
    );
    await client.query(sql);
    const backwards = await client.query<{ date_hours: Record<string, unknown> }>(
      `select date_hours from availability_rules where tutor_profile_id = $1`,
      [nikaId],
    );
    assert.deepEqual(backwards.rows[0]?.date_hours, fixedWeek);
    await client.query(
      `update availability_rules
       set weekly_hours = '{"1":[{"start":"07:00","end":"21:00"}]}'::jsonb
       where tutor_profile_id = $1`,
      [nikaId],
    );
    await client.query(sql);
    const opened = await client.query<{ date_hours: Record<string, unknown>; weekly_hours: Record<string, unknown> }>(
      `select date_hours, weekly_hours from availability_rules where tutor_profile_id = $1`,
      [nikaId],
    );
    const dateHours = opened.rows[0]?.date_hours ?? {};
    assert.deepEqual(dateHours["2026-10-19"], [{ start: "21:00", end: "22:00" }]);
    assert.deepEqual(dateHours["2026-10-17"], []);
    assert.deepEqual(dateHours["2026-10-25"], [{ start: "13:00", end: "20:00" }]);
    assert.equal(Object.prototype.hasOwnProperty.call(dateHours, "2026-10-26"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dateHours, "2026-11-15"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dateHours, "2099-12-31"), false);
    assert.deepEqual(opened.rows[0]?.weekly_hours, { "1": [{ start: "07:00", end: "21:00" }] });
    const untouched = await client.query<{ date_hours: Record<string, unknown> }>(
      `select date_hours from availability_rules where tutor_profile_id = $1`,
      [otherId],
    );
    assert.deepEqual(untouched.rows[0]?.date_hours, fixedWeek);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
