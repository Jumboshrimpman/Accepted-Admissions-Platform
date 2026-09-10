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
  looksCorruptStemOcr,
  looksFailedMathLayoutDump,
  looksGarbledQuizText,
  looksMissingOperatorChoice,
  looksPipeBackslashOcr,
  shouldHideMismatchedQuizFigures,
  shouldHideQuizOcrStem,
  shouldShowQuizChoices,
  stemCitesVisual,
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

test("hides page-neighbor figures on word problems and rejects corrupt stems", () => {
  assert.equal(looksCorruptStemOcr("In the triangle shown, PQ QR. What is the value = of x?"), true);
  assert.equal(stemCitesVisual("Rectangle P has an area of 72 square inches."), false);
  const wordProblem = {
    presentation: "text" as const,
    prompt:
      "The lengths of two sides of a triangle are 4 centimeters and 6 centimeters. If the perimeter is 18 centimeters, what is the third side?",
    stimulus:
      "![Diagram from page 34](https://app.acceptedadmissions.org/media/sat-bank/pack/p34-draw2.png)",
    choices: [
      { id: "a", label: "A", text: "2" },
      { id: "b", label: "B", text: "8" },
      { id: "c", label: "C", text: "10" },
      { id: "d", label: "D", text: "24" },
    ],
    questionType: "mcq",
  };
  assert.equal(shouldHideMismatchedQuizFigures(wordProblem), true);
  assert.equal(shouldShowQuizChoices(wordProblem), true);
  const brokenTriangle = {
    ...wordProblem,
    prompt: "In the triangle shown, PQ QR. What is the value = of x?",
    stimulus:
      "![Diagram from page 34](https://app.acceptedadmissions.org/media/sat-bank/pack/p34-draw1.png)",
    choices: [
      { id: "a", label: "A", text: "156" },
      { id: "b", label: "B", text: "66" },
      { id: "c", label: "C", text: "48" },
      { id: "d", label: "D", text: "24" },
    ],
  };
  assert.equal(shouldHideQuizOcrStem(brokenTriangle), true);
  assert.equal(shouldShowQuizChoices(brokenTriangle), false);
});

test("rejects missing operators, pipe OCR, and ?-as-operator; keeps slash fractions", () => {
  assert.equal(looksMissingOperatorChoice("x 16 = 30"), true);
  assert.equal(looksMissingOperatorChoice("t 10 ≤75"), true);
  assert.equal(looksMissingOperatorChoice("x/4 = 32"), false);
  assert.equal(isStudentReadableChoiceText("x/4 = 32"), true);
  assert.equal(isStudentReadableChoiceText("7x6"), false);
  assert.equal(looksBrokenMathOcr("16 + 30 = 190 x\nWhich equation has the same solution?"), true);
  assert.equal(looksBrokenMathOcr("x/4 + 1 = 33\nWhich equation has the same solution?"), false);
  assert.equal(looksCorruptStemOcr("= ^ h in\nFor the linear function f , the graph of y f(x)\npoint,0 5"), true);
  assert.equal(looksPipeBackslashOcr("I \\\n/ ' I '\\ I '\nI"), true);
  assert.equal(looksBrokenMathOcr("12x3 −5x ? 3\nWhich expression is equivalent to"), true);
  const surfboard = {
    presentation: "text" as const,
    prompt:
      "The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. A person rents a surfboard for t hours and intends to spend a maximum of $75. Which inequality represents this situation?",
    stimulus:
      "![Diagram from page 35](https://app.acceptedadmissions.org/media/sat-bank/pack/p35-draw1.png)",
    choices: [
      { id: "a", label: "A", text: "t 10 ≤75" },
      { id: "b", label: "B", text: "t 10 + 25 ≤75" },
      { id: "c", label: "C", text: "25 ≤75 t" },
      { id: "d", label: "D", text: "t 25 + 10 ≤75" },
    ],
    questionType: "mcq",
  };
  assert.equal(shouldHideMismatchedQuizFigures(surfboard), true);
  assert.equal(shouldShowQuizChoices(surfboard), false);
  const slashFractions = {
    ...surfboard,
    prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
    stimulus: null,
    choices: [
      { id: "a", label: "A", text: "x/4 = 32" },
      { id: "b", label: "B", text: "x/4 = 5" },
      { id: "c", label: "C", text: "x/4 = 1" },
      { id: "d", label: "D", text: "x/4 = -32" },
    ],
  };
  assert.equal(shouldShowQuizChoices(slashFractions), true);
  assert.equal(shouldHideMismatchedQuizFigures(slashFractions), false);
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
