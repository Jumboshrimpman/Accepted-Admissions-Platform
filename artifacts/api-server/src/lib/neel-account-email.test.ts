import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import { NEEL_DHARNI_USER_ID, NEEL_PLACEHOLDER_EMAIL } from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import { decideVerifiedLoginAlias } from "./portal-login-aliases.ts";

const NEEL_ACCOUNT_EMAIL = "ndharni300@gmail.com";
const PRIOR_EMAIL = "neel-before-migration@example.invalid";

const migrationSql = (
  await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0065_neel_account_email.sql", import.meta.url)),
    "utf8",
  )
).replace(/^--.*$/gm, "");

test("Neel account email migration is a single scoped update", () => {
  assert.match(migrationSql, /UPDATE "users"/);
  assert.match(migrationSql, /SET "email" = 'ndharni300@gmail.com'/);
  assert.match(migrationSql, /WHERE "id" = '6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19'/);
  assert.match(migrationSql, /lower\("email"\) = 'ndharni300@gmail.com'/);
  assert.equal(migrationSql.includes("portal_login_aliases"), false);
  assert.equal(migrationSql.includes("portal_access_grants"), false);
  assert.equal(/create trigger/i.test(migrationSql), false);
  assert.equal(/notify/i.test(migrationSql), false);
  assert.equal(/clerk/i.test(migrationSql), false);
});

test("samakubba@gmail.com still opens Neel after his account email changes", () => {
  const decision = decideVerifiedLoginAlias({
    email: NEEL_PLACEHOLDER_EMAIL,
    clerkUserId: "user_neel_login",
    alias: {
      email: NEEL_PLACEHOLDER_EMAIL,
      userId: NEEL_DHARNI_USER_ID,
      clerkUserId: null,
      revokedAt: null,
    },
    user: {
      id: NEEL_DHARNI_USER_ID,
      email: NEEL_ACCOUNT_EMAIL,
      displayName: "Neel Dharni",
      role: "student",
      clerkUserId: "pending:neel",
    },
  });
  assert.equal(decision.action, "use");
  if (decision.action === "use") assert.equal(decision.userId, NEEL_DHARNI_USER_ID);
  assert.notEqual(NEEL_ACCOUNT_EMAIL, NEEL_PLACEHOLDER_EMAIL);
});

test("migration sets Neel's email, skips a taken address, and leaves the alias", async () => {
  assert.ok(process.env.DATABASE_URL?.trim(), "DATABASE_URL is required to run the email migration");
  const client = await pool.connect();
  const otherId = randomUUID();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [
      NEEL_DHARNI_USER_ID,
    ]);
    if (existing.rowCount === 0) {
      await client.query(
        `INSERT INTO "users" ("id", "clerk_user_id", "email", "display_name", "role")
         VALUES ($1, $2, $3, 'Neel Dharni', 'student')`,
        [NEEL_DHARNI_USER_ID, `pending:${PRIOR_EMAIL}`, PRIOR_EMAIL],
      );
    } else {
      await client.query(`UPDATE "users" SET "email" = $2 WHERE "id" = $1`, [
        NEEL_DHARNI_USER_ID,
        PRIOR_EMAIL,
      ]);
    }
    await client.query(
      `INSERT INTO "portal_login_aliases" ("email", "user_id")
       VALUES ($1, $2)
       ON CONFLICT ("email") DO UPDATE
       SET "user_id" = EXCLUDED."user_id", "revoked_at" = NULL`,
      [NEEL_PLACEHOLDER_EMAIL, NEEL_DHARNI_USER_ID],
    );
    const aliasBefore = await client.query(
      `SELECT "email", "user_id", "clerk_user_id", "revoked_at"
       FROM "portal_login_aliases"
       WHERE lower("email") = $1`,
      [NEEL_PLACEHOLDER_EMAIL],
    );
    const grantsBefore = await client.query(
      `SELECT "id", "email", "user_id" FROM "portal_access_grants" ORDER BY "id"`,
    );
    const beforeRow = (
      await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [NEEL_DHARNI_USER_ID])
    ).rows[0];

    await client.query(
      `INSERT INTO "users" ("id", "clerk_user_id", "email", "display_name", "role")
       VALUES ($1, $2, $3, 'Other', 'student')`,
      [otherId, `pending:conflict-${otherId}`, NEEL_ACCOUNT_EMAIL],
    );
    await client.query(migrationSql);
    const blocked = await client.query(`SELECT "email" FROM "users" WHERE "id" = $1`, [
      NEEL_DHARNI_USER_ID,
    ]);
    assert.equal(blocked.rows[0]?.email, PRIOR_EMAIL);
    await client.query(`DELETE FROM "users" WHERE "id" = $1`, [otherId]);

    await client.query(migrationSql);
    const after = (
      await client.query(`SELECT * FROM "users" WHERE "id" = $1`, [NEEL_DHARNI_USER_ID])
    ).rows[0];
    assert.equal(after.email, NEEL_ACCOUNT_EMAIL);
    for (const column of Object.keys(beforeRow)) {
      if (column === "email") continue;
      assert.deepEqual(after[column], beforeRow[column]);
    }
    await client.query(migrationSql);
    const twice = await client.query(`SELECT "email" FROM "users" WHERE "id" = $1`, [
      NEEL_DHARNI_USER_ID,
    ]);
    assert.equal(twice.rows[0]?.email, NEEL_ACCOUNT_EMAIL);

    const aliasAfter = await client.query(
      `SELECT "email", "user_id", "clerk_user_id", "revoked_at"
       FROM "portal_login_aliases"
       WHERE lower("email") = $1`,
      [NEEL_PLACEHOLDER_EMAIL],
    );
    assert.deepEqual(aliasAfter.rows, aliasBefore.rows);
    const grantsAfter = await client.query(
      `SELECT "id", "email", "user_id" FROM "portal_access_grants" ORDER BY "id"`,
    );
    assert.deepEqual(grantsAfter.rows, grantsBefore.rows);

    const decision = decideVerifiedLoginAlias({
      email: NEEL_PLACEHOLDER_EMAIL,
      clerkUserId: "user_neel_login",
      alias: {
        email: aliasAfter.rows[0].email,
        userId: aliasAfter.rows[0].user_id,
        clerkUserId: aliasAfter.rows[0].clerk_user_id,
        revokedAt: aliasAfter.rows[0].revoked_at
          ? new Date(aliasAfter.rows[0].revoked_at).toISOString()
          : null,
      },
      user: {
        id: after.id,
        email: after.email,
        displayName: after.display_name,
        role: after.role,
        clerkUserId: after.clerk_user_id,
      },
    });
    assert.equal(decision.action, "use");
    if (decision.action === "use") assert.equal(decision.userId, NEEL_DHARNI_USER_ID);
    assert.equal(after.email, NEEL_ACCOUNT_EMAIL);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
