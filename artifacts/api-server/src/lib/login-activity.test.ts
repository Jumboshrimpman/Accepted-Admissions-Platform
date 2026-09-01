import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db, loginActivityTable, usersTable } from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { recordSuccessfulLogin } from "./login-activity.ts";

test("successful login activity is recorded once per Clerk session", async () => {
  const suffix = randomUUID();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `login-test-${suffix}`,
      email: `login-${suffix}@example.invalid`,
      displayName: "Login Activity Test",
      role: "student",
    })
    .returning();

  try {
    await recordSuccessfulLogin(user!.id, `session-${suffix}`);
    await recordSuccessfulLogin(user!.id, `session-${suffix}`);
    await recordSuccessfulLogin(user!.id, undefined);

    const rows = await db
      .select()
      .from(loginActivityTable)
      .where(eq(loginActivityTable.userId, user!.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.clerkSessionId, `session-${suffix}`);
  } finally {
    await db
      .delete(loginActivityTable)
      .where(eq(loginActivityTable.userId, user!.id));
    await db.delete(usersTable).where(eq(usersTable.id, user!.id));
  }
});