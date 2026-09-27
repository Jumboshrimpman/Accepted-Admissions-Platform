import assert from "node:assert/strict";
import test from "node:test";
import {
  feedbackParagraphs,
  splitWrittenFeedback,
  usableWrittenExplanation,
  writtenQuestionNote,
} from "./written-quiz-feedback.ts";

test("splits a written letter into paragraphs and drops blank stubs", () => {
  assert.deepEqual(
    feedbackParagraphs("You finished with 2 of 4 correct.\n\nThe misses gathered around Transitions."),
    ["You finished with 2 of 4 correct.", "The misses gathered around Transitions."],
  );
  assert.equal(usableWrittenExplanation("Because."), null);
  assert.equal(
    usableWrittenExplanation("Official explanation is not in the extract yet. Do not invent College Board wording."),
    null,
  );
  assert.equal(usableWrittenExplanation("The graph rises."), "The graph rises.");
});

test("lifts mistake-pattern prose out of the letter without treating it as a question list", () => {
  const letter = [
    "You finished with 1 of 2 correct, about 50%.",
    "This pre-work reports accuracy only. It is not an official SAT score.",
    "Mistake patterns",
    "The pattern is Transitions. It showed up on one miss. That means the word you chose did not match how the two ideas actually relate. Read both sides of the blank and name the relationship.",
    "Before the next timed pre-work set, stay with Transitions until you can say what the pattern was and what you will do differently.",
  ].join("\n\n");
  const split = splitWrittenFeedback(letter);
  assert.deepEqual(split.intro, [
    "You finished with 1 of 2 correct, about 50%.",
    "This pre-work reports accuracy only. It is not an official SAT score.",
  ]);
  assert.equal(split.mistakePatterns.length, 2);
  assert.match(split.mistakePatterns[0] ?? "", /The pattern is Transitions/);
  assert.doesNotMatch(split.mistakePatterns.join(" "), /Which transition/);
  assert.deepEqual(splitWrittenFeedback("Accuracy only."), {
    intro: ["Accuracy only."],
    mistakePatterns: [],
  });
});

test("writes a usable note when the explanation field is empty", () => {
  const note = writtenQuestionNote({
    correct: false,
    skill: "Linear equations",
    subject: "SAT Math",
    domain: "Algebra",
    prompt: "What is the slope?",
    finalAnswer: "a",
    explanation: "",
  });
  assert.equal(note.source, "coaching");
  assert.match(note.text, /Linear equations/);
  assert.match(note.text, /what is unknown/i);
  assert.doesNotMatch(note.text, /College Board/);
  assert.doesNotMatch(note.text, /official solution/i);
});

test("keeps a real explanation and coaches a blank answer without inventing a solution", () => {
  const kept = writtenQuestionNote({
    correct: true,
    skill: "Evidence",
    finalAnswer: "b",
    explanation: "The cited line supports the claim.",
  });
  assert.equal(kept.source, "explanation");
  assert.equal(kept.text, "The cited line supports the claim.");

  const blank = writtenQuestionNote({
    correct: false,
    skill: "Boundaries",
    finalAnswer: null,
    explanation: "N/A",
  });
  assert.equal(blank.source, "coaching");
  assert.match(blank.text, /left blank/);
  assert.match(blank.text, /Boundaries/);
  assert.doesNotMatch(blank.text, /^N\/A/);
});
