import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationSqlTemplate = await readFile(
  new URL("../drizzle/0018_orphan_ledger_repair.sql", import.meta.url),
  "utf8",
);

after(async () => {
  await pool.end();
});

function migrationSqlForSchema(schema) {
  // The committed repair migration targets public.*; remap for schema-isolated fixtures.
  return migrationSqlTemplate.replaceAll('"public".', `"${schema}".`);
}

async function withFixture(setup, verify) {
  const client = await pool.connect();
  const schema = `orphan_ledger_repair_${randomUUID().replaceAll("-", "")}`;
  const migrationSql = migrationSqlForSchema(schema);
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid()
      );
      CREATE TABLE tutor_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        name text NOT NULL
      );
      CREATE TABLE invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        description text NOT NULL DEFAULT '',
        subtotal_cents numeric NOT NULL DEFAULT 0,
        total_cents numeric NOT NULL DEFAULT 0
      );
      CREATE TABLE payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        amount_cents numeric NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'pending',
        method text NOT NULL DEFAULT 'stripe'
      );
    `);
    await setup(client);
    await client.query(migrationSql);
    await verify(client, schema, migrationSql);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

test("creates missing Connect and invoice columns on a lean schema and reruns safely", async () => {
  await withFixture(
    async () => {},
    async (client, schema, migrationSql) => {
      await client.query(migrationSql);

      const { rows: invoiceCols } = await client.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'invoices'
          AND column_name IN ('issuer_name', 'line_items', 'created_by', 'updated_at')
        ORDER BY column_name
      `,
        [schema],
      );
      assert.deepEqual(
        invoiceCols.map((row) => row.column_name),
        ["created_by", "issuer_name", "line_items", "updated_at"],
      );

      const { rows: paymentCols } = await client.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'payments'
          AND column_name IN (
            'tutor_profile_id',
            'tutor_share_cents',
            'platform_share_cents',
            'provider_charge_id',
            'receipt_url',
            'audit_metadata'
          )
        ORDER BY column_name
      `,
        [schema],
      );
      assert.deepEqual(
        paymentCols.map((row) => row.column_name),
        [
          "audit_metadata",
          "platform_share_cents",
          "provider_charge_id",
          "receipt_url",
          "tutor_profile_id",
          "tutor_share_cents",
        ],
      );

      const { rows: tutorCols } = await client.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'tutor_profiles'
          AND column_name LIKE 'stripe_connect%'
        ORDER BY column_name
      `,
        [schema],
      );
      assert.deepEqual(
        tutorCols.map((row) => row.column_name),
        [
          "stripe_connect_account_id",
          "stripe_connect_charges_enabled",
          "stripe_connect_details_submitted",
          "stripe_connect_payouts_enabled",
          "stripe_connect_status",
        ],
      );

      const { rows: tables } = await client.query(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = 'stripe_transfers'
      `,
        [schema],
      );
      assert.deepEqual(tables, [{ table_name: "stripe_transfers" }]);

      const { rows: indexes } = await client.query(
        `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = $1
          AND tablename = 'stripe_transfers'
        ORDER BY indexname
      `,
        [schema],
      );
      assert.deepEqual(
        indexes.map((row) => row.indexname),
        [
          "stripe_transfer_payment_unique_idx",
          "stripe_transfer_provider_id_idx",
          "stripe_transfers_pkey",
        ],
      );
    },
  );
});

test("tolerates schema-ahead databases that already have orphan DDL", async () => {
  await withFixture(
    async (client) => {
      await client.query(`
        ALTER TABLE invoices
          ADD COLUMN issuer_name text DEFAULT 'Accepted Admissions' NOT NULL,
          ADD COLUMN created_by uuid;
        ALTER TABLE payments
          ADD COLUMN tutor_profile_id uuid,
          ADD COLUMN tutor_share_cents numeric DEFAULT 0 NOT NULL,
          ADD COLUMN platform_share_cents numeric DEFAULT 0 NOT NULL,
          ADD COLUMN provider_charge_id text,
          ADD COLUMN receipt_url text,
          ADD COLUMN audit_metadata jsonb DEFAULT '{}'::jsonb NOT NULL;
        ALTER TABLE tutor_profiles
          ADD COLUMN stripe_connect_account_id text,
          ADD COLUMN stripe_connect_status text DEFAULT 'not_started' NOT NULL,
          ADD COLUMN stripe_connect_details_submitted boolean DEFAULT false NOT NULL,
          ADD COLUMN stripe_connect_charges_enabled boolean DEFAULT false NOT NULL,
          ADD COLUMN stripe_connect_payouts_enabled boolean DEFAULT false NOT NULL;
        CREATE TABLE stripe_transfers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          payment_id uuid NOT NULL,
          tutor_profile_id uuid NOT NULL,
          amount_cents numeric NOT NULL,
          status text DEFAULT 'pending' NOT NULL,
          provider_transfer_id text,
          reversed_amount_cents numeric DEFAULT 0 NOT NULL,
          failure_reason text,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        );
      `);
    },
    async (client, schema, migrationSql) => {
      await client.query(migrationSql);

      const { rows } = await client.query(
        `
        SELECT COUNT(*)::int AS count
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = 'stripe_transfers'
      `,
        [schema],
      );
      assert.equal(rows[0].count, 1);
    },
  );
});
