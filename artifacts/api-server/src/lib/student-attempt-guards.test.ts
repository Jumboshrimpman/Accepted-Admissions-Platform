import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  canFinalizeAttemptResult,
  countRecordedAnswers,
  countsTowardAttemptLimit,
  emptyAttemptSubmitError,
  isBrokenEmptyAttempt,
  isResumableIncompleteAttempt,
  shouldFinalizeExpiredAttempt,
} from "./student-attempt-guards.ts";

test("empty submit is blocked when no final answers were recorded", () => {
  assert.equal(countRecordedAnswers([]), 0);
  assert.equal(countRecordedAnswers([{ finalAnswer: null }, { finalAnswer: "" }]), 0);
  assert.match(emptyAttemptSubmitError(0) ?? "", /no answers recorded/i);
  assert.equal(emptyAttemptSubmitError(1), null);
});

test("recorded answers count only non-empty finals, not predictions", () => {
  assert.equal(
    countRecordedAnswers([{ finalAnswer: "B" }, { finalAnswer: "  " }, { finalAnswer: "9" }]),
    2,
  );
});

test("broken empty submits are the only attempts the first-session cleanup targets", () => {
  assert.equal(isBrokenEmptyAttempt({ status: "submitted", answeredCount: 0 }), true);
  assert.equal(isBrokenEmptyAttempt({ status: "expired", answeredCount: 0 }), true);
  assert.equal(isBrokenEmptyAttempt({ status: "submitted", answeredCount: 3 }), false);
  assert.equal(isBrokenEmptyAttempt({ status: "active", answeredCount: 0 }), false);
});

test("timer expiry with zero answers cannot finalize a completed 0/N result", () => {
  assert.equal(canFinalizeAttemptResult(0), false);
  assert.equal(canFinalizeAttemptResult(1), true);
  assert.equal(shouldFinalizeExpiredAttempt({ hasResult: false, answeredCount: 0 }), false);
  assert.equal(shouldFinalizeExpiredAttempt({ hasResult: false, answeredCount: 2 }), true);
  assert.equal(shouldFinalizeExpiredAttempt({ hasResult: true, answeredCount: 0 }), false);
  assert.equal(countsTowardAttemptLimit({ status: "expired", hasResult: false }), false);
  assert.equal(countsTowardAttemptLimit({ status: "expired", hasResult: true }), true);
  assert.equal(isResumableIncompleteAttempt({ status: "expired", hasResult: false }), true);
  assert.equal(isResumableIncompleteAttempt({ status: "expired", hasResult: true }), false);
});
