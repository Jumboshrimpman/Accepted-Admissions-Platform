import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  diagnosticTimeLimitMinutes,
  isFullLengthDiagnosticSelection,
  preferSatDiagnosticCollection,
  selectFullPracticeCollection,
  selectQuestionsForTimeBudget,
  shouldReplaceFirstSessionPrework,
} from "./sat-bank-timing.ts";

const items = [
  { id: "rw-1", section: "rw" as const, skill: "Transitions", estimatedSeconds: 450, position: 1 },
  { id: "m-1", section: "math" as const, skill: "Algebra", estimatedSeconds: 450, position: 2 },
  { id: "rw-2", section: "rw" as const, skill: "Evidence", estimatedSeconds: 450, position: 3 },
  { id: "m-2", section: "math" as const, skill: "Geometry", estimatedSeconds: 450, position: 4 },
  { id: "rw-3", section: "rw" as const, skill: "Boundaries", estimatedSeconds: 450, position: 5 },
  { id: "m-3", section: "math" as const, skill: "Algebra", estimatedSeconds: 450, position: 6 },
  { id: "rw-4", section: "rw" as const, skill: "Transitions", estimatedSeconds: 450, position: 7 },
  { id: "m-4", section: "math" as const, skill: "Algebra", estimatedSeconds: 450, position: 8 },
];

test("selects ~60 minutes from mixed bank items without dumping the whole list", () => {
  const result = selectQuestionsForTimeBudget(items, { targetMinutes: 60, toleranceMinutes: 8 });
  assert.equal(result.estimatedSeconds, 3600);
  assert.equal(result.selected.length, 8);
  assert.equal(result.withinTolerance, true);
  assert.deepEqual(
    result.selected.map((item) => item.section),
    ["rw", "math", "rw", "math", "rw", "math", "rw", "math"],
  );
});

test("preserves original collection order when assigning from a source test", () => {
  const result = selectQuestionsForTimeBudget(items, {
    targetMinutes: 30,
    toleranceMinutes: 8,
    preferOriginalOrder: true,
  });
  assert.deepEqual(
    result.selected.map((item) => item.id),
    ["rw-1", "m-1", "rw-2", "m-2", "rw-3"],
  );
  assert.ok(result.estimatedSeconds <= 30 * 60 + 8 * 60);
  assert.ok(result.estimatedSeconds >= 30 * 60 - 8 * 60);
});

test("diagnostic assign uses the full collection in original order, not a 60-minute slice", () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    id: `q-${index + 1}`,
    section: index % 2 === 0 ? ("rw" as const) : ("math" as const),
    skill: "Skill",
    estimatedSeconds: 450,
    position: index + 1,
  }));
  const result = selectFullPracticeCollection(many);
  assert.equal(result.selected.length, 12);
  assert.deepEqual(
    result.selected.map((item) => item.id),
    many.map((item) => item.id),
  );
  assert.equal(result.leftoverCount, 0);
  assert.ok(diagnosticTimeLimitMinutes(result.estimatedSeconds) >= 134);
});

test("routine stays time-boxed at ~60 minutes while diagnostic prefers SAT Practice Tests 4–11", () => {
  const routine = selectQuestionsForTimeBudget(items, { targetMinutes: 60, toleranceMinutes: 8 });
  assert.ok(routine.estimatedSeconds <= 60 * 60 + 8 * 60);
  assert.ok(routine.selected.length < 80);
  const preferred = preferSatDiagnosticCollection([
    { examFamily: "psat", practiceTestNumber: 1, slug: "psat-10-practice-test-1", questionCount: 120 },
    { examFamily: "sat", practiceTestNumber: 4, slug: "sat-practice-test-4-digital", questionCount: 120 },
    { examFamily: "sat", practiceTestNumber: 11, slug: "sat-practice-test-11-digital", questionCount: 90 },
  ]);
  assert.equal(preferred?.slug, "sat-practice-test-4-digital");
  assert.equal(
    isFullLengthDiagnosticSelection({ homeworkKind: "diagnostic", questionCount: 120, targetMinutes: 164 }),
    true,
  );
  assert.equal(
    isFullLengthDiagnosticSelection({ homeworkKind: "routine", questionCount: 24, targetMinutes: 60 }),
    false,
  );
  assert.equal(
    shouldReplaceFirstSessionPrework({ homeworkKind: "diagnostic", questionCount: 120, title: "Full-length SAT diagnostic" }),
    false,
  );
  assert.equal(
    shouldReplaceFirstSessionPrework({ homeworkKind: null, questionCount: 24, title: "Full SAT Practice Diagnostic" }),
    true,
  );
});

test("does not overshoot the time band when later items are long", () => {
  const result = selectQuestionsForTimeBudget(
    [
      { id: "a", section: "rw", skill: "A", estimatedSeconds: 1700, position: 1 },
      { id: "b", section: "rw", skill: "B", estimatedSeconds: 1700, position: 2 },
      { id: "c", section: "rw", skill: "C", estimatedSeconds: 1700, position: 3 },
    ],
    { targetMinutes: 60, toleranceMinutes: 8, preferOriginalOrder: true },
  );
  assert.equal(result.selected.length, 2);
  assert.equal(result.leftoverCount, 1);
});
