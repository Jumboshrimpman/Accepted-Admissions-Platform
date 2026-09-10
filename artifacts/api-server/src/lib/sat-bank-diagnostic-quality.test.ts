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
  isCleanTextMcqItem,
  isStudentUsableDiagnosticItem,
  isTrueSprQuizItem,
  isUsableFullLengthDiagnostic,
  normalizeLetterAnswer,
  selectUsableDiagnosticItems,
  summarizeDiagnosticComposition,
} from "./sat-bank-diagnostic-quality.ts";

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
  ];
  for (const key of brokenMathKeys) {
    assert.ok(
      unusable.some((row) => row.sourceKey === key),
      `expected ${key} to be dropped as broken math OCR`,
    );
  }

  const selected = selectUsableDiagnosticItems(records, {
    preferredCollectionSlug: "sat-practice-test-4-digital",
    allowCrossCollectionFill: true,
  });
  const composition = summarizeDiagnosticComposition(selected, {
    droppedUnusable: unusable.filter((row) => row.collectionSlug === "sat-practice-test-4-digital")
      .length,
    preferredCollectionSlug: "sat-practice-test-4-digital",
  });

  assert.equal(composition.questionCount, 120);
  assert.equal(composition.rwCount, 66);
  assert.equal(composition.mathCount, 54);
  assert.deepEqual(composition.modules, {
    "rw-1": 33,
    "rw-2": 33,
    "math-1": 27,
    "math-2": 27,
  });
  assert.equal(composition.sprCount, 0);
  assert.equal(composition.duplicatePrompts, 0);
  assert.ok(composition.filledFromOtherPacks > 0);
  assert.ok(composition.cleanMcqCount >= 80);
  assert.equal(composition.usable, true);
  assert.equal(isUsableFullLengthDiagnostic(composition), true);
  assert.ok(selected.every((row) => isStudentUsableDiagnosticItem(row)));
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
  assert.ok(selected.length >= 80);
  assert.ok(selected.length < 120);
  assert.ok(selected.every((row) => row.collectionSlug === "sat-practice-test-4-digital"));
  assert.ok(selected.every((row) => isStudentUsableDiagnosticItem(row)));
});
