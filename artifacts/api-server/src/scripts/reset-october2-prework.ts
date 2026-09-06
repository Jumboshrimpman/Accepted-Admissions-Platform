/**
 * One-shot admin reset for Taito's first Fall SAT session (October 2).
 *
 * Clears that session's before_session attempts, submissions, diagnostic
 * results, and pre-work plan, then re-attaches the full-length diagnostic.
 * Does not wipe the College Board question bank.
 *
 * Usage (requires DATABASE_URL):
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/reset-october2-prework.ts
 *
 * Optional: --no-reassign  reset attempts only, leave the assignment archived.
 */
import { resetTaitoFirstSatPrework } from "../lib/sat-bank-service.ts";

const reassignDiagnostic = !process.argv.includes("--no-reassign");

const result = await resetTaitoFirstSatPrework({ reassignDiagnostic });
console.log(
  JSON.stringify(
    {
      ok: true,
      sessionId: result.sessionId,
      archivedAssignments: result.archivedAssignments,
      deletedAttempts: result.deletedAttempts,
      reassignedAssignmentId: result.reassigned?.assignmentId ?? null,
      reassignedQuestionCount: result.reassigned?.questionCount ?? null,
      reassignedMinutes: result.reassigned?.targetMinutes ?? null,
      verify: [
        "Oct 2 Taito SAT pre-work has no leftover submitted/empty attempts.",
        "New assignment title looks like Full-length SAT diagnostic — …",
        "Question count is a complete Practice Test 4–11 pack (≥80).",
        "Time limit is ≥134 minutes.",
        "Student start → answer at least one item → submit shows an estimated SAT range.",
        "Empty submit stays blocked.",
      ],
    },
    null,
    2,
  ),
);
