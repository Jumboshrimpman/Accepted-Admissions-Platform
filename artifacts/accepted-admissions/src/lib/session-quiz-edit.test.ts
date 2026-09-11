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

test("session drafts do not invent A when the stored letter key is missing", () => {
  const draft = draftFromAssignmentQuestion({
    prompt: "Which choice completes the text?",
    choices: [
      { id: "a", label: "A", text: "however" },
      { id: "b", label: "B", text: "therefore" },
      { id: "c", label: "C", text: "meanwhile" },
      { id: "d", label: "D", text: "similarly" },
    ],
    correctAnswer: "",
    explanation: "",
  });
  assert.equal(draft.correctAnswer, "");
  const keyed = draftFromAssignmentQuestion({
    prompt: "For x > 0, f(x) equals 201% of x. Which could describe this function?",
    choices: [
      { id: "a", label: "A", text: "Decreasing exponential" },
      { id: "b", label: "B", text: "Decreasing linear" },
      { id: "c", label: "C", text: "Increasing exponential" },
      { id: "d", label: "D", text: "Increasing linear" },
    ],
    correctAnswer: "D",
    explanation: "",
  });
  assert.equal(keyed.correctAnswer, "d");
});
