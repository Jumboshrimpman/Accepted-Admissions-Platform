import assert from "node:assert/strict";
import test from "node:test";
import {
  displayAnswerLabel,
  figurePrimaryChoices,
  isFigurePrimaryQuestion,
  looksGarbledQuizText,
  stripSatBankFigureComments,
} from "./quiz-figure-primary.ts";

test("strips leaked SAT bank figure comments", () => {
  assert.equal(
    stripSatBankFigureComments("<!-- sat-bank-figures -->\nGraph\n<!-- /sat-bank-figures -->"),
    "Graph",
  );
});

test("treats ASCII scatterplots as garbled quiz text", () => {
  assert.equal(looksGarbledQuizText("10+-+-+-+--i------,f-----+---+---+"), true);
  assert.equal(looksGarbledQuizText("Which value of x satisfies the equation?"), false);
});

test("figure-primary questions expose A–D even when the payload omitted choices", () => {
  const question = {
    presentation: "figure_primary" as const,
    prompt: "",
    stimulus: "![Question](/media/sat-bank/pack/q1.png)",
    choices: [],
    questionType: "mcq",
  };
  assert.equal(isFigurePrimaryQuestion(question), true);
  assert.deepEqual(
    figurePrimaryChoices(question).map((choice) => choice.label),
    ["A", "B", "C", "D"],
  );
});

test("answer review shows the letter when choice text is empty", () => {
  assert.equal(
    displayAnswerLabel("c", [
      { id: "a", label: "A", text: "" },
      { id: "c", label: "C", text: "(see figure)" },
    ]),
    "C",
  );
  assert.equal(
    displayAnswerLabel("b", [
      { id: "a", label: "A", text: "However" },
      { id: "b", label: "B", text: "Therefore" },
    ]),
    "Therefore",
  );
});
