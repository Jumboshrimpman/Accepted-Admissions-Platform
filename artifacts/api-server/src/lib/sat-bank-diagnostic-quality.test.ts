import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isMultipleChoiceQuizItem,
  listOfficialExtractFiles,
  parseCollegeBoardPayload,
  resolveCollegeBoardRoot,
} from "./sat-bank-import.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  auditStudentQuizItem,
  canAssignDiagnostic,
  composeDiagnosticItems,
  diagnosticAssignmentCopy,
  isCleanTextMcqItem,
  isMathQuizItem,
  isStudentUsableDiagnosticItem,
  isStudentUsableMathQuizItem,
  isStudentUsableQuizItem,
  isStudentUsableServedQuestion,
  isTrueSprQuizItem,
  isUsableFullLengthDiagnostic,
  normalizeLetterAnswer,
  selectUsableDiagnosticItems,
  summarizeDiagnosticComposition,
} from "./sat-bank-diagnostic-quality.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { hasCompleteLetterChoiceText } from "./sat-bank-figure-primary.ts";

const figureUrl =
  "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/q7-question.png";

test("drops true SPR and irreparable OCR, keeps clean MCQ and figure-primary with an image", () => {
  assert.equal(isTrueSprQuizItem({ questionType: "spr", correctAnswer: "9; 9.0" }), true);
  assert.equal(isTrueSprQuizItem({ questionType: "spr", correctAnswer: "C" }), false);
  assert.equal(normalizeLetterAnswer("B"), "b");
  assert.equal(normalizeLetterAnswer("9; 9.0"), "9; 9.0");

  assert.equal(
    isCleanTextMcqItem({
      prompt: "Which choice completes the text with the most logical transition?",
      choices: [
        { id: "a", label: "A", text: "However" },
        { id: "b", label: "B", text: "Therefore" },
        { id: "c", label: "C", text: "Meanwhile" },
        { id: "d", label: "D", text: "Similarly" },
      ],
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );

  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "2 x = 36",
      choices: [
        { id: "a", label: "A", text: "" },
        { id: "b", label: "B", text: "" },
      ],
      questionType: "mcq",
      correctAnswer: "B",
      figures: [],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "",
      choices: [
        { id: "a", label: "A", text: "" },
        { id: "b", label: "B", text: "" },
        { id: "c", label: "C", text: "" },
        { id: "d", label: "D", text: "" },
      ],
      questionType: "mcq",
      correctAnswer: "C",
      figures: [],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "How many pounds of oranges?",
      choices: [],
      questionType: "spr",
      correctAnswer: "9; 9.0",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "V = i,.r3 V =3£wh",
      choices: [],
      questionType: "spr",
      correctAnswer: "C",
      figures: [{ url: figureUrl, role: "question_region" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "Particle physicists spend much of their time ______ what is invisible.\nWhich choice completes the text with the most logical and precise word or phrase?",
      choices: [
        { id: "a", label: "A", text: "selecting" },
        { id: "b", label: "B", text: "inspecting ~ ---~" },
        { id: "c", label: "C", text: "creating ~" },
        { id: "d", label: "D", text: "deciding" },
      ],
      questionType: "mcq",
      correctAnswer: "B",
    }),
    true,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt:
        "x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values of x and their corresponding values of f(x)( ). Which ( ) ? equation defines f(x)",
      choices: [
        { id: "a", label: "A", text: "f(x)= 3x + 29" },
        { id: "b", label: "B", text: "f(x)= 29x + 32" },
        { id: "c", label: "C", text: "f(x)= 35x + 29" },
        { id: "d", label: "D", text: "f(x)= 32x + 35" },
      ],
      questionType: "mcq",
      correctAnswer: "A",
      figures: [
        { url: `${figureUrl}-tri-1`, alt: "Figure from page 35" },
        { url: `${figureUrl}-tri-2`, alt: "Diagram from page 35" },
      ],
    }),
    true,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "",
      choices: [
        { id: "a", label: "A", text: "" },
        { id: "b", label: "B", text: "" },
        { id: "c", label: "C", text: "" },
        { id: "d", label: "D", text: "" },
      ],
      questionType: "mcq",
      correctAnswer: "C",
      figures: [{ url: figureUrl, alt: "Question region including choices A–D", role: "question_region" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "",
      choices: [
        { id: "a", label: "A", text: "" },
        { id: "b", label: "B", text: "" },
        { id: "c", label: "C", text: "" },
        { id: "d", label: "D", text: "" },
      ],
      questionType: "mcq",
      correctAnswer: "C",
      extractGaps: { figurePrimary: true },
      figures: [{ url: figureUrl, alt: "Diagram from page 10" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt:
        "According to the US Department of Agriculture, in 2016 California had between 2,600 and 2,800 organic farms and ______ Which choice most effectively uses data from the graph to complete the text?",
      choices: [
        { id: "a", label: "A", text: "Washington had between 600 and 800 organic farms." },
        { id: "b", label: "B", text: "New York had fewer than 800 organic farms." },
        { id: "c", label: "C", text: "Wisconsin and Iowa each had between 1,200 and 1,400 organic farms." },
        { id: "d", label: "D", text: "Pennsylvania had more than 1,200 organic farms." },
      ],
      questionType: "mcq",
      correctAnswer: "A",
      figures: [],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt:
        "According to the US Department of Agriculture, in 2016 California had between 2,600 and 2,800 organic farms and ______ Which choice most effectively uses data from the graph to complete the text?",
      choices: [
        { id: "a", label: "A", text: "Washington had between 600 and 800 organic farms." },
        { id: "b", label: "B", text: "New York had fewer than 800 organic farms." },
        { id: "c", label: "C", text: "Wisconsin and Iowa each had between 1,200 and 1,400 organic farms." },
        { id: "d", label: "D", text: "Pennsylvania had more than 1,200 organic farms." },
      ],
      questionType: "mcq",
      correctAnswer: "A",
      figures: [{ url: figureUrl, alt: "Diagram from page 10" }],
    }),
    false,
    "a page-neighbor PNG is not a recovered graph",
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt:
        "According to the US Department of Agriculture, in 2016 California had between 2,600 and 2,800 organic farms and ______ Which choice most effectively uses data from the graph to complete the text?",
      choices: [
        { id: "a", label: "A", text: "Washington had between 600 and 800 organic farms." },
        { id: "b", label: "B", text: "New York had fewer than 800 organic farms." },
        { id: "c", label: "C", text: "Wisconsin and Iowa each had between 1,200 and 1,400 organic farms." },
        { id: "d", label: "D", text: "Pennsylvania had more than 1,200 organic farms." },
      ],
      questionType: "mcq",
      correctAnswer: "A",
      figures: [
        {
          url: figureUrl,
          alt: "Question region including choices A–D",
          role: "question_region",
        },
      ],
    }),
    true,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      prompt: "USStateswiththeGreatestNumberofOrganicFarmsin2016 State Organicfarmingisamethod",
      choices: [
        { id: "a", label: "A", text: "Washington had between 600 and 800 organic farms." },
        { id: "b", label: "B", text: "New York had fewer than 800 organic farms." },
        { id: "c", label: "C", text: "Wisconsin and Iowa each had between 1,200 and 1,400 organic farms." },
        { id: "d", label: "D", text: "Pennsylvania had more than 1,200 organic farms." },
      ],
      questionType: "mcq",
      correctAnswer: "A",
      figures: [{ url: figureUrl, alt: "Diagram from page 10" }],
    }),
    false,
  );
});

test("rejects PT4 math items whose OCR lost exponents, radicals, or dumped fractions", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m1-q16",
      prompt:
        "= 206(1.034)x models the value,\nThe function f(x)\nin dollars, of a certain bank account by the end of each year from 1957 through 1972, where x is the number of years after 1957. Which of the following is the best interpretation of f(5)?",
      choices: letterChoices([
        "The value of the bank account is estimated to be approximately 5 dollars greater in 1962 than in 1957.",
        "The value of the bank account is estimated to be approximately 243 dollars in 1962.",
        "The value, in dollars, of the bank account is estimated to be approximately 5 times greater in 1962 than in 1957.",
        "The value of the bank account is estimated to increase by approximately 243 dollars every 5 years between 1957 and 1972.",
      ]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m1-q19",
      prompt:
        "14x = 2 w + 19\n7y\nThe given equation relates the distinct positive real numbers w, x, and y. Which equation correctly expresses w in terms of x and y ?\nf(x)",
      choices: letterChoices([
        "w = −19 y F 28x",
        "−19 w = 14y 2⎞⎟ ⎛x",
        "w = − 19 ⎜⎜⎜⎝ ⎟⎟⎠ y ⎟ 2⎞⎟ ⎛28x",
        "w = 14y ⎟⎟⎠ − 19 ⎜⎜⎜⎝ ⎟",
      ]),
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m1-q22",
      prompt: "A right triangle has sides of length 2 2 , 6 2 , and 80 units. What is the area of the triangle, in square units?",
      choices: letterChoices(["8 2 + 80", "12", "24/80", "24"]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: [
        {
          url: `${figureUrl}-p38-q22-right.png`,
          alt: "Question figure region page 38",
        },
      ],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m1-q23",
      prompt:
        "2 4x + bx − 45, where b is a constant,\nThe expression can be rewritten as (hx + k)(x + j), where h, k, and j are integer constants. Which of the following must be an integer?",
      choices: letterChoices(["b h", "b k", "45 h", "45 k"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m1-q24",
      prompt:
        "y = 2x2 − 21x + 64\ny = 3x + a\nIn the given system of equations, a is a constant. The graphs of the equations in the given system intersect at exactly one point, ( ,x y), in the x y-plane. What is the value of x ?",
      choices: letterChoices(["−8", "−6", "6", "8"]),
      questionType: "mcq",
      correctAnswer: "C",
      figures: [{ url: `${figureUrl}-p39-q24-left.png`, alt: "Question figure region page 39" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m1-q26",
      prompt:
        "In the x y-plane, a parabola has vertex (9, −14) and intersects the x-axis at two points. If the equation of the parabola is written in the form y = ax2 + bx + c, where a, b, and c are constants, which of the\n? following could be the value of a + b + c",
      choices: letterChoices(["−23", "−19", "−14", "−12"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
});

test("rejects corrupt stems and mismatched page-neighbor figures; keeps clean word problems", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt11-math-m1-q1",
      prompt: "In the triangle shown, PQ QR. What is the value =\nof x?",
      choices: letterChoices(["156", "66", "48", "24"]),
      questionType: "mcq",
      correctAnswer: "D",
      figures: [{ url: figureUrl, alt: "Diagram from page 34" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt8-math-m1-q1",
      prompt: "X -10 -8 -6 -4 -2 V\n246810\nWhat is the y-intercept of the graph shown?",
      choices: [
        { id: "a", label: "A", text: "(−8, 0)" },
        { id: "b", label: "B", text: "(−6, 0)" },
        { id: "c", label: "C", text: "(0, 6)" },
        {
          id: "d",
          label: "D",
          text: "(0, 8) - --------~ 4 Which expression is equivalent to (2x^2+x-9)+(x^2+6x+1)?",
        },
        { id: "a2", label: "A", text: "2x^2 + 6x − 8" },
      ],
      questionType: "mcq",
      correctAnswer: "C",
      figures: [
        { url: `${figureUrl}-draw1`, alt: "Diagram from page 34" },
        { url: `${figureUrl}-draw2`, alt: "Diagram from page 34" },
      ],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt6-math-m1-q1",
      prompt:
        "X u 1 2 3 4 5 6\nThe graph models the number of active projects a company was working on x months after the end of\n0 ≤x ≤6. According to the November 2012, where\nmodel, what is the predicted number of active projects the company was working on at the end of November 2012?",
      choices: letterChoices(["0", "5", "8", "9"]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: [{ url: figureUrl, alt: "Diagram from page 39" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt9-math-m1-q1",
      prompt:
        "The lengths of two sides of a triangle are 4 centimeters and 6 centimeters. If the perimeter of the triangle is 18 centimeters, what is the length, in centimeters, of the third side of this triangle?",
      choices: letterChoices(["2", "8", "10", "24"]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: [{ url: `${figureUrl}-eqs`, alt: "Diagram from page 34" }],
    }),
    true,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt7-math-m1-q2",
      prompt:
        "Rectangle P has an area of 72 square inches. If a rectangle with an area of 20 square inches is removed from rectangle P, what is the area, in square inches, of the resulting figure?",
      choices: letterChoices(["92", "84", "80", "52"]),
      questionType: "mcq",
      correctAnswer: "D",
      figures: [{ url: `${figureUrl}-scatter`, alt: "Diagram from page 34" }],
    }),
    true,
  );
});

test("rejects unlabeled-choice crops, missing operators, clipped OCR, and ?-as-operator; keeps slash fractions", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt9-math-m1-q2",
      prompt: "16 + 30 = 190 x\nWhich equation has the same solution as the given equation?",
      choices: letterChoices([
        "x 16 = 30",
        "16 x = 130",
        "x 16 = 160",
        "x 16 = 190 , _ _ ____, 3 Ty set a goal to walk at least 24 kilometers every day to prepare for a multiday hike. On a certain day, Ty plans to walk at an average speed of 4 kilometers per",
      ]),
      questionType: "mcq",
      correctAnswer: "C",
      figures: [{ url: figureUrl, alt: "Diagram from page 34" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt11-math-m1-q2",
      prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
      choices: letterChoices(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt10-math-m1-q3",
      prompt:
        "The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. A person rents a surfboard for t hours and intends to spend a maximum of $75 to rent the surfboard. Which inequality represents this situation?",
      choices: letterChoices(["t 10 ≤75", "t 10 + 25 ≤75", "25 ≤75 t", "t 25 + 10 ≤75"]),
      questionType: "mcq",
      correctAnswer: "D",
      figures: [
        { url: `${figureUrl}-draw1`, alt: "Diagram from page 35" },
        { url: `${figureUrl}-draw2`, alt: "Diagram from page 35" },
      ],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt11-math-m1-q3",
      prompt:
        "= ^ h in\nFor the linear function f , the graph of y f(x)\nthe xy-plane has a slope of 7 and passes through the\n^ h. Which equation defines f ?\npoint,0 5\n^ h",
      choices: letterChoices(["f(x) x 5 = ^ h", "f(x) x 35 = ^ h", "f(x) x/7 = 5 + ^ h", "f(x) x/12 = 5 +"]),
      questionType: "mcq",
      correctAnswer: "C",
      figures: [{ url: `${figureUrl}-p34-q3-right.png`, alt: "Question figure region page 34" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q1",
      prompt:
        "The line graph shows the estimated number of chipmunks in a state park on April 1 of each year from 1989 to 1999.\nI \\\n/ ' I '\\ I '\nI\nBased on the line graph, in which year was the estimated number of chipmunks in the state park the greatest?",
      choices: letterChoices(["1989", "1994", "1995", "1998"]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: [{ url: figureUrl, alt: "Diagram from page 42" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q3",
      prompt: "12x3 −5x ? 3\nWhich expression is equivalent to",
      choices: letterChoices(["7x6", "17x3", "7x3", "17x6"]),
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
});

test("rejects mangled coordinates, incomplete table crops, scrambled stems, and glued 2 −4x −7x OCR; formats inequalities", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q4",
      prompt: "x + y = 18\n5 y = x\nWhat is the solution ( ,x y) to the given system of equations?",
      choices: letterChoices(["(15, 3)", "(16, 2)", "(17, 1)", "(18, 0)"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q5",
      prompt: "The point (8, 2) in the x y-plane is a solution to which of the following systems of inequalities?",
      choices: letterChoices(["x > 0 y > 0", "x > 0 y < 0", "x < 0 y > 0", "x < 0 y < 0"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q8",
      prompt:
        "= x2 −3\nh x\nWhich table gives three values of x and their\n( ) for the given corresponding values of h x\nfunction h?",
      choices: letterChoices([
        "x 1 2 3 h(x) 4 5 6",
        "x 1 2 3 −2 h(x) 1 6",
        "x 1 2 3 −1 h(x) 1 3",
        "x 1 2 3 −2 h(x) 1 3",
      ]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: [{ url: `${figureUrl}-p43-q8-right.png`, alt: "Question figure region page 43" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q9",
      prompt: "= 270(0.1)x. What The function f is defined by f(x)\nis the value of f (0) ?",
      choices: letterChoices(["0", "1", "27", "270"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q12",
      prompt: "2 −4x −7x = −36\nWhat is the positive solution to the given equation?",
      choices: letterChoices(["7/4", "9/4", "4", "7"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q15",
      prompt:
        "A proposal for a new library was included on an election ballot. A radio show stated that 3 times as many people voted in favor of the proposal as people who voted against it. A social media post reported that 15,000 more people voted in favor of the proposal than voted against it. Based on these data, how many people voted against the proposal?",
      choices: letterChoices([
        "7,500",
        "15,000",
        "22,500",
        "45,000/16 t m n Note: Figure not drawn to scale. In the figure, lines m and n are parallel. If",
      ]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: [{ url: figureUrl, alt: "Diagram from page 45" }],
    }),
    false,
  );
});

test("rejects scrambled f(x) and smashed vertex crops; keeps 21px no-solution and dot-plot comparisons", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q17",
      prompt:
        "−3x + 21px = 84\nIn the given equation, p is a constant. The equation has no solution. What is the value of p ?",
      choices: letterChoices(["0", "1/7", "4/3", "4"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    true,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q18",
      prompt:
        "= (x − 10)(x + 13) f(x)\nThe function f is defined by the given equation. For what value of x does f(x)( ) reach its minimum?",
      choices: letterChoices(["−130", "−13 23", "− 2 3", "− 2"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q19",
      prompt:
        "f(x) = 1 x\n2 + The function ( ) ( −7) 3 gives a metal\n9\nball’s height above the ground f(x)( ), in inches,\nx seconds after it started moving on a track, where\n0 ≤ x ≤ 10. Which of the following is the best\ninterpretation of the vertex of the graph of\ny = (f(x)) in the x y-plane?",
      choices: letterChoices([
        "The metal ball’s minimum height was 3 inches above the ground.",
        "The metal ball’s minimum height was 7 inches above the ground.",
        "The metal ball’s height was 3 inches above the ground when it started moving.",
        "The metal ball’s height was 7 inches above the ground when it started moving. 20",
      ]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: [{ url: `${figureUrl}-p46-q19-left.png`, alt: "Question figure region page 46" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableDiagnosticItem({
      sourceKey: "sat-pt4-math-m2-q24",
      prompt:
        "Data Set A\n22 23 24 25 26\nThe dot plot represents the 15 values in data set A. Data set B is created by adding 56 to each of the values in data set A. Which of the following correctly compares the medians and the ranges of data sets A and B?",
      choices: letterChoices([
        "The median of data set B is equal to the median of data set A, and the range of data set B is equal to the range of data set A.",
        "The median of data set B is equal to the median of data set A, and the range of data set B is greater than the range of data set A.",
        "The median of data set B is greater than the median of data set A, and the range of data set B is equal to the range of data set A.",
        "The median of data set B is greater than the median of data set A, and the range of data set B is greater than the range of data set A.",
      ]),
      questionType: "mcq",
      correctAnswer: "C",
      figures: [{ url: figureUrl, alt: "Diagram from page 47" }],
    }),
    false,
  );
});

test("shared quiz gate rejects character-spaced OCR, module boilerplate D, and exploded tables", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(isStudentUsableQuizItem, isStudentUsableDiagnosticItem);
  assert.equal(
    isMathQuizItem({
      prompt: "Which choice completes the text with the most logical transition?",
      section: "rw",
      choices: letterChoices(["However", "Therefore", "Meanwhile", "Similarly"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: "The graph of y = f(x) is shown in the xy-plane. What is the vertex of the graph?",
      section: "math",
      choices: letterChoices(["(-2, 3)", "(0, 0)", "(2, -1)", "(3, 4)"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "T h e g r a p h s h o w s the relationship. Which choice is correct?",
      choices: letterChoices(["Positive", "Negative", "None", "Undefined"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "Which choice completes the text with the most logical transition?",
      choices: letterChoices(["However", "Therefore", "Meanwhile", "Module 2 Reading and Writing GO ON TO THE NEXT PAGE"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "Yes No Total Men 12 8 20 Women 15 5 20 Which choice uses data from the table?",
      choices: letterChoices(["12", "15", "20", "8"]),
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
});

test("drops remaining Oct 2 smashed-table, missing-figure, and unavailable-choice items", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "AblationRatesforThreeElementsinCosmicDust,byDustSourceElement SPC AST HTC OCC iron 20% 28% 90% 98% potassium 44% 74% 97% 100% sodium 45% 75% 99% 100% Earth’s atmosphere is bombarded by cosmic dust. Which choice most effectively uses data from the table to complete the example?",
      choices: letterChoices([
        "iron from SPC dust is 20%.",
        "sodium from OCC dust is 100%.",
        "iron from HTC dust is 90%.",
        "potassium from AST dust is 75%.",
      ]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "Note:Figuresnotdrawntoscale. Righttriangles PQR and STU are similar, where P corresponds to S. If the measure of angle Q is 18°, what is the measure of angle S?",
      choices: letterChoices(["18°", "72°", "82°", "162°"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "Thescatterplotshowingtherelationshipbetweentwovariables, x and y. y U12345678910 Which of the following equations is the most appropriate linear model for the data shown?",
      choices: letterChoices(["y = 0.9 + 9.4x", "y = 0.9 − 9.4x", "y = 9.4 + 0.9x", "y = 9.4 − 0.9x"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "Linetinthexy-planehasaslopeof1–3andpassesthroughthepoint(9,10). Which equation defines line t?",
      choices: letterChoices(["y=13x-3", "y=9+10x", "y=-+103x", "y=-+133"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "=206(1.034)x models the value, The function f(x) in dollars, of a certain bank account by the end of each year from 1957 through 1972, where x is the number of years after 1957. Which of the following is the best interpretation of f(5) is approximately equal to 243 in this context?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "Square P has a side length of x inches. Square Q has a perimeter that is 176 inches greater than the perimeter of square P. The function f gives the area of square Q, in square inches. Which of the following defines f?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
});

test("drops Oct 2 Q77–82 smashed stems, empty A–D, and incomplete A/B-only sets", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "14x = 2 w + 19 7y The given equation relates the distinct positive real numbers w, x, and y. Which equation correctly expresses w in terms of x and y ? f(x)",
      choices: [],
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "A right triangle has sides of length 2 2 , 6 2 , and 80 units. What is the area of the triangle, in square units?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "2 4x + bx − 45, where b is a constant, The expression can be rewritten as (hx + k)(x + j), where h, k, and j are integer constants. Which of the following must be an integer?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "y = 2x2 − 21x + 64 y = 3x + a In the given system of equations, a is a constant. The graphs of the equations in the given system intersect at exactly one point, ( , x y), in the x y-plane. What is the value of x?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "An isosceles right triangle has a hypotenuse of length 58 inches. What is the perimeter, in inches, of this triangle?",
      choices: [
        { id: "a", label: "A", text: "2/29" },
        { id: "b", label: "B", text: "2/58" },
      ],
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    hasCompleteLetterChoiceText([
      { id: "a", label: "A", text: "2/29" },
      { id: "b", label: "B", text: "2/58" },
    ]),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "In the x y-plane, a parabola has vertex (9, −14) and intersects the x-axis at two points. If the equation of the parabola is written in the form y = ax2 + bx + c, where a, b, and c are constants, which of the ? following could be the value of a + b + c",
      choices: [],
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
  assert.equal(
    isStudentUsableServedQuestion({
      prompt: "An isosceles right triangle has a hypotenuse of length 58 inches. What is the perimeter?",
      choices: letterChoices(["2/29", "2/58"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
});

test("drops Oct 2 Q83–91 figure-only or wiped A–D items; keeps intact slash-fraction Q89", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const emptyLetters = letterChoices(["", "", "", ""]);
  const triangleFigure = {
    url: `${figureUrl}-p40-q27-draw1.png`,
    alt: "Diagram from page 40",
  };
  const graphFigure = {
    url: `${figureUrl}-p41-draw1.png`,
    alt: "Diagram from page 41",
  };

  assert.equal(
    isStudentUsableQuizItem({
      prompt: "Note: Figure not drawn to scale.",
      choices: emptyLetters,
      questionType: "mcq",
      correctAnswer: "B",
      figures: [triangleFigure],
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "",
      stimulus: `![Exponential graph](${graphFigure.url})`,
      choices: [],
      questionType: "mcq",
      correctAnswer: "A",
      figures: [graphFigure],
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "",
      stimulus: `![Parabola](${graphFigure.url})`,
      choices: emptyLetters,
      questionType: "mcq",
      correctAnswer: "C",
      figures: [{ ...graphFigure, alt: "Diagram from page 42" }],
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "16+30=190 xWhich equation has the same solution as the given equation?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
      choices: letterChoices(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );
  assert.equal(
    isStudentUsableServedQuestion({
      prompt: "x/4 + 1 = 33 Which equation has the same solution as the given equation?",
      choices: letterChoices(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. A person rents a surfboard for t hours and intends to spend a maximum of $75 to rent the surfboard. Which inequality represents this situation?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
});

test("drops Oct 2 Q92–98 OCR-garbage and wiped A–D items; keeps readable Q93", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const emptyLetters = letterChoices(["", "", "", ""]);
  const graphFigure = {
    url: `${figureUrl}-p42-draw1.png`,
    alt: "Estimated number of chipmunks",
  };

  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "= ^ h inFor thelinearfunctionf , thegraphof y f(x)thexy-planehasaslopeof7andpassesthrough the ^ h. Whichequationdefinesf ? point0,0 5 ^ h",
      choices: emptyLetters,
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "s + 7 = 27 r = 3What is thesolution (r, s) tothegivensystemofequations?",
      choices: letterChoices(["(6,3)", "(3,6)", "(3,27)", "(27,3)"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );
  assert.equal(
    isStudentUsableServedQuestion({
      prompt: "s + 7 = 27\nr = 3\nWhat is the solution (r, s) to the given system of equations?",
      choices: letterChoices(["(6,3)", "(3,6)", "(3,27)", "(27,3)"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "",
      stimulus: `![Chipmunk line graph](${graphFigure.url})`,
      choices: emptyLetters,
      questionType: "mcq",
      correctAnswer: "B",
      figures: [graphFigure],
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "12x3 −5x ? 3Which expressionisequivalentto",
      choices: [],
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "x + y = 18 5 y = x What is thesolution (, x y) tothegivensystemofequations?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "The point (8, 2) in the xy-plane is a solution to which of the following systems of inequalities?",
      choices: letterChoices(["x > 0 y > 0", "x > 0 y < 0", "x < 0 y > 0", "x < 0 y < 0"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
});

test("drops Oct 2 Q99–106 scrambled or incomplete A–D items and smashed 2 –4x –7x; keeps 21px Q105", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "= x2 −3 h x Which tablegivesthreevaluesof x andtheirfor thegivencorrespondingvaluesof x functionh?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "= 270(0.1)x. WhatThe functionf isdefinedby f(x)isthevalueof f (0)?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "2 −4x −7x = −36Whatisthepositivesolutiontothegivenequation?",
      choices: letterChoices(["7/4", "9/4", "4", "7"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    hasCompleteLetterChoiceText([
      { id: "a", label: "A", text: "7,500" },
      { id: "b", label: "B", text: "15,000" },
      { id: "c", label: "C", text: "22,500" },
    ]),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "A proposal for a new library was included on an election ballot. A radio show stated that 3 times as many people voted in favor of the proposal as people who voted against it. A social media post reported that 15,000 more people voted in favor of the proposal than voted against it. Based on these data, how many people voted against the proposal?",
      choices: [
        { id: "a", label: "A", text: "7,500" },
        { id: "b", label: "B", text: "15,000" },
        { id: "c", label: "C", text: "22,500" },
      ],
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "−3x + 21px = 84 In thegivenequation, p isaconstant. Theequationhasnosolution. Whatisthevalueof p ?",
      choices: letterChoices(["0", "1/7", "4/3", "4"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    true,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "=(x −10)(x +13) f(x) The functionf isdefinedby thegivenequation. Forwhatvalueof x doesf(x)reachitsminimum?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
  );
});

test("drops Oct 2 Q107–114 exploded OCR, missing figures, and character-spaced garbage", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));

  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "f(x)=1 x 2 + The function (-7) 3 gives a metal 9 ball’s height above the ground f(x), in inches, x seconds after it started moving on a track, where 0 ≤ x ≤ 10. Which of the following is the best interpretation of the vertex of the graph of y = (f(x)) in the x y-plane?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "The equation 2 2 x + (y –1) = 49 represents circle A. Circle B is obtained by shifting circle A down 2 units in the x y-plane. Which of the following equations represents circle B? 2 2 (x –2) + (y –1) =",
      choices: [],
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "Two identical rectangular prisms each have a height of 90 centimeters (cm). The base of each prism is a 2 cm . square, and the surface area of each prism is K If the prisms are glued together along a square base, the resulting prism has a surface area of 92 K 2 cm . 47 What is the side length, in cm, of each square base?",
      choices: letterChoices(["4", "8", "9", "16"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "f X -2 2 = is The graph of the quadratic function y f(x) shown. What is the vertex of the graph?",
      choices: [],
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "Which expression is equivalent to x x y 6 5 4 ? + +",
      choices: letterChoices(["x15", "y15", "xy114+", "xy304+"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "I, 7 X 12345678910 For how many of the 10 data points is the actual y-value greater than the y-value predicted by the line of best fit?",
      choices: letterChoices(["3", "4", "6", "7"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
  );
});

test("drops Oct 2 Q115/Q117/Q119 axis-bleed, smashed algebra, and exploded two-way tables", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const dotPlot = {
    url: `${figureUrl}-p48-draw1.png`,
    alt: "Dot plot of sea star diameters",
  };
  const tableCrop = {
    url: `${figureUrl}-p49-draw1.png`,
    alt: "Cropped two-way table",
  };

  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "To study the characteristics of sea stars in a group of tide pools, researchers measured the diameter of the sea stars within the tide pools. The dot plot gives the diameter, to the nearest inch, of each of the sea stars in these tide pools. 16 17 18 19 20 Diameter (inches) Based on the dot plot, how many sea stars had a diameter, to the nearest inch, of 16 inches?",
      choices: letterChoices(["16", "6", "4", "1"]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: [dotPlot],
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt: "x 16( + 15) ? Which expression is equivalent to",
      choices: letterChoices(["x16+31", "16+240x", "16+1x", "x16+15"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "Live east Live west of the river of the river Total Less than 17 11 28 40 years old At least 18 89 107 40 years old Total 35 100 135 The table summarizes members of a local organization by age and whether they live east or west of the river. If a member of the organization is selected at random, what is the probability that the selected member is at least 40 years old?",
      choices: letterChoices(["28/135", "35/135", "100/135", "107/135"]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: [tableCrop],
    }),
    false,
  );
});

test("legacy assignable+letter filter still admits garbage that the usable filter drops", () => {
  const emptyFigurePrimary = {
    questionType: "mcq",
    choices: [
      { id: "a", label: "A", text: "" },
      { id: "b", label: "B", text: "" },
      { id: "c", label: "C", text: "" },
      { id: "d", label: "D", text: "" },
    ],
    correctAnswer: "C",
  };
  assert.equal(isMultipleChoiceQuizItem(emptyFigurePrimary), true);
  assert.equal(isStudentUsableDiagnosticItem({ ...emptyFigurePrimary, prompt: "", figures: [] }), false);
});

test("composes a linear SAT diagnostic from PT4 usable rows and fills dropped math from other SAT packs", async () => {
  const root = resolveCollegeBoardRoot(path.resolve(process.cwd(), "../../content/college-board"));
  const files = (await listOfficialExtractFiles(root)).filter((file) =>
    file.includes("sat-practice-test-"),
  );
  const records = [];
  for (const file of files) {
    const parsed = parseCollegeBoardPayload(await readFile(file, "utf8"), path.basename(file));
    records.push(...parsed.records);
  }

  const unusable = records.filter((row) => !isStudentUsableDiagnosticItem(row));
  assert.ok(unusable.some((row) => isTrueSprQuizItem(row)));
  assert.ok(unusable.some((row) => row.sourceKey === "sat-pt4-math-m1-q3"));
  assert.ok(unusable.some((row) => row.sourceKey === "sat-pt4-math-m1-q12"));
  const brokenMathKeys = [
    "sat-pt4-math-m1-q16",
    "sat-pt4-math-m1-q19",
    "sat-pt4-math-m1-q22",
    "sat-pt4-math-m1-q23",
    "sat-pt4-math-m1-q24",
    "sat-pt4-math-m1-q26",
    "sat-pt11-math-m1-q1",
    "sat-pt8-math-m1-q1",
    "sat-pt6-math-m1-q1",
    "sat-pt9-math-m1-q2",
    "sat-pt10-math-m1-q3",
    "sat-pt11-math-m1-q3",
    "sat-pt4-math-m2-q1",
    "sat-pt4-math-m2-q3",
    "sat-pt4-math-m2-q4",
    "sat-pt4-math-m2-q8",
    "sat-pt4-math-m2-q9",
    "sat-pt4-math-m2-q15",
    "sat-pt4-math-m2-q18",
    "sat-pt4-math-m2-q19",
    "sat-pt4-math-m2-q24",
    "sat-pt4-math-m1-q9",
    "sat-pt4-rw-m1-q8",
    "sat-pt9-math-m1-q10",
    "sat-pt10-math-m2-q12",
    "sat-pt9-math-m1-q12",
    "sat-pt11-math-m1-q15",
    "sat-pt8-math-m1-q18",
    "sat-pt7-math-m1-q19",
    "sat-pt10-math-m2-q4",
    "sat-pt6-math-m2-q17",
    "sat-pt5-math-m2-q19",
    "sat-pt9-math-m2-q22",
  ];
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt11-math-m1-q2"),
    false,
    "slash-fraction equivalent-equation item must stay usable",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt4-math-m2-q5"),
    true,
    "run-on / stacked inequality systems are unreadable OCR, not salvageable at render time",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt4-rw-m1-q17"),
    true,
    "RW mycorrhizal chart with leftover headers and incomplete Corn/yes/15.1 salvage must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt10-math-m1-q22"),
    true,
    "Q85 stacked 1/10 scale-factor fraction must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt4-math-m2-q12"),
    true,
    "glued 2 −4x −7x compact poly OCR must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt4-math-m2-q17"),
    false,
    "21px juxtaposition no-solution item must stay usable",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt4-math-m2-q24"),
    true,
    "dot-plot axis ticks OCR'd into the stem must drop even when A–D text exists",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt4-rw-m1-q8"),
    true,
    "Start/End referenced content markers must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt4-math-m1-q9"),
    true,
    "similar-triangle stem with spaced vertex labels must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt9-math-m1-q10"),
    true,
    "smashed y = px choices must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt10-math-m2-q12"),
    true,
    "66 = 66 x x smashed algebra must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt9-math-m1-q12"),
    true,
    "Q84 smashed π / circle-figure OCR must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt11-math-m1-q15"),
    true,
    "Q86 spaced-decimal slope choices must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt9-math-m2-q22"),
    true,
    "Q120 flattened xy-table choices must drop",
  );
  assert.equal(
    unusable.some((row) => row.sourceKey === "sat-pt10-math-m2-q4"),
    true,
    "Q104 junk-bleed choice D must drop",
  );
  for (const key of brokenMathKeys) {
    assert.ok(
      unusable.some((row) => row.sourceKey === key),
      `expected ${key} to be dropped as broken math OCR`,
    );
  }

  const { selected, composition } = composeDiagnosticItems(records, {
    preferredCollectionSlug: "sat-practice-test-4-digital",
    allowCrossCollectionFill: true,
  });

  assert.equal(composition.sprCount, 0);
  assert.equal(composition.duplicatePrompts, 0);
  assert.equal(composition.residualJunk, 0);
  assert.ok(selected.every((row) => isStudentUsableDiagnosticItem(row)));
  assert.ok(selected.every((row) => auditStudentQuizItem(row).ok));
  if (composition.questionCount === 120) {
    assert.equal(composition.rwCount, 66);
    assert.equal(composition.mathCount, 54);
    assert.deepEqual(composition.modules, {
      "rw-1": 33,
      "rw-2": 33,
      "math-1": 27,
      "math-2": 27,
    });
    assert.equal(composition.usable, true);
    assert.equal(isUsableFullLengthDiagnostic(composition), true);
    assert.ok(composition.filledFromOtherPacks > 0);
    assert.equal(canAssignDiagnostic(composition, selected), true);
  } else {
    assert.equal(composition.usable, false);
    assert.ok(composition.shortfall.questionCount > 0);
    assert.equal(isUsableFullLengthDiagnostic(composition), false);
    assert.ok(
      composition.shortfall.mathCount > 0 || composition.shortfall.rwCount > 0,
      "a thin clean bank must report section shortfall instead of padding junk",
    );
    assert.equal(
      canAssignDiagnostic(composition, selected),
      composition.rwCount > 0 && composition.mathCount > 0,
      "a short clean form with both sections is assignable",
    );
  }
  assert.ok(selected.every((row) => row.examFamily === "sat"));
  assert.equal(
    selected.some((row) => row.sourceKey === "sat-pt4-math-m1-q3"),
    false,
  );
  for (const key of [
    "sat-pt4-math-m1-q16",
    "sat-pt4-math-m1-q19",
    "sat-pt4-math-m1-q22",
    "sat-pt4-math-m1-q23",
    "sat-pt4-math-m1-q24",
    "sat-pt4-math-m1-q26",
    "sat-pt11-math-m1-q1",
    "sat-pt8-math-m1-q1",
    "sat-pt6-math-m1-q1",
    "sat-pt9-math-m1-q2",
    "sat-pt10-math-m1-q3",
    "sat-pt11-math-m1-q3",
    "sat-pt4-math-m2-q1",
    "sat-pt4-math-m2-q3",
    "sat-pt4-math-m2-q4",
    "sat-pt4-math-m2-q8",
    "sat-pt4-math-m2-q9",
    "sat-pt4-math-m2-q15",
    "sat-pt4-math-m2-q18",
    "sat-pt4-math-m2-q19",
    "sat-pt4-math-m2-q24",
    "sat-pt4-math-m1-q9",
    "sat-pt4-rw-m1-q8",
    "sat-pt9-math-m1-q10",
    "sat-pt10-math-m2-q12",
    "sat-pt9-math-m1-q12",
    "sat-pt11-math-m1-q15",
    "sat-pt8-math-m1-q18",
    "sat-pt7-math-m1-q19",
    "sat-pt10-math-m2-q4",
    "sat-pt6-math-m2-q17",
    "sat-pt5-math-m2-q19",
    "sat-pt9-math-m2-q22",
  ]) {
    assert.equal(selected.some((row) => row.sourceKey === key), false, key);
  }
  assert.equal(
    selected.some((row) => row.questionType === "spr" && !/^[a-d]$/i.test(row.correctAnswer)),
    false,
  );

  const fingerprints = new Set(selected.map((row) => `${row.sourceKey}`));
  assert.equal(fingerprints.size, selected.length);

  const order = selected.map((row) => `${row.section}-${row.module}`);
  const firstMath = order.findIndex((slot) => slot.startsWith("math"));
  assert.ok(firstMath > 0);
  assert.ok(order.slice(0, firstMath).every((slot) => slot.startsWith("rw")));
});

test("stays inside one collection when cross-pack fill is disabled", async () => {
  const root = resolveCollegeBoardRoot(path.resolve(process.cwd(), "../../content/college-board"));
  const text = await readFile(path.join(root, "sat-practice-test-4-digital.jsonl"), "utf8");
  const parsed = parseCollegeBoardPayload(text, "sat-practice-test-4-digital.jsonl");
  const selected = selectUsableDiagnosticItems(parsed.records, {
    preferredCollectionSlug: "sat-practice-test-4-digital",
    allowCrossCollectionFill: false,
  });
  assert.ok(selected.length < 80, "a single pack must stay thin rather than keep broken OCR to hit 80");
  assert.ok(selected.every((row) => row.collectionSlug === "sat-practice-test-4-digital"));
  assert.ok(selected.every((row) => isStudentUsableDiagnosticItem(row)));
  const single = summarizeDiagnosticComposition(selected);
  assert.equal(single.usable, false);
  assert.ok(single.shortfall.questionCount > 0);
});

test("fail-closed: a short clean diagnostic is assignable and is not labeled usable 120", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const rw = Array.from({ length: 8 }, (_, index) => ({
    id: `rw-short-${index}`,
    sourceKey: `rw-short-${index}`,
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "rw" as const,
    module: 1,
    questionNumber: index + 1,
    position: index,
    prompt: `Which choice completes the text with the most logical and precise word or phrase? Item ${index + 1}.`,
    choices: letterChoices(["selecting", "inspecting", "creating", "deciding"]),
    questionType: "mcq",
    correctAnswer: "A",
  }));
  const math = Array.from({ length: 6 }, (_, index) => ({
    id: `math-short-${index}`,
    sourceKey: `math-short-${index}`,
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "math" as const,
    module: 1,
    questionNumber: index + 1,
    position: 20 + index,
    prompt: `x/4 + ${index + 1} = 33\nWhich equation has the same solution as the given equation?`,
    choices: letterChoices(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
    questionType: "mcq",
    correctAnswer: "A",
  }));
  const { selected, composition } = composeDiagnosticItems([...rw, ...math], {
    preferredCollectionSlug: "sat-practice-test-4-digital",
  });
  assert.equal(selected.length, 14);
  assert.equal(composition.usable, false);
  assert.ok(composition.shortfall.questionCount > 0);
  assert.equal(composition.residualJunk, 0);
  assert.equal(canAssignDiagnostic(composition, selected), true);
  const copy = diagnosticAssignmentCopy(composition, "Taito’s SAT Session with Eunice");
  assert.match(copy.title, /14 clean questions/);
  assert.equal(copy.title.includes("Full-length"), false);
  assert.match(copy.instructions, /could not fill a clean 120/);
});

test("fail-closed: cannot mark usable or assign when only dirty math remains", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const neighbor = {
    url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p35-draw1.png",
    alt: "Diagram from page 35",
  };
  const rw = Array.from({ length: 66 }, (_, index) => ({
    id: `rw-${index}`,
    sourceKey: `rw-${index}`,
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "rw" as const,
    module: index < 33 ? 1 : 2,
    questionNumber: (index % 33) + 1,
    position: index,
    prompt: `Which choice completes the text with the most logical and precise word or phrase? Item ${index + 1}.`,
    choices: letterChoices(["selecting", "inspecting", "creating", "deciding"]),
    questionType: "mcq",
    correctAnswer: "A",
  }));
  const dirtyMath = [
    {
      id: "math-table",
      sourceKey: "math-table",
      collectionSlug: "sat-practice-test-4-digital",
      examFamily: "sat",
      section: "math" as const,
      module: 1,
      questionNumber: 1,
      position: 70,
      prompt:
        "For the linear function f, the table shows three values of x and their corresponding values of f(x). Which equation defines f(x)?",
      choices: letterChoices(["f(x)=3x+29", "f(x)=29x+32", "f(x)=35x+29", "f(x)=32x+35"]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: [neighbor],
    },
    {
      id: "math-trig",
      sourceKey: "math-trig",
      collectionSlug: "sat-practice-test-4-digital",
      examFamily: "sat",
      section: "math" as const,
      module: 1,
      questionNumber: 2,
      position: 71,
      prompt: "In triangle QRS shown, QR RS. Which expression represents the length of QS?",
      choices: letterChoices(["cosQ 18", "sinQ 18 18", "cosQ 18", "sinQ"]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: [neighbor],
    },
    {
      id: "math-graph",
      sourceKey: "math-graph",
      collectionSlug: "sat-practice-test-4-digital",
      examFamily: "sat",
      section: "math" as const,
      module: 2,
      questionNumber: 1,
      position: 90,
      prompt: "The graph of y = f(x) is shown in the xy-plane. What is the vertex of the graph?",
      choices: letterChoices(["(-2, 3)", "(0, 0)", "(2, -1)", "(3, 4)"]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: [neighbor],
    },
  ];
  for (const item of dirtyMath) {
    assert.equal(isStudentUsableQuizItem(item), false, `${item.id} must fail the live audit`);
    assert.ok(auditStudentQuizItem(item).reasons.length > 0);
  }
  assert.ok(auditStudentQuizItem(dirtyMath[0]!).reasons.includes("table_cite_without_values"));
  const { selected, composition } = composeDiagnosticItems([...rw, ...dirtyMath], {
    preferredCollectionSlug: "sat-practice-test-4-digital",
    allowCrossCollectionFill: true,
  });
  assert.equal(selected.some((row) => row.section === "math"), false);
  assert.equal(composition.mathCount, 0);
  assert.equal(composition.usable, false);
  assert.ok(composition.shortfall.mathCount >= 54);
  assert.equal(canAssignDiagnostic(composition, selected), false);
});

test("fail-closed: table-cite-without-values cannot pass even with a page PNG", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const item = {
    prompt:
      "For the linear function f, the table shows three values of x and their corresponding values of f(x). Which equation defines f(x)?",
    section: "math" as const,
    choices: letterChoices(["f(x)=3x+29", "f(x)=29x+32", "f(x)=35x+29", "f(x)=32x+35"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: [
      {
        url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p35-draw1.png",
        alt: "Diagram from page 35",
      },
    ],
  };
  const audit = auditStudentQuizItem(item);
  assert.equal(audit.ok, false);
  assert.ok(audit.reasons.includes("table_cite_without_values"));
  assert.equal(isStudentUsableMathQuizItem(item), false);
});

test("prefer figure-primary for smashed trig when a full-question crop and clean A–D exist", () => {
  const letterChoices = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const smashed = {
    prompt: "In triangle QRS shown, QR RS. Which expression represents the length of QS?",
    section: "math" as const,
    choices: letterChoices(["cosQ 18", "sinQ 18 18", "2", "sinQ"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: [
      {
        url: "https://app.acceptedadmissions.org/media/sat-bank/pack/q88-question.png",
        alt: "Question region including choices A–D",
        role: "question_region",
      },
    ],
  };
  assert.equal(isStudentUsableMathQuizItem(smashed), false, "smashed A–D still drop");
  const salvaged = {
    ...smashed,
    choices: letterChoices(["18", "36", "72", "90"]),
  };
  assert.equal(isStudentUsableMathQuizItem(salvaged), true);
  assert.equal(isStudentUsableQuizItem(salvaged), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      ...salvaged,
      figures: [{ url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p35-draw1.png", alt: "Diagram from page 35" }],
    }),
    false,
    "text-only smash without a full-question crop must drop",
  );
});
