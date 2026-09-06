import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { groupMissesByWeakness } from "./sat-bank-weakness.ts";

test("groups misses by skill and ranks the heaviest weakness first", () => {
  const groups = groupMissesByWeakness([
    { questionId: "q1", bankQuestionId: "b1", skill: "Transitions", correct: false },
    { questionId: "q2", bankQuestionId: "b2", skill: "Algebra", correct: false },
    { questionId: "q3", bankQuestionId: "b3", skill: "Transitions", correct: false },
    { questionId: "q4", skill: "Transitions", correct: true },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.skill, "Transitions");
  assert.equal(groups[0]?.missCount, 2);
  assert.equal(groups[0]?.priority, 1);
  assert.deepEqual(groups[0]?.questionIds, ["q1", "q3"]);
  assert.equal(groups[1]?.skill, "Algebra");
  assert.equal(groups[1]?.priority, 2);
});

test("returns no groups when every item is correct", () => {
  assert.deepEqual(
    groupMissesByWeakness([{ questionId: "q1", skill: "Algebra", correct: true }]),
    [],
  );
});
