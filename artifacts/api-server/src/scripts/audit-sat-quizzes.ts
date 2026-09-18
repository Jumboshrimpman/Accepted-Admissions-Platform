/**
 * Offline SAT/PSAT bank quality audit (JSONL only). Does not touch production.
 *
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/audit-sat-quizzes.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  listOfficialExtractFiles,
  parseCollegeBoardPayload,
  resolveCollegeBoardRoot,
} from "../lib/sat-bank-import.ts";
import {
  auditStudentQuizItem,
  canAssignCleanStudentQuizSet,
  canAssignDiagnostic,
  composeDiagnosticItems,
  isOfficialSatExtract,
  isStudentUsableQuizItem,
  isTrueSprQuizItem,
} from "../lib/sat-bank-diagnostic-quality.ts";
import { selectQuestionsForCountBudget } from "../lib/sat-bank-timing.ts";
import { TAITO_FALL_2026_SESSIONS, TAITO_FIRST_SAT_DATE_KEY } from "../lib/session-schedule.ts";

const root = resolveCollegeBoardRoot(path.resolve(process.cwd(), "../../content/college-board"));
const files = await listOfficialExtractFiles(root);
const packs: Array<Record<string, unknown>> = [];
const all = [];

for (const file of files.sort()) {
  const parsed = parseCollegeBoardPayload(await readFile(file, "utf8"), path.basename(file));
  const records = parsed.records;
  const usable = records.filter((row) => isStudentUsableQuizItem(row));
  const reasons: Record<string, number> = {};
  for (const row of records) {
    if (isStudentUsableQuizItem(row)) continue;
    for (const reason of auditStudentQuizItem(row).reasons) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }
  packs.push({
    file: path.basename(file),
    examFamily: records[0]?.examFamily ?? null,
    total: records.length,
    usable: usable.length,
    unusable: records.length - usable.length,
    rwUsable: usable.filter((row) => row.section !== "math").length,
    mathUsable: usable.filter((row) => row.section === "math").length,
    spr: records.filter((row) => isTrueSprQuizItem(row)).length,
    topDropReasons: Object.entries(reasons)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5),
  });
  all.push(...records);
}

const sat = all.filter((row) => isOfficialSatExtract(row));
const { selected, composition } = composeDiagnosticItems(sat, {
  preferredCollectionSlug: "sat-practice-test-4-digital",
  allowCrossCollectionFill: true,
});
const satUsable = sat.filter((row) => isStudentUsableQuizItem(row));
const routine = selectQuestionsForCountBudget(
  satUsable.map((row) => ({
    ...row,
    estimatedSeconds: row.estimatedSeconds || 90,
    skill: row.skill || row.section,
  })),
  { preferOriginalOrder: false },
);

const successiveSat = TAITO_FALL_2026_SESSIONS.filter((session) => session.subject === "SAT");

console.log(
  JSON.stringify(
    {
      ok: true,
      wrote: false,
      packs,
      satOfficial: {
        total: sat.length,
        usable: satUsable.length,
        rwUsable: satUsable.filter((row) => row.section !== "math").length,
        mathUsable: satUsable.filter((row) => row.section === "math").length,
      },
      oct2DiagnosticDryRun: {
        questionCount: composition.questionCount,
        rwCount: composition.rwCount,
        mathCount: composition.mathCount,
        modules: composition.modules,
        usable: composition.usable,
        residualJunk: composition.residualJunk,
        sprCount: composition.sprCount,
        duplicatePrompts: composition.duplicatePrompts,
        assignable: canAssignDiagnostic(composition, selected),
        filledFromOtherPacks: composition.filledFromOtherPacks,
        shortfall: composition.shortfall.questionCount,
      },
      successiveRoutineDryRun: {
        questionCount: routine.selected.length,
        rwCount: routine.selected.filter((row) => row.section !== "math").length,
        mathCount: routine.selected.filter((row) => row.section === "math").length,
        residualJunk: routine.selected.filter((row) => !isStudentUsableQuizItem(row)).length,
        assignable: canAssignCleanStudentQuizSet(routine.selected),
        note: "Autogen successive SAT sessions share this 30–50 pool; rebuild each session after deploy. They currently pick the same first 40 unless Cos assigns distinct collections.",
      },
      taitoSatSessions: successiveSat.map((session) => ({
        dateKey: session.dateKey,
        kind: session.dateKey === TAITO_FIRST_SAT_DATE_KEY ? "diagnostic" : "routine",
        tutor: session.tutorName,
      })),
      railwayAfterDeploy: [
        "POST /api/admin/sat-bank/rescore-usable",
        "POST /api/admin/sat-bank/refresh-linked   # rematerialize + drop junk on ALL live assignments",
        "POST /api/admin/sat-bank/drop-unusable-live  # unlink only, if import/refresh is flaky",
        "POST /api/admin/sat-bank/reset-first-sat-prework  # Oct 2 short clean rebuild",
        "POST /api/admin/sessions/:sessionId/reset-prework  # later SAT = routine 30–50, not a second diagnostic",
      ],
    },
    null,
    2,
  ),
);
