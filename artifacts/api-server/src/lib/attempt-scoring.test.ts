import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isUnscoredAttemptItem, scoreAttemptItems } from "./attempt-scoring.ts";

test("review flags stay in the score and reported items do not", () => {
  assert.equal(isUnscoredAttemptItem({ correct: true, flagged: true }), false);
  assert.equal(isUnscoredAttemptItem({ correct: false, reported: true }), true);
  assert.equal(isUnscoredAttemptItem({ correct: true, flagged: false }), false);

  const result = scoreAttemptItems([
    { correct: true, flagged: false },
    { correct: false, flagged: false },
    { correct: true, flagged: true },
    { correct: false, reported: true },
  ]);
  assert.equal(result.correctCount, 2);
  assert.equal(result.totalCount, 3);
  assert.equal(result.score, (2 / 3) * 100);
  assert.equal(result.unscoredCount, 1);
});

test("unusable live-audit junk is excluded from scoring", () => {
  assert.equal(isUnscoredAttemptItem({ correct: false, unusable: true }), true);
  const result = scoreAttemptItems([
    { correct: true },
    { correct: false, unusable: true },
    { correct: true, flagged: true },
  ]);
  assert.equal(result.correctCount, 2);
  assert.equal(result.totalCount, 2);
  assert.equal(result.score, 100);
  assert.equal(result.unscoredCount, 1);
});

test("an attempt of only reported items scores 0 over an empty denominator", () => {
  const result = scoreAttemptItems([{ correct: true, reported: true }]);
  assert.equal(result.correctCount, 0);
  assert.equal(result.totalCount, 0);
  assert.equal(result.score, 0);
  assert.equal(result.unscoredCount, 1);
});
