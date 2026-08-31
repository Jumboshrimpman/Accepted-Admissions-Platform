import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationSql = await readFile(
  new URL("../drizzle/0010_faulty_sumo.sql", import.meta.url),
  "utf8",
);

after(async () => {
  await pool.end();
});

test("deduplicates saved calendars and enforces one provider connection per profile", async () => {
  const client = await pool.connect();
  const schema = `calendar_uniqueness_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE calendar_connections (
        id uuid PRIMARY KEY,
        tutor_profile_id uuid NOT NULL,
        provider text NOT NULL DEFAULT 'google',
        status text NOT NULL DEFAULT 'disconnected',
        encrypted_access_token text,
        encrypted_refresh_token text,
        connected_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO calendar_connections (
        id,
        tutor_profile_id,
        provider,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        connected_at,
        updated_at
      )
      VALUES
        (
          '10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          'google',
          'disconnected',
          NULL,
          NULL,
          NULL,
          '2026-08-31T12:02:00Z'
        ),
        (
          '10000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001',
          'google',
          'connected',
          'encrypted-access',
          'encrypted-refresh',
          '2026-08-31T12:00:00Z',
          '2026-08-31T12:00:00Z'
        );
    `);

    await client.query(migrationSql);
    await client.query(migrationSql);

    const { rows } = await client.query(`
      SELECT id, status, encrypted_access_token, encrypted_refresh_token
      FROM calendar_connections
    `);
    assert.deepEqual(rows, [
      {
        id: "10000000-0000-0000-0000-000000000002",
        status: "connected",
        encrypted_access_token: "encrypted-access",
        encrypted_refresh_token: "encrypted-refresh",
      },
    ]);
    await assert.rejects(
      client.query(`
        INSERT INTO calendar_connections (id, tutor_profile_id, provider)
        VALUES (
          '10000000-0000-0000-0000-000000000003',
          '20000000-0000-0000-0000-000000000001',
          'google'
        )
      `),
      (error) => error?.code === "23505",
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});