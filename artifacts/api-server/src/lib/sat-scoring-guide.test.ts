import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SAT_SCORING_METHODOLOGY,
  convertRawToSectionScore,
  estimateSatScoreFromScoringGuide,
  formatEstimatedSatRange,
} from "./sat-scoring-guide.ts";

test("official scoring-guide conversion stays on the 200–800 band in tens", () => {
  assert.equal(convertRawToSectionScore(0, 66), 200);
  assert.equal(convertRawToSectionScore(66, 66), 800);
  assert.equal(convertRawToSectionScore(0, 54), 200);
  assert.equal(convertRawToSectionScore(54, 54), 800);
  const mid = convertRawToSectionScore(33, 66);
  assert.ok(mid >= 450 && mid <= 560);
  assert.equal(mid % 10, 0);
});

test("full-length diagnostic exposes an estimated SAT range, not official adaptive scoring", () => {
  const items = [
    ...Array.from({ length: 40 }, () => ({
      correct: true,
      subject: "SAT Reading & Writing",
      section: "rw" as const,
    })),
    ...Array.from({ length: 26 }, () => ({
      correct: false,
      subject: "SAT Reading & Writing",
      section: "rw" as const,
    })),
    ...Array.from({ length: 30 }, () => ({
      correct: true,
      subject: "SAT Math",
      section: "math" as const,
    })),
    ...Array.from({ length: 24 }, () => ({
      correct: false,
      subject: "SAT Math",
      section: "math" as const,
    })),
  ];
  const estimated = estimateSatScoreFromScoringGuide(items);
  assert.ok(estimated.total != null && estimated.total >= 400 && estimated.total <= 1600);
  assert.ok(estimated.rangeLow != null && estimated.rangeHigh != null);
  assert.ok(estimated.rangeLow < estimated.rangeHigh);
  assert.equal(estimated.rawReadingWriting, 40);
  assert.equal(estimated.rawMath, 30);
  assert.match(estimated.label, /estimated/i);
  assert.match(estimated.methodology, /not an official College Board adaptive/i);
  assert.match(formatEstimatedSatRange(estimated), /–/);
  assert.match(SAT_SCORING_METHODOLOGY, /linear paper\/digital/);
});
