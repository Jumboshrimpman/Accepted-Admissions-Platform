import assert from "node:assert/strict";
import test from "node:test";
import {
  answeredQuestionCount,
  canSubmitStudentAttempt,
  isCollaborativeSessionPractice,
  shouldAutoSubmitOnExpiry,
  studentCanSeeAnswerChoices,
  studentSeesFinishedResult,
  studentSeesPredictionStep,
} from "./student-attempt-ui.ts";

test("prediction cannot appear or auto-advance the student flow", () => {
  assert.equal(studentSeesPredictionStep(true), false);
  assert.equal(studentSeesPredictionStep(false), false);
  assert.equal(studentCanSeeAnswerChoices(), true);
});

test("empty submit is blocked and cannot glitch forward to results", () => {
  assert.equal(answeredQuestionCount({}), 0);
  assert.equal(answeredQuestionCount({ q1: { finalAnswer: "" }, q2: { finalAnswer: "   " } }), 0);
  assert.deepEqual(canSubmitStudentAttempt({ answeredCount: 0 }), { ok: false, reason: "empty" });
  assert.equal(shouldAutoSubmitOnExpiry(0), false);
  assert.deepEqual(canSubmitStudentAttempt({ answeredCount: 2 }), { ok: true, reason: "ok" });
  assert.equal(shouldAutoSubmitOnExpiry(1), true);
});

test("in-session practice is collaborative, not a prediction quiz", () => {
  assert.equal(isCollaborativeSessionPractice("during_session"), true);
  assert.equal(isCollaborativeSessionPractice("before_session"), false);
});

test("timer expiry with zero answers does not show a finished result", () => {
  assert.equal(
    studentSeesFinishedResult({ status: "expired", hasResult: false, resultError: true }),
    false,
  );
  assert.equal(studentSeesFinishedResult({ status: "expired", hasResult: false }), false);
  assert.equal(studentSeesFinishedResult({ status: "active", hasResult: false }), false);
  assert.equal(studentSeesFinishedResult({ status: "expired", hasResult: true }), true);
});
