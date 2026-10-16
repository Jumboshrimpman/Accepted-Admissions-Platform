/**
 * Link three existing Clerk logins to existing portal users.
 *
 * Does not create Clerk users, send email, or change users.email,
 * users.display_name, users.role, or users.clerk_user_id.
 * Does not map xsfam6@gmail.com. Does not touch samapostgrad.
 *
 * Dry-run is the default. Stdout is the operator review record
 * (before SELECT, plan, after SELECT). Application logs omit these addresses.
 *
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/link-portal-login-aliases.ts
 *   node --experimental-strip-types src/scripts/link-portal-login-aliases.ts --apply
 *   node --experimental-strip-types src/scripts/link-portal-login-aliases.ts --rollback
 */
import { pool } from "@workspace/db";
import { planPortalLoginAliases } from "../lib/portal-login-aliases.ts";
import {
  applyLoginAliasPlan,
  dryRunPreview,
  loadLoginAliasSnapshot,
  rollbackLoginAliases,
} from "../lib/portal-login-alias-store.ts";

const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback");

function printSection(label: string, value: unknown) {
  console.log(`\n${label}`);
  console.log(JSON.stringify(value, null, 2));
}

if (apply && rollback) {
  console.error("Pass only one of --apply or --rollback.");
  process.exit(1);
}

try {
  const before = await loadLoginAliasSnapshot();
  printSection("BEFORE SELECT", before.select);

  if (rollback) {
    const removed = await rollbackLoginAliases();
    const after = await loadLoginAliasSnapshot();
    printSection("ROLLBACK removed alias emails", removed);
    printSection("AFTER SELECT", after.select);
    console.log(
      "\nRollback deleted alias rows for the mapped logins only. User rows were not updated.",
    );
  } else {
    const preview = dryRunPreview(before.users, before.aliases);
    printSection("PLAN", preview.plan);
    if (!preview.plan.ok) {
      printSection("AFTER SELECT (not written)", before.select);
      console.error("\nBlocked. No alias rows were written.");
      process.exitCode = 1;
    } else if (!apply) {
      printSection("AFTER SELECT (dry run, not written)", preview.after);
      console.log("\nDry run only. Re-run with --apply to write alias rows.");
    } else {
      await applyLoginAliasPlan(planPortalLoginAliases({
        users: before.users,
        aliases: before.aliases,
      }));
      const after = await loadLoginAliasSnapshot();
      printSection("AFTER SELECT", after.select);
      console.log(
        "\nApplied. User contact emails, names, roles, and clerk ids were not updated.",
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
