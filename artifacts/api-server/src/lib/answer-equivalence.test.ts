import assert from "node:assert/strict";
import test from "node:test";
import { answersMatch } from "./sat-bank-retry.ts";
import { factorOrderAnswers, FACTORING_QUIZ_QUESTIONS, SAT_MATH_FOLLOW_UP_QUESTIONS } from "./xavier-follow-up-content.ts";

const factors = factorOrderAnswers("(x+6)", "(x-3)");
const gcf = factorOrderAnswers("5x^2", "3x-5");

test("free-response grading accepts reasonable factoring forms", () => {
  for (const answer of [
    "(x + 6)(x - 3)",
    "(x-3)(x+6)",
    "(X + 6)(X - 3)",
    "(x+6)*(x-3)",
    "((x+6))(x-3)",
    "((x + 6)(x - 3))",
    "(x+6)(x-3)(1)",
    "(-x-6)(-x+3)",
    "-(x+6)(3-x)",
  ]) {
    assert.equal(answersMatch(answer, factors), true, answer);
  }
  for (const answer of [
    "5x^2(3x-5)",
    "5x²(3x − 5)",
    "5x**2(3x-5)",
    "(3x - 5)(5x^2)",
    "5*x*x*(3x-5)",
    "(5x^2)(3x-5)",
    "(-5x^2)(5-3x)",
  ]) {
    assert.equal(answersMatch(answer, gcf), true, answer);
  }
  assert.equal(answersMatch("7*x*y*(2x+3y)", factorOrderAnswers("7xy", "2x+3y")), true);
  assert.equal(answersMatch("(2x + 3y)(7yx)", factorOrderAnswers("7xy", "2x+3y")), true);
});

test("free-response grading rejects wrong or merely expanded answers", () => {
  assert.equal(answersMatch("x^2 + 3x - 18", factors), false);
  assert.equal(answersMatch("x^2+3x-18", factors), false);
  assert.equal(answersMatch("(x+6)(x-4)", factors), false);
  assert.equal(answersMatch("2(x+6)(x-3)", factors), false);
  assert.equal(answersMatch("(2x+12)(x-3)", factors), false);
  assert.equal(answersMatch("(2x+12)(1/2x-3/2)", factors), false);
  assert.equal(answersMatch("15x^3 - 25x^2", gcf), false);
  assert.equal(answersMatch("5x^2(5-3x)", gcf), false);
  assert.equal(answersMatch("x^2(15x-25)", gcf), false);
  assert.equal(answersMatch("(x+6)(x-3)(x)", factors), false);
});

test("numeric free responses accept equivalent rationals and signs", () => {
  for (const answer of ["0.5", ".5", "1/2", "2/4", "+0.50", "+1/2", "½"]) {
    assert.equal(answersMatch(answer, "1/2"), true, answer);
    assert.equal(answersMatch(answer, "0.5"), true, answer);
  }
  assert.equal(answersMatch("+9", "9"), true);
  assert.equal(answersMatch("9.0", "9"), true);
  assert.equal(answersMatch("09", "9"), true);
  assert.equal(answersMatch("18/2", "9"), true);
  assert.equal(answersMatch("−13", "-13"), true);
  assert.equal(answersMatch("-13.0", "-13"), true);
  assert.equal(answersMatch("9x/x", "9"), false);
  assert.equal(answersMatch("1/2", "9"), false);
  assert.equal(answersMatch("4", "9"), false);
});

test("letter keys stay exact and are not treated as variables", () => {
  assert.equal(answersMatch("a", "A"), true);
  assert.equal(answersMatch("d", "D"), true);
  assert.equal(answersMatch("a", "d"), false);
  assert.equal(answersMatch("2a/2", "a"), false);
  assert.equal(answersMatch("b", ""), false);
});

test("spaced numbers and malformed decimals are not products", () => {
  assert.equal(answersMatch("2 4", "8"), false);
  assert.equal(answersMatch("2 3", "6"), false);
  assert.equal(answersMatch("3 5", "15"), false);
  assert.equal(answersMatch("1 1/2", "1/2"), false);
  assert.equal(answersMatch("1.2.3", ".36"), false);
  assert.equal(answersMatch("1.2.3", "0.36"), false);
  assert.equal(answersMatch("2*4", "8"), true);
  assert.equal(answersMatch("2+4", "6"), true);
  assert.equal(answersMatch("neon", "none"), false);
  assert.equal(answersMatch("none", "none"), true);
});

test("every authored follow-up key still grades itself", () => {
  const questions = [...SAT_MATH_FOLLOW_UP_QUESTIONS, ...FACTORING_QUIZ_QUESTIONS];
  assert.equal(questions.length, 48);
  for (const question of questions) {
    const forms = question.correctAnswer
      .split(";")
      .map((form) => form.trim())
      .filter(Boolean);
    assert.ok(forms.length >= 1, question.sourceKey);
    for (const form of forms) {
      assert.equal(answersMatch(form, question.correctAnswer), true, `${question.sourceKey}: ${form}`);
    }
  }
});

test("equivalent expanded polynomials match when the key is not factored", () => {
  assert.equal(answersMatch("2(x+1)", "2x+2"), true);
  assert.equal(answersMatch("2x+2", "2(x+1)"), false);
  assert.equal(answersMatch("x**2", "x^2"), true);
  assert.equal(answersMatch("x²", "x^2"), true);
  assert.equal(answersMatch("2*x", "2x"), true);
});
