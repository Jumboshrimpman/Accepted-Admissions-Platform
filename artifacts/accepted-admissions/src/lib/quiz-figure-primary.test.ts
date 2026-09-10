import assert from "node:assert/strict";
import test from "node:test";
import {
  displayAnswerLabel,
  figurePrimaryChoices,
  hasUsableChoiceText,
  isFigurePrimaryQuestion,
  letterMcqChoices,
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

test("preserves A–D choice text on figure-primary items instead of hiding it", () => {
  const question = {
    presentation: "figure_primary" as const,
    prompt: "Which choice uses data from the graph?",
    stimulus: "![Graph](/media/sat-bank/pack/p10-draw1.png)",
    choices: [
      { id: "a", label: "A", text: "Washington had between 600 and 800 organic farms." },
      { id: "b", label: "B", text: "New York had fewer than 800 organic farms." },
      { id: "c", label: "C", text: "Wisconsin and Iowa each had between 1,200 and 1,400 organic farms." },
      { id: "d", label: "D", text: "Pennsylvania had more than 1,200 organic farms." },
    ],
    questionType: "mcq",
  };
  assert.equal(isFigurePrimaryQuestion(question), true);
  assert.equal(hasUsableChoiceText(figurePrimaryChoices(question)), true);
  assert.match(figurePrimaryChoices(question)[0]?.text ?? "", /Washington/);
  assert.equal(letterMcqChoices(question.choices)[1]?.text.includes("New York"), true);
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
