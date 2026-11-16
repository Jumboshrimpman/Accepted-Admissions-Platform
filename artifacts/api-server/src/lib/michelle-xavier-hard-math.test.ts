import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { MICHELLE_XAVIER_HARD_MATH_DRAFTS } from "./michelle-xavier-hard-math-drafts.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  michelleXavierHardMathBankRecords,
  michelleXavierHardMathItems,
} from "./michelle-xavier-hard-math.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { isRenderableHardSatItem, toRenderableHardSatInput } from "./sat-set-difficulty.ts";

test("Michelle Xavier drafts are 60 unique hard SAT math items with integer answers", () => {
  assert.equal(MICHELLE_XAVIER_HARD_MATH_DRAFTS.length, 60);
  const prompts = new Set<string>();
  const domains = new Set<string>();
  for (const draft of MICHELLE_XAVIER_HARD_MATH_DRAFTS) {
    const solved = draft.solve();
    assert.equal(Number.isInteger(solved), true, draft.prompt);
    assert.equal(draft.wrong.includes(solved), false, draft.prompt);
    assert.equal(new Set(draft.wrong).size, 3, draft.prompt);
    assert.ok(draft.because.length > 0);
    assert.ok(!prompts.has(draft.prompt), draft.prompt);
    prompts.add(draft.prompt);
    domains.add(draft.domain);
  }
  assert.ok(domains.has("Algebra"));
  assert.ok(domains.has("Advanced Math"));
  assert.ok(domains.has("Problem-Solving and Data Analysis"));
  assert.ok(domains.has("Geometry and Trigonometry"));
});

test("built Michelle Xavier items have a matching correct choice, hard tag, and render", () => {
  const items = michelleXavierHardMathItems();
  const records = michelleXavierHardMathBankRecords();
  assert.equal(items.length, 60);
  assert.equal(records.length, 60);
  const keys = new Set<string>();
  for (const [index, item] of items.entries()) {
    const solved = item.solve();
    const correct = item.choices.find((choice) => choice.label?.toLowerCase() === item.correctAnswer);
    assert.ok(correct, item.sourceKey);
    assert.equal(correct!.text, String(solved));
    assert.ok(item.sourceKey.startsWith("original-hard-michelle-2026-11-22-math-"));
    assert.equal(keys.has(item.sourceKey), false);
    keys.add(item.sourceKey);
    const record = records[index]!;
    assert.equal(record.sourceKind, "original_hard");
    assert.equal(record.difficulty, "hard");
    assert.equal(record.section, "math");
    assert.equal(record.module, 2);
    assert.equal(record.questionType, "mcq");
    assert.equal(record.assignable, true);
    assert.equal(
      isRenderableHardSatItem(
        toRenderableHardSatInput({
          id: record.sourceKey,
          sourceKey: record.sourceKey,
          examFamily: record.examFamily,
          sourceKind: record.sourceKind,
          section: record.section,
          module: record.module,
          questionNumber: record.questionNumber,
          practiceTestNumber: record.practiceTestNumber,
          prompt: record.prompt,
          stimulus: record.stimulus,
          choices: record.choices,
          figures: record.figures,
          questionType: record.questionType,
          correctAnswer: record.correctAnswer,
          officialExplanation: record.officialExplanation,
          extractGaps: record.extractGaps,
          domain: record.domain,
          skill: record.skill,
          difficulty: record.difficulty,
        }),
      ),
      true,
      record.sourceKey,
    );
  }
});
