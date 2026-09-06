import assert from "node:assert/strict";
import test from "node:test";
import {
  QUESTION_ALREADY_ON_QUIZ_MESSAGE,
  questionCanAttachToAssignment,
} from "./question-single-quiz.ts";

const bank = {
  assignmentId: "quiz-bank",
  sessionId: null,
  title: "October pre-session mini-section",
};
const clone = {
  assignmentId: "quiz-clone",
  sessionId: "session-1",
  title: "October pre-session mini-section",
};
const otherBank = {
  assignmentId: "quiz-other",
  sessionId: null,
  title: "Different SAT quiz",
};

test("a question can attach to its own quiz and a same-title session clone", () => {
  assert.equal(questionCanAttachToAssignment([], bank), true);
  assert.equal(questionCanAttachToAssignment([bank], bank), true);
  assert.equal(questionCanAttachToAssignment([bank], clone), true);
  assert.equal(questionCanAttachToAssignment([bank, clone], clone), true);
});

test("a question cannot attach to a second bank quiz", () => {
  assert.equal(questionCanAttachToAssignment([bank], otherBank), false);
  assert.equal(questionCanAttachToAssignment([bank, clone], otherBank), false);
  assert.equal(
    QUESTION_ALREADY_ON_QUIZ_MESSAGE,
    "This question is already on another quiz. A question can only belong to one quiz.",
  );
});

test("same-title bank quizzes cannot share a question", () => {
  const sameTitleBank = {
    assignmentId: "quiz-bank-copy",
    sessionId: null,
    title: "October pre-session mini-section",
  };
  assert.equal(questionCanAttachToAssignment([bank], sameTitleBank), false);
  assert.equal(questionCanAttachToAssignment([sameTitleBank], bank), false);
  assert.equal(questionCanAttachToAssignment([bank, clone], sameTitleBank), false);
});
