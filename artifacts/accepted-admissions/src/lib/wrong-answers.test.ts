import assert from "node:assert/strict";
import test from "node:test";
import {
  filterWrongAnswersOnly,
  tutorWrongAnswersHref,
  wantsWrongAnswersOnly,
} from "./wrong-answers.ts";

test("filterWrongAnswersOnly keeps only misses from a homework attempt", () => {
  const items = [
    { questionId: "q1", correct: true, skill: "Evidence" },
    { questionId: "q2", correct: false, skill: "Transitions" },
    { questionId: "q3", correct: false, skill: "Algebra" },
  ];
  assert.deepEqual(
    filterWrongAnswersOnly(items).map((item) => item.questionId),
    ["q2", "q3"],
  );
});

test("tutor wrong-answers href and query parse the same filter", () => {
  assert.equal(tutorWrongAnswersHref("attempt-1"), "/tutor/attempts/attempt-1?wrongAnswersOnly=1");
  assert.equal(wantsWrongAnswersOnly("wrongAnswersOnly=1"), true);
  assert.equal(wantsWrongAnswersOnly("?wrongAnswersOnly=true"), true);
  assert.equal(wantsWrongAnswersOnly(""), false);
});
