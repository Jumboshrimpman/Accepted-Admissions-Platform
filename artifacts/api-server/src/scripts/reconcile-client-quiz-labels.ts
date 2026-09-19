/**
 * Cos one-time cleanup for Taito client-preview quiz-list mismatches.
 *
 * Does NOT rematerialize SAT banks. Safe for Michelle/Xavier real clients:
 * only unassigns Taito from "SAT capability test — Xavier" sessions and
 * retitles stored diagnostic labels to the live question count.
 *
 * Usage (requires DATABASE_URL):
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/reconcile-client-quiz-labels.ts
 *
 * After deploy, boot seed also stops attaching Taito to the capability session.
 * Client lists hide Xavier capability quizzes from Taito even if this script
 * has not run yet. Run this once on prod so stored session client + titles
 * match what the portal already displays.
 */
import { reconcileClientQuizLabels } from "../lib/client-quiz-labels.ts";

const result = await reconcileClientQuizLabels();
console.log(
  JSON.stringify(
    {
      ok: true,
      unassignedCapabilitySessions: result.unassignedCapabilitySessions,
      retitledDiagnostics: result.retitledDiagnostics,
      verify: [
        "Taito portal / admin client preview quizzes: Eunice SAT + Nika English only.",
        "Xavier capability-test pre-work is not on Taito's list.",
        "Short clean diagnostics say SAT diagnostic (N clean questions), not Full-length.",
        "N is the live assignment question count (e.g. 104), not a stale 105.",
        "Michelle/Xavier real session homework was not rematerialized.",
      ],
    },
    null,
    2,
  ),
);
