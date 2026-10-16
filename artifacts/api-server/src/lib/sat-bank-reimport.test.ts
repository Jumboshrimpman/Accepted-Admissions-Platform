import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedBankRecord } from "./sat-bank-import.ts";
import {
  planBankReimportDiff,
  reimportApplySourceKeys,
  reimportContentFromRecord,
  reimportFingerprint,
} from "./sat-bank-reimport.ts";

function record(overrides: Partial<ParsedBankRecord> & Pick<ParsedBankRecord, "sourceKey">): ParsedBankRecord {
  return {
    dedupKey: overrides.dedupKey ?? overrides.sourceKey,
    examFamily: "sat",
    examVariant: "digital",
    practiceTestNumber: 7,
    formCode: null,
    section: "math",
    module: 2,
    questionNumber: 25,
    position: 25,
    collectionSlug: "sat-practice-test-7-digital",
    collectionTitle: "SAT Practice Test 7",
    prompt: "Which expression is equivalent?",
    stimulus: null,
    choices: [
      { id: "a", label: "A", text: "√109" },
      { id: "b", label: "B", text: "√149" },
      { id: "c", label: "C", text: "√167" },
      { id: "d", label: "D", text: "√341" },
    ],
    correctAnswer: "C",
    officialExplanation: "Choice C is correct.",
    figures: [],
    scoring: {},
    skill: "Advanced Math",
    domain: "Advanced Math",
    difficulty: "H",
    questionType: "mcq",
    estimatedSeconds: 90,
    sourceKind: "official_extract",
    sourceFiles: {},
    assets: [],
    extractGaps: {
      skillDifficultyAbsent: false,
      missingPrompt: false,
      missingChoices: false,
      figuresIncomplete: false,
      spr: false,
      figurePrimary: false,
      notes: [],
    },
    assignable: true,
    ...overrides,
  };
}

test("bank reimport is idempotent, rejects unknown ids, and leaves matching rows unchanged", () => {
  const repaired = record({ sourceKey: "sat-pt7-math-m2-q25" });
  const garbled = record({
    sourceKey: "sat-pt7-math-m2-q25",
    prompt: "Which expression is equivalent?",
    choices: [
      { id: "a", label: "A", text: "109" },
      { id: "b", label: "B", text: "149" },
      { id: "c", label: "C", text: "167" },
      { id: "d", label: "D", text: "341" },
    ],
  });
  const other = record({
    sourceKey: "sat-pt5-rw-m2-q15",
    section: "rw",
    questionNumber: 15,
    prompt: "Which choice completes the text?",
  });
  const duplicate = record({
    sourceKey: "sat-pt11-math-m2-q26",
    dedupKey: "dup-a",
    questionNumber: 26,
  });
  const firstPlan = planBankReimportDiff({
    records: [repaired, other, duplicate, { ...duplicate, dedupKey: "dup-b" }, record({ sourceKey: "seed-1", sourceKind: "seed" })],
    duplicatesInFile: ["sat-pt4-math-m2-q18"],
    existing: [
      { ...reimportContentFromRecord(garbled), linkedQuestionId: "question-attempted" },
      { ...reimportContentFromRecord(other), linkedQuestionId: null },
      { ...reimportContentFromRecord(duplicate), linkedQuestionId: null },
      { ...reimportContentFromRecord(duplicate), linkedQuestionId: "second-row" },
    ],
  });
  assert.deepEqual(firstPlan.updates, ["sat-pt7-math-m2-q25"]);
  assert.deepEqual(firstPlan.hardMathTailUpdates, ["sat-pt7-math-m2-q25"]);
  assert.deepEqual(firstPlan.unchanged, ["sat-pt5-rw-m2-q15"]);
  assert.deepEqual(firstPlan.duplicateBankSourceKeys, ["sat-pt11-math-m2-q26"]);
  assert.ok(firstPlan.duplicatesSkipped.includes("sat-pt11-math-m2-q26"));
  assert.ok(firstPlan.duplicatesSkipped.includes("sat-pt4-math-m2-q18"));
  assert.deepEqual(firstPlan.skippedSeeds, ["seed-1"]);
  assert.deepEqual(firstPlan.inserts, []);

  const rejected = reimportApplySourceKeys(
    ["sat-pt7-math-m2-q25", "not-in-the-file"],
    firstPlan,
  );
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.deepEqual(rejected.rejectedIds, ["not-in-the-file"]);

  const duplicateRejected = reimportApplySourceKeys(["sat-pt11-math-m2-q26"], firstPlan);
  assert.equal(duplicateRejected.ok, false);

  const applied = reimportApplySourceKeys(["sat-pt7-math-m2-q25", "sat-pt5-rw-m2-q15"], firstPlan);
  assert.equal(applied.ok, true);
  if (applied.ok) {
    assert.deepEqual(applied.sourceKeys, ["sat-pt7-math-m2-q25", "sat-pt5-rw-m2-q15"]);
  }

  const second = planBankReimportDiff({
    records: [repaired, other],
    existing: [
      { ...reimportContentFromRecord(repaired), linkedQuestionId: "question-attempted" },
      { ...reimportContentFromRecord(other), linkedQuestionId: null },
    ],
  });
  assert.deepEqual(second.updates, []);
  assert.deepEqual(second.inserts, []);
  assert.deepEqual(second.unchanged, ["sat-pt7-math-m2-q25", "sat-pt5-rw-m2-q15"]);
  assert.equal(
    reimportFingerprint(reimportContentFromRecord(repaired)),
    reimportFingerprint({
      ...reimportContentFromRecord(repaired),
      prompt: `  ${repaired.prompt}  `,
      officialExplanation: repaired.officialExplanation,
    }),
  );

  const missing = planBankReimportDiff({
    records: [repaired],
    existing: [],
  });
  assert.deepEqual(missing.inserts, ["sat-pt7-math-m2-q25"]);
  assert.equal(reimportApplySourceKeys([], missing).ok, false);
});
