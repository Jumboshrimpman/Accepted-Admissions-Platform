import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { parseCollegeBoardPayload, STAGED_COLLECTION_STUBS } from "./sat-bank-import.ts";

const jsonl = [
  JSON.stringify({
    examFamily: "sat",
    practiceTestNumber: 11,
    section: "Reading and Writing",
    module: 1,
    questionNumber: 3,
    prompt: "Which choice most logically completes the text?",
    choices: [
      { id: "a", label: "A", text: "an unsupported leap" },
      { id: "b", label: "B", text: "a limited conclusion" },
      { id: "c", label: "C", text: "a copied statistic" },
      { id: "d", label: "D", text: "an unrelated anecdote" },
    ],
    correctAnswer: "b",
    officialExplanation: "The text supports only a limited conclusion.",
    skill: "Command of Evidence",
    domain: "Information and Ideas",
    sourceFiles: {
      testPdf: "content/college-board/sat/practice-test-11/test.pdf",
      answersPdf: "content/college-board/sat/practice-test-11/answers.pdf",
    },
  }),
  JSON.stringify({
    examFamily: "sat",
    practiceTestNumber: 11,
    section: "rw",
    module: 1,
    questionNumber: 3,
    prompt: "Duplicate source key must be ignored.",
    correctAnswer: "a",
    officialExplanation: "Should not create a second canonical row.",
    skill: "Evidence",
  }),
].join("\n");

test("parses JSONL extracts into canonical records with stable source keys", () => {
  const parsed = parseCollegeBoardPayload(jsonl, "fixture.jsonl");
  assert.equal(parsed.records.length, 1);
  assert.deepEqual(parsed.duplicatesInFile, ["sat:11:rw:1:3"]);
  const record = parsed.records[0]!;
  assert.equal(record.sourceKey, "sat:11:rw:1:3");
  assert.equal(record.collectionSlug, "sat-practice-test-11");
  assert.equal(record.officialExplanation, "The text supports only a limited conclusion.");
  assert.equal(record.assets[0]?.resourceUrl, "content/college-board/sat/practice-test-11/test.pdf");
});

test("parses a JSON array extract without inventing official wording", () => {
  const parsed = parseCollegeBoardPayload(
    JSON.stringify({
      questions: [
        {
          examFamily: "psat",
          formCode: "8-9",
          section: "math",
          module: 2,
          q: 5,
          prompt: "What is the value of x?",
          correctAnswer: "12",
          officialExplanation: "Solve the linear equation.",
          skill: "Linear equations",
          questionType: "spr",
        },
      ],
    }),
  );
  assert.equal(parsed.records[0]?.sourceKey, "psat:8-9:math:2:5");
  assert.equal(parsed.records[0]?.questionType, "spr");
  assert.equal(parsed.records[0]?.estimatedSeconds, 120);
});

test("skips incomplete rows instead of creating blank bank questions", () => {
  const parsed = parseCollegeBoardPayload(
    JSON.stringify([{ examFamily: "sat", section: "rw", module: 1 }]),
  );
  assert.equal(parsed.records.length, 0);
  assert.match(parsed.skipped[0]?.reason ?? "", /questionNumber|prompt/);
});

test("stages SAT 4–11 and PSAT pack collection stubs for PDF linking", () => {
  const slugs = STAGED_COLLECTION_STUBS.map((item) => item.slug);
  assert.ok(slugs.includes("sat-practice-test-11"));
  assert.ok(slugs.includes("sat-practice-test-4"));
  assert.ok(slugs.includes("psat-8-9"));
  assert.ok(slugs.includes("psat-nmsqt"));
});
