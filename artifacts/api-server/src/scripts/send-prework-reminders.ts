/**
 * Email students who still have unstarted pre-work before a session
 * in the next 24 hours.
 *
 * Dry-run prints the plan and does not send or write. Requires DATABASE_URL.
 *
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/send-prework-reminders.ts --dry-run
 *   node --experimental-strip-types src/scripts/send-prework-reminders.ts
 *
 * See docs/prework-reminders.md.
 */
import { pool } from "@workspace/db";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { runPreworkReminders } from "../lib/prework-reminder-run.ts";

const dryRun = process.argv.includes("--dry-run");

try {
  const result = await runPreworkReminders({ dryRun });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
