import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationSql = await readFile(
  new URL("../drizzle/0013_glamorous_ben_grimm.sql", import.meta.url),
  "utf8",
);

after(async () => {
  await pool.end();
});

test("reconciles an existing login activity table and remains repeatable", async () => {
  const client = await pool.connect();
  const schema = `login_activity_reconciliation_${randomUUID().replaceAll("-", "")}`;

  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY
      );
      CREATE TABLE login_activity (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL,
        clerk_session_id text NOT NULL,
        signed_in_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    await client.query(migrationSql);
    await client.query(migrationSql);

    const { rows: constraints } = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = $1
        AND table_name = 'login_activity'
        AND constraint_name = 'login_activity_user_id_users_id_fk'
    `, [schema]);
    assert.deepEqual(constraints, [
      { constraint_name: "login_activity_user_id_users_id_fk" },
    ]);

    const { rows: indexes } = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = $1
        AND tablename = 'login_activity'
        AND indexname = 'login_activity_clerk_session_unique_idx'
    `, [schema]);
    assert.deepEqual(indexes, [
      { indexname: "login_activity_clerk_session_unique_idx" },
    ]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});