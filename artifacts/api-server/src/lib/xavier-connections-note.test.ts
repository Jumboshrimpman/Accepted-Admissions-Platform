import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { isRetiredTutorProfile } from "./calendar-profile-match.ts";
import { profileNotesWithoutSupersededMarker } from "./xavier-identity.ts";

const migrationSql = await readFile(
  fileURLToPath(
    new URL("../../../../lib/db/drizzle/0076_xavier_connections_superseded_note.sql", import.meta.url),
  ),
  "utf8",
);
const journal = JSON.parse(
  await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url)),
    "utf8",
  ),
) as { entries: Array<{ idx: number; when: number; tag: string }> };

const XAVIER_PROFILE_ID = "e4022489-00d8-42ca-b1e6-f6742199e1af";

after(async () => {
  await pool.end();
});

test("Xavier connections note repair is journaled after 0075 and does not write sessions", () => {
  const entry = journal.entries.find((item) => item.tag === "0076_xavier_connections_superseded_note");
  assert.ok(entry);
  assert.equal(entry.idx, 76);
  assert.equal(entry.when, 1792800000000);
  assert.ok(entry.when > 1792790000000);
  const previous = journal.entries.find((item) => item.tag === "0075_restore_xavier_public_profile");
  assert.ok(previous);
  assert.ok(entry.when > previous.when);
  const executable = migrationSql.replace(/^--.*$/gm, "");
  assert.match(executable, new RegExp(XAVIER_PROFILE_ID));
  assert.match(executable, /SUPERSEDED:%/);
  assert.doesNotMatch(executable, /UPDATE\s+"sessions"/i);
  assert.doesNotMatch(executable, /UPDATE\s+"users"/i);
  assert.doesNotMatch(executable, /provider_event/i);
  assert.doesNotMatch(executable, /meeting/i);
  assert.doesNotMatch(executable, /INSERT\s+/i);
});

test("clearing the marker makes the restored profile visible to Connections", () => {
  const notes = "Harvard biography.\nSUPERSEDED: duplicate Xavier Clerk user.";
  assert.equal(
    isRetiredTutorProfile({
      email: "xavier.rmz6@gmail.com",
      name: "Xavier Morales",
      internalNotes: notes,
    }),
    true,
  );
  assert.equal(
    isRetiredTutorProfile({
      email: "xavier.rmz6@gmail.com",
      name: "Xavier Morales",
      internalNotes: profileNotesWithoutSupersededMarker(notes),
    }),
    false,
  );
});

test("the note repair leaves the inactive duplicate and Michelle's session alone", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const client = await pool.connect();
  const schema = `xavier_connections_note_${randomUUID().replaceAll("-", "")}`;
  const blankId = "05575f9d-a83c-45f5-ad37-e9c10adc58b6";
  const sessionId = "40000000-0000-4000-8000-000000000025";
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE tutor_profiles (
        id uuid PRIMARY KEY,
        email text NOT NULL,
        name text NOT NULL,
        active boolean NOT NULL,
        public_approved boolean NOT NULL,
        booking_eligible boolean NOT NULL,
        internal_notes text,
        updated_at timestamptz NOT NULL
      );
      CREATE TABLE sessions (
        id uuid PRIMARY KEY,
        title text NOT NULL,
        date_time timestamptz NOT NULL,
        tutor_user_id uuid
      );
    `);
    await client.query(
      `INSERT INTO tutor_profiles (
         id, email, name, active, public_approved, booking_eligible, internal_notes, updated_at
       ) VALUES
       ($1, 'xavier.rmz6@gmail.com', 'Xavier Morales', true, true, true,
        $2, '2026-10-19T00:00:00Z'),
       ($3, 'retired+xavier-duplicate-05575f9d@retired.accepted.local', 'Xavier Morales', false, false, false,
        $4, '2026-10-18T00:00:00Z')`,
      [
        XAVIER_PROFILE_ID,
        "Harvard biography.\nSUPERSEDED: duplicate Xavier Clerk user.",
        blankId,
        "SUPERSEDED: duplicate Xavier Clerk user.",
      ],
    );
    await client.query(
      `INSERT INTO sessions (id, title, date_time, tutor_user_id)
       VALUES ($1, 'Michelle SAT', '2026-10-25T16:00:00Z', NULL)`,
      [sessionId],
    );
    await client.query(migrationSql);
    const live = await client.query<{ internal_notes: string | null; booking_eligible: boolean }>(
      `SELECT internal_notes, booking_eligible FROM tutor_profiles WHERE id = $1`,
      [XAVIER_PROFILE_ID],
    );
    assert.equal(live.rows[0]?.internal_notes, "Harvard biography.");
    assert.equal(live.rows[0]?.booking_eligible, true);
    assert.equal(
      isRetiredTutorProfile({
        email: "xavier.rmz6@gmail.com",
        name: "Xavier Morales",
        internalNotes: live.rows[0]?.internal_notes,
      }),
      false,
    );
    const blank = await client.query<{ internal_notes: string | null; active: boolean }>(
      `SELECT internal_notes, active FROM tutor_profiles WHERE id = $1`,
      [blankId],
    );
    assert.match(blank.rows[0]?.internal_notes ?? "", /SUPERSEDED:/);
    assert.equal(blank.rows[0]?.active, false);
    const beforeSecond = await client.query<{ updated_at: Date }>(
      `SELECT updated_at FROM tutor_profiles WHERE id = $1`,
      [XAVIER_PROFILE_ID],
    );
    await client.query(migrationSql);
    const afterSecond = await client.query<{ updated_at: Date; internal_notes: string | null }>(
      `SELECT updated_at, internal_notes FROM tutor_profiles WHERE id = $1`,
      [XAVIER_PROFILE_ID],
    );
    assert.equal(
      afterSecond.rows[0]?.updated_at.toISOString(),
      beforeSecond.rows[0]?.updated_at.toISOString(),
    );
    assert.equal(afterSecond.rows[0]?.internal_notes, "Harvard biography.");
    const session = await client.query<{ title: string; date_time: Date }>(
      `SELECT title, date_time FROM sessions WHERE id = $1`,
      [sessionId],
    );
    assert.equal(session.rows[0]?.title, "Michelle SAT");
    assert.equal(session.rows[0]?.date_time.toISOString(), "2026-10-25T16:00:00.000Z");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
