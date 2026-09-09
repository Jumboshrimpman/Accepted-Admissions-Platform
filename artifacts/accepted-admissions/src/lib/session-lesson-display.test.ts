import assert from "node:assert/strict";
import test from "node:test";
import {
  displaySkill,
  formatAnswer,
  mergeRetryFeedback,
  missPickerLabel,
  retryDetailsExpanded,
  retryOutcomeHeading,
  retryRecordedMessage,
  retrySourceLabel,
} from "../components/session-lesson-display.ts";

test("displaySkill never returns the extract placeholder", () => {
  assert.equal(displaySkill("Transitions"), "Transitions");
  assert.equal(displaySkill("Skill not in extract", "SAT Math"), "SAT Math");
  assert.equal(displaySkill("Skill not in PDF", "Reading and Writing"), "Reading and Writing");
  assert.equal(displaySkill("Skill not in extract"), "General");
  assert.equal(displaySkill("Skill not in extract", "Skill not in extract"), "General");
});

test("miss picker labels stay unique when every miss has the same skill", () => {
  const misses = [
    { skill: "Skill not in extract", prompt: "If 2x + 3 = 11, what is the value of x?" },
    { skill: "Skill not in extract", prompt: "Which choice most logically completes the text?" },
    { skill: "SAT Math", prompt: "" },
  ];
  const labels = misses.map((miss, index) => missPickerLabel(miss, index));
  assert.equal(labels[0], "Q1 · If 2x + 3 = 11, what is the value…");
  assert.equal(labels[1], "Q2 · Which choice most logically…");
  assert.equal(labels[2], "Q3");
  assert.equal(new Set(labels).size, 3);
  assert.equal(
    labels.every((label) => !/skill not in extract/i.test(label)),
    true,
  );
});

test("retry copy uses Correct/Incorrect instead of bank jargon", () => {
  assert.equal(retrySourceLabel("bank"), "Similar practice question");
  assert.equal(retrySourceLabel("ai"), "Original practice question");
  assert.equal(retrySourceLabel("blocked"), "No similar question available");
  assert.equal(retryOutcomeHeading({ outcome: "pending" }), null);
  assert.equal(retryOutcomeHeading({ outcome: "mastered", correct: true }), "Correct");
  assert.equal(retryOutcomeHeading({ outcome: "still_struggling", correct: false }), "Incorrect");
  assert.equal(retryRecordedMessage({ correct: true }), "Correct.");
  assert.equal(
    retryRecordedMessage({
      correct: false,
      formattedCorrectAnswer: "B. However",
      explanation: "However signals contrast.",
    }),
    "Incorrect. The correct answer is B. However. However signals contrast.",
  );
});

const choices = [
  { id: "a", label: "A", text: "Meanwhile" },
  { id: "b", label: "B", text: "However" },
  { id: "c", label: "C", text: "For example" },
];

test("formatAnswer matches id, label, letter, and choice text", () => {
  assert.equal(formatAnswer("c", choices), "C. For example");
  assert.equal(formatAnswer("C", choices), "C. For example");
  assert.equal(formatAnswer("C.", choices), "C. For example");
  assert.equal(formatAnswer("For example", choices), "C. For example");
  assert.equal(formatAnswer("C. For example", choices), "C. For example");
  assert.equal(formatAnswer("9; 9.0"), "9; 9.0");
  assert.equal(formatAnswer(""), "");
  assert.equal(formatAnswer(null), "");
});

test("mergeRetryFeedback keeps a just-graded key when the lesson refetch omits it", () => {
  const pending = {
    outcome: "pending" as const,
    correct: null,
    studentAnswer: null,
    correctAnswer: null,
    explanation: null,
  };
  const merged = mergeRetryFeedback(pending, {
    outcome: "still_struggling",
    correct: false,
    studentAnswer: "a",
    correctAnswer: "C",
    explanation: "However signals contrast.",
  });
  assert.equal(merged.outcome, "still_struggling");
  assert.equal(merged.correctAnswer, "C");
  assert.equal(merged.explanation, "However signals contrast.");
  assert.equal(
    mergeRetryFeedback(
      { ...merged, correctAnswer: "", explanation: null },
      { correctAnswer: "C", explanation: "kept" },
    ).correctAnswer,
    "C",
  );
});

test("graded retries stay collapsed until expanded", () => {
  assert.equal(retryDetailsExpanded({ outcome: "pending" }), true);
  assert.equal(retryDetailsExpanded({ outcome: "still_struggling" }), false);
  assert.equal(retryDetailsExpanded({ outcome: "mastered", expanded: true }), true);
  assert.equal(retryDetailsExpanded({ outcome: "still_struggling", expanded: false }), false);
});
