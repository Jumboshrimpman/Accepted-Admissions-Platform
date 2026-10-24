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

const REQUIRED_SKILLS = [
  "Words in Context",
  "Cross-Text Connections",
  "Inferences",
  "Rhetorical Synthesis",
  "Boundaries",
] as const;

test("Oct 30 reading items are hard, keyed, and render without figures", () => {
  const items = oct30HardRwItems();
  const records = oct30HardRwBankRecords();
  assert.equal(items.length, OCT30_HARD_RW_COUNT);
  assert.equal(records.length, OCT30_HARD_RW_COUNT);
  assert.equal(new Set(items.map((item) => item.sourceKey)).size, OCT30_HARD_RW_COUNT);
  assert.ok(!(ORIGINAL_HARD_SAT_DATES as readonly string[]).includes("2026-10-30"));
  const skills = new Set(items.map((item) => item.skill));
  for (const skill of REQUIRED_SKILLS) assert.ok(skills.has(skill), skill);
  assert.equal(items.filter((item) => item.skill === "Words in Context").length, 5);
  assert.equal(items.filter((item) => item.skill === "Cross-Text Connections").length, 4);
  assert.equal(items.filter((item) => item.skill === "Inferences").length, 4);
  assert.equal(items.filter((item) => item.skill === "Rhetorical Synthesis").length, 4);
  assert.equal(items.filter((item) => item.skill === "Boundaries").length, 5);

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
    if (item.skill === "Cross-Text Connections") {
      const words = item.stimulus.trim().split(/\s+/).filter(Boolean);
      assert.ok(words.length >= 100 && words.length <= 150, `${item.sourceKey} ${words.length} words`);
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
});
