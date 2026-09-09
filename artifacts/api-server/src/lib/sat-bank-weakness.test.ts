import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { groupMissesByWeakness, weaknessGroupsNeedRebuild } from "./sat-bank-weakness.ts";

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

test("maps extract skill placeholders to the section label before grouping", () => {
  const groups = groupMissesByWeakness([
    {
      questionId: "q1",
      skill: "Skill not in extract",
      domain: "SAT Math",
      correct: false,
    },
    {
      questionId: "q2",
      skill: "Skill not in PDF",
      domain: "Reading and Writing",
      correct: false,
    },
  ]);
  assert.equal(groups[0]?.skill, "Reading and Writing");
  assert.equal(groups[1]?.skill, "SAT Math");
});

test("infers SAT Math vs Reading and Writing from bank section when domain is empty", () => {
  const groups = groupMissesByWeakness([
    {
      questionId: "q-math",
      skill: "Skill not in extract",
      section: "math",
      correct: false,
    },
    {
      questionId: "q-rw",
      skill: "Skill not in extract",
      section: "rw",
      correct: false,
    },
  ]);
  assert.equal(groups[0]?.skill, "Reading and Writing");
  assert.equal(groups[1]?.skill, "SAT Math");
  assert.equal(
    groups.every((group) => !/skill not in extract/i.test(group.skill)),
    true,
  );
});

test("rebuilds persisted groups that still store the extract placeholder", () => {
  assert.equal(
    weaknessGroupsNeedRebuild([{ skill: "Skill not in extract" }]),
    true,
  );
  assert.equal(weaknessGroupsNeedRebuild([{ skill: "Skill not in PDF" }]), true);
  assert.equal(weaknessGroupsNeedRebuild([{ skill: "SAT Math" }]), false);
  assert.equal(weaknessGroupsNeedRebuild([{ skill: "Transitions" }]), false);
  assert.equal(weaknessGroupsNeedRebuild([]), false);
});
