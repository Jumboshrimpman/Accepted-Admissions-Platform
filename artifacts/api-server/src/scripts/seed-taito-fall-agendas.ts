/**
 * Seed complementary Fall 2026 Taito session agendas into Private tutor
 * guidance (`session_artifacts.kind = tutor_notes`) plus optional student
 * `objectives` / `callout` curriculum blocks.
 *
 * Discovers session IDs from the live Fall course + `TAITO_FALL_2026_SESSIONS`.
 * Does not invent IDs. Does not rematerialize quizzes or invite Clerk users.
 *
 * Usage (requires DATABASE_URL on the API host):
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/seed-taito-fall-agendas.ts --dry-run
 *   node --experimental-strip-types src/scripts/seed-taito-fall-agendas.ts
 *   node --experimental-strip-types src/scripts/seed-taito-fall-agendas.ts --force
 *
 * Flags:
 *   --dry-run               Report planned writes; do not persist.
 *   --force                 Overwrite tutor_notes that are not seed-marked.
 *   --skip-student-blocks   Tutor notes only (no objectives / callout).
 *
 * See docs/taito-fall-2026-session-agendas.md.
 */
import { seedTaitoFallAgendas } from "../lib/seed-taito-fall-agendas.ts";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const skipStudentBlocks = process.argv.includes("--skip-student-blocks");

const result = await seedTaitoFallAgendas({
  dryRun,
  force,
  skipStudentBlocks,
});

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      courseId: result.courseId,
      dryRun: result.dryRun,
      force: result.force,
      missingDateKeys: result.missingDateKeys,
      sessions: result.sessions,
      whereTutorsFindIt:
        "Tutor session page → Private tutor guidance (session_artifacts.kind = tutor_notes). Student-visible Session goals + score callout are published curriculum blocks.",
      verify: [
        "All 12 Fall Taito dates have tutor_notes, or missingDateKeys lists gaps.",
        "Re-run updates seed-marked notes and skips handwritten notes unless --force.",
        "Objectives / callout blocks keep seedKey taito-fall-2026-agenda-* (no duplicate rows).",
        "SAT / IELTS banks and quizzes were not rematerialized.",
        "Xavier capability-test session was not written.",
      ],
    },
    null,
    2,
  ),
);

if (!result.ok) {
  process.exitCode = 1;
}
