import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
const migrationSql = await readFile(
  fileURLToPath(
    new URL("../../../../lib/db/drizzle/0075_restore_xavier_public_profile.sql", import.meta.url),
  ),
  "utf8",
);
const journal = JSON.parse(
  await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url)),
    "utf8",
  ),
) as { entries: Array<{ idx: number; when: number; tag: string }> };

after(async () => {
  await pool.end();
});

test("Xavier profile repair is journaled after 0074 and does not write sessions or users", () => {
  const entry = journal.entries.find((item) => item.tag === "0075_restore_xavier_public_profile");
  assert.ok(entry);
  assert.equal(entry.idx, 75);
  assert.equal(entry.when, 1792790000000);
  assert.ok(entry.when > 1792780000000);
  const executable = migrationSql.replace(/^--.*$/gm, "");
  assert.match(executable, /\/media\/team\/xavier-morales\.jpg/);
  assert.match(executable, /xavier\.rmz6@gmail\.com/);
  assert.doesNotMatch(executable, /UPDATE\s+"sessions"/i);
  assert.doesNotMatch(executable, /UPDATE\s+"users"/i);
  assert.doesNotMatch(executable, /UPDATE\s+"courses"/i);
  assert.doesNotMatch(executable, /provider_event/i);
  assert.doesNotMatch(executable, /meeting_records/i);
  assert.doesNotMatch(executable, /RAISE NOTICE 'xavier_profile_repair[^']*@/i);
});

test("repair keeps the original Xavier profile and leaves Michelle's Oct 25 session unchanged", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const client = await pool.connect();
  const schema = `xavier_profile_restore_${randomUUID().replaceAll("-", "")}`;
  const userId = "10000000-0000-4000-8000-000000000001";
  const originalId = "20000000-0000-4000-8000-000000000001";
  const blankId = "05575f9d-a83c-45f5-ad37-e9c10adc58b6";
  const otherId = "20000000-0000-4000-8000-000000000003";
  const courseId = "30000000-0000-4000-8000-000000000001";
  const sessionId = "40000000-0000-4000-8000-000000000025";
  const paymentId = "50000000-0000-4000-8000-000000000001";
  const biography =
    "Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy.";
  const linkedin = "https://www.linkedin.com/in/xavier-morales-8830821a5/";
  const alt = "Xavier Morales, SAT and Math Tutor";
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        clerk_user_id text NOT NULL UNIQUE,
        email text NOT NULL UNIQUE,
        display_name text NOT NULL,
        role text NOT NULL
      );
      CREATE TABLE courses (
        id uuid PRIMARY KEY,
        meet_url text
      );
      CREATE TABLE tutor_profiles (
        id uuid PRIMARY KEY,
        user_id uuid,
        email text NOT NULL UNIQUE,
        name text NOT NULL,
        title text NOT NULL DEFAULT 'Tutor',
        photo_url text,
        photo_alt_text text,
        biography text,
        linkedin_url text,
        active boolean NOT NULL DEFAULT true,
        booking_eligible boolean NOT NULL DEFAULT false,
        public_approved boolean NOT NULL DEFAULT false,
        calendar_status text NOT NULL DEFAULT 'disconnected',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE availability_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        weekly_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
        date_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE calendar_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        provider text NOT NULL DEFAULT 'google',
        status text NOT NULL DEFAULT 'disconnected',
        encrypted_refresh_token text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tutor_profile_id, provider)
      );
      CREATE TABLE tutor_compensation_rates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        hourly_rate_cents integer NOT NULL
      );
      CREATE TABLE payments (
        id uuid PRIMARY KEY,
        tutor_profile_id uuid,
        amount_cents integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE booking_slot_holds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        payment_id uuid NOT NULL,
        start_time timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE tutor_payout_obligations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        amount_owed_cents integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE stripe_transfers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        amount_cents integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE sessions (
        id uuid PRIMARY KEY,
        course_id uuid NOT NULL,
        tutor_user_id uuid,
        date_time timestamptz NOT NULL,
        title text NOT NULL,
        provider_event_id text,
        provider_event_url text,
        provider_calendar_id text,
        updated_at timestamptz NOT NULL
      );
    `);
    await client.query(
      `INSERT INTO users (id, clerk_user_id, email, display_name, role)
       VALUES ($1, 'user_3IxUfoT1xRnDsqhlx5NN1eGfRg6', 'xaver.rmz6@gmail.com', 'Xavier Morales', 'tutor')`,
      [userId],
    );
    await client.query(
      `INSERT INTO courses (id, meet_url) VALUES ($1, 'https://meet.google.com/shared-accepted')`,
      [courseId],
    );
    await client.query(
      `INSERT INTO tutor_profiles (
         id, user_id, email, name, title, photo_url, photo_alt_text, biography, linkedin_url,
         active, booking_eligible, public_approved, calendar_status, created_at
       ) VALUES
       ($1, NULL, 'retired+xavier-duplicate-20000000@retired.accepted.local', 'Xavier Morales', 'SAT & Math Tutor',
        '/media/team/xavier-morales.jpg', $4, $5, $6, false, false, false, 'disconnected', '2024-01-01T00:00:00Z'),
       ($2, $3, 'xavier.rmz6@gmail.com', 'Xavier Morales', 'SAT & Math Tutor',
        NULL, NULL, NULL, NULL, true, true, true, 'connected', '2026-10-19T03:13:00Z'),
       ($7, NULL, 'other-tutor@example.invalid', 'Other Tutor', 'Tutor',
        NULL, NULL, NULL, NULL, true, true, true, 'disconnected', '2024-06-01T00:00:00Z')`,
      [originalId, blankId, userId, alt, biography, linkedin, otherId],
    );
    await client.query(
      `INSERT INTO availability_rules (tutor_profile_id, weekly_hours, date_hours)
       VALUES ($1, '{"1":[{"start":"16:00","end":"20:00"}]}'::jsonb, '{"2026-10-25":[{"start":"16:00","end":"20:00"}]}'::jsonb),
              ($2, '{"2":[{"start":"09:00","end":"12:00"}]}'::jsonb, '{}'::jsonb)`,
      [originalId, otherId],
    );
    await client.query(
      `INSERT INTO calendar_connections (tutor_profile_id, provider, status, encrypted_refresh_token)
       VALUES ($1, 'google', 'connected', 'enc:refresh-token')`,
      [blankId],
    );
    await client.query(
      `INSERT INTO tutor_compensation_rates (tutor_profile_id, hourly_rate_cents) VALUES ($1, 8000)`,
      [blankId],
    );
    await client.query(
      `INSERT INTO payments (id, tutor_profile_id, amount_cents) VALUES ($1, $2, 16000)`,
      [paymentId, blankId],
    );
    await client.query(
      `INSERT INTO booking_slot_holds (tutor_profile_id, payment_id, start_time)
       VALUES ($1, $2, '2026-10-25T20:00:00Z')`,
      [blankId, paymentId],
    );
    await client.query(
      `INSERT INTO tutor_payout_obligations (tutor_profile_id, amount_owed_cents) VALUES ($1, 8000)`,
      [blankId],
    );
    await client.query(
      `INSERT INTO stripe_transfers (tutor_profile_id, amount_cents) VALUES ($1, 8000)`,
      [blankId],
    );
    await client.query(
      `INSERT INTO sessions (
         id, course_id, tutor_user_id, date_time, title, provider_event_id, provider_event_url,
         provider_calendar_id, updated_at
       ) VALUES (
         $1, $2, $3, '2026-10-25T20:00:00Z', 'Michelle''s SAT Session with Xavier',
         'event-michelle-oct25', 'https://www.google.com/calendar/event?eid=michelle',
         'primary', '2026-10-01T00:00:00Z'
       )`,
      [sessionId, courseId, userId],
    );

    const beforeSession = await client.query(`SELECT row_to_json(sessions) AS row FROM sessions`);
    const beforeUser = await client.query(`SELECT row_to_json(users) AS row FROM users`);
    const beforeCourse = await client.query(`SELECT meet_url FROM courses`);

    await client.query(migrationSql);

    const active = await client.query<{ id: string; email: string; photo_url: string; photo_alt_text: string; biography: string; linkedin_url: string; calendar_status: string; user_id: string }>(
      `SELECT id, email, photo_url, photo_alt_text, biography, linkedin_url, calendar_status, user_id
       FROM tutor_profiles WHERE name = 'Xavier Morales' AND active = true AND public_approved = true`,
    );
    assert.equal(active.rowCount, 1);
    assert.equal(active.rows[0]?.id, originalId);
    assert.equal(active.rows[0]?.email, "xavier.rmz6@gmail.com");
    assert.equal(active.rows[0]?.photo_url, "/media/team/xavier-morales.jpg");
    assert.equal(active.rows[0]?.photo_alt_text, alt);
    assert.equal(active.rows[0]?.biography, biography);
    assert.equal(active.rows[0]?.linkedin_url, linkedin);
    assert.equal(active.rows[0]?.calendar_status, "connected");
    assert.equal(active.rows[0]?.user_id, userId);

    const blank = await client.query<{ active: boolean; public_approved: boolean; booking_eligible: boolean; user_id: string | null; email: string }>(
      `SELECT active, public_approved, booking_eligible, user_id, email FROM tutor_profiles WHERE id = $1`,
      [blankId],
    );
    assert.equal(blank.rows[0]?.active, false);
    assert.equal(blank.rows[0]?.public_approved, false);
    assert.equal(blank.rows[0]?.booking_eligible, false);
    assert.equal(blank.rows[0]?.user_id, null);
    assert.match(blank.rows[0]?.email ?? "", /^retired\+xavier-duplicate-/);

    const rules = await client.query<{ tutor_profile_id: string; date_hours: unknown }>(
      `SELECT tutor_profile_id, date_hours FROM availability_rules ORDER BY tutor_profile_id`,
    );
    assert.deepEqual(
      rules.rows.map((row) => row.tutor_profile_id).sort(),
      [originalId, otherId].sort(),
    );
    assert.deepEqual(
      rules.rows.find((row) => row.tutor_profile_id === originalId)?.date_hours,
      { "2026-10-25": [{ start: "16:00", end: "20:00" }] },
    );
    const calendar = await client.query<{ tutor_profile_id: string; status: string; encrypted_refresh_token: string }>(
      `SELECT tutor_profile_id, status, encrypted_refresh_token FROM calendar_connections`,
    );
    assert.equal(calendar.rowCount, 1);
    assert.equal(calendar.rows[0]?.tutor_profile_id, originalId);
    assert.equal(calendar.rows[0]?.status, "connected");
    assert.equal(calendar.rows[0]?.encrypted_refresh_token, "enc:refresh-token");
    const rates = await client.query(`SELECT tutor_profile_id, hourly_rate_cents FROM tutor_compensation_rates`);
    assert.equal(rates.rows[0]?.tutor_profile_id, originalId);
    assert.equal(rates.rows[0]?.hourly_rate_cents, 8000);
    const payment = await client.query(`SELECT tutor_profile_id, amount_cents FROM payments`);
    assert.equal(payment.rows[0]?.tutor_profile_id, originalId);
    assert.equal(payment.rows[0]?.amount_cents, 16000);
    const hold = await client.query(`SELECT tutor_profile_id, start_time FROM booking_slot_holds`);
    assert.equal(hold.rows[0]?.tutor_profile_id, originalId);
    const payout = await client.query(`SELECT tutor_profile_id, amount_owed_cents FROM tutor_payout_obligations`);
    assert.equal(payout.rows[0]?.tutor_profile_id, originalId);
    const transfer = await client.query(`SELECT tutor_profile_id, amount_cents FROM stripe_transfers`);
    assert.equal(transfer.rows[0]?.tutor_profile_id, originalId);

    const afterSession = await client.query(`SELECT row_to_json(sessions) AS row FROM sessions`);
    const afterUser = await client.query(`SELECT row_to_json(users) AS row FROM users`);
    const afterCourse = await client.query(`SELECT meet_url FROM courses`);
    assert.deepEqual(afterSession.rows, beforeSession.rows);
    assert.deepEqual(afterUser.rows, beforeUser.rows);
    assert.deepEqual(afterCourse.rows, beforeCourse.rows);

    const stamp = await client.query<{ profile_at: string; rule_at: string; payment_at: string }>(
      `SELECT
         (SELECT updated_at FROM tutor_profiles WHERE id = $1) AS profile_at,
         (SELECT updated_at FROM availability_rules WHERE tutor_profile_id = $1) AS rule_at,
         (SELECT updated_at FROM payments WHERE id = $2) AS payment_at`,
      [originalId, paymentId],
    );
    await client.query(migrationSql);
    const rerun = await client.query(
      `SELECT
         (SELECT updated_at FROM tutor_profiles WHERE id = $1) AS profile_at,
         (SELECT updated_at FROM availability_rules WHERE tutor_profile_id = $1) AS rule_at,
         (SELECT updated_at FROM payments WHERE id = $2) AS payment_at`,
      [originalId, paymentId],
    );
    assert.deepEqual(rerun.rows, stamp.rows);
    const stillOne = await client.query(
      `SELECT COUNT(*)::int AS count FROM tutor_profiles
       WHERE name = 'Xavier Morales' AND active = true AND public_approved = true`,
    );
    assert.equal(stillOne.rows[0]?.count, 1);
    const sessionAgain = await client.query(`SELECT row_to_json(sessions) AS row FROM sessions`);
    assert.deepEqual(sessionAgain.rows, beforeSession.rows);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
