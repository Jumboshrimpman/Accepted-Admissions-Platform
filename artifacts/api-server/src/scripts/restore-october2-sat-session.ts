/**
 * One-shot + durable restore for the October 2, 2026 SAT diagnostic session.
 *
 * Makes the 9:00–10:00 PM JST slot Published + Confirmed on the Fall 2026
 * course, assigned to samapostgrad@gmail.com so it is visible on that client
 * portal. Tutor is Xavier (xaver.rmz6@gmail.com) when the slot has no tutor
 * yet; an existing Eunice assignment is kept. Recreates the slot if missing.
 * Attaches full-length diagnostic pre-work only when none exists.
 * Does not wipe the SAT bank or reset diagnostic attempts.
 *
 * Usage (requires DATABASE_URL):
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/restore-october2-sat-session.ts --dry-run
 *   node --experimental-strip-types src/scripts/restore-october2-sat-session.ts
 *
 * Railway production (from repo root, linked to the API service):
 *   railway run -s <api-service> -e production -- \
 *     node --experimental-strip-types artifacts/api-server/src/scripts/restore-october2-sat-session.ts --dry-run
 *   railway run -s <api-service> -e production -- \
 *     node --experimental-strip-types artifacts/api-server/src/scripts/restore-october2-sat-session.ts
 *
 * After deploy, Admin → Curriculum also runs this via ensureSeedData.
 * Inspect without writing:
 *   GET /api/admin/sat-bank/october2-session
 */
import { restoreTaitoOctober2SatSession } from "../lib/october2-session-restore.ts";

const dryRun = process.argv.includes("--dry-run");

const result = await restoreTaitoOctober2SatSession({ dryRun });
console.log(
  JSON.stringify(
    {
      ok: true,
      ...result,
      verify: [
        "Fall 2026 SAT & IELTS has an SAT session at 2026-10-02T12:00:00.000Z (9 PM JST).",
        "status is published and bookingStatus is confirmed.",
        "Student is samapostgrad@gmail.com (portal-visible).",
        "Tutor is xaver.rmz6@gmail.com or eunice_chon@berkeley.edu.",
        "cancelledAt and cancellationReason are cleared.",
        "Active before_session diagnostic pre-work is attached when the bank is imported.",
        "SAT question bank row counts are unchanged.",
        "A second run is a no-op (created=false, restoredSessionIds=[]).",
      ],
      adminUi: [
        "Admin → Curriculum → Sessions & meetings → filter All (Upcoming hides cancelled/archived).",
        "Search October 2 or samapostgrad.",
        "Confirm Published, Confirmed, 60 min, Asia/Tokyo, student Sama, tutor Xavier or Eunice.",
      ],
      notes: [
        "Does not re-debit SAT credits if samapostgrad received a cancel restore.",
        "Later swap tutor to Eunice from Admin session edit; seed will keep Eunice once set.",
        "Do not run reset-october2-prework.ts unless you intend to wipe diagnostic attempts.",
      ],
    },
    null,
    2,
  ),
);
