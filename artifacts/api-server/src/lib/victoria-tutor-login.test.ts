import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import {
  VICTORIA_INTENDED_EMAIL,
  VICTORIA_PLACEHOLDER_EMAIL,
  VICTORIA_USER_ID,
} from "./college-consulting.ts";

const migrationSql = (
  await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0069_victoria_tutor_login.sql", import.meta.url)),
    "utf8",
  )
).replace(/^--.*$/gm, "");

test("Victoria login migration only swaps her three emails", () => {
  assert.match(migrationSql, /UPDATE "users"/);
  assert.match(migrationSql, /UPDATE "portal_access_grants"/);
  assert.match(migrationSql, /UPDATE "tutor_profiles"/);
  assert.match(migrationSql, /victoriawije7@gmail.com/);
  assert.match(migrationSql, new RegExp(VICTORIA_USER_ID));
  assert.equal(migrationSql.includes("sessions"), false);
  assert.equal(migrationSql.includes("calendar_connections"), false);
  assert.equal(migrationSql.includes("portal_login_aliases"), false);
  assert.equal(/clerk/i.test(migrationSql), false);
  assert.equal(/notify|resend|sendmail/i.test(migrationSql), false);
  assert.equal(/insert into/i.test(migrationSql), false);
  assert.equal(VICTORIA_INTENDED_EMAIL, "victoriawije7@gmail.com");
  assert.notEqual(VICTORIA_INTENDED_EMAIL, VICTORIA_PLACEHOLDER_EMAIL);
});

test("migration sets Victoria's login email and leaves calendar, alias, and sessions", async () => {
  assert.ok(process.env.DATABASE_URL?.trim(), "DATABASE_URL is required to run the email migration");
  const client = await pool.connect();
  const otherId = randomUUID();
  const courseId = randomUUID();
  const sessionId = randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "users" ("id", "clerk_user_id", "email", "display_name", "role")
       VALUES ($1, $2, $3, 'Victoria Wijerathnayapa', 'tutor')
       ON CONFLICT ("id") DO UPDATE
       SET "email" = EXCLUDED."email",
           "clerk_user_id" = EXCLUDED."clerk_user_id",
           "role" = 'tutor'`,
      [VICTORIA_USER_ID, `pending:${VICTORIA_PLACEHOLDER_EMAIL}`, VICTORIA_PLACEHOLDER_EMAIL],
    );
    await client.query(
      `DELETE FROM "portal_access_grants" WHERE "user_id" = $1 OR lower("email") = $2`,
      [VICTORIA_USER_ID, VICTORIA_PLACEHOLDER_EMAIL],
    );
    await client.query(
      `DELETE FROM "tutor_profiles" WHERE "user_id" = $1 OR lower("email") = $2`,
      [VICTORIA_USER_ID, VICTORIA_PLACEHOLDER_EMAIL],
    );
    await client.query(
      `INSERT INTO "portal_access_grants"
         ("email", "clerk_user_id", "display_name", "role_category", "active", "user_id")
       VALUES ($1, $2, 'Victoria Wijerathnayapa', 'tutor', true, $3)`,
      [VICTORIA_PLACEHOLDER_EMAIL, `pending:${VICTORIA_PLACEHOLDER_EMAIL}`, VICTORIA_USER_ID],
    );
    const profile = await client.query(
      `INSERT INTO "tutor_profiles"
         ("user_id", "email", "name", "calendar_status", "booking_eligible", "active")
       VALUES ($1, $2, 'Victoria Wijerathnayapa', 'connected', true, true)
       RETURNING "id"`,
      [VICTORIA_USER_ID, VICTORIA_PLACEHOLDER_EMAIL],
    );
    const profileId = profile.rows[0].id as string;
    await client.query(
      `INSERT INTO "calendar_connections"
         ("tutor_profile_id", "status", "app_calendar_id", "encrypted_refresh_token", "google_account_email")
       VALUES ($1, 'connected', 'app-cal', 'refresh-test', $2)`,
      [profileId, VICTORIA_PLACEHOLDER_EMAIL],
    );
    await client.query(
      `INSERT INTO "portal_login_aliases" ("email", "user_id")
       VALUES ($1, $2)
       ON CONFLICT ("email") DO UPDATE
       SET "user_id" = EXCLUDED."user_id", "revoked_at" = NULL`,
      [VICTORIA_PLACEHOLDER_EMAIL, VICTORIA_USER_ID],
    );
    await client.query(
      `INSERT INTO "courses" ("id", "title", "subject", "term")
       VALUES ($1, 'Victoria login test', 'College Consulting', 'Ongoing')`,
      [courseId],
    );
    await client.query(
      `INSERT INTO "sessions" ("id", "course_id", "tutor_user_id", "date_time", "timezone", "subject", "title")
       VALUES ($1, $2, $3, '2026-10-21T22:00:00.000Z', 'America/New_York', 'College Consulting', 'Kept session')`,
      [sessionId, courseId, VICTORIA_USER_ID],
    );

    const beforeCalendar = await client.query(
      `SELECT "status", "app_calendar_id", "encrypted_refresh_token", "google_account_email"
       FROM "calendar_connections" WHERE "tutor_profile_id" = $1`,
      [profileId],
    );
    const beforeAlias = await client.query(
      `SELECT "email", "user_id", "clerk_user_id", "revoked_at"
       FROM "portal_login_aliases" WHERE lower("email") = $1`,
      [VICTORIA_PLACEHOLDER_EMAIL],
    );
    const beforeSession = await client.query(`SELECT * FROM "sessions" WHERE "id" = $1`, [sessionId]);
    const beforeUser = (
      await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [VICTORIA_USER_ID])
    ).rows[0];

    await client.query(
      `INSERT INTO "users" ("id", "clerk_user_id", "email", "display_name", "role")
       VALUES ($1, $2, $3, 'Other', 'student')`,
      [otherId, `pending:conflict-${otherId}`, VICTORIA_INTENDED_EMAIL],
    );
    await client.query(migrationSql);
    const blocked = await client.query(
      `SELECT "email", "clerk_user_id" FROM "users" WHERE "id" = $1`,
      [VICTORIA_USER_ID],
    );
    assert.equal(blocked.rows[0]?.email, VICTORIA_PLACEHOLDER_EMAIL);
    assert.equal(blocked.rows[0]?.clerk_user_id, beforeUser.clerk_user_id);
    await client.query(`DELETE FROM "users" WHERE "id" = $1`, [otherId]);

    await client.query(migrationSql);
    const after = (
      await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [VICTORIA_USER_ID])
    ).rows[0];
    assert.equal(after.email, VICTORIA_INTENDED_EMAIL);
    for (const column of Object.keys(beforeUser)) {
      if (column === "email" || column === "updated_at") continue;
      assert.deepEqual(after[column], beforeUser[column]);
    }
    const grant = await client.query(
      `SELECT "email", "clerk_user_id", "active" FROM "portal_access_grants" WHERE "user_id" = $1`,
      [VICTORIA_USER_ID],
    );
    assert.equal(grant.rows[0]?.email, VICTORIA_INTENDED_EMAIL);
    assert.equal(grant.rows[0]?.clerk_user_id, `pending:${VICTORIA_PLACEHOLDER_EMAIL}`);
    const tutor = await client.query(
      `SELECT "email", "calendar_status", "booking_eligible" FROM "tutor_profiles" WHERE "id" = $1`,
      [profileId],
    );
    assert.equal(tutor.rows[0]?.email, VICTORIA_INTENDED_EMAIL);
    assert.equal(tutor.rows[0]?.calendar_status, "connected");
    const calendar = await client.query(
      `SELECT "status", "app_calendar_id", "encrypted_refresh_token", "google_account_email"
       FROM "calendar_connections" WHERE "tutor_profile_id" = $1`,
      [profileId],
    );
    assert.deepEqual(calendar.rows, beforeCalendar.rows);
    const alias = await client.query(
      `SELECT "email", "user_id", "clerk_user_id", "revoked_at"
       FROM "portal_login_aliases" WHERE lower("email") = $1`,
      [VICTORIA_PLACEHOLDER_EMAIL],
    );
    assert.deepEqual(alias.rows, beforeAlias.rows);
    const session = await client.query(`SELECT * FROM "sessions" WHERE "id" = $1`, [sessionId]);
    assert.deepEqual(session.rows, beforeSession.rows);

    const updatedAt = after.updated_at;
    await client.query(migrationSql);
    const twice = await client.query(
      `SELECT "email", "updated_at" FROM "users" WHERE "id" = $1`,
      [VICTORIA_USER_ID],
    );
    assert.equal(twice.rows[0]?.email, VICTORIA_INTENDED_EMAIL);
    assert.equal(new Date(twice.rows[0]?.updated_at).toISOString(), new Date(updatedAt).toISOString());
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
