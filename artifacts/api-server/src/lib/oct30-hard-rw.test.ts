import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditStudentQuizItem } from "./sat-bank-diagnostic-quality.ts";
import { hasWrongFigureForStem } from "./sat-bank-figure-primary.ts";
import { routinePreworkTimeLimitMinutes } from "./sat-bank-timing.ts";
import {
  OCT30_HARD_MATH_COUNT,
  OCT30_HARD_PREWORK_COUNT,
  OCT30_HARD_RW_COUNT,
  composeOct30HardPrework,
  isOct30HardRwSourceKey,
  oct30HardRwBankRecords,
  oct30HardRwItems,
  oct30HardRwPreworkAction,
  oct30HardRwPreworkIsCurrent,
  oct30HardRwSourceKeys,
  planOct30HardRwBankWrite,
} from "./oct30-hard-rw.ts";
import {
  ORIGINAL_HARD_SAT_DATES,
  hardSatStudentFacing,
  planHardSatSessionSets,
  toRenderableHardSatInput,
  type HardSatCandidate,
} from "./sat-set-difficulty.ts";

const SKILL_COUNTS: Record<string, number> = {
  "Words in Context": 3,
  "Text Structure and Purpose": 2,
  "Cross-Text Connections": 2,
  "Central Ideas and Details": 2,
  "Command of Evidence": 4,
  Inferences: 3,
  "Rhetorical Synthesis": 2,
  Transitions: 1,
  Boundaries: 2,
  "Form, Structure, and Sense": 1,
};

function wordsOnly(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("Oct 30 reading items are hard, keyed, and render without figures", () => {
  const items = oct30HardRwItems();
  const records = oct30HardRwBankRecords();
  assert.equal(items.length, OCT30_HARD_RW_COUNT);
  assert.equal(records.length, OCT30_HARD_RW_COUNT);
  assert.equal(new Set(items.map((item) => item.sourceKey)).size, OCT30_HARD_RW_COUNT);
  assert.ok(!(ORIGINAL_HARD_SAT_DATES as readonly string[]).includes("2026-10-30"));
  const counted = new Map<string, number>();
  for (const item of items) counted.set(item.skill, (counted.get(item.skill) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(counted), SKILL_COUNTS);
  assert.equal(
    items.filter((item) => item.skill === "Command of Evidence" && /data from the table/i.test(item.prompt))
      .length,
    1,
  );
  assert.equal(
    items.filter((item) => item.skill === "Command of Evidence" && /gauge readings/i.test(item.prompt)).length,
    1,
  );
  assert.ok(items.some((item) => item.correctText === "inimical to"));
  const harbor = items.find((item) => item.questionNumber === 16);
  assert.ok(harbor);
  assert.equal(harbor.correctText, "inimical to");
  assert.ok(harbor.choices.some((choice) => choice.text === "brusque toward"));
  assert.ok(harbor.choices.some((choice) => choice.text === "solicitous of"));
  assert.equal(harbor.choices.some((choice) => choice.text === "curt toward"), false);
  assert.equal(harbor.choices.some((choice) => /hostile|antithetical/i.test(choice.text)), false);
  const ledger = items.find((item) => item.questionNumber === 35);
  assert.ok(ledger);
  assert.equal(ledger.correctText, "; a different clerk filed the June tally.");
  assert.ok(ledger.choices.some((choice) => choice.text === "a different clerk filed the June tally."));
  assert.equal(ledger.choices.some((choice) => choice.text.includes("—")), false);
  const logFile = items.find((item) => item.questionNumber === 29);
  assert.ok(logFile);
  assert.equal(
    logFile.correctText,
    "falls short of the circular's condition for entry, because the witness left before signing and the circular places the log entry after that signature",
  );
  assert.equal(/unentered/i.test(logFile.correctText), false);
  const folios = items.find((item) => item.questionNumber === 33);
  assert.ok(folios);
  assert.equal(folios.correctText, "is");
  assert.ok(folios.choices.some((choice) => choice.text === "have been"));
  assert.equal(folios.choices.some((choice) => choice.text === "was"), false);
  const praise = items.find((item) => item.questionNumber === 21);
  assert.ok(praise);
  assert.match(praise.stimulus, /ambassador's public praise/);
  assert.equal(/plotted/i.test(items.map((item) => item.stimulus).join("\n")), false);
  const templateChoice =
    /timing in the first account is too (?:early|late)|pattern holds in a further case|stated rule fails under a condition/i;

  for (const item of items) {
    assert.equal(item.stimulus.split("___").length - 1 <= 1, true, item.sourceKey);
    assert.ok(item.explanation.length > 40, item.sourceKey);
    assert.ok(item.difficultyNote.length >= 40, item.sourceKey);
    const keyed = item.choices.find((choice) => choice.id === item.correctAnswer);
    assert.ok(keyed, item.sourceKey);
    assert.equal(keyed.text, item.correctText, item.sourceKey);
    const record = records.find((row) => row.sourceKey === item.sourceKey);
    assert.ok(record, item.sourceKey);
    assert.equal(record.sourceKind, "original_hard");
    assert.equal(record.module, 2);
    assert.equal(record.section, "rw");
    assert.deepEqual(record.figures, []);
    assert.equal(record.correctAnswer, item.correctAnswer);
    const match = record.choices.find((choice) => choice.id === record.correctAnswer);
    assert.equal(match?.text, keyed.text);
    assert.equal(new Set(record.choices.map((choice) => choice.text)).size, 4, item.sourceKey);
    const facingInput = toRenderableHardSatInput({
      id: item.sourceKey,
      sourceKey: item.sourceKey,
      examFamily: "sat",
      sourceKind: "original_hard",
      section: "rw",
      module: 2,
      questionNumber: item.questionNumber,
      prompt: item.prompt,
      stimulus: item.stimulus,
      choices: item.choices,
      figures: [],
      questionType: "mcq",
      correctAnswer: item.correctAnswer,
      officialExplanation: item.explanation,
      domain: item.domain,
      skill: item.skill,
      difficulty: "H",
    });
    const audit = auditStudentQuizItem(facingInput);
    assert.deepEqual(audit.reasons, [], `${item.sourceKey} ${audit.reasons.join(",")}`);
    const facing = hardSatStudentFacing(facingInput);
    assert.ok(facing, item.sourceKey);
    assert.equal(facing.correctAnswer, item.correctAnswer);
    const faced = facing.choices.find((choice) => choice.id === facing.correctAnswer);
    assert.equal(faced?.text, keyed.text, item.sourceKey);
    assert.equal(
      hasWrongFigureForStem({ prompt: item.prompt, stimulus: item.stimulus, figures: [] }),
      false,
      item.sourceKey,
    );
    assert.equal(templateChoice.test(item.stimulus), false, item.sourceKey);
    for (const choice of item.choices) {
      assert.equal(templateChoice.test(choice.text), false, `${item.sourceKey} ${choice.text}`);
    }
    if (item.skill === "Cross-Text Connections") {
      const words = item.stimulus.trim().split(/\s+/).filter(Boolean);
      assert.ok(words.length >= 100 && words.length <= 150, `${item.sourceKey} ${words.length} words`);
    }
    if (item.skill === "Boundaries") {
      const norms = item.choices.map((choice) => wordsOnly(choice.text));
      assert.equal(new Set(norms).size, 1, `${item.sourceKey} ${norms.join(" | ")}`);
      if (item.questionNumber === 34) {
        assert.match(item.choices.map((choice) => choice.text).join("\n"), /—/);
      }
    }
    if (item.skill === "Rhetorical Synthesis") {
      const notes = item.stimulus.split("\n").filter((line) => line.startsWith("- "));
      assert.ok(notes.length >= 5 && notes.length <= 6, `${item.sourceKey} ${notes.length} notes`);
      assert.equal(/\bonly\b/i.test(item.prompt), false, item.prompt);
    }
  }
  assert.equal(routinePreworkTimeLimitMinutes(OCT30_HARD_PREWORK_COUNT), 50);
});

test("Oct 30 pre-work keeps official math and does not enter other hard sessions", () => {
  const reading = oct30HardRwItems().map((item) => ({
    id: item.sourceKey,
    bankId: `bank-${item.sourceKey}`,
    sourceKey: item.sourceKey,
    sourceKind: "original_hard",
    section: "rw",
    module: 2,
    questionNumber: item.questionNumber,
    practiceTestNumber: null,
  }));
  const math = Array.from({ length: 22 }, (_, index) => {
    const questionNumber = 22 - index;
    return {
      id: `math-${questionNumber}`,
      bankId: `bank-math-${questionNumber}`,
      sourceKey: `sat-pt4-math-m2-q${questionNumber}`,
      sourceKind: "official_extract",
      section: "math",
      module: 2,
      questionNumber,
      practiceTestNumber: 4,
    };
  });
  const officialRw = [27, 26, 20, 15].map((questionNumber) => ({
    id: `rw-${questionNumber}`,
    bankId: `bank-rw-${questionNumber}`,
    sourceKey: `sat-pt4-rw-m2-q${questionNumber}`,
    sourceKind: "official_extract",
    section: "rw",
    module: 2,
    questionNumber,
    practiceTestNumber: 4,
  }));
  const existingMath = math.slice(0, OCT30_HARD_MATH_COUNT).map((item) => item.sourceKey);
  const composed = composeOct30HardPrework({
    pool: [...reading, ...math, ...officialRw],
    existingSourceKeys: [...existingMath, "sat-pt4-rw-m2-q27"],
  });
  assert.equal(composed.complete, true);
  assert.equal(composed.prework.length, OCT30_HARD_PREWORK_COUNT);
  const rw = composed.prework.filter((item) => isOct30HardRwSourceKey(item.sourceKey));
  const keptMath = composed.prework.filter((item) => item.section === "math");
  assert.equal(rw.length, OCT30_HARD_RW_COUNT);
  assert.equal(keptMath.length, OCT30_HARD_MATH_COUNT);
  assert.deepEqual(
    keptMath.map((item) => item.sourceKey).sort(),
    existingMath.slice().sort(),
  );
  for (const item of keptMath) {
    assert.equal(math.find((row) => row.sourceKey === item.sourceKey), item);
  }
  assert.equal(composed.prework.some((item) => item.sourceKey === "sat-pt4-rw-m2-q27"), false);

  const fresh = composeOct30HardPrework({ pool: [...reading, ...math, ...officialRw] });
  assert.deepEqual(
    fresh.prework.filter((item) => item.section === "math").map((item) => item.questionNumber),
    math.slice(0, OCT30_HARD_MATH_COUNT).map((item) => item.questionNumber),
  );

  const keys = oct30HardRwSourceKeys();
  assert.equal(oct30HardRwPreworkAction({ attemptCount: 1, assignmentKeyLists: [keys] }), "blocked");
  assert.equal(
    oct30HardRwPreworkAction({
      attemptCount: 0,
      assignmentKeyLists: [[...keys, ...existingMath]],
    }),
    "unchanged",
  );
  assert.equal(oct30HardRwPreworkIsCurrent([...keys, ...existingMath]), true);
  assert.equal(
    oct30HardRwPreworkAction({
      attemptCount: 0,
      assignmentKeyLists: [["sat-pt4-rw-m2-q27", ...existingMath]],
    }),
    "replace",
  );
  assert.equal(
    oct30HardRwPreworkAction({
      attemptCount: 2,
      assignmentKeyLists: [["sat-pt4-rw-m2-q27", ...existingMath]],
    }),
    "blocked",
  );

  const planned = planHardSatSessionSets(
    [...reading, ...math, ...officialRw] as HardSatCandidate[],
    { preworkTarget: 4, preworkMax: 4, inSessionMax: 2 },
  );
  assert.equal(planned.prework.some((item) => isOct30HardRwSourceKey(item.sourceKey)), false);
  assert.equal(planned.inSession.some((item) => isOct30HardRwSourceKey(item.sourceKey)), false);
});

test("Oct 30 reading bank plan writes only new or changed rows", () => {
  const records = oct30HardRwBankRecords();
  const first = planOct30HardRwBankWrite([], records);
  assert.equal(first.insert, OCT30_HARD_RW_COUNT);
  assert.equal(first.update, 0);
  assert.equal(first.unchanged, 0);
  assert.equal(first.writeKeys.length, OCT30_HARD_RW_COUNT);
  const second = planOct30HardRwBankWrite(records, records);
  assert.deepEqual(second, { insert: 0, update: 0, unchanged: OCT30_HARD_RW_COUNT, writeKeys: [] });
  const changed = records.map((record, index) =>
    index === 0 ? { ...record, prompt: `${record.prompt} extra` } : record,
  );
  const third = planOct30HardRwBankWrite(changed, records);
  assert.equal(third.insert, 0);
  assert.equal(third.update, 1);
  assert.equal(third.unchanged, OCT30_HARD_RW_COUNT - 1);
  assert.deepEqual(third.writeKeys, [records[0]!.sourceKey]);
});

test("Oct 30 startup swaps only an unattempted reading half and logs the plan", () => {
  const hardSets = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  const boot = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(hardSets, /composeOct30HardPrework/);
  assert.match(hardSets, /notifyOct30ReadingLeftInPlace/);
  assert.match(hardSets, /dryRun: true/);
  assert.match(hardSets, /if \(plan\.writeKeys\.length === 0\) return/);
  assert.match(boot, /readingLeftInPlace: result\.readingLeftInPlace/);
  assert.doesNotMatch(boot, /original-hard-sat|originalHardSatBankRecords|runCollegeBoardReimport/);
  const ensure = hardSets.slice(
    hardSets.indexOf("export async function ensureHardSatPrework"),
    hardSets.indexOf("export async function officialHardInSessionItems"),
  );
  assert.match(ensure, /oct30HardRwPreworkAction/);
  assert.match(ensure, /readingLeftInPlace/);
  assert.doesNotMatch(ensure, /ORIGINAL_HARD_SAT_DATES/);
  const archive = hardSets.slice(
    hardSets.indexOf("async function archiveUnattemptedAssignment"),
    hardSets.indexOf("async function sourceKeysForAssignment"),
  );
  assert.match(archive, /db\.transaction/);
  assert.match(archive, /for update/);
  assert.match(archive, /if \(Number\(count\) > 0\) return/);
  const service = readFileSync(new URL("./sat-bank-service.ts", import.meta.url), "utf8");
  const serviceArchive = service.slice(
    service.indexOf("async function archiveAssignmentIfUnattempted"),
    service.indexOf("async function archiveSessionPrework"),
  );
  assert.match(serviceArchive, /db\.transaction/);
  assert.match(serviceArchive, /for update/);
  assert.match(serviceArchive, /if \(Number\(count\) > 0\) return/);
});
