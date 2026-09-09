import assert from "node:assert/strict";
import test from "node:test";
import {
  draftFromAssignmentQuestion,
  isSessionMcqQuestion,
  sessionQuestionUpdateBody,
} from "./session-quiz-edit.ts";

test("session quiz drafts keep MCQ stems, choices, keys, and explanations", () => {
  const draft = draftFromAssignmentQuestion({
    prompt: "Which choice completes the text?",
    choices: [
      { id: "a", label: "A", text: "however" },
      { id: "b", label: "B", text: "therefore" },
    ],
    correctAnswer: "a",
    explanation: "However signals contrast.",
  });
  assert.equal(isSessionMcqQuestion("multiple_choice"), true);
  assert.equal(isSessionMcqQuestion("spr"), false);
  assert.deepEqual(sessionQuestionUpdateBody(draft), {
    prompt: "Which choice completes the text?",
    choices: [
      { id: "a", label: "A", text: "however" },
      { id: "b", label: "B", text: "therefore" },
    ],
    correctAnswer: "a",
    explanation: "However signals contrast.",
  });
});
