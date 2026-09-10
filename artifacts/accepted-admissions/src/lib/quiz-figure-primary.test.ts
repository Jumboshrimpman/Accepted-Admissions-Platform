import assert from "node:assert/strict";
import test from "node:test";
import {
  displayAnswerLabel,
  figurePrimaryChoices,
  hasUsableChoiceText,
  isFigurePrimaryQuestion,
  isStudentReadableChoiceText,
  letterMcqChoices,
  looksBrokenMathOcr,
  looksFailedMathLayoutDump,
  looksGarbledQuizText,
  shouldHideQuizOcrStem,
  shouldShowQuizChoices,
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

test("figure-primary questions without usable choice text do not invent letter keys", () => {
  const question = {
    presentation: "figure_primary" as const,
    prompt: "",
    stimulus: "![Question](/media/sat-bank/pack/q1.png)",
    choices: [],
    questionType: "mcq",
  };
  assert.equal(isFigurePrimaryQuestion(question), true);
  assert.deepEqual(figurePrimaryChoices(question), []);
  assert.equal(hasUsableChoiceText(figurePrimaryChoices(question)), false);
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

test("rejects fraction dumps, missing exponents, and hides OCR next to a crop", () => {
  assert.equal(looksFailedMathLayoutDump("w = − 19 ⎜⎜⎜⎝ ⎟⎟⎠ y ⎟ 2⎞⎟ ⎛28x"), true);
  assert.equal(isStudentReadableChoiceText("w = −19 y F 28x"), false);
  assert.equal(isStudentReadableChoiceText("b h"), false);
  assert.equal(isStudentReadableChoiceText("8 2 + 80"), false);
  assert.equal(looksBrokenMathOcr("y = 2x2 − 21x + 64\npoint, ( ,x y),"), true);
  assert.equal(looksBrokenMathOcr("y = ax2 + bx + c, which of the\n? following could be"), true);
  const triangle = {
    presentation: "text" as const,
    prompt: "A right triangle has sides of length 2 2 , 6 2 , and 80 units. What is the area?",
    stimulus:
      "![Question figure region page 38](https://app.acceptedadmissions.org/media/sat-bank/pack/p38-q22-right.png)",
    choices: [
      { id: "a", label: "A", text: "8 2 + 80" },
      { id: "b", label: "B", text: "12" },
      { id: "c", label: "C", text: "24/80" },
      { id: "d", label: "D", text: "24" },
    ],
    questionType: "mcq",
  };
  assert.equal(shouldHideQuizOcrStem(triangle), true);
  assert.equal(shouldShowQuizChoices(triangle), false);
  assert.deepEqual(figurePrimaryChoices(triangle), []);
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
