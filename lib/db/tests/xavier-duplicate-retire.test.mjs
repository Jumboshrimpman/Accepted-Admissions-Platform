import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationSql = await readFile(
  new URL("../drizzle/0034_retire_duplicate_xavier_clerk.sql", import.meta.url),
  "utf8",
);

after(async () => {
  await pool.end();
});

async function withFixture(setup, verify) {
  const client = await pool.connect();
  const schema = `xavier_duplicate_retire_${randomUUID().replaceAll("-", "")}`;
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
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE tutor_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        email text NOT NULL UNIQUE,
        name text NOT NULL,
        title text NOT NULL DEFAULT 'Tutor',
        subjects jsonb NOT NULL DEFAULT '[]'::jsonb,
        active boolean NOT NULL DEFAULT true,
        booking_eligible boolean NOT NULL DEFAULT false,
        public_approved boolean NOT NULL DEFAULT false,
        internal_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE portal_access_grants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        clerk_user_id text,
        display_name text NOT NULL,
        role_category text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        notes text,
        user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      );
      CREATE TABLE courses (
        id uuid PRIMARY KEY,
        title text NOT NULL
      );
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        tutor_user_id uuid,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE tutor_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        tutor_user_id uuid NOT NULL,
        student_user_id uuid NOT NULL,
        subject text NOT NULL,
        UNIQUE (course_id, tutor_user_id, student_user_id, subject)
      );
      CREATE TABLE course_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        user_id uuid NOT NULL,
        membership_role text NOT NULL,
        subject text NOT NULL DEFAULT 'all',
        UNIQUE (course_id, user_id)
      );
      CREATE TABLE calendar_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        provider text NOT NULL DEFAULT 'google',
        status text NOT NULL DEFAULT 'disconnected',
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tutor_profile_id, provider)
      );
      CREATE TABLE availability_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_profile_id uuid NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
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

test("repoints the typo Xavier onto the canonical Clerk user and soft-retires the duplicate", async () => {
  if (!process.env.DATABASE_URL) {
    test.skip("DATABASE_URL is required");
    return;
  }
  const canonicalUser = "10000000-0000-0000-0000-000000000001";
  const retiredUser = "10000000-0000-0000-0000-000000000002";
  const student = "10000000-0000-0000-0000-000000000003";
  const course = "30000000-0000-0000-0000-000000000001";
  const winnerProfile = "20000000-0000-0000-0000-000000000001";
  const loserProfile = "20000000-0000-0000-0000-000000000002";

  await withFixture(
    async (client) => {
      await client.query(
        `
        INSERT INTO users (id, clerk_user_id, email, display_name, role)
        VALUES
          ($1, 'user_3IxUfoT1xRnDsqhlx5NN1eGfRg6', 'xaver.rmz6@gmail.com', 'Xavier Morales', 'tutor'),
          ($2, 'user_3IsvKVDGAg5KdvwHhvODf2VFqtd', 'xavier.rmz6@gmail.com', 'Xavier Morales', 'tutor'),
          ($3, 'user_student', 'michaelmakarem@gmail.com', 'Michelle Makarem', 'student');
        INSERT INTO courses (id, title) VALUES ($4, 'SAT');
        INSERT INTO tutor_profiles (id, user_id, email, name, active, booking_eligible, public_approved)
        VALUES
          ($5, $1, 'xaver.rmz6@gmail.com', 'Xavier Morales', true, true, true),
          ($6, $2, 'xavier.rmz6@gmail.com', 'Xavier Morales', true, true, true);
        INSERT INTO portal_access_grants (email, clerk_user_id, display_name, role_category, active, user_id)
        VALUES
          ('xaver.rmz6@gmail.com', 'user_3IxUfoT1xRnDsqhlx5NN1eGfRg6', 'Xavier Morales', 'sat_tutor', true, $1),
          ('xavier.rmz6@gmail.com', 'user_3IsvKVDGAg5KdvwHhvODf2VFqtd', 'Xavier Morales', 'sat_tutor', true, $2);
        INSERT INTO sessions (course_id, tutor_user_id) VALUES ($4, $2);
        INSERT INTO tutor_assignments (course_id, tutor_user_id, student_user_id, subject)
        VALUES ($4, $2, $3, 'SAT');
        INSERT INTO course_memberships (course_id, user_id, membership_role, subject)
        VALUES ($4, $1, 'tutor', 'SAT'), ($4, $2, 'tutor', 'SAT');
        INSERT INTO calendar_connections (tutor_profile_id, status)
        VALUES ($6, 'connected');
        INSERT INTO availability_rules (tutor_profile_id) VALUES ($6);
        INSERT INTO tutor_compensation_rates (tutor_profile_id) VALUES ($6);
      `,
        [canonicalUser, retiredUser, student, course, winnerProfile, loserProfile],
      );
    },
    async (client) => {
      const { rows: users } = await client.query(`
        SELECT id, clerk_user_id, email, display_name
        FROM users
        WHERE display_name ILIKE '%xavier%'
        ORDER BY email
      `);
      const canonical = users.find((row) => row.id === canonicalUser);
      const retired = users.find((row) => row.id === retiredUser);
      assert.equal(canonical.clerk_user_id, "user_3IxUfoT1xRnDsqhlx5NN1eGfRg6");
      assert.equal(canonical.email, "xaver.rmz6@gmail.com");
      assert.match(retired.clerk_user_id, /^retired:user_3IsvKVDGAg5KdvwHhvODf2VFqtd:/);
      assert.match(retired.email, /@retired\.accepted\.local$/);
      assert.equal(retired.display_name, "Xavier Morales (superseded)");

      const { rows: sessions } = await client.query(
        `SELECT tutor_user_id FROM sessions`,
      );
      assert.deepEqual(sessions, [{ tutor_user_id: canonicalUser }]);

      const { rows: assignments } = await client.query(
        `SELECT tutor_user_id, student_user_id FROM tutor_assignments`,
      );
      assert.deepEqual(assignments, [
        { tutor_user_id: canonicalUser, student_user_id: student },
      ]);

      const { rows: memberships } = await client.query(
        `SELECT user_id FROM course_memberships ORDER BY user_id`,
      );
      assert.deepEqual(memberships, [{ user_id: canonicalUser }]);

      const { rows: profiles } = await client.query(`
        SELECT id, user_id, email, active, booking_eligible, public_approved
        FROM tutor_profiles
        ORDER BY active DESC, email
      `);
      const live = profiles.find((row) => row.id === winnerProfile);
      const hidden = profiles.find((row) => row.id === loserProfile);
      assert.equal(live.email, "xaver.rmz6@gmail.com");
      assert.equal(live.active, true);
      assert.equal(live.booking_eligible, true);
      assert.equal(live.user_id, canonicalUser);
      assert.equal(hidden.active, false);
      assert.equal(hidden.booking_eligible, false);
      assert.equal(hidden.public_approved, false);
      assert.equal(hidden.user_id, null);

      const { rows: grants } = await client.query(`
        SELECT email, clerk_user_id, active
        FROM portal_access_grants
        ORDER BY email
      `);
      const liveGrant = grants.find((row) => row.email === "xaver.rmz6@gmail.com");
      const retiredGrant = grants.find((row) => row.email === "xavier.rmz6@gmail.com");
      assert.equal(liveGrant.active, true);
      assert.equal(liveGrant.clerk_user_id, "user_3IxUfoT1xRnDsqhlx5NN1eGfRg6");
      assert.equal(retiredGrant.active, false);
      assert.match(retiredGrant.clerk_user_id, /^retired:/);
    },
  );
});

test("reruns safely when only the canonical Xavier already exists", async () => {
  if (!process.env.DATABASE_URL) {
    test.skip("DATABASE_URL is required");
    return;
  }
  await withFixture(
    async (client) => {
      await client.query(`
        INSERT INTO users (id, clerk_user_id, email, display_name, role)
        VALUES (
          '10000000-0000-0000-0000-000000000009',
          'user_3IxUfoT1xRnDsqhlx5NN1eGfRg6',
          'xaver.rmz6@gmail.com',
          'Xavier Morales',
          'tutor'
        );
        INSERT INTO tutor_profiles (user_id, email, name, active, booking_eligible)
        VALUES (
          '10000000-0000-0000-0000-000000000009',
          'xaver.rmz6@gmail.com',
          'Xavier Morales',
          true,
          true
        );
      `);
    },
    async (client) => {
      await client.query(migrationSql);
      const { rows } = await client.query(`
        SELECT clerk_user_id, email, display_name FROM users
      `);
      assert.deepEqual(rows, [
        {
          clerk_user_id: "user_3IxUfoT1xRnDsqhlx5NN1eGfRg6",
          email: "xaver.rmz6@gmail.com",
          display_name: "Xavier Morales",
        },
      ]);
    },
  );
});
