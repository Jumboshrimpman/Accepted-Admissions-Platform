import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  applyFigurePrimaryToRecord,
  figurePrimaryStudentPrompt,
  hasUsableChoiceText,
  isLetterAnswer,
  letterMcqChoices,
  looksGarbledExtractText,
  selectStimulusFigures,
  shouldUseFigurePrimary,
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

test("marks garbled graph + letter key as figure-primary even when choice text is present", () => {
  assert.equal(
    shouldUseFigurePrimary({
      prompt: "The scatterplot shows the relationship.\n10+-+-+-+--i------,f-----+---+---+",
      choices: [
        { id: "a", label: "A", text: "Positive" },
        { id: "b", label: "B", text: "Negative" },
        { id: "c", label: "C", text: "None" },
        { id: "d", label: "D", text: "Undefined" },
      ],
      questionType: "mcq",
      correctAnswer: "B",
    }),
    true,
  );
});

test("converts SPR items whose official key is a letter and figures exist", () => {
  const record = applyFigurePrimaryToRecord({
    prompt: "V = i,.r3 V =3£wh V=½nr2h",
    stimulus: null,
    choices: [],
    questionType: "spr",
    correctAnswer: "C",
    figures: [{ url: figureUrl, alt: "Question region", role: "question_region" }],
    extractGaps: { spr: true, missingChoices: true, notes: [] },
    assignable: true,
  });
  assert.equal(record.questionType, "mcq");
  assert.equal(record.extractGaps.figurePrimary, true);
  assert.equal(record.assignable, true);
  assert.deepEqual(
    record.choices.map((choice) => choice.label),
    ["A", "B", "C", "D"],
  );
  assert.ok(record.choices.every((choice) => choice.text === ""));
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

test("honors the PR #56 figure-primary src comment as an explicit MC-only hook", () => {
  const src = "https://app.acceptedadmissions.org/media/sat-bank/pack/q7-question.png";
  const fields = studentFacingFigurePrimaryFields({
    prompt: `<!-- figure-primary src="${src}" -->`,
    stimulus: null,
    choices: [],
    questionType: "spr",
    correctAnswer: "A",
  });
  assert.equal(fields.presentation, "figure_primary");
  assert.equal(fields.questionType, "mcq");
  assert.equal(fields.stimulus, `![Question region](${src})`);
  assert.deepEqual(fields.choices?.map((choice) => choice.label), ["A", "B", "C", "D"]);
});

test("student-facing fields hide garbled stems and emit letter-only choices", () => {
  const fields = studentFacingFigurePrimaryFields({
    prompt: "<!-- sat-bank-figures -->\nV = i,.r3",
    stimulus: `![Question region](${figureUrl})`,
    choices: [],
    questionType: "spr",
    correctAnswer: "A",
    extractGaps: { figurePrimary: true },
  });
  assert.equal(fields.presentation, "figure_primary");
  assert.equal(fields.prompt, "");
  assert.equal(figurePrimaryStudentPrompt("V = i,.r3 V =3£wh"), "");
  assert.deepEqual(letterMcqChoices([]).map((choice) => choice.id), ["a", "b", "c", "d"]);
  assert.match(fields.stimulus ?? "", /Question region/);
});
