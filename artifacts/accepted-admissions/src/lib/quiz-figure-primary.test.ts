import assert from "node:assert/strict";
import test from "node:test";
import {
  displayAnswerLabel,
  figurePrimaryChoices,
  hasCompleteLetterChoiceText,
  hasUsableChoiceText,
  isFigurePrimaryQuestion,
  isStudentAnswerableQuizQuestion,
  hasRecoveredQuizTable,
  isStudentReadableChoiceText,
  letterMcqChoices,
  looksBrokenMathOcr,
  looksIncompleteMathParens,
  looksCorruptStemOcr,
  looksFailedMathLayoutDump,
  looksGarbledQuizText,
  looksMissingOperatorChoice,
  looksPipeBackslashOcr,
  formatStudentChoiceText,
  formatStudentStemText,
  looksSmashedTableChoice,
  looksCharacterSpacedGarbage,
  looksExplodedOcrTable,
  looksModuleBoilerplateChoice,
  shouldHideMismatchedQuizFigures,
  shouldHideQuizOcrStem,
  shouldShowQuizChoices,
  stemCitesVisual,
  looksExtractionMarkerBleed,
  looksSmashedAlgebraChoice,
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

test("incomplete A/B-only sets and empty A–D are not student-answerable", () => {
  assert.equal(
    hasCompleteLetterChoiceText([
      { id: "a", label: "A", text: "2/29" },
      { id: "b", label: "B", text: "2/58" },
    ]),
    false,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt:
        "An isosceles right triangle has a hypotenuse of length 58 inches. What is the perimeter, in inches, of this triangle?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "2/29" },
        { id: "b", label: "B", text: "2/58" },
      ],
      questionType: "mcq",
    }),
    false,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt:
        "14x = 2 w + 19 7y The given equation relates w, x, and y. Which equation correctly expresses w in terms of x and y ? f(x)",
      stimulus: null,
      choices: [],
      questionType: "mcq",
    }),
    false,
  );
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
  assert.equal(looksBrokenMathOcr("16+30=190 xWhich equation has the same solution as the given equation?"), true);
  assert.equal(looksBrokenMathOcr("y = 3 x + 1"), false);
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "x/4 = 32" },
        { id: "b", label: "B", text: "x/4 = 5" },
        { id: "c", label: "C", text: "x/4 = 1" },
        { id: "d", label: "D", text: "x/4 = -32" },
      ],
      questionType: "mcq",
    }),
    true,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: "Note: Figure not drawn to scale.",
      stimulus: "![Triangle](/media/sat-bank/pack/p40-draw1.png)",
      choices: [
        { id: "a", label: "A", text: "" },
        { id: "b", label: "B", text: "" },
        { id: "c", label: "C", text: "" },
        { id: "d", label: "D", text: "" },
      ],
      questionType: "mcq",
    }),
    false,
  );
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
  assert.equal(
    looksCorruptStemOcr(
      "= ^ h inFor thelinearfunctionf , thegraphof y f(x)thexy-planehasaslopeof7andpassesthrough the ^ h. Whichequationdefinesf ? point0,0 5 ^ h",
    ),
    true,
  );
  assert.equal(looksCorruptStemOcr("point0,0 5"), true);
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
  assert.equal(isFigurePrimaryQuestion(surfboard), false);
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

test("formats run-on inequalities and rejects mangled coordinates, table crops, and orphan figures", () => {
  assert.equal(formatStudentChoiceText("x > 0 y > 0"), "x > 0\ny > 0");
  assert.equal(isStudentReadableChoiceText("x > 0 y > 0"), true);
  assert.equal(
    formatStudentStemText("s + 7 = 27 r = 3What is thesolution (r, s) tothegivensystemofequations?"),
    "s + 7 = 27\nr = 3\nWhat is thesolution (r, s) tothegivensystemofequations?",
  );
  assert.equal(formatStudentStemText("y = 3 x + 1"), "y = 3 x + 1");
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: "s + 7 = 27 r = 3What is thesolution (r, s) tothegivensystemofequations?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "(6,3)" },
        { id: "b", label: "B", text: "(3,6)" },
        { id: "c", label: "C", text: "(3,27)" },
        { id: "d", label: "D", text: "(27,3)" },
      ],
      questionType: "mcq",
    }),
    true,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt:
        "= ^ h inFor thelinearfunctionf , thegraphof y f(x)thexy-planehasaslopeof7andpassesthrough the ^ h. Whichequationdefinesf ? point0,0 5 ^ h",
      stimulus: null,
      choices: [],
      questionType: "mcq",
    }),
    false,
  );
  assert.equal(looksBrokenMathOcr("What is the solution ( ,x y) to the given system?"), true);
  assert.equal(looksBrokenMathOcr("= 270(0.1)x. What The function f is defined by f(x)"), true);
  assert.equal(looksBrokenMathOcr("= 270(0.1)x. WhatThe functionf isdefinedby f(x)isthevalueof f (0)?"), true);
  assert.equal(
    looksBrokenMathOcr(
      "= x2 −3 h x Which tablegivesthreevaluesof x andtheirfor thegivencorrespondingvaluesof x functionh?",
    ),
    true,
  );
  assert.equal(looksBrokenMathOcr("2 −4x −7x = −36\nWhat is the positive solution?"), false);
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: "2 −4x −7x = −36Whatisthepositivesolutiontothegivenequation?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "7/4" },
        { id: "b", label: "B", text: "9/4" },
        { id: "c", label: "C", text: "4" },
        { id: "d", label: "D", text: "7" },
      ],
      questionType: "mcq",
    }),
    true,
  );
  assert.equal(
    hasCompleteLetterChoiceText([
      { id: "a", label: "A", text: "7,500" },
      { id: "b", label: "B", text: "15,000" },
      { id: "c", label: "C", text: "22,500" },
    ]),
    false,
  );
  assert.equal(looksSmashedTableChoice("x 1 2 3 h(x) 4 5 6"), true);
  assert.equal(isStudentReadableChoiceText("7/4"), true);
  const library = {
    presentation: "text" as const,
    prompt:
      "A proposal for a new library was included on an election ballot. Based on these data, how many people voted against the proposal?",
    stimulus:
      "![Diagram from page 45](https://app.acceptedadmissions.org/media/sat-bank/pack/p45-draw1.png)",
    choices: [
      { id: "a", label: "A", text: "7,500" },
      { id: "b", label: "B", text: "15,000" },
      { id: "c", label: "C", text: "22,500" },
      {
        id: "d",
        label: "D",
        text: "45,000/16 t m n Note: Figure not drawn to scale. In the figure, lines m and n are parallel. If",
      },
    ],
    questionType: "mcq",
  };
  assert.equal(shouldHideMismatchedQuizFigures(library), true);
  assert.equal(isStudentReadableChoiceText(library.choices[3]!.text), false);
});

test("rejects scrambled f(x) and smashed vertex OCR; keeps 21px and shows dot-plot choice text", () => {
  assert.equal(
    looksBrokenMathOcr("−3x + 21px = 84\nIn the given equation, p is a constant. What is the value of p ?"),
    false,
  );
  assert.equal(
    looksBrokenMathOcr("= (x − 10)(x + 13) f(x)\nFor what value of x does f(x)( ) reach its minimum?"),
    true,
  );
  assert.equal(
    looksBrokenMathOcr(
      "=(x −10)(x +13) f(x) The functionf isdefinedby thegivenequation. Forwhatvalueof x doesf(x)reachitsminimum?",
    ),
    true,
  );
  assert.equal(
    looksBrokenMathOcr("f(x) = 1 x\n2 + The function ( ) ( −7) 3 gives a metal ball’s height"),
    true,
  );
  assert.equal(
    looksBrokenMathOcr("f(x)=1 x 2 + The function (-7) 3 gives a metal 9 ball’s height"),
    true,
  );
  assert.equal(looksBrokenMathOcr("The equation 2 2 x + (y –1) = 49 represents circle A."), true);
  assert.equal(looksBrokenMathOcr("the resulting prism has a surface area of 92 K 2 cm . 47"), true);
  assert.equal(looksBrokenMathOcr("f X -2 2 = is The graph of the quadratic function y f(x) shown."), true);
  assert.equal(looksBrokenMathOcr("Which expression is equivalent to x x y 6 5 4 ? + +"), true);
  assert.equal(looksCorruptStemOcr("I, 7 X 12345678910 For how many of the 10 data points"), true);
  assert.equal(
    looksCorruptStemOcr("The dot plot gives the diameter. 16 17 18 19 20 Diameter (inches) Based on the dot plot"),
    true,
  );
  assert.equal(looksIncompleteMathParens("x 16( + 15) ? Which expression is equivalent to"), true);
  assert.equal(looksIncompleteMathParens("f(x) = (x + 1"), true);
  assert.equal(looksIncompleteMathParens("f(x) = x^2 + 1"), false);
  assert.equal(looksIncompleteMathParens("The point (6,3) is a solution."), false);
  assert.equal(looksIncompleteMathParens("(-2, 3)"), false);
  assert.equal(
    hasRecoveredQuizTable("x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values."),
    true,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt:
        "x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values of x. Which equation defines f(x)?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "f(x)= 3x + 29" },
        { id: "b", label: "B", text: "f(x)= 29x + 32" },
        { id: "c", label: "C", text: "f(x)= 35x + 29" },
        { id: "d", label: "D", text: "f(x)= 32x + 35" },
      ],
      questionType: "mcq",
    }),
    true,
  );
  assert.equal(looksBrokenMathOcr("x 16( + 15) ? Which expression is equivalent to"), true);
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: "The graph of y = f(x) is shown. What is the vertex of the graph?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "(-2, 3)" },
        { id: "b", label: "B", text: "(0, 0)" },
        { id: "c", label: "C", text: "(2, -1)" },
        { id: "d", label: "D", text: "(3, 4)" },
      ],
      questionType: "mcq",
    }),
    false,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: "The graph of y = f(x) is shown. What is the vertex of the graph?",
      stimulus: "![Graph](/media/sat-bank/pack/graph.png)",
      choices: [
        { id: "a", label: "A", text: "(-2, 3)" },
        { id: "b", label: "B", text: "(0, 0)" },
        { id: "c", label: "C", text: "(2, -1)" },
        { id: "d", label: "D", text: "(3, 4)" },
      ],
      questionType: "mcq",
    }),
    true,
  );
  assert.equal(
    looksExplodedOcrTable(
      "Live east Live west Total Less than 17 11 28 40 years old At least 18 89 107 Total 35 100 135 The table summarizes members",
    ),
    true,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt:
        "The dot plot gives the diameter. 16 17 18 19 20 Diameter (inches) Based on the dot plot, how many sea stars had a diameter of 16 inches?",
      stimulus: "![Dot plot](/media/sat-bank/pack/p48-draw1.png)",
      choices: [
        { id: "a", label: "A", text: "16" },
        { id: "b", label: "B", text: "6" },
        { id: "c", label: "C", text: "4" },
        { id: "d", label: "D", text: "1" },
      ],
      questionType: "mcq",
    }),
    false,
  );
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt:
        "I, 7 X 12345678910 For how many of the 10 data points is the actual y-value greater than the y-value predicted by the line of best fit?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "3" },
        { id: "b", label: "B", text: "4" },
        { id: "c", label: "C", text: "6" },
        { id: "d", label: "D", text: "7" },
      ],
      questionType: "mcq",
    }),
    false,
  );
  assert.equal(stemCitesVisual("The dot plot represents the 15 values in data set A."), true);
  const metalBall = {
    presentation: "text" as const,
    prompt: "f(x) = 1 x\n2 + The function ( ) ( −7) 3 gives a metal ball’s height f(x)( )",
    stimulus:
      "![Question figure region page 46](https://app.acceptedadmissions.org/media/sat-bank/pack/p46-q19-left.png)",
    choices: [
      { id: "a", label: "A", text: "The metal ball’s minimum height was 3 inches above the ground." },
      { id: "b", label: "B", text: "The metal ball’s minimum height was 7 inches above the ground." },
      { id: "c", label: "C", text: "The metal ball’s height was 3 inches above the ground when it started moving." },
      { id: "d", label: "D", text: "The metal ball’s height was 7 inches above the ground when it started moving." },
    ],
    questionType: "mcq",
  };
  assert.equal(shouldHideQuizOcrStem(metalBall), true);
  assert.equal(shouldShowQuizChoices(metalBall), false);
});

test("hides character-spaced OCR, module boilerplate D, and exploded tables", () => {
  assert.equal(looksCharacterSpacedGarbage("T h e g r a p h s h o w s enrollment"), true);
  assert.equal(looksModuleBoilerplateChoice("Module 2 Math"), true);
  assert.equal(looksExplodedOcrTable("Yes No Total Men 12 8 20 Women 15 5 20"), true);
  assert.equal(isStudentReadableChoiceText("STOP GO ON TO THE NEXT PAGE"), false);
  assert.equal(
    shouldShowQuizChoices({
      prompt: "Which choice completes the text with the most logical transition?",
      choices: [
        { id: "a", label: "A", text: "However" },
        { id: "b", label: "B", text: "Therefore" },
        { id: "c", label: "C", text: "Meanwhile" },
        { id: "d", label: "D", text: "Module 2 Reading and Writing" },
      ],
    }),
    false,
  );
  assert.equal(looksGarbledQuizText("T h e f u n c t i o n is defined by"), true);
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

test("live audit: extraction markers, missing cited figures, and smashed algebra are unanswerable", () => {
  const letters = (texts: string[]) =>
    ["A", "B", "C", "D"].map((label, index) => ({
      id: label.toLowerCase(),
      label,
      text: texts[index] ?? "",
    }));
  const markerPrompt =
    "from any B. terrenus. Start referenced content: But e\nvolutionary links persist. End referenced content. Which choice best describes the function of the third sentence?";
  assert.equal(looksExtractionMarkerBleed(markerPrompt), true);
  assert.equal(looksGarbledQuizText(markerPrompt), true);
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: markerPrompt,
      stimulus: null,
      choices: letters([
        "It states a hypothesis.",
        "It presents a generalization.",
        "It offers an alternative.",
        "It provides context.",
      ]),
      questionType: "mcq",
    }),
    false,
  );
  assert.equal(
    stemCitesVisual(
      "Note: Figures not drawn to scale.\nRight triangles P Q R and S T U are similar, where P corresponds to S.",
    ),
    true,
  );
  assert.equal(stemCitesVisual("The dat plot represents the 15 values in data set A."), true);
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt:
        "Note: Figures not drawn to scale.\nRight triangles P Q R and S T U are similar, where P corresponds to S. If the measure of angle Q is 18°, what is the measure of angle S ?",
      stimulus: null,
      choices: letters(["18°", "72°", "82°", "162°"]),
      questionType: "mcq",
    }),
    false,
  );
  assert.equal(looksSmashedAlgebraChoice("y x p = 57 +"), true);
  assert.equal(
    isStudentAnswerableQuizQuestion({
      prompt: "66 = 66 x x\nHow many solutions does the given equation have?",
      stimulus: null,
      choices: letters(["Exactly one", "Exactly two", "Infinitely many", "Zero"]),
      questionType: "mcq",
    }),
    false,
  );
});
