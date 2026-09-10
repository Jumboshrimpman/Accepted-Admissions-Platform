import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isSafeToShowStudentQuizItem,
  isStudentUsableQuizItem,
  isStudentUsableServedQuestion,
} from "./sat-bank-diagnostic-quality.ts";

const figureUrl =
  "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/q-flagged.png";

function letters(texts: string[]) {
  return ["A", "B", "C", "D"].map((label, index) => ({
    id: label.toLowerCase(),
    label,
    text: texts[index] ?? "",
  }));
}

const empty = letters(["", "", "", ""]);

/**
 * Every messy math item Sama screenshot-flagged. Shared gate must drop these
 * on diagnostic, routine, tutor-built, and lesson-retry quizzes.
 */
const FLAGGED_DROPS: Array<{
  id: string;
  prompt: string;
  choices?: ReturnType<typeof letters>;
  figures?: Array<{ url: string; alt: string }>;
}> = [
  {
    id: "Q15",
    prompt: "AblationRates % % % % iron 20% 28% 90% 98% Which choice uses data from the table?",
    choices: letters(["20%", "28%", "90%", "98%"]),
  },
  {
    id: "Q70",
    prompt: "Figuresnotdrawntoscale. Righttriangles PQR and STU are similar. What is the measure of angle S?",
    choices: letters(["18°", "72°", "82°", "162°"]),
  },
  {
    id: "Q71",
    prompt: "Thescatterplot y U12345678910 Which equation is the most appropriate linear model?",
    choices: letters(["y = 0.9 + 9.4x", "y = 0.9 − 9.4x", "y = 9.4 + 0.9x", "y = 9.4 − 0.9x"]),
  },
  {
    id: "Q73",
    prompt: "The slopeof1–3 and y=-+103x. Which equation represents the line?",
    choices: letters(["y=-+103x", "y=3x", "y=x", "y=0"]),
  },
  {
    id: "Q77",
    prompt: "14x = 2 w + 19 7y expresses w f(x)",
    choices: empty,
  },
  {
    id: "Q78",
    prompt: "A right triangle has sides of length 2 2 , 6 2 , and 80 units. What is the area?",
    choices: empty,
  },
  {
    id: "Q79",
    prompt: "Which expression is equivalent to 2 4x + 3?",
    choices: empty,
  },
  {
    id: "Q80",
    prompt: "y = 2x2 − 21x + 64 point, ( ,x y), What is the solution?",
    choices: empty,
  },
  {
    id: "Q81",
    prompt: "Which fraction is equivalent?",
    choices: [
      { id: "a", label: "A", text: "2/29" },
      { id: "b", label: "B", text: "2/58" },
    ],
  },
  {
    id: "Q82",
    prompt: "y = ax2 + bx + c, which of the ? following could be",
    choices: empty,
  },
  {
    id: "Q83",
    prompt: "Note: Figure not drawn to scale.",
    choices: empty,
    figures: [{ url: `${figureUrl}-triangle`, alt: "Triangle" }],
  },
  {
    id: "Q88",
    prompt: "16+30=190 xWhich equation has the same solution as the given equation?",
    choices: empty,
  },
  {
    id: "Q91",
    prompt:
      "The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. Which inequality represents this situation?",
    choices: empty,
  },
  {
    id: "Q92",
    prompt:
      "= ^ h inFor thelinearfunctionf , thegraphof y f(x)thexy-planehasaslopeof7andpassesthrough the ^ h. Whichequationdefinesf ? point0,0 5 ^ h",
    choices: empty,
  },
  {
    id: "Q94",
    prompt: "",
    choices: empty,
    figures: [{ url: `${figureUrl}-chipmunk`, alt: "Chipmunk line graph" }],
  },
  {
    id: "Q96",
    prompt: "12x3 −5x ? 3Which expressionisequivalentto",
    choices: empty,
  },
  {
    id: "Q97",
    prompt: "x + y = 18 5 y = x What is thesolution (, x y) tothegivensystemofequations?",
    choices: empty,
  },
  {
    id: "Q99",
    prompt: "= x2 −3 h x Which tablegivesthreevaluesof x andtheirfor thegivencorrespondingvaluesof x functionh?",
    choices: empty,
  },
  {
    id: "Q100",
    prompt: "= 270(0.1)x. WhatThe functionf isdefinedby f(x)isthevalueof f (0)?",
    choices: empty,
  },
  {
    id: "Q104",
    prompt: "A proposal for a new library was included on an election ballot. How many people voted against it?",
    choices: [
      { id: "a", label: "A", text: "7,500" },
      { id: "b", label: "B", text: "15,000" },
      { id: "c", label: "C", text: "22,500" },
    ],
  },
  {
    id: "Q106",
    prompt: "=(x −10)(x +13) f(x) The functionf isdefinedby thegivenequation.",
    choices: empty,
  },
  {
    id: "Q107",
    prompt: "f(x)=1 x 2 + The function (-7) 3 gives a metal 9 ball’s height above the ground f(x)",
    choices: empty,
  },
  {
    id: "Q109",
    prompt: "The equation 2 2 x + (y –1) = 49 represents circle A.",
    choices: empty,
  },
  {
    id: "Q110",
    prompt: "The resulting prism has a surface area of 92 K 2 cm . 47 What is the side length?",
    choices: letters(["4", "8", "9", "16"]),
  },
  {
    id: "Q112",
    prompt: "f X -2 2 = is The graph of the quadratic function y f(x) shown. What is the vertex of the graph?",
    choices: empty,
  },
  {
    id: "Q113",
    prompt: "Which expression is equivalent to x x y 6 5 4 ? + +",
    choices: letters(["x15", "y15", "xy114+", "xy304+"]),
  },
  {
    id: "Q114",
    prompt:
      "I, 7 X 12345678910 For how many of the 10 data points is the actual y-value greater than the y-value predicted by the line of best fit?",
    choices: letters(["3", "4", "6", "7"]),
  },
  {
    id: "Q115",
    prompt:
      "The dot plot gives the diameter. 16 17 18 19 20 Diameter (inches) Based on the dot plot, how many sea stars had a diameter of 16 inches?",
    choices: letters(["16", "6", "4", "1"]),
    figures: [{ url: `${figureUrl}-dots`, alt: "Dot plot" }],
  },
  {
    id: "Q117",
    prompt: "x 16( + 15) ? Which expression is equivalent to",
    choices: letters(["x16+31", "16+240x", "16+1x", "x16+15"]),
  },
  {
    id: "Q119",
    prompt:
      "Live east Live west of the river Total Less than 17 11 28 40 years old At least 18 89 107 Total 35 100 135 The table summarizes members. What is the probability the member is at least 40 years old?",
    choices: letters(["28/135", "35/135", "100/135", "107/135"]),
    figures: [{ url: `${figureUrl}-table`, alt: "Cropped table" }],
  },
];

const FLAGGED_KEEPS: Array<{
  id: string;
  prompt: string;
  choices: ReturnType<typeof letters>;
}> = [
  {
    id: "Q89",
    prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
    choices: letters(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
  },
  {
    id: "Q93",
    prompt: "s + 7 = 27 r = 3What is thesolution (r, s) tothegivensystemofequations?",
    choices: letters(["(6,3)", "(3,6)", "(3,27)", "(27,3)"]),
  },
  {
    id: "Q98",
    prompt: "The point (8, 2) in the xy-plane is a solution to which of the following systems of inequalities?",
    choices: letters(["x > 0 y > 0", "x > 0 y < 0", "x < 0 y > 0", "x < 0 y < 0"]),
  },
  {
    id: "Q103",
    prompt: "2 −4x −7x = −36Whatisthepositivesolutiontothegivenequation?",
    choices: letters(["7/4", "9/4", "4", "7"]),
  },
  {
    id: "Q105",
    prompt: "−3x + 21px = 84 In the given equation, p is a constant. The equation has no solution. What is the value of p ?",
    choices: letters(["0", "1/7", "4/3", "4"]),
  },
];

test("shared math gate drops every Sama-flagged messy item and keeps readable controls", () => {
  for (const item of FLAGGED_DROPS) {
    const input = {
      prompt: item.prompt,
      choices: item.choices ?? empty,
      questionType: "mcq",
      correctAnswer: "A",
      figures: item.figures,
    };
    assert.equal(isStudentUsableQuizItem(input), false, `${item.id} must drop`);
    assert.equal(isSafeToShowStudentQuizItem(input), false, `${item.id} must drop on the shared alias`);
    assert.equal(isStudentUsableServedQuestion(input), false, `${item.id} must drop at serve time`);
  }
  for (const item of FLAGGED_KEEPS) {
    const input = {
      prompt: item.prompt,
      choices: item.choices,
      questionType: "mcq",
      correctAnswer: "A",
    };
    assert.equal(isStudentUsableQuizItem(input), true, `${item.id} must stay`);
    assert.equal(isStudentUsableServedQuestion(input), true, `${item.id} must stay at serve time`);
  }
});
