import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migrationPath = fileURLToPath(
  new URL("../drizzle/0044_client_request_resolution.sql", import.meta.url),
);

test("resolution migration adds resolver columns and only backfills already-closed requests", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "resolved_at"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "resolved_by_user_id"/);
  assert.match(sql, /client_requests_resolved_by_user_id_users_id_fk/);
  assert.match(sql, /SET "resolved_at" = "created_at"/);
  assert.match(sql, /WHERE "status" = 'closed' AND "resolved_at" IS NULL/);
  assert.equal(sql.includes("status = 'new'"), false);
});
