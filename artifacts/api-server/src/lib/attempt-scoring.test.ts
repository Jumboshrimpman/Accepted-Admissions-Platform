import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isUnscoredAttemptItem, scoreAttemptItems } from "./attempt-scoring.ts";

test("flagged and reported responses are excluded from scoring", () => {
  assert.equal(isUnscoredAttemptItem({ correct: true, flagged: true }), true);
  assert.equal(isUnscoredAttemptItem({ correct: false, reported: true }), true);
  assert.equal(isUnscoredAttemptItem({ correct: true, flagged: false }), false);

  const result = scoreAttemptItems([
    { correct: true, flagged: false },
    { correct: false, flagged: false },
    { correct: true, flagged: true },
    { correct: false, reported: true },
  ]);
  assert.equal(result.correctCount, 1);
  assert.equal(result.totalCount, 2);
  assert.equal(result.score, 50);
  assert.equal(result.unscoredCount, 2);
});

test("an attempt of only flagged items scores 0 over an empty denominator", () => {
  const result = scoreAttemptItems([
    { correct: true, flagged: true },
    { correct: true, reported: true },
  ]);
  assert.equal(result.correctCount, 0);
  assert.equal(result.totalCount, 0);
  assert.equal(result.score, 0);
  assert.equal(result.unscoredCount, 2);
});
