import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isMathQuizItem,
  isSafeToShowStudentQuizItem,
  isStudentUsableMathQuizItem,
  isStudentUsableQuizItem,
  isStudentUsableServedQuestion,
} from "./sat-bank-diagnostic-quality.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  looksAxisTickBleed,
  looksExtractionMarkerBleed,
  looksGarbledExtractText,
  looksSmashedAlgebraChoice,
  looksSmashedAlgebraText,
  looksSpacedGeometryLabels,
  stemCitesVisual,
} from "./sat-bank-figure-primary.ts";

const letterChoices = (texts: string[]) =>
  ["A", "B", "C", "D"].map((label, index) => ({
    id: label.toLowerCase(),
    label,
    text: texts[index] ?? "",
  }));

const figure = [
  {
    url: "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p35-draw1.png",
    alt: "Diagram from page 35",
  },
];

/**
 * Live Taito Oct 2 stems from the 2026-09-10 production audit.
 * These must never pass the shared student-usable gates.
 */
test("live audit: extraction-marker bleed never passes RW or math", () => {
  const prompt = `The mimosa tree evolved in East Asia, where the
beetle Bruchidius terrenus preys on its seeds. In 1785,
mimosa trees were introduced to North America, far
from any B. terrenus. Start referenced content: But e
volutionary links between predators and their prey can
persist across centuries and continents. End referenced content.2001, B. terrenus was
introduced in southeastern North America near
where botanist Shu-Mei Chang and colleagues had
been monitoring mimosa trees. Within a year,
93 % of the trees had been attacked by the
beetles.
Which choice best describes the function of the third
sentence in the overall structure of the text?`;
  assert.equal(looksExtractionMarkerBleed(prompt), true);
  assert.equal(looksGarbledExtractText(prompt), true);
  const item = {
    prompt,
    section: "rw" as const,
    choices: letterChoices([
      "It states the hypothesis that Chang and colleagues had set out to investigate using mimosa trees and B. terrenus.",
      "It presents a generalization that is exemplified by the discussion of the mimosa trees and B. terrenus.",
      "It offers an alternative explanation for the findings of Chang and colleagues.",
      "It provides context that clarifies why the species mentioned spread to new locations.",
    ]),
    questionType: "mcq",
    correctAnswer: "B",
  };
  assert.equal(isMathQuizItem(item), false);
  assert.equal(isStudentUsableQuizItem(item), false, "Q8 extraction markers must drop");
  assert.equal(isStudentUsableServedQuestion(item), false);
  assert.equal(isSafeToShowStudentQuizItem(item), false);

  const splitMarker =
    "Start refere\nnced content: given the negligible cost of messaging. End referenced content\nWhich choice best describes the function of the underlined portion?";
  assert.equal(looksExtractionMarkerBleed(splitMarker), true);
  assert.equal(
    isStudentUsableQuizItem({
      prompt: splitMarker,
      section: "rw",
      choices: letterChoices(["It notes a cost.", "It names a date.", "It cites a study.", "It defines a term."]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
  );
});

test("live audit: figure cite without a usable figure never passes", () => {
  const similarTriangles = `Note: Figures not drawn to scale.
Right triangles P Q R and S T U are similar, where P
corresponds to S. If the measure of angle Q is 18°,
what is the measure of angle S ?`;
  assert.equal(stemCitesVisual(similarTriangles), true);
  assert.equal(looksSpacedGeometryLabels(similarTriangles), true);
  const q70 = {
    prompt: similarTriangles,
    section: "math" as const,
    choices: letterChoices(["18°", "72°", "82°", "162°"]),
    questionType: "mcq",
    correctAnswer: "B",
  };
  assert.equal(isStudentUsableMathQuizItem(q70), false, "Q70 missing figure must drop");
  assert.equal(isStudentUsableQuizItem(q70), false);
  assert.equal(
    isStudentUsableMathQuizItem({ ...q70, figures: figure }),
    false,
    "Q70 spaced vertex OCR is bleed even when a page crop exists",
  );

  const datPlot = `Data Set A
22 23 24 25 26
The dat plot represents the 15 values in data set A.
Data set B is created by adding 56 to each of the
values in data set A. Which of the following correctly
compares the medians and the ranges of data sets A
and B?`;
  assert.equal(stemCitesVisual(datPlot), true, "dat plot OCR still cites a visual");
  assert.equal(looksAxisTickBleed(datPlot), true);
  const q100 = {
    prompt: datPlot,
    section: "math" as const,
    choices: letterChoices([
      "The median of data set B is equal to the median of data set A, and the range of data set B is equal to the range of data set A.",
      "The median of data set B is equal to the median of data set A, and the range of data set B is greater than the range of data set A.",
      "The median of data set B is greater than the median of data set A, and the range of data set B is equal to the range of data set A.",
      "The median of data set B is greater than the median of data set A, and the range of data set B is greater than the range of data set A.",
    ]),
    questionType: "mcq",
    correctAnswer: "C",
  };
  assert.equal(isStudentUsableMathQuizItem(q100), false, "Q100 dat-plot without figure must drop");
  assert.equal(isStudentUsableQuizItem(q100), false);
  assert.equal(
    isStudentUsableMathQuizItem({
      ...q100,
      prompt: datPlot.replace("dat plot", "dot plot"),
      figures: figure,
    }),
    false,
    "Q100 axis-tick bleed drops even with a crop",
  );

  const inTheFigure = {
    prompt:
      "Note: Figure not drawn to scale.\nIn the figure, two lines intersect at a point. Angle 1 and angle 2 are vertical angles. The measure of angle 1 is 72°. What is the measure of angle 2?",
    section: "math" as const,
    choices: letterChoices(["18°", "72°", "108°", "162°"]),
    questionType: "mcq",
    correctAnswer: "B",
  };
  assert.equal(stemCitesVisual(inTheFigure.prompt), true);
  assert.equal(isStudentUsableMathQuizItem(inTheFigure), false);
  assert.equal(isStudentUsableMathQuizItem({ ...inTheFigure, figures: figure }), true);
});

test("live audit: smashed algebra stems and choices never pass", () => {
  const q90 = {
    prompt: `y −57 = px
The given equation relates the positive numbers p, x,
and y. Which equation correctly expresses y in terms
of p and x ?`,
    section: "math" as const,
    choices: letterChoices(["y x p = 57 +", "y px = + 57", "y = 57 px px", "y = 57"]),
    questionType: "mcq",
    correctAnswer: "B",
  };
  assert.equal(looksSmashedAlgebraChoice("y x p = 57 +"), true);
  assert.equal(looksSmashedAlgebraChoice("y px = + 57"), true);
  assert.equal(looksSmashedAlgebraChoice("y = 57 px px"), true);
  assert.equal(isStudentUsableMathQuizItem(q90), false, "Q90 smashed choices must drop");
  assert.equal(isStudentUsableQuizItem(q90), false);

  const q120Prompt = "66 = 66 x x\nHow many solutions does the given equation have?";
  assert.equal(looksSmashedAlgebraText(q120Prompt), true);
  const q120 = {
    prompt: q120Prompt,
    section: "math" as const,
    choices: letterChoices(["Exactly one", "Exactly two", "Infinitely many", "Zero"]),
    questionType: "mcq",
    correctAnswer: "C",
  };
  assert.equal(isStudentUsableMathQuizItem(q120), false, "Q120 smashed 66 x x must drop");
  assert.equal(isStudentUsableServedQuestion({ ...q120, subject: "Math" }), false);

  const lateMath = [
    "8 = 6, what is the value of 72 If x x ?",
    "2 x 8 40 32\n=\nWhat is the positive solution to the given equation?",
    "= 40 + 3 s t\nThe equation gives the speed s, in miles per hour.",
    "P t = 1,800 1.02 t\nThe function P gives the estimated number of marine mammals.",
    "x 3 = 12\n−3 + x y = −6\nThe solution to the given system of equations is x y ( , ). What is the value of y ?",
    "y = −3 x\n4 + x y = 15\nThe solution to the given system of equations is x y ( , ). What is the value of x ?",
    "6 .,,,,,.~\n~ ,,,,\n4.,,, ~v\nWhat is the y-intercept of the line graphed?",
    "> 4 + 8 y x For which of the following tables are all the values solutions?",
    "x + 7 = 10 2 x + 7 = y Which ordered pair is a solution?",
    "R S sin is cos 4 . What is the value of",
  ];
  for (const prompt of lateMath) {
    assert.equal(
      isStudentUsableMathQuizItem({
        prompt,
        section: "math",
        choices: letterChoices(["1", "2", "3", "4"]),
        questionType: "mcq",
        correctAnswer: "A",
      }),
      false,
      `late math must drop: ${prompt.slice(0, 40)}`,
    );
  }
});

test("live audit: readable controls still stay", () => {
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
      section: "math",
      choices: letterChoices(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt:
        "−3x + 21px = 84 In the given equation, p is a constant. The equation has no solution. What is the value of p ?",
      section: "math",
      choices: letterChoices(["0", "1/7", "4/3", "4"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    true,
  );
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "Particle physicists spend much of their time ______ what is invisible.\nWhich choice completes the text with the most logical and precise word or phrase?",
      section: "rw",
      choices: letterChoices(["selecting", "inspecting ~ ---~", "creating ~", "deciding"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    true,
  );
});
