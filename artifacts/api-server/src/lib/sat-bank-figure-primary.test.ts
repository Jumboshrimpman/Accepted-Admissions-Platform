import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  applyFigurePrimaryToRecord,
  cleanOcrChoiceText,
  extractPlainTextTable,
  figurePrimaryStudentPrompt,
  hasCompleteLetterChoiceText,
  hasFullQuestionCrop,
  hasReadableStudentStem,
  hasRecoveredDataTable,
  hasUsableChoiceText,
  isFullQuestionCrop,
  isStudentReadableChoiceText,
  isLetterAnswer,
  isOrphanFigureFragment,
  letterMcqChoices,
  looksOcrGarbageChoice,
  looksSmashedOrTruncatedExtract,
  looksTruncatedChoiceText,
  normalizeLetterAnswer,
  looksBrokenMathOcr,
  looksCorruptStemOcr,
  looksFailedMathLayoutDump,
  looksGarbledExtractText,
  looksLeakedNextQuestionChoice,
  hasMergedOrLeakedChoices,
  stemCitesVisual,
  looksSpacedProductChoice,
  looksStrippedRadicalChoice,
  prepareStudentExtractText,
  referencesVisualStimulus,
  selectStimulusFigures,
  shouldUseFigurePrimary,
  stripChartHeaderFragments,
  stripSatBankFigureComments,
  studentFacingFigurePrimaryFields,
} from "./sat-bank-figure-primary.ts";

const figureUrl =
  "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p34-q1-question.png";

test("detects leaked sat-bank-figures comments and strips them", () => {
  const raw = "<!-- sat-bank-figures -->\nV = i,.r3\n<!-- /sat-bank-figures -->";
  assert.equal(looksGarbledExtractText(raw), true);
  assert.equal(stripSatBankFigureComments(raw), "V = i,.r3");
});

test("detects ASCII scatterplots and smashed OCR without flagging clean stems", () => {
  assert.equal(
    looksGarbledExtractText("10+-+-+-+--i------,f-----+---+---+---+"),
    true,
  );
  assert.equal(looksGarbledExtractText("X 0-=8~ - <:...4--=2_ f- ~2-4_6_8_10"), true);
  assert.equal(
    looksGarbledExtractText("The lengths of two sides of a triangle are 4 centimeters and 6 centimeters."),
    false,
  );
});

test("garbled graph with usable A–D stays text unless a full-question crop exists", () => {
  const choices = [
    { id: "a", label: "A", text: "Positive" },
    { id: "b", label: "B", text: "Negative" },
    { id: "c", label: "C", text: "None" },
    { id: "d", label: "D", text: "Undefined" },
  ];
  assert.equal(
    shouldUseFigurePrimary({
      prompt: "The scatterplot shows the relationship.\n10+-+-+-+--i------,f-----+---+---+",
      choices,
      questionType: "mcq",
      correctAnswer: "B",
      figures: [{ url: figureUrl, alt: "Diagram from page 10" }],
    }),
    false,
  );
  assert.equal(
    shouldUseFigurePrimary({
      prompt: "The scatterplot shows the relationship.\n10+-+-+-+--i------,f-----+---+---+",
      choices,
      questionType: "mcq",
      correctAnswer: "B",
      figures: [{ url: figureUrl, alt: "Question region including choices A–D", role: "question_region" }],
    }),
    false,
  );
});

test("cleans OCR tildes from vocab choices and recovers smashed tables", () => {
  assert.equal(cleanOcrChoiceText("inspecting ~ ---~"), "inspecting");
  assert.equal(cleanOcrChoiceText("creating ~"), "creating");
  assert.equal(looksOcrGarbageChoice("----"), true);
  assert.equal(looksOcrGarbageChoice("inspecting"), false);
  assert.equal(hasCompleteLetterChoiceText([
    { id: "a", label: "A", text: "selecting" },
    { id: "b", label: "B", text: "inspecting ~ ---~" },
    { id: "c", label: "C", text: "creating ~" },
    { id: "d", label: "D", text: "deciding" },
  ]), true);
  const table = extractPlainTextTable("x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values.");
  assert.deepEqual(table.table, { headers: ["x", "f(x)"], rows: [["0", "29"], ["1", "32"], ["2", "35"]] });
  assert.equal(hasRecoveredDataTable("x f(x)\n0 29\n1 32\n2 35\nWhich equation defines f(x)?"), true);
  assert.match(
    prepareStudentExtractText("For the linear function f, the table shows three values of f(x)( ). Which ( ) ? equation defines f(x)"),
    /Which equation defines f\(x\)/,
  );
  assert.equal(
    hasReadableStudentStem({
      prompt:
        "x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values of x and their corresponding values of f(x)( ). Which ( ) ? equation defines f(x)",
    }),
    true,
  );
});

test("drops orphan page-sibling figures when a draw crop or recovered table exists", () => {
  const img1 = { url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p35-img1.png", alt: "Figure from page 35" };
  const img2 = { url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p35-img2.png", alt: "Figure from page 35" };
  const draw = { url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p35-draw1.png", alt: "Diagram from page 35" };
  assert.equal(isOrphanFigureFragment(img1, [img1, img2, draw]), true);
  const triangles = selectStimulusFigures([img1, img2, draw], {
    prompt: "Right triangles PQR and STU are similar. What is the measure of angle S?",
  });
  assert.equal(triangles.length, 1);
  assert.equal(triangles[0]?.url, draw.url);
  const tableItem = selectStimulusFigures([img1, draw], {
    prompt: "x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values. Which equation defines f(x)?",
  });
  assert.equal(tableItem.length, 0);
});

test("does not convert empty-choice SPR items into letter-only figure-primary", () => {
  const record = applyFigurePrimaryToRecord({
    prompt: "V = i,.r3 V =3£wh V=½nr2h",
    stimulus: null,
    choices: [],
    questionType: "spr",
    correctAnswer: "C",
    figures: [{ url: figureUrl, alt: "Question region including choices A–D", role: "question_region" }],
    extractGaps: { spr: true, missingChoices: true, notes: [] },
    assignable: true,
  });
  assert.equal(record.extractGaps.figurePrimary, false);
  assert.equal(record.questionType, "spr");
});

test("letter keys normalize to a lowercase a–d id for grading", () => {
  assert.equal(normalizeLetterAnswer("B"), "b");
  assert.equal(normalizeLetterAnswer("c"), "c");
  assert.equal(normalizeLetterAnswer("9; 9.0"), "9; 9.0");
});

test("keeps genuine numeric SPR items as SPR", () => {
  assert.equal(isLetterAnswer("9; 9.0"), false);
  assert.equal(
    shouldUseFigurePrimary({
      prompt: "How many pounds of oranges did the customer purchase?",
      choices: [],
      questionType: "spr",
      correctAnswer: "9; 9.0",
      figures: [{ url: figureUrl }],
    }),
    false,
  );
});

test("clean text MCQs with usable A–D stay in text mode even with a figure", () => {
  assert.equal(
    shouldUseFigurePrimary({
      prompt: "Which equation represents the line shown?",
      stimulus: `![Line graph](${figureUrl})`,
      choices: [
        { id: "a", label: "A", text: "y = 2x + 1" },
        { id: "b", label: "B", text: "y = -2x + 1" },
        { id: "c", label: "C", text: "y = x - 8" },
        { id: "d", label: "D", text: "y = -x - 12" },
      ],
      questionType: "mcq",
      correctAnswer: "D",
      figures: [{ url: figureUrl, alt: "Line graph" }],
    }),
    false,
  );
  assert.equal(hasUsableChoiceText([{ text: "(see figure)" }, { text: "" }]), false);
});

test("prefers a composite question-region crop over snippet figures", () => {
  const selected = selectStimulusFigures([
    { url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p01-draw1.png", alt: "Sphere" },
    {
      url: figureUrl,
      alt: "Question region including choices",
      role: "question_region",
    },
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.url, figureUrl);
});

test("figure-primary src without usable A–D text does not invent letter-only choices", () => {
  const src = "https://app.acceptedadmissions.org/media/sat-bank/pack/q7-question.png";
  const fields = studentFacingFigurePrimaryFields({
    prompt: `<!-- figure-primary src="${src}" -->`,
    stimulus: null,
    choices: [],
    questionType: "spr",
    correctAnswer: "A",
  });
  assert.equal(fields.presentation, "text");
  assert.equal(fields.choices, undefined);
});

test("rejects graph-only crops as full-question screenshots", () => {
  assert.equal(isFullQuestionCrop({ url: figureUrl, alt: "Diagram from page 10" }), false);
  assert.equal(
    isFullQuestionCrop({
      url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p11-q15-left.png",
      alt: "Question figure region page 11",
    }),
    false,
  );
  assert.equal(
    isFullQuestionCrop({
      url: figureUrl,
      alt: "Question region",
      role: "question_region",
    }),
    false,
  );
  assert.equal(
    isFullQuestionCrop({
      url: figureUrl,
      alt: "Question region including choices A–D",
      role: "question_region",
    }),
    true,
  );
  assert.equal(
    hasFullQuestionCrop({
      figures: [{ url: figureUrl, alt: "Diagram from page 10" }],
      prompt: "Use the graph.",
    }),
    false,
  );
  assert.equal(
    hasFullQuestionCrop({
      figures: [{ url: figureUrl, alt: "Question region including A–D", role: "question_region" }],
    }),
    true,
  );
});

test("detects smashed OCR, truncated choices, leftover chart headers, and graph citations", () => {
  assert.equal(looksSmashedOrTruncatedExtract("USStateswiththeGreatestNumberofOrganicFarmsin2016 State"), true);
  assert.equal(
    looksSmashedOrTruncatedExtract("Organic farming is a method of growing food that tries to reduce harm."),
    false,
  );
  assert.equal(looksTruncatedChoiceText("broccoli grown in soil containing mycorrhizal fungi had a sl"), true);
  assert.equal(looksTruncatedChoiceText("Washington had between 600 and 800 organic farms."), false);
  assert.equal(hasUsableChoiceText([{ text: "(see figure)" }, { text: "" }]), false);
  assert.equal(
    hasCompleteLetterChoiceText([
      { id: "a", label: "A", text: "However" },
      { id: "b", label: "B", text: "Therefore" },
    ]),
    false,
  );
  assert.equal(
    hasCompleteLetterChoiceText([
      { id: "a", label: "A", text: "However" },
      { id: "b", label: "B", text: "Therefore" },
      { id: "c", label: "C", text: "Meanwhile" },
      { id: "d", label: "D", text: "Similarly" },
    ]),
    true,
  );
  assert.equal(stripChartHeaderFragments("Organic Farms in 2016\nState\nOrganic farming is a method."), "Organic Farms in 2016\nOrganic farming is a method.");
  assert.equal(referencesVisualStimulus("Which choice most effectively uses data from the graph to complete the text?"), true);
  assert.equal(referencesVisualStimulus("Several artworks depict a female figure fishing."), false);
  assert.equal(
    shouldUseFigurePrimary({
      prompt: "Use the graph.",
      choices: [
        { id: "a", label: "A", text: "" },
        { id: "b", label: "B", text: "" },
        { id: "c", label: "C", text: "" },
        { id: "d", label: "D", text: "" },
      ],
      questionType: "mcq",
      correctAnswer: "A",
      extractGaps: { figurePrimary: true },
      figures: [{ url: figureUrl, alt: "Diagram from page 10" }],
    }),
    false,
  );
  const preserved = letterMcqChoices([
    { id: "a", label: "A", text: "Washington had between 600 and 800 organic farms." },
    { id: "b", label: "B", text: "New York had fewer than 800 organic farms." },
    { id: "c", label: "C", text: "Wisconsin and Iowa each had between 1,200 and 1,400 organic farms." },
    { id: "d", label: "D", text: "Pennsylvania had more than 1,200 organic farms." },
  ]);
  assert.equal(preserved[0]?.text.includes("Washington"), true);
});

test("rejects math OCR that lost exponents, radicals, or dumped fractions", () => {
  assert.equal(
    looksBrokenMathOcr(
      "= 206(1.034)x models the value,\nThe function f(x)\nin dollars, of a certain bank account",
    ),
    true,
  );
  assert.equal(looksBrokenMathOcr("f(x) = 206(1.034)^x models the value of the account."), false);
  assert.equal(
    looksBrokenMathOcr("14x = 2 w + 19\n7y\nWhich equation correctly expresses w in terms of x and y ?\nf(x)"),
    true,
  );
  assert.equal(looksFailedMathLayoutDump("w = − 19 ⎜⎜⎜⎝ ⎟⎟⎠ y ⎟ 2⎞⎟ � = − 19 ⎜⎜⎜⎝ ⎟⎟⎠ y ⎟ 2⎞⎟ ⎛28x"), true);
  assert.equal(looksFailedMathLayoutDump("w = −19 y F 28x"), true);
  assert.equal(isStudentReadableChoiceText("w = −19 y F 28x"), false);
  assert.equal(isStudentReadableChoiceText("w = − 19 ⎜⎜⎜⎝ ⎟⎟⎠ y"), false);
  assert.equal(
    looksBrokenMathOcr("A right triangle has sides of length 2 2 , 6 2 , and 80 units."),
    true,
  );
  assert.equal(looksStrippedRadicalChoice("8 2 + 80"), true);
  assert.equal(isStudentReadableChoiceText("8 2 + 80"), false);
  assert.equal(looksBrokenMathOcr("2 4x + bx − 45, where b is a constant,"), true);
  assert.equal(looksSpacedProductChoice("b h"), true);
  assert.equal(looksSpacedProductChoice("45 k"), true);
  assert.equal(isStudentReadableChoiceText("b h"), false);
  assert.equal(isStudentReadableChoiceText("45 k"), false);
  assert.equal(
    looksBrokenMathOcr("y = 2x2 − 21x + 64\nintersect at exactly one point, ( ,x y), in the x y-plane."),
    true,
  );
  assert.equal(looksBrokenMathOcr("y = 2x^2 − 21x + 64 intersect at (x, y) in the xy-plane."), false);
  assert.equal(
    looksBrokenMathOcr("y = ax2 + bx + c, which of the\n? following could be the value of a + b + c"),
    true,
  );
  assert.equal(hasReadableStudentStem({
    prompt:
      "= 206(1.034)x models the value,\nThe function f(x)\nin dollars, of a certain bank account by the end of each year from 1957 through 1972, where x is the number of years after 1957. Which of the following is the best interpretation of f(5)?",
  }), false);
  assert.equal(
    isFullQuestionCrop({
      url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p38-q22-right.png",
      alt: "Question figure region page 38",
    }),
    false,
  );
});

test("rejects corrupt stems, leaked A–D, and page-neighbor figures on word problems", () => {
  assert.equal(
    looksCorruptStemOcr("In the triangle shown, PQ QR. What is the value =\nof x?"),
    true,
  );
  assert.equal(looksCorruptStemOcr("In the triangle shown, PQ = QR. What is the value of x?"), false);
  assert.equal(
    looksCorruptStemOcr("X -10 -8 -6 -4 -2 V\n246810\nWhat is the y-intercept of the graph shown?"),
    true,
  );
  assert.equal(
    looksCorruptStemOcr(
      "X u 1 2 3 4 5 6\nThe graph models the number of active projects after the end of\n0 ≤x ≤6. According to the November 2012, where\nmodel, what is the predicted number?",
    ),
    true,
  );
  assert.equal(
    looksLeakedNextQuestionChoice(
      "(0, 8) - --------~ 4 Which expression is equivalent to 2x^2 + x − 9?",
    ),
    true,
  );
  assert.equal(
    hasMergedOrLeakedChoices([
      { id: "a", label: "A", text: "(−8, 0)" },
      { id: "b", label: "B", text: "(−6, 0)" },
      { id: "c", label: "C", text: "(0, 6)" },
      { id: "d", label: "D", text: "(0, 8) Which expression is equivalent to (2x^2+x-9)?" },
      { id: "a2", label: "A", text: "2x^2 + 6x − 8" },
    ]),
    true,
  );
  assert.equal(stemCitesVisual("In the triangle shown, PQ = QR. What is the value of x?"), true);
  assert.equal(
    stemCitesVisual(
      "The lengths of two sides of a triangle are 4 centimeters and 6 centimeters. If the perimeter is 18, what is the third side?",
    ),
    false,
  );
  assert.equal(
    selectStimulusFigures(
      [{ url: figureUrl, alt: "Diagram from page 34" }],
      {
        prompt:
          "The lengths of two sides of a triangle are 4 centimeters and 6 centimeters. If the perimeter of the triangle is 18 centimeters, what is the length of the third side?",
      },
    ).length,
    0,
  );
  assert.equal(
    selectStimulusFigures(
      [{ url: figureUrl, alt: "Diagram from page 34" }],
      {
        prompt:
          "Rectangle P has an area of 72 square inches. If a rectangle with an area of 20 square inches is removed from rectangle P, what is the area of the resulting figure?",
      },
    ).length,
    0,
  );
  assert.equal(
    selectStimulusFigures(
      [{ url: figureUrl, alt: "Diagram from page 34" }],
      { prompt: "In the triangle shown, PQ = QR. What is the value of x?" },
    ).length,
    1,
  );
});

test("student-facing fields hide garbled stems and do not emit empty letter keys", () => {
  const fields = studentFacingFigurePrimaryFields({
    prompt: "<!-- sat-bank-figures -->\nV = i,.r3",
    stimulus: `![Question region](${figureUrl})`,
    choices: [],
    questionType: "spr",
    correctAnswer: "A",
    extractGaps: { figurePrimary: true },
  });
  assert.equal(fields.presentation, "text");
  assert.equal(fields.choices, undefined);
  assert.equal(figurePrimaryStudentPrompt("V = i,.r3 V =3£wh"), "");
  assert.deepEqual(letterMcqChoices([]).map((choice) => choice.id), ["a", "b", "c", "d"]);
});
