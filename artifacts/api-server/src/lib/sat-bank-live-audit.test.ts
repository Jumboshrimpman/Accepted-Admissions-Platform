import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  auditStudentQuizItem,
  canAssignDiagnostic,
  composeDiagnosticItems,
  isMathQuizItem,
  isSafeToShowStudentQuizItem,
  isStudentUsableMathQuizItem,
  isStudentUsableQuizItem,
  isStudentUsableServedQuestion,
  summarizeDiagnosticComposition,
} from "./sat-bank-diagnostic-quality.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  looksAxisTickBleed,
  looksExtractionMarkerBleed,
  looksGarbledExtractText,
  looksFlattenedFractionChoice,
  looksGluedInequalityChoice,
  looksGluedMinusSpacing,
  looksLeakedNextQuestionChoice,
  looksMalformedFractionChoice,
  looksSmashedAlgebraChoice,
  looksSmashedAlgebraText,
  looksSmashedPiChoice,
  looksSmashedPiToken,
  looksSmashedRadicalText,
  looksSmashedTableChoice,
  looksSmashedTrigToken,
  looksSmashedYxToken,
  looksIsolatedIGlyphs,
  looksStrippedRadicalChoice,
  looksSpacedDecimalChoice,
  looksSpacedGeometryLabels,
  looksStackedFractionDump,
  looksSmashedStackedFraction,
  looksSmashedChartHeaders,
  hasUsableTableData,
  stemCitesDataTable,
  stemCitesMathDataTable,
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
  assert.equal(
    isStudentUsableMathQuizItem({ ...inTheFigure, figures: figure }),
    false,
    "a generic page-neighbor PNG is not a solvable cited figure",
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      ...inTheFigure,
      figures: [
        {
          url: "https://app.acceptedadmissions.org/media/sat-bank/pack/q-question.png",
          alt: "Question region including choices A–D",
          role: "question_region",
        },
      ],
    }),
    true,
    "a real full-question crop makes a clean cited-figure item solvable",
  );
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

test("live audit after #71 rematerialize: π smash, spaced decimals, junk bleed, flattened tables drop", () => {
  const q84Prompt = `Note: Figure not drawn to scale.
π 144 , The circle shown has center O, circumference
and diameters PR and QS. The length of arc PS is
twice the length of arc PQ. What is the length of
arc QR ?`;
  assert.equal(looksSmashedPiToken(q84Prompt), true);
  assert.equal(looksSmashedPiChoice("24 π"), true);
  assert.equal(looksSmashedPiChoice("π 48"), true);
  assert.equal(looksSmashedPiChoice("24π"), false);
  assert.equal(stemCitesVisual(q84Prompt), true);
  const q84 = {
    prompt: q84Prompt,
    section: "math" as const,
    choices: letterChoices(["24 π", "π 48", "72 π", "96 π"]),
    questionType: "mcq",
    correctAnswer: "B",
    figures: figure,
  };
  assert.equal(isStudentUsableMathQuizItem(q84), false, "Q84 smashed π / figure OCR must drop even with a crop");
  assert.equal(isStudentUsableQuizItem(q84), false);
  assert.equal(isStudentUsableServedQuestion({ ...q84, subject: "Math" }), false);

  const q86Prompt = `The scatterplot shows the relationship between x
and y. A line of best fit is also shown.
Which of the following is closest to the slope of this
line of best fit?`;
  assert.equal(looksSpacedDecimalChoice(".0 60"), true);
  assert.equal(looksSpacedDecimalChoice(".2 50"), true);
  assert.equal(looksSpacedDecimalChoice("0.60"), false);
  const q86 = {
    prompt: q86Prompt,
    section: "math" as const,
    choices: letterChoices([".0 60", ".2 50", ".7 80", ".8 00"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: figure,
  };
  assert.equal(isStudentUsableMathQuizItem(q86), false, "Q86 spaced-decimal slope choices must drop");
  assert.equal(isStudentUsableQuizItem(q86), false);

  const q90Prompt = `Circle A has a radius of n 3 and circle B has a radius
129 , where n is a positive constant. The area of n of
circle B is how many times the area of circle A?`;
  assert.equal(looksSmashedRadicalText(q90Prompt), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: q90Prompt,
      section: "math",
      choices: letterChoices(["43", "86", "129", "1,849"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
    "Q90 smashed n√3 / area-of-n OCR must drop",
  );

  const q93Prompt = `12 −2 = −2
n t w
The given equation relates the variables n, t, and w,
where n > 0, t > 0, and w > . Which expression is t
equivalent to n ?`;
  assert.equal(looksStackedFractionDump(q93Prompt), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: q93Prompt,
      section: "math",
      choices: letterChoices(["12 tw", "6( − ) t w", "w t − 6 tw 6 tw", "− w t"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
    "Q93 stacked-fraction dump must drop",
  );

  const junkChoice =
    "26 - ------~ 5 7 = 2 + ( ) m n p The given equation relates the positive numbers m,";
  assert.equal(looksLeakedNextQuestionChoice(junkChoice), true);
  const q104 = {
    prompt:
      "What is the perimeter, in inches, of a rectangle with a\nlength of 4 inches and a width of 9 inches?",
    section: "math" as const,
    choices: letterChoices(["13", "17", "22", junkChoice]),
    questionType: "mcq",
    correctAnswer: "D",
  };
  assert.equal(isStudentUsableMathQuizItem(q104), false, "Q104 junk-bleed choice D must drop");
  assert.equal(isStudentUsableQuizItem(q104), false);

  const q116Prompt = "2 x = −841\nHow many distinct real solutions does the given\nequation have?";
  assert.equal(looksSmashedAlgebraText(q116Prompt), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: q116Prompt,
      section: "math",
      choices: letterChoices(["Exactly one", "Exactly two", "Infinitely many", "Zero"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
    "Q116 smashed 2 x = −841 must drop",
  );

  assert.equal(looksMalformedFractionChoice("−1 7"), true);
  assert.equal(looksMalformedFractionChoice("7/4"), false);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt:
        "= 7 + 1\n8 . Line j is Line k is defined by y x\nperpendicular to line k in the xy-plane. What is\nthe slope of line j ?",
      section: "math",
      choices: letterChoices(["−8", "−1 7", "1/8", "7"]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    false,
    "Q118 malformed −1 7 fraction choice must drop",
  );

  const q119Prompt = `2x −y > 883
For which of the following tables are all the values of
x and their corresponding values of y solutions to the
given inequality?`;
  const q119D =
    "x y 0 442 −2 441 −4 440 - ------~ 20 5y = 10x + 11 −5y = 5x −21 The solution to the given system of equations is";
  assert.equal(looksSmashedTableChoice("x y 440 0 −2 441 −4 442"), true);
  assert.equal(looksLeakedNextQuestionChoice(q119D), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: q119Prompt,
      section: "math",
      choices: letterChoices([
        "x y 440 0 −2 441 −4 442",
        "x y 440 0 −2 442 −4 441",
        "x y 0 442 −2 440 −4 441",
        q119D,
      ]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    false,
    "Q119 flattened table + junk bleed must drop",
  );

  const q120Prompt = `y > 13 −18 x
For which of the following tables are all the values of
x and their corresponding values of y solutions to the
given inequality?`;
  assert.equal(looksSmashedTableChoice("x y 3 21 5 47 8 86"), true);
  assert.equal(looksSmashedTableChoice("xy321547886"), true);
  const q120 = {
    prompt: q120Prompt,
    section: "math" as const,
    choices: letterChoices([
      "x y 3 21 5 47 8 86",
      "x y 3 26 5 42 8 86",
      "x y 3 16 5 42 8 81",
      "x y 3 26 5 52 8 91",
    ]),
    questionType: "mcq",
    correctAnswer: "D",
  };
  assert.equal(isStudentUsableMathQuizItem(q120), false, "Q120 flattened xy-table choices must drop");
  assert.equal(isStudentUsableQuizItem(q120), false);
  assert.equal(isSafeToShowStudentQuizItem(q120), false);
});

test("live audit after #72 rematerialize: table-cite, trig smash, junk-bleed, tan, flattened fractions drop", () => {
  const q68Prompt =
    "For the linear function f, the table shows three values of x and their corresponding values of f(x). Which equation defines f(x)?";
  assert.equal(stemCitesVisual(q68Prompt), true);
  assert.equal(stemCitesMathDataTable(q68Prompt), true);
  const q68 = {
    prompt: q68Prompt,
    section: "math" as const,
    choices: letterChoices(["f(x)=3x+29", "f(x)=29x+32", "f(x)=35x+29", "f(x)=32x+35"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: figure,
  };
  assert.equal(isStudentUsableMathQuizItem(q68), false, "Q68 table cite without recovered values must drop even with a crop");
  assert.equal(isStudentUsableQuizItem(q68), false);
  assert.equal(
    isStudentUsableMathQuizItem({
      ...q68,
      prompt: `x f(x)\n0 29\n1 32\n2 35\n${q68Prompt}`,
    }),
    true,
    "Q68 stays when the table values were recovered",
  );

  const q88Prompt =
    "In triangle QRS shown, QR RS. Which expression < represents the length of QS?";
  assert.equal(looksSmashedTrigToken("cosQ 18"), true);
  assert.equal(looksSmashedTrigToken("sinQ 18 18"), true);
  assert.equal(looksSmashedTrigToken("sinQ"), true);
  assert.equal(looksSmashedTrigToken("cos(Q)"), false);
  assert.equal(looksSmashedTrigToken("sin(18°)"), false);
  const q88 = {
    prompt: q88Prompt,
    section: "math" as const,
    choices: letterChoices(["cosQ 18", "sinQ 18 18", "cosQ 18", "sinQ"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: figure,
  };
  assert.equal(isStudentUsableMathQuizItem(q88), false, "Q88 smashed trig choices / missing QR=RS must drop");
  assert.equal(isStudentUsableQuizItem(q88), false);

  const junkD =
    "1-6=45+600()f(x), in dollars, The function f gives the monthly fee f(x) a facility charge to keep x crates in storage.";
  assert.equal(looksLeakedNextQuestionChoice(junkD), true);
  const q106 = {
    prompt:
      "−11, −9, 26\nA data set of three numbers is shown. If a number from this data set is selected at random, what is the",
    section: "math" as const,
    choices: letterChoices(["0/1", "3", "2/3", junkD]),
    questionType: "mcq",
    correctAnswer: "C",
  };
  assert.equal(isStudentUsableMathQuizItem(q106), false, "Q106 junk-bleed choice D must drop");
  assert.equal(isStudentUsableQuizItem(q106), false);

  const q120Prompt =
    "In triangle XYZ, angle Z is a right angle and the =12 teolength of YZ 21 units. If XZ 5 what is the";
  const q120 = {
    prompt: q120Prompt,
    section: "math" as const,
    choices: letterChoices(["188", "168", "84", "71"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: figure,
  };
  assert.equal(isStudentUsableMathQuizItem(q120), false, "Q120 smashed tan / bare =12 / incomplete If XZ must drop");
  assert.equal(isStudentUsableQuizItem(q120), false);
  assert.equal(isStudentUsableServedQuestion({ ...q120, subject: "Math" }), false);

  assert.equal(looksFlattenedFractionChoice("84a k"), true);
  assert.equal(looksFlattenedFractionChoice("84ak2k"), true);
  assert.equal(looksFlattenedFractionChoice("42a(k+1)k"), true);
  assert.equal(looksFlattenedFractionChoice("42a(k2+1)k"), true);
  assert.equal(looksFlattenedFractionChoice("42a(k+1)/k"), false);
  assert.equal(looksFlattenedFractionChoice("21px"), false);
  const q119 = {
    prompt: "Which expression is equivalent to 42a + 42ak?",
    section: "math" as const,
    choices: letterChoices(["84a k", "84ak2k", "42a(k+1)k", "42a(k2+1)k"]),
    questionType: "mcq",
    correctAnswer: "C",
  };
  assert.equal(isStudentUsableMathQuizItem(q119), false, "Q119 flattened fraction choices must drop");
  assert.equal(isStudentUsableQuizItem(q119), false);

  assert.equal(looksGluedInequalityChoice("x>0y>0"), true);
  assert.equal(looksGluedInequalityChoice("x > 0 y > 0"), true);
  assert.equal(looksGluedInequalityChoice("x > 0y > 0"), true);
  assert.equal(looksGluedInequalityChoice("x > 0\ny > 0"), true);
  assert.equal(looksGluedInequalityChoice("x > 0 and y > 0"), false);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: "The point (8, 2) in the xy-plane is a solution to which of the following systems of inequalities?",
      section: "math",
      choices: letterChoices(["x>0y>0", "x>0y<0", "x<0y>0", "x<0y<0"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
    "Q95 glued inequality choices must drop",
  );

  assert.equal(looksMalformedFractionChoice("51/904,"), true);
  assert.equal(looksMalformedFractionChoice("75/9778,"), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt:
        "The table shows selected values from function f.\nx f(x)\n11\nWhich statement best describes function f?",
      section: "math",
      choices: letterChoices([
        "decreasing linear",
        "increasing linear",
        "decreasing exponential",
        "increasing exponential",
      ]),
      questionType: "mcq",
      correctAnswer: "A",
      figures: figure,
    }),
    false,
    "Q76 cited table with no recovered rows must drop",
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt:
        "The table gives the distribution of votes for a new school mascot and grade level for 80 students.\nGrade level\nWhat is the probability?",
      section: "math",
      choices: letterChoices(["1/9", "1/5", "1/4", "2/3"]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: figure,
    }),
    false,
    "Q78 table-gives cite without recovered values must drop",
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt:
        "Time (years) Total amount (dollars)\nRosa opened a savings account at a bank. The table shows the exponential relationship between the time and the amount.",
      section: "math",
      choices: letterChoices(["n=(1+604)t", "n=(1+0.004)t", "n=604(1+0.004)t", "n=0.004(1+604)t"]),
      questionType: "mcq",
      correctAnswer: "C",
    }),
    false,
    "Q109 flattened table + missing-caret growth must drop",
  );
});

test("live audit: smashed trig with a full-question crop and clean A–D may ship as figure-primary", () => {
  const smashedChoices = letterChoices(["cosQ 18", "sinQ 18 18", "2", "sinQ"]);
  const cleanChoices = letterChoices(["18", "36", "72", "90"]);
  const fullCrop = [
    {
      url: "https://app.acceptedadmissions.org/media/sat-bank/pack/q88-question.png",
      alt: "Question region including choices A–D",
      role: "question_region",
    },
  ];
  const prompt = "In triangle QRS shown, QR RS. Which expression represents the length of QS?";
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt,
      section: "math",
      choices: smashedChoices,
      questionType: "mcq",
      correctAnswer: "A",
      figures: fullCrop,
    }),
    false,
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt,
      section: "math",
      choices: cleanChoices,
      questionType: "mcq",
      correctAnswer: "A",
      figures: fullCrop,
    }),
    true,
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt,
      section: "math",
      choices: cleanChoices,
      questionType: "mcq",
      correctAnswer: "A",
      figures: figure,
    }),
    false,
  );
});

test("live audit: fail-closed cannot assign a diagnostic built only from dirty math", () => {
  const q68 = {
    id: "q68",
    sourceKey: "q68",
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "math" as const,
    module: 1,
    questionNumber: 8,
    position: 8,
    prompt:
      "For the linear function f, the table shows three values of x and their corresponding values of f(x). Which equation defines f(x)?",
    choices: letterChoices(["f(x)=3x+29", "f(x)=29x+32", "f(x)=35x+29", "f(x)=32x+35"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: figure,
  };
  assert.ok(auditStudentQuizItem(q68).reasons.includes("table_cite_without_values"));
  const { selected, composition } = composeDiagnosticItems([q68], {
    preferredCollectionSlug: "sat-practice-test-4-digital",
  });
  assert.equal(selected.length, 0);
  assert.equal(composition.usable, false);
  assert.ok(composition.shortfall.mathCount > 0);
  assert.equal(canAssignDiagnostic(composition, selected), false);
});

test("live audit after #74 rematerialize: RW missing table, 0y, 17yx, histogram still drop", () => {
  const pageCrop = [
    {
      url: "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p12-q17-left.png",
      alt: "Question figure region page 12",
    },
  ];
  const fullCrop = [
    {
      url: "https://app.acceptedadmissions.org/media/sat-bank/pack/q-question.png",
      alt: "Question region including choices A–D",
      role: "question_region",
    },
  ];

  const q14Prompt = `Effects of Mycorrhizal Fungi on 3 Plant Species
Average mass of plants grown in soil containing
Average mass of plants grown in soil that had been treated to kill fungi
Mycorrhizal fungi in soil benefits many plants, substantially increasing the mass of some. After several weeks, the student measured the plants’ average mass and was surprised to discover that ______
Which choice most effectively uses data from the table to complete the statement?`;
  assert.equal(stemCitesDataTable(q14Prompt), true, "RW Q14 chart/table cite must fire without the word table in the title");
  assert.equal(isMathQuizItem({ prompt: q14Prompt, section: "rw" }), false);
  const q14 = {
    id: "q14-rw",
    prompt: q14Prompt,
    section: "rw" as const,
    choices: letterChoices([
      "broccoli grown in soil containing mycorrhizal fungi had a slightly higher average mass than broccoli grown in soil that had been treated to kill fungi.",
      "corn grown in soil containing mycorrhizal fungi had a higher average mass than broccoli grown in soil containing mycorrhizal fungi.",
      "marigolds grown in soil containing mycorrhizal fungi had a much higher average mass than marigolds grown in soil that had been treated to kill fungi.",
      "corn had the highest average mass of all three species grown in soil that had been treated to kill fungi, while marigolds had the lowest.",
    ]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: pageCrop,
  };
  const q14Audit = auditStudentQuizItem(q14);
  assert.equal(q14Audit.ok, false, "RW Q14 table/chart cite without recovered values must drop");
  assert.ok(q14Audit.reasons.includes("table_cite_without_values"));
  assert.equal(isStudentUsableQuizItem(q14), false);
  assert.equal(
    isStudentUsableQuizItem({ ...q14, figures: fullCrop }),
    false,
    "a full-question crop is not table values",
  );

  const q68Prompt =
    "For the linear function f, the table shows three values of x and their corresponding values of f(x). Which equation defines f(x)?";
  const q68 = {
    id: "q68-math",
    prompt: q68Prompt,
    section: "math" as const,
    choices: letterChoices(["f(x)=3x+29", "f(x)=29x+32", "f(x)=35x+29", "f(x)=32x+35"]),
    questionType: "mcq",
    correctAnswer: "A",
    figures: fullCrop,
  };
  assert.ok(auditStudentQuizItem(q68).reasons.includes("table_cite_without_values"));
  assert.equal(
    isStudentUsableMathQuizItem(q68),
    false,
    "Q68 table cite without values must drop even with a full-question crop",
  );

  const q93Prompt = `Poll Results
Angel Cruz 483 I I
Terry Smith 320
The table shows the results of a poll. A total of 803 voters selected at random were asked which candidate they would vote for. According to the poll, if 6,424 people vote in the election, by how many votes would Angel Cruz be expected to win?`;
  assert.equal(looksIsolatedIGlyphs(q93Prompt), true);
  assert.equal(stemCitesMathDataTable(q93Prompt), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: q93Prompt,
      section: "math",
      choices: letterChoices(["163", "1,304", "3,864", "5,621"]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: pageCrop,
    }),
    false,
    "Q93 named-pair salvage cannot hide I I extraction junk",
  );

  assert.equal(looksGluedInequalityChoice("x > 0y > 0"), true);
  assert.equal(looksGluedInequalityChoice("x > 0 y > 0"), true);
  assert.equal(looksGluedInequalityChoice("x > 0\ny > 0"), true);
  const q95 = {
    id: "q95-math",
    prompt: "The point (8, 2) in the xy-plane is a solution to which of the following systems of inequalities?",
    section: "math" as const,
    choices: letterChoices(["x > 0y > 0", "x > 0y < 0", "x < 0y > 0", "x < 0y < 0"]),
    questionType: "mcq",
    correctAnswer: "A",
  };
  assert.equal(isStudentUsableMathQuizItem(q95), false, "Q95 0y glued inequalities must drop");
  assert.ok(auditStudentQuizItem(q95).reasons.includes("smashed_algebra"));

  assert.equal(looksSmashedYxToken("3 = 4 + 17yx"), true);
  assert.equal(looksSmashedYxToken("3 = 4 + 17 y x"), true);
  const q112Prompt = `3 = 4 + 17yx
−3 = 9 − 23yx
The solution to the given system of equations is , 39 ( ). What is the value of x?`;
  const q112 = {
    id: "q112-math",
    prompt: q112Prompt,
    section: "math" as const,
    choices: letterChoices(["−18", "−6", "6", "18"]),
    questionType: "mcq",
    correctAnswer: "D",
  };
  assert.equal(isStudentUsableMathQuizItem(q112), false, "Q112 17yx system smash must drop");
  assert.ok(auditStudentQuizItem(q112).reasons.length > 0);

  assert.equal(looksStrippedRadicalChoice("20 20 2"), true);
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt:
        "A square is inscribed in a circle. The radius of the circle is 20 2 inches. What is the side length, in 2 inches, of the square?",
      section: "math",
      choices: letterChoices(["20 20 2", "2", "2/20", "40"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
    "Q115 stripped-radical extraction smash must drop",
  );

  const q116Prompt = `The histogram summarizes data set A, which represents the number of points per player earned by 50 players of a game. A new player earns 18 points playing the game, and this number of points is added to data set A to create data set B with 51 values.
Which of the following must be true?
I. The median number of points per player for data set B is less than the median for data set A.
II. The mean number of points per player for data set B is less than the mean for data set A.`;
  assert.equal(stemCitesVisual(q116Prompt), true, "histogram is a cited visual");
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt: q116Prompt,
      section: "math",
      choices: letterChoices(["I only", "II only", "I and II", "Neither I nor II"]),
      questionType: "mcq",
      correctAnswer: "B",
      figures: pageCrop,
    }),
    false,
    "Q116 histogram cite without recovered values or a real full-question crop must drop",
  );

  const cleanRw = {
    id: "clean-rw",
    sourceKey: "clean-rw",
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "rw" as const,
    module: 1,
    questionNumber: 1,
    position: 1,
    prompt:
      "Particle physicists spend much of their time ______ what is invisible.\nWhich choice completes the text with the most logical and precise word or phrase?",
    choices: letterChoices(["selecting", "inspecting", "creating", "deciding"]),
    questionType: "mcq",
    correctAnswer: "B",
  };
  const cleanMath = {
    id: "clean-math",
    sourceKey: "clean-math",
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "math" as const,
    module: 1,
    questionNumber: 1,
    position: 20,
    prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
    choices: letterChoices(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
    questionType: "mcq",
    correctAnswer: "A",
  };
  const junk = [
    { ...q14, sourceKey: "q14-rw", collectionSlug: "sat-practice-test-4-digital", examFamily: "sat", module: 1, questionNumber: 14, position: 14 },
    { ...q68, sourceKey: "q68-math", collectionSlug: "sat-practice-test-4-digital", examFamily: "sat", module: 1, questionNumber: 8, position: 68 },
    { ...q95, sourceKey: "q95-math", collectionSlug: "sat-practice-test-4-digital", examFamily: "sat", module: 2, questionNumber: 5, position: 95 },
    { ...q112, sourceKey: "q112-math", collectionSlug: "sat-practice-test-4-digital", examFamily: "sat", module: 2, questionNumber: 18, position: 112 },
  ];
  const composed = composeDiagnosticItems([cleanRw, cleanMath, ...junk], {
    preferredCollectionSlug: "sat-practice-test-4-digital",
  });
  assert.equal(composed.selected.some((item) => item.id === "q14-rw"), false);
  assert.equal(composed.selected.some((item) => item.id === "q68-math"), false);
  assert.equal(composed.selected.some((item) => item.id === "q95-math"), false);
  assert.equal(composed.selected.some((item) => item.id === "q112-math"), false);

  const leaked = summarizeDiagnosticComposition([cleanRw, cleanMath, ...junk]);
  assert.ok(leaked.residualJunk >= 4, "served junk in a composed set cannot report residualJunk===0");
  assert.equal(canAssignDiagnostic(leaked, [cleanRw, cleanMath, ...junk]), false);
});

test("live audit after #76 rematerialize: served Q14/Q85/Q95 variants still drop", () => {
  const pageCrop = [
    {
      url: "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p12-q17-left.png",
      alt: "Question figure region page 12",
    },
  ];
  const q14Choices = letterChoices([
    "broccoli grown in soil containing mycorrhizal fungi had a slightly higher average mass than broccoli grown in soil that had been treated to kill fungi.",
    "corn grown in soil containing mycorrhizal fungi had a higher average mass than broccoli grown in soil containing mycorrhizal fungi.",
    "marigolds grown in soil containing mycorrhizal fungi had a much higher average mass than marigolds grown in soil that had been treated to kill fungi.",
    "corn had the highest average mass of all three species grown in soil that had been treated to kill fungi, while marigolds had the lowest.",
  ]);

  const q14ScreenshotPrompt = `Effects of Mycorrhizal Fungi on 3 Plant Species
Average mass of plants
grown in soil containing Average mass of plants`;
  assert.equal(looksSmashedChartHeaders(q14ScreenshotPrompt), true);
  assert.equal(
    isStudentUsableQuizItem({
      prompt: q14ScreenshotPrompt,
      section: "rw",
      choices: q14Choices,
      questionType: "mcq",
      correctAnswer: "A",
    }),
    false,
    "admin-visible Q14 headers without rows must drop",
  );

  const q14ServedPrompt = `Effects of Mycorrhizal Fungi on 3 Plant Species
Average mass of plants
grown in soil containing Average mass of plants
Plant Mycorrhizal mycorrhizal fungi grown in soil treated
species host (in grams) to kill fungi (in grams)
Mycorrhizal fungi in soil benefits many plants, substantially increasing the mass of some. After several weeks, the student measured the plants’ average mass and was surprised to discover that ______
Which choice most effectively uses data from the table to complete the statement?`;
  const q14ServedStimulus = "Corn\tyes\t15.1\nMarigold\tyes\t10.2\nBroccoli\tno\t7.5";
  assert.equal(looksSmashedChartHeaders(q14ServedPrompt), true);
  assert.equal(hasUsableTableData(`${q14ServedPrompt}\n${q14ServedStimulus}`), false);
  const q14Served = {
    id: "q14-served",
    prompt: q14ServedPrompt,
    stimulus: q14ServedStimulus,
    section: "rw" as const,
    choices: q14Choices,
    questionType: "mcq",
    correctAnswer: "A",
    figures: pageCrop,
  };
  const q14Audit = auditStudentQuizItem(q14Served);
  assert.equal(q14Audit.ok, false, "rematerialized Q14 must not salvage a Corn/yes/15.1 fake table in stimulus");
  assert.ok(q14Audit.reasons.includes("table_cite_without_values"));
  assert.equal(isStudentUsableQuizItem(q14Served), false);

  const q95Prompt =
    "The point (8, 2) in the x y-plane is a solution to which of the following systems of inequalities?";
  const q95Spaced = {
    id: "q95-spaced",
    prompt: q95Prompt,
    section: "math" as const,
    choices: letterChoices(["x > 0 y > 0", "x > 0 y < 0", "x < 0 y > 0", "x < 0 y < 0"]),
    questionType: "mcq",
    correctAnswer: "A",
  };
  const q95Newline = {
    ...q95Spaced,
    id: "q95-newline",
    choices: letterChoices(["x > 0\ny > 0", "x > 0\ny < 0", "x < 0\ny > 0", "x < 0\ny < 0"]),
  };
  const q95Glued = {
    ...q95Spaced,
    id: "q95-glued",
    choices: letterChoices(["x > 0y > 0", "x > 0y < 0", "x < 0y > 0", "x < 0y < 0"]),
  };
  assert.equal(isStudentUsableMathQuizItem(q95Spaced), false, "bank/rematerialized spaced Q95 must drop");
  assert.equal(isStudentUsableMathQuizItem(q95Newline), false, "newline-split Q95 must drop");
  assert.equal(isStudentUsableMathQuizItem(q95Glued), false, "admin-smashed 0y Q95 must drop");
  assert.ok(auditStudentQuizItem(q95Spaced).reasons.length > 0);

  const q85Screenshot = `of the ballroom, where the length of each side of the
model is 1
10 times the length of the corresponding`;
  const q85Bank = `The floor of a ballroom has an area of 600 square
meters. An architect creates a scale model of the floor
of the ballroom, where the length of each side of the
model is 1
10 times the length of the corresponding
side of the actual floor of the ballroom. What is the
area, in square meters, of the scale model?`;
  assert.equal(looksSmashedStackedFraction(q85Screenshot), true);
  assert.equal(looksSmashedStackedFraction(q85Bank), true);
  assert.equal(looksSmashedStackedFraction("model is 1/10 times the length of the corresponding side"), false);
  assert.equal(looksStackedFractionDump(q85Bank), false);
  const q85 = {
    id: "q85-math",
    prompt: q85Bank,
    section: "math" as const,
    choices: letterChoices(["6", "10", "60", "150"]),
    questionType: "mcq",
    correctAnswer: "A",
  };
  assert.equal(isStudentUsableMathQuizItem(q85), false, "Q85 stacked 1/10 scale factor must drop");
  assert.equal(
    isStudentUsableMathQuizItem({ ...q85, prompt: q85Screenshot }),
    false,
    "admin-visible truncated Q85 stacked 1/10 must drop",
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      ...q85,
      prompt:
        "The floor of a ballroom has an area of 600 square meters. An architect creates a scale model of the floor of the ballroom, where the length of each side of the model is 1/10 times the length of the corresponding side of the actual floor. What is the area, in square meters, of the scale model?",
    }),
    true,
    "slash-form 1/10 scale factor stays",
  );

  const cleanRw = {
    id: "clean-rw",
    sourceKey: "clean-rw",
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "rw" as const,
    module: 1,
    questionNumber: 1,
    position: 1,
    prompt:
      "Particle physicists spend much of their time ______ what is invisible.\nWhich choice completes the text with the most logical and precise word or phrase?",
    choices: letterChoices(["selecting", "inspecting", "creating", "deciding"]),
    questionType: "mcq",
    correctAnswer: "B",
  };
  const cleanMath = {
    id: "clean-math",
    sourceKey: "clean-math",
    collectionSlug: "sat-practice-test-4-digital",
    examFamily: "sat",
    section: "math" as const,
    module: 1,
    questionNumber: 1,
    position: 20,
    prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
    choices: letterChoices(["x/4 = 32", "x/4 = 5", "x/4 = 1", "x/4 = -32"]),
    questionType: "mcq",
    correctAnswer: "A",
  };
  const junk = [
    {
      ...q14Served,
      sourceKey: "q14-served",
      collectionSlug: "sat-practice-test-4-digital",
      examFamily: "sat",
      module: 1,
      questionNumber: 14,
      position: 14,
    },
    {
      ...q95Spaced,
      sourceKey: "q95-spaced",
      collectionSlug: "sat-practice-test-4-digital",
      examFamily: "sat",
      module: 2,
      questionNumber: 5,
      position: 95,
    },
    {
      ...q85,
      sourceKey: "q85-math",
      collectionSlug: "sat-practice-test-10-digital",
      examFamily: "sat",
      module: 1,
      questionNumber: 22,
      position: 85,
    },
  ];
  const composed = composeDiagnosticItems([cleanRw, cleanMath, ...junk], {
    preferredCollectionSlug: "sat-practice-test-4-digital",
  });
  assert.equal(composed.selected.some((item) => item.id === "q14-served"), false);
  assert.equal(composed.selected.some((item) => item.id === "q95-spaced"), false);
  assert.equal(composed.selected.some((item) => item.id === "q85-math"), false);

  const leaked = summarizeDiagnosticComposition([cleanRw, cleanMath, ...junk]);
  assert.ok(leaked.residualJunk >= 3, "live served Q14/Q85/Q95 cannot report residualJunk===0");
  assert.equal(canAssignDiagnostic(leaked, [cleanRw, cleanMath, ...junk]), false);
});

test("live audit after #77 rematerialize: Q97 smashed 2 –4x –7x drops; missing letter keys drop", () => {
  const q97Choices = letterChoices(["7/4", "9/4", "4", "7"]);
  const q97Unicode = {
    id: "q97-unicode",
    prompt: "2 −4x −7x = −36\nWhat is the positive solution to the given equation?",
    section: "math" as const,
    choices: q97Choices,
    questionType: "mcq",
    correctAnswer: "A",
  };
  const q97EnDash = {
    ...q97Unicode,
    id: "q97-endash",
    prompt: "2 –4x –7x = –36\nWhat is the positive solution to the given equation?",
  };
  assert.equal(looksSmashedAlgebraText(q97Unicode.prompt), true);
  assert.equal(isStudentUsableMathQuizItem(q97Unicode), false, "unicode-minus Q97 must drop");
  assert.equal(isStudentUsableMathQuizItem(q97EnDash), false, "admin screenshot en-dash Q97 must drop");
  const q97Reasons = auditStudentQuizItem(q97Unicode).reasons;
  assert.ok(
    q97Reasons.includes("unsure_math_presentation") || q97Reasons.includes("smashed_algebra"),
  );

  const unkeyed = {
    id: "unkeyed-mcq",
    prompt:
      "For x > 0, the function f is defined as follows: f(x) equals 201% of x. Which of the following could describe this function?",
    section: "math" as const,
    choices: letterChoices([
      "Decreasing exponential",
      "Decreasing linear",
      "Increasing exponential",
      "Increasing linear",
    ]),
    questionType: "mcq",
    correctAnswer: "",
  };
  const missingAudit = auditStudentQuizItem(unkeyed);
  assert.equal(missingAudit.ok, false);
  assert.ok(missingAudit.reasons.includes("missing_letter_key"));
  assert.equal(isStudentUsableMathQuizItem(unkeyed), false);

  const mismatched = {
    ...unkeyed,
    id: "mismatched-key",
    correctAnswer: "c",
    choices: letterChoices(["Decreasing exponential", "Decreasing linear"]).slice(0, 2),
  };
  const mismatchAudit = auditStudentQuizItem(mismatched);
  assert.equal(mismatchAudit.ok, false);
  assert.ok(mismatchAudit.reasons.includes("missing_letter_key"));

  const keyed = {
    ...unkeyed,
    id: "keyed-201",
    correctAnswer: "D",
  };
  assert.equal(isStudentUsableMathQuizItem(keyed), true);

  const composed = composeDiagnosticItems([
    {
      id: "rw-clean",
      prompt: "Which choice completes the text with the most logical transition?",
      section: "rw" as const,
      module: 1,
      questionNumber: 1,
      position: 1,
      choices: letterChoices(["However", "Therefore", "Meanwhile", "Similarly"]),
      questionType: "mcq",
      correctAnswer: "A",
    },
    keyed,
    q97EnDash,
    unkeyed,
  ]);
  assert.equal(
    composed.selected.some((item) => item.id === "q97-endash"),
    false,
  );
  assert.equal(
    composed.selected.some((item) => item.id === "unkeyed-mcq"),
    false,
  );
  assert.ok((composed.composition.shortfall.reasons.missing_letter_key ?? 0) >= 1);
});

test("live audit after #78 rematerialize: Q82/Q85/Q93 glued-minus OCR drops", () => {
  const q82OfficialPrompt =
    "Kaylani used fabric measuring 5 yards in length to\nmake each suit for a men’s choir. The relationship\nbetween the number of suits that Kaylani made, x,\nand the total length of fabric that she purchased y, in\nyards, is represented by the equation y −5x = 6.\nWhat is the best interpretation of 6 in this context?";
  const q82LivePrompt =
    "andthe totallengthof fabric that shepurchasedy,in\nyards,isrepresented bytheequationy-5x=6.\nWhatisthebestinterpretationof6inthiscontext?";
  const q82Choices = letterChoices([
    "Kaylani made 6 suits.",
    "Kaylani purchased a total of 6 yards of fabric.",
    "Kaylani used a total of 6 yards of fabric to make the suits.",
    "Kaylani purchased 6 yards more fabric than she used to make the suits.",
  ]);
  const q85OfficialChoices = letterChoices([
    "V(x) = x(x + 9)(x + 7)",
    "V(x) = x(x + 9)(x −7)",
    "V(x) = 9x(x + 7)",
    "V(x) = 9x(x −7)",
  ]);
  const q85LiveChoices = letterChoices([
    "V(x)=x(x+9)(x+7)",
    "V(x)=x(x+9)(x-7)",
    "V(x)=9x(x+7)",
    "V(x)=9x(x-7)",
  ]);
  const q85OfficialPrompt =
    "A right rectangular prism has a height of 9 inches.\nThe length of the prism’s base is x inches, which is\n7 inches more than the width of the prism’s base.\nWhich function V gives the volume of the prism,\nin cubic inches, in terms of the length of the\nprism’s base?";
  const q85LivePrompt =
    "Arightrectangularprismhasaheightof9inches.\nThelengthoftheprism'sbaseisxinches,whichis\n7inchesmore thanthewidthoftheprism'sbase";
  const q93OfficialPrompt =
    "Line r in the xy-plane has a slope of 4 and passes\nthrough the point (0, 6). Which equation defines\nline r ?";
  const q93LivePrompt =
    "Linerinthexy-planehasaslopeof4andpasses\nthroughthepoint(0,6).Whichequationdefines\nlinea?";
  const q93OfficialChoices = letterChoices(["y = −6x + 4", "y = 6x + 4", "y = 4x −6", "y = 4x + 6"]);
  const q93LiveChoices = letterChoices(["y=-6x+4", "y=6x+4", "y=4x-6", "y=4x+6"]);

  assert.equal(looksGluedMinusSpacing("y −5x = 6"), true);
  assert.equal(looksGluedMinusSpacing("y-5x=6"), true);
  assert.equal(looksGluedMinusSpacing("bytheequationy-5x=6"), true);
  assert.equal(looksSmashedAlgebraText(q82OfficialPrompt), true);
  assert.equal(looksSmashedAlgebraText(q82LivePrompt), true);
  assert.equal(looksGluedMinusSpacing("V(x) = 9x(x −7)"), true);
  assert.equal(looksGluedMinusSpacing("V(x)=9x(x-7)"), true);
  assert.equal(looksGluedMinusSpacing("y = 4x −6"), true);
  assert.equal(looksGluedMinusSpacing("y=4x-6"), true);

  assert.equal(looksGluedMinusSpacing("2 - 4x"), false);
  assert.equal(looksGluedMinusSpacing("y - 5x = 6"), false);
  assert.equal(looksGluedMinusSpacing("V(x) = 9x(x - 7)"), false);
  assert.equal(looksGluedMinusSpacing("y = 4x - 6"), false);
  assert.equal(looksGluedMinusSpacing("y = −6x + 4"), false);
  assert.equal(looksGluedMinusSpacing("(-7)"), false);
  assert.equal(looksGluedMinusSpacing("the xy-plane"), false);
  assert.equal(looksGluedMinusSpacing("COVID-19 research"), false);

  const q82Official = {
    id: "q82-official",
    prompt: q82OfficialPrompt,
    section: "math" as const,
    choices: q82Choices,
    questionType: "mcq",
    correctAnswer: "D",
  };
  const q82Live = { ...q82Official, id: "q82-live", prompt: q82LivePrompt };
  const q85Official = {
    id: "q85-official",
    prompt: q85OfficialPrompt,
    section: "math" as const,
    choices: q85OfficialChoices,
    questionType: "mcq",
    correctAnswer: "D",
  };
  const q85Live = {
    ...q85Official,
    id: "q85-live",
    prompt: q85LivePrompt,
    choices: q85LiveChoices,
  };
  const q93Official = {
    id: "q93-official",
    prompt: q93OfficialPrompt,
    section: "math" as const,
    choices: q93OfficialChoices,
    questionType: "mcq",
    correctAnswer: "D",
  };
  const q93Live = {
    ...q93Official,
    id: "q93-live",
    prompt: q93LivePrompt,
    choices: q93LiveChoices,
  };

  for (const item of [q82Official, q82Live, q85Official, q85Live, q93Official, q93Live]) {
    assert.equal(isStudentUsableMathQuizItem(item), false, `${item.id} glued minus must drop`);
    assert.equal(isStudentUsableQuizItem(item), false, `${item.id} must fail shared gate`);
    assert.ok(auditStudentQuizItem(item).reasons.includes("smashed_algebra"), `${item.id} smashed_algebra`);
  }

  const spacedKeep = {
    id: "q82-spaced",
    prompt:
      "The relationship is represented by the equation y - 5x = 6.\nWhat is the best interpretation of 6 in this context?",
    section: "math" as const,
    choices: q82Choices,
    questionType: "mcq",
    correctAnswer: "D",
  };
  assert.equal(looksGluedMinusSpacing(spacedKeep.prompt), false);
  assert.equal(isStudentUsableMathQuizItem(spacedKeep), true, "spaced y - 5x = 6 must stay");
  assert.equal(
    isStudentUsableMathQuizItem({
      id: "q85-spaced",
      prompt: q85OfficialPrompt,
      section: "math",
      choices: letterChoices([
        "V(x) = x(x + 9)(x + 7)",
        "V(x) = x(x + 9)(x - 7)",
        "V(x) = 9x(x + 7)",
        "V(x) = 9x(x - 7)",
      ]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    true,
    "spaced (x - 7) volume choices must stay",
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      id: "q93-spaced",
      prompt: q93OfficialPrompt,
      section: "math",
      choices: letterChoices(["y = −6x + 4", "y = 6x + 4", "y = 4x - 6", "y = 4x + 6"]),
      questionType: "mcq",
      correctAnswer: "D",
    }),
    true,
    "spaced 4x - 6 line choices must stay",
  );

  const cleanRw = {
    id: "rw-clean-glued",
    prompt: "Which choice completes the text with the most logical transition?",
    section: "rw" as const,
    module: 1,
    questionNumber: 1,
    position: 1,
    choices: letterChoices(["However", "Therefore", "Meanwhile", "Similarly"]),
    questionType: "mcq",
    correctAnswer: "A",
  };
  const composed = composeDiagnosticItems([cleanRw, spacedKeep, q82Live, q85Official, q93Live]);
  assert.equal(composed.selected.some((item) => item.id === "q82-live"), false);
  assert.equal(composed.selected.some((item) => item.id === "q85-official"), false);
  assert.equal(composed.selected.some((item) => item.id === "q93-live"), false);
  assert.equal(composed.selected.some((item) => item.id === "q82-spaced"), true);

  const leaked = summarizeDiagnosticComposition([cleanRw, q82Official, q85Live, q93Official]);
  assert.ok(leaked.residualJunk >= 3, "live served Q82/Q85/Q93 cannot report residualJunk===0");
  assert.equal(canAssignDiagnostic(leaked, [cleanRw, q82Official, q85Live, q93Official]), false);
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
  assert.equal(
    isStudentUsableQuizItem({
      prompt:
        "The COVID-19 study notes that well-known y-intercept graphs can mislead readers.\nWhich choice best describes the function of the underlined sentence?",
      section: "rw",
      choices: letterChoices([
        "It states a hypothesis.",
        "It presents a generalization.",
        "It offers an alternative.",
        "It provides context.",
      ]),
      questionType: "mcq",
      correctAnswer: "B",
    }),
    true,
    "hyphenated COVID-19 / y-intercept RW must stay",
  );
  assert.equal(
    isStudentUsableMathQuizItem({
      prompt:
        "The point (8, 2) in the xy-plane is a solution to which of the following systems of inequalities?",
      section: "math",
      choices: letterChoices(["x > 0 and y > 0", "x > 0 and y < 0", "x < 0 and y > 0", "x < 0 and y < 0"]),
      questionType: "mcq",
      correctAnswer: "A",
    }),
    true,
  );
});
