/**
 * Rebuild Taito's October 2 full-length SAT diagnostic from usable MCQ bank rows.
 *
 * Default: rematerialize the current linked (non-fork) questions, archive the
 * broken assignment, and attach a new MCQ-only diagnostic (PT4 modules, dropped
 * SPR/OCR replaced with clean SAT MCQs from other official packs).
 *
 * Usage (requires DATABASE_URL):
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/reset-october2-prework.ts
 *
 * Flags:
 *   --refresh-linked-only  Update bank-linked question content in place. Does
 *                          not archive or rebuild. Skips session-local forks.
 *   --no-reassign          Archive the current Oct 2 pre-work and stop.
 *
 * See docs/sat-diagnostic-october2.md for the production runbook.
 */
import { resetTaitoFirstSatPrework } from "../lib/sat-bank-service.ts";

const refreshLinkedOnly = process.argv.includes("--refresh-linked-only");
const reassignDiagnostic = !process.argv.includes("--no-reassign");

const result = await resetTaitoFirstSatPrework({
  reassignDiagnostic: refreshLinkedOnly ? false : reassignDiagnostic,
  refreshLinkedOnly,
});
console.log(
  JSON.stringify(
    {
      ok: true,
      sessionId: result.sessionId,
      archivedAssignments: result.archivedAssignments,
      deletedAttempts: result.deletedAttempts,
      rematerialized: result.rematerialized,
      reassignedAssignmentId: result.reassigned?.assignmentId ?? null,
      reassignedQuestionCount: result.reassigned?.questionCount ?? null,
      reassignedMinutes: result.reassigned?.targetMinutes ?? null,
      assignBlocked: result.assignBlocked,
      composition: result.composition,
      verify: [
        "Fail-closed: usable:true only for a complete clean 120 with zero residual junk.",
        "If assignBlocked, the old assignment was rematerialized (junk unlinked) but not replaced.",
        "Shortfall counts/reasons are explicit — do not pad with OCR junk to hit 120.",
        "Math visual cites need recovered table values or a full-question crop, not a page-neighbor PNG.",
        "No SPR text boxes, empty stems, or duplicate module prompts.",
        "Session-local forks on other meetings were not rewritten.",
      ],
    },
    null,
    2,
  ),
);
