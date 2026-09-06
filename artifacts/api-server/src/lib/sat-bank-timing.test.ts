import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { selectQuestionsForTimeBudget } from "./sat-bank-timing.ts";

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
