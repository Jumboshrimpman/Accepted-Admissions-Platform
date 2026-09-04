import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationSql = await readFile(
  new URL("../drizzle/0008_xavier_profile_reconciliation.sql", import.meta.url),
  "utf8",
);
// Historical 0008 fixture: canonical email was xsfam6@gmail.com.
// Live correction is 0026_xavier_email_xaver_rmz6.sql → xaver.rmz6@gmail.com.

after(async () => {
  await pool.end();
});

async function withFixture(setup, verify) {
  const client = await pool.connect();
  const schema = `xavier_reconciliation_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        role text NOT NULL
      );
      CREATE TABLE tutor_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        email text NOT NULL,
        name text NOT NULL,
        title text NOT NULL DEFAULT 'Tutor',
        photo_url text,
        biography text,
        subjects jsonb NOT NULL DEFAULT '[]'::jsonb,
        linkedin_url text,
        active boolean NOT NULL DEFAULT true,
        booking_eligible boolean NOT NULL DEFAULT false,
        calendar_status text NOT NULL DEFAULT 'disconnected',
        internal_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX tutor_profile_email_idx ON tutor_profiles (email);
      CREATE TABLE calendar_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        provider text NOT NULL DEFAULT 'google',
        status text NOT NULL DEFAULT 'disconnected'
      );
      CREATE TABLE availability_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL
      );
      CREATE TABLE tutor_compensation_rates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL
      );
    `);
    await setup(client);
    await client.query(migrationSql);
    await verify(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

test("creates one canonical Xavier profile on an empty database and reruns safely", async () => {
  await withFixture(
    async () => {},
    async (client) => {
      await client.query(migrationSql);
      const { rows } = await client.query(`
        SELECT email, active, booking_eligible
        FROM tutor_profiles
        WHERE name = 'Xavier Morales'
      `);
      assert.deepEqual(rows, [
        {
          email: "xsfam6@gmail.com",
          active: true,
          booking_eligible: true,
        },
      ]);
    },
  );
});

test("merges every Xavier variant and reparents all dependent records", async () => {
  await withFixture(
    async (client) => {
      await client.query(`
        INSERT INTO users (id, role)
        VALUES ('10000000-0000-0000-0000-000000000001', 'tutor');
        INSERT INTO tutor_profiles (id, user_id, email, name, title, subjects)
        VALUES
          (
            '20000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001',
            'XSFAM6@GMAIL.COM',
            'Xavier Morales',
            'SAT Tutor',
            '["SAT"]'::jsonb
          ),
          (
            '20000000-0000-0000-0000-000000000002',
            NULL,
            'Xaver.RMZ6@GMAIL.COM',
            'Xavier Morales',
            'SAT Tutor',
            '["SAT"]'::jsonb
          ),
          (
            '20000000-0000-0000-0000-000000000003',
            NULL,
            'xavier+duplicate@example.com',
            'Xavier Morales',
            'SAT Tutor',
            '["SAT"]'::jsonb
          );
        INSERT INTO calendar_connections (tutor_profile_id, status)
        VALUES
          ('20000000-0000-0000-0000-000000000001', 'connected'),
          ('20000000-0000-0000-0000-000000000002', 'disconnected');
        INSERT INTO availability_rules (tutor_profile_id)
        VALUES
          ('20000000-0000-0000-0000-000000000001'),
          ('20000000-0000-0000-0000-000000000002'),
          ('20000000-0000-0000-0000-000000000003');
        INSERT INTO tutor_compensation_rates (tutor_profile_id)
        VALUES
          ('20000000-0000-0000-0000-000000000002'),
          ('20000000-0000-0000-0000-000000000003');
      `);
    },
    async (client) => {
      const { rows: profiles } = await client.query(`
        SELECT id, user_id, email, active, booking_eligible, calendar_status
        FROM tutor_profiles
        WHERE name = 'Xavier Morales'
      `);
      assert.deepEqual(profiles, [
        {
          id: "20000000-0000-0000-0000-000000000001",
          user_id: "10000000-0000-0000-0000-000000000001",
          email: "xsfam6@gmail.com",
          active: true,
          booking_eligible: true,
          calendar_status: "connected",
        },
      ]);
      for (const [table, expectedCount] of [
        ["calendar_connections", 2],
        ["availability_rules", 3],
        ["tutor_compensation_rates", 2],
      ]) {
        const { rows } = await client.query(
          `SELECT count(*)::int AS count, count(DISTINCT tutor_profile_id)::int AS owners FROM ${table}`,
        );
        assert.deepEqual(rows, [{ count: expectedCount, owners: 1 }]);
      }
    },
  );
});

test("does not make a Xavier profile bookable when it is linked to a non-tutor", async () => {
  await withFixture(
    async (client) => {
      await client.query(`
        INSERT INTO users (id, role)
        VALUES ('10000000-0000-0000-0000-000000000002', 'student');
        INSERT INTO tutor_profiles (id, user_id, email, name, title, subjects, booking_eligible)
        VALUES (
          '20000000-0000-0000-0000-000000000004',
          '10000000-0000-0000-0000-000000000002',
          'xaver.rmz6@gmail.com',
          'Xavier Morales',
          'SAT Tutor',
          '["SAT"]'::jsonb,
          true
        );
      `);
    },
    async (client) => {
      const { rows } = await client.query(`
        SELECT email, booking_eligible
        FROM tutor_profiles
        WHERE name = 'Xavier Morales'
      `);
      assert.deepEqual(rows, [
        {
          email: "xsfam6@gmail.com",
          booking_eligible: false,
        },
      ]);
    },
  );
});