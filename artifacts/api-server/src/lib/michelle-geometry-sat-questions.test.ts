import assert from "node:assert/strict";
import test from "node:test";
import { repairStackedMathNotation } from "./stacked-math-notation.ts";
import {
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  GEOMETRY_SAT_QUESTIONS,
  auditGeometrySatQuestions,
  geometrySatQuestionCount,
} from "./michelle-geometry-sat-questions.ts";

test("Geometry SAT Questions is a 12-item original hard set with keys and no solutions", () => {
  assert.equal(GEOMETRY_SAT_FOLLOW_UP_TITLE, "Geometry SAT Questions");
  assert.equal(geometrySatQuestionCount(), 12);
  const keys = new Set(GEOMETRY_SAT_QUESTIONS.map((item) => item.key));
  assert.equal(keys.size, 12);
  for (const item of GEOMETRY_SAT_QUESTIONS) {
    assert.equal(item.choices.length, 4);
    assert.ok(item.choices.some((choice) => choice.id === item.correctAnswer));
    assert.equal(/because|explanation|solution|rationale/i.test(item.prompt), false);
    for (const choice of item.choices) {
      assert.equal(/because|explanation|solution/i.test(choice.text), false);
    }
    assert.equal(repairStackedMathNotation(item.prompt), item.prompt);
    for (const choice of item.choices) {
      assert.equal(repairStackedMathNotation(choice.text), choice.text);
    }
  }
  const skills = GEOMETRY_SAT_QUESTIONS.map((item) => item.skill).join(" ");
  assert.match(skills, /polygon/i);
  assert.match(skills, /volume/i);
  assert.match(skills, /area/i);
});

test("every Geometry SAT question passes the student-usable math gate", () => {
  assert.deepEqual(auditGeometrySatQuestions(), []);
});
