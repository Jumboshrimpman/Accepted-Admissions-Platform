/**
 * Email the allowlisted student and that session's tutor 24 hours and 1 hour
 * before a confirmed session. Parent and viewer accounts are not recipients.
 *
 * Dry-run prints the plan and does not send or write. Requires DATABASE_URL.
 * Unset RESEND_API_KEY before a local run so nothing is delivered.
 *
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/send-session-reminders.ts --dry-run
 *   node --experimental-strip-types src/scripts/send-session-reminders.ts
 */
import { pool } from "@workspace/db";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { runSessionReminders } from "../lib/session-reminder-run.ts";

const dryRun = process.argv.includes("--dry-run");

try {
  const result = await runSessionReminders({ dryRun });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
