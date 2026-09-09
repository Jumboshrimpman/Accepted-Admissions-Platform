import assert from "node:assert/strict";
import test from "node:test";
import {
  displaySkill,
  missPickerLabel,
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
  assert.equal(labels[0], "Q1 · If 2x + 3 = 11, what is the value of…");
  assert.equal(labels[1], "Q2 · Which choice most logically comple…");
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
