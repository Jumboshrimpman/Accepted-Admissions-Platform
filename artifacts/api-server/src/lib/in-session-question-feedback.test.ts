import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  IN_SESSION_CHECK_EMPTY_ANSWER_MESSAGE,
  IN_SESSION_CHECK_NOT_ALLOWED_MESSAGE,
  attemptResponseFeedbackShape,
  checkAnswerRejectedReason,
  gradeInSessionAnswer,
  isResponseRevealed,
  lockedFinalAnswerAfterReveal,
  studentVisibleQuestionFeedback,
} from "./in-session-question-feedback.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { allowsInSessionPerQuestionFeedback } from "./session-homework.ts";

test("in-session practice can reveal per-question feedback; pre-work cannot", () => {
  assert.equal(allowsInSessionPerQuestionFeedback({ deliveryPhase: "during_session" }), true);
  assert.equal(allowsInSessionPerQuestionFeedback({ deliveryPhase: "before_session" }), false);
  assert.equal(allowsInSessionPerQuestionFeedback({ deliveryPhase: null }), false);
});

test("checkAnswer is rejected for timed pre-work and empty answers", () => {
  assert.equal(
    checkAnswerRejectedReason({
      deliveryPhase: "before_session",
      checkAnswer: true,
      finalAnswer: "a",
    }),
    IN_SESSION_CHECK_NOT_ALLOWED_MESSAGE,
  );
  assert.equal(
    checkAnswerRejectedReason({
      deliveryPhase: "during_session",
      checkAnswer: true,
      finalAnswer: "   ",
    }),
    IN_SESSION_CHECK_EMPTY_ANSWER_MESSAGE,
  );
  assert.equal(
    checkAnswerRejectedReason({
      deliveryPhase: "during_session",
      checkAnswer: true,
      finalAnswer: "b",
    }),
    null,
  );
  assert.equal(
    checkAnswerRejectedReason({
      deliveryPhase: "before_session",
      checkAnswer: false,
      finalAnswer: "a",
    }),
    null,
  );
});

test("revealed in-session items expose grade, key, and explanation; others stay hidden", () => {
  const revealed = studentVisibleQuestionFeedback({
    deliveryPhase: "during_session",
    revealed: true,
    storedCorrect: false,
    studentAnswer: "a",
    correctAnswer: "b",
    explanation: "However signals contrast.",
  });
  assert.deepEqual(revealed, {
    revealed: true,
    correct: false,
    correctAnswer: "b",
    explanation: "However signals contrast.",
  });

  assert.deepEqual(
    studentVisibleQuestionFeedback({
      deliveryPhase: "before_session",
      revealed: true,
      storedCorrect: true,
      studentAnswer: "a",
      correctAnswer: "a",
      explanation: "hidden until final submit",
    }),
    { revealed: false, correct: null, correctAnswer: null, explanation: null },
  );

  assert.deepEqual(
    studentVisibleQuestionFeedback({
      deliveryPhase: "during_session",
      revealed: false,
      studentAnswer: "a",
      correctAnswer: "a",
      explanation: "not yet checked",
    }),
    { revealed: false, correct: null, correctAnswer: null, explanation: null },
  );
});

test("graded responses stay locked after reveal so a later edit cannot unhide a different key", () => {
  assert.equal(isResponseRevealed(false), true);
  assert.equal(isResponseRevealed(true), true);
  assert.equal(isResponseRevealed(null), false);
  assert.equal(
    lockedFinalAnswerAfterReveal({
      alreadyRevealed: true,
      existingAnswer: "a",
      incomingAnswer: "b",
    }),
    "a",
  );
  assert.equal(gradeInSessionAnswer({ studentAnswer: "b", correctAnswer: "b" }), true);
  assert.equal(gradeInSessionAnswer({ studentAnswer: "9.0", correctAnswer: "9; 9.0" }), true);
});

test("attempt response shape never includes a key when feedback is hidden", () => {
  const hidden = attemptResponseFeedbackShape({
    questionId: "q1",
    prediction: null,
    predictionLocked: false,
    finalAnswer: "a",
    flagged: false,
    feedback: { revealed: false, correct: null, correctAnswer: null, explanation: null },
  });
  assert.equal(hidden.revealed, false);
  assert.equal(hidden.correctAnswer, null);
  assert.equal(hidden.explanation, null);
});
