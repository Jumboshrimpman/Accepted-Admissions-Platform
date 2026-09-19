/**
 * One-shot Cos cleanup: archive extra live before-session homework of the
 * same kind on a session. Keeps the newest complete assignment.
 *
 * Does not rematerialize banks, scrape official IELTS/SAT, or send Clerk
 * invites. Safe to re-run (idempotent once extras are archived).
 *
 * Usage (requires DATABASE_URL on the API host):
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/archive-duplicate-session-prework.ts --dry-run
 *   node --experimental-strip-types src/scripts/archive-duplicate-session-prework.ts
 *
 * See docs/session-prework-dedupe.md.
 */
import { archiveExtraLiveSessionPrework } from "../lib/session-prework-live.ts";

const dryRun = process.argv.includes("--dry-run");
const courseIdFlag = process.argv.find((arg) => arg.startsWith("--course-id="));
const courseId = courseIdFlag?.slice("--course-id=".length).trim() || undefined;

const result = await archiveExtraLiveSessionPrework({
  courseId,
  dryRun,
});

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      dryRun: result.dryRun,
      courseId: result.courseId,
      archivedAssignments: result.archivedAssignments,
      sessions: result.sessions,
      verify: [
        "Taito English Oct 23 / Nov 13 / Dec 4 should each have one live before-session homework.",
        "Oct 9 SAT should have one live “SAT Homework — Grammar and Boundaries” (extras archived).",
        "Keeper is the newest complete assignment (has questions); empties are archived first.",
        "Re-run ensureSeedData / this script must not create new quiz rows.",
        "SAT / IELTS banks were not rematerialized. No Clerk invites.",
      ],
    },
    null,
    2,
  ),
);

if (!result.ok) {
  process.exitCode = 1;
}
