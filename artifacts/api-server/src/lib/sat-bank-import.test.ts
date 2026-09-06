import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  STAGED_COLLECTION_STUBS,
  parseCollegeBoardManifest,
  parseCollegeBoardPayload,
} from "./sat-bank-import.ts";

const jsonl = [
  JSON.stringify({
    id: "sat-pt11-rw-m1-q3",
    examFamily: "sat",
    examVariant: "sat",
    practiceTestNumber: 11,
    section: "Reading and Writing",
    module: 1,
    questionNumber: 3,
    prompt: "Which choice most logically completes the text?",
    choices: [
      { label: "A", text: "an unsupported leap" },
      { label: "B", text: "a limited conclusion" },
      { label: "C", text: "a copied statistic" },
      { label: "D", text: "an unrelated anecdote" },
    ],
    correctAnswer: "B",
    officialExplanation: "The text supports only a limited conclusion.",
    skill: null,
    topic: null,
    difficulty: null,
    source: {
      packId: "sat-practice-test-11-digital",
      testPdf: "sat-practice-test-11-digital.pdf",
      answersPdf: "sat-practice-test-11-answers-digital.pdf",
    },
  }),
  JSON.stringify({
    examFamily: "sat",
    examVariant: "sat",
    practiceTestNumber: 11,
    section: "rw",
    module: 1,
    questionNumber: 3,
    prompt: "Duplicate source key must be ignored.",
    correctAnswer: "a",
    officialExplanation: "Should not create a second canonical row.",
  }),
].join("\n");

test("parses JSONL extracts into canonical records with stable source keys", () => {
  const parsed = parseCollegeBoardPayload(jsonl, "fixture.jsonl");
  assert.equal(parsed.records.length, 1);
  assert.deepEqual(parsed.duplicatesInFile, ["sat-pt11-rw-m1-q3"]);
  const record = parsed.records[0]!;
  assert.equal(record.sourceKey, "sat-pt11-rw-m1-q3");
  assert.equal(record.dedupKey, "sat:sat:11:rw:1:3");
  assert.equal(record.collectionSlug, "sat-practice-test-11-digital");
  assert.equal(record.officialExplanation, "The text supports only a limited conclusion.");
  assert.equal(record.skill, null);
  assert.equal(record.difficulty, null);
  assert.equal(record.correctAnswer, "b");
  assert.equal(
    record.assets[0]?.resourceUrl,
    "content/college-board/pdfs/sat-practice-test-11-digital.pdf",
  );
});

test("keeps figure-heavy and SPR rows instead of inventing official wording", () => {
  const parsed = parseCollegeBoardPayload(
    JSON.stringify([
      {
        id: "sat-pt4-math-m1-q6",
        examFamily: "sat",
        examVariant: "sat",
        practiceTestNumber: 4,
        section: "math",
        module: 1,
        questionNumber: 6,
        questionType: "spr",
        prompt: "How many pounds of oranges did the customer purchase?",
        choices: null,
        correctAnswer: "9; 9.0",
        officialExplanation: "The customer spent $27 at $3 per pound.",
        skill: null,
        difficulty: null,
      },
      {
        id: "sat-pt7-math-m2-q12",
        examFamily: "sat",
        examVariant: "sat",
        practiceTestNumber: 7,
        section: "math",
        module: 2,
        questionNumber: 12,
        questionType: "mcq",
        prompt: null,
        choices: null,
        correctAnswer: "C",
        officialExplanation: "Choice C is the best answer because the figure shows the relationship.",
        skill: null,
        difficulty: null,
        extractionNotes: ["figure not recovered"],
      },
    ]),
  );
  assert.equal(parsed.records.length, 2);
  const spr = parsed.records[0]!;
  assert.equal(spr.questionType, "spr");
  assert.equal(spr.choices.length, 0);
  assert.equal(spr.assignable, true);
  assert.deepEqual(spr.scoring.acceptedForms, ["9", "9.0"]);
  const figure = parsed.records[1]!;
  assert.equal(figure.prompt, "");
  assert.equal(figure.assignable, false);
  assert.equal(figure.extractGaps.missingPrompt, true);
  assert.equal(figure.extractGaps.figuresIncomplete, true);
  assert.ok(figure.officialExplanation.includes("Choice C"));
});

test("does not invent skill or difficulty when the PDF omitted them", () => {
  const parsed = parseCollegeBoardPayload(
    JSON.stringify({
      questions: [
        {
          examFamily: "psat",
          examVariant: "psat8_9",
          practiceTestNumber: 1,
          section: "math",
          module: 2,
          q: 5,
          prompt: "What is the value of x?",
          correctAnswer: "12",
          officialExplanation: "Solve the linear equation.",
          questionType: "spr",
        },
      ],
    }),
  );
  assert.equal(parsed.records[0]?.sourceKey, "psat8_9-pt1-math-m2-q5");
  assert.equal(parsed.records[0]?.skill, null);
  assert.equal(parsed.records[0]?.difficulty, null);
  assert.equal(parsed.records[0]?.questionType, "spr");
});

test("skips rows that cannot be graded instead of creating blank bank questions", () => {
  const parsed = parseCollegeBoardPayload(
    JSON.stringify([{ examFamily: "sat", section: "rw", module: 1 }]),
  );
  assert.equal(parsed.records.length, 0);
  assert.match(parsed.skipped[0]?.reason ?? "", /questionNumber|correctAnswer/);
});

test("stages SAT 4–11 and the seven PSAT packs from the official layout", () => {
  const slugs = STAGED_COLLECTION_STUBS.map((item) => item.slug);
  assert.ok(slugs.includes("sat-practice-test-11-digital"));
  assert.ok(slugs.includes("sat-practice-test-4-digital"));
  assert.ok(slugs.includes("psat-8-9-practice-test-1"));
  assert.ok(slugs.includes("psat-nmsqt-practice-test-1"));
  assert.equal(STAGED_COLLECTION_STUBS.length, 15);
});

test("official on-disk extracts parse to 1800 unique graded questions", async () => {
  const root = path.resolve(process.cwd(), "../../content/college-board");
  const manifest = parseCollegeBoardManifest(await readFile(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.length, 15);
  const records = [];
  for (const pack of manifest) {
    const text = await readFile(path.join(root, pack.outputFile), "utf8");
    const parsed = parseCollegeBoardPayload(text, pack.outputFile);
    assert.equal(parsed.records.length, 120, pack.packId);
    records.push(...parsed.records);
  }
  assert.equal(records.length, 1800);
  assert.ok(records.every((row) => row.correctAnswer && row.officialExplanation));
  assert.ok(records.every((row) => row.skill == null && row.difficulty == null));
  assert.equal(new Set(records.map((row) => row.sourceKey)).size, 1800);
  assert.ok(records.some((row) => row.questionType === "spr" && row.choices.length === 0));
  assert.ok(records.some((row) => row.extractGaps.missingPrompt));
});
