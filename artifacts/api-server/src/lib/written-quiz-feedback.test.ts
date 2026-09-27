import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  buildStudentWrittenFeedback,
  usableWrittenExplanation,
  writtenQuestionNote,
} from "./written-quiz-feedback.ts";

const TUTOR_BRIEF = /do not rehash|live session should open|open with the \d+|start with the focus areas below|skill not in extract/i;

test("writes a tutor-style letter for a finished pre-work set", () => {
  const feedback = buildStudentWrittenFeedback({
    score: 50,
    correctCount: 2,
    totalCount: 4,
    assignmentTitle: "60-minute SAT pre-work — October 9",
    homeworkKind: "routine",
    items: [
      {
        correct: false,
        skill: "Transitions",
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
        prompt: "Which transition best connects the paragraphs?",
        finalAnswer: "a",
        explanation: "Because.",
      },
      {
        correct: false,
        skill: "Transitions",
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
        prompt: "Choose the link that matches the contrast.",
        finalAnswer: "c",
        explanation: "",
      },
      {
        correct: true,
        skill: "Linear equations",
        subject: "SAT Math",
        domain: "Algebra",
        prompt: "Solve for x.",
        finalAnswer: "b",
        explanation: "Subtract 4 from both sides, then divide by 2.",
      },
      {
        correct: false,
        skill: "Problem-Solving and Data Analysis",
        subject: "SAT Math",
        domain: "Problem-Solving and Data Analysis",
        prompt: "What is the slope?",
        finalAnswer: null,
        explanation: "Official explanation is not in the extract yet. Do not invent College Board wording.",
      },
    ],
  });

  assert.match(feedback, /You finished with 2 of 4 correct/);
  assert.match(feedback, /Transitions/);
  assert.match(feedback, /Which transition best connects/);
  assert.match(feedback, /contrast, cause, example, or sequence/);
  assert.match(feedback, /Linear equations was steadier/);
  assert.match(feedback, /left blank/);
  assert.match(feedback, /accuracy only/i);
  assert.match(feedback, /not an official SAT score/i);
  assert.doesNotMatch(feedback, /Estimated SAT/);
  assert.doesNotMatch(feedback, TUTOR_BRIEF);
  assert.doesNotMatch(feedback, /Because\./);
  assert.doesNotMatch(feedback, /Do not invent/);
  assert.doesNotMatch(feedback, /Subtract 4 from both sides/);
});

test("diagnostic feedback includes an estimated range and stays unofficial", () => {
  const feedback = buildStudentWrittenFeedback({
    score: 50,
    correctCount: 1,
    totalCount: 2,
    assignmentTitle: "Full SAT Practice Diagnostic",
    homeworkKind: "diagnostic",
    items: [
      {
        correct: false,
        skill: "Transitions",
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
        prompt: "Which transition fits?",
        finalAnswer: "a",
      },
      {
        correct: true,
        skill: "Linear equations",
        subject: "SAT Math",
        domain: "Algebra",
        prompt: "Solve the equation.",
        finalAnswer: "b",
      },
    ],
  });
  assert.match(feedback, /estimated SAT range/i);
  assert.match(feedback, /not an official College Board adaptive/i);
  assert.doesNotMatch(feedback, TUTOR_BRIEF);
});

test("english sets get written feedback without an SAT score claim", () => {
  const feedback = buildStudentWrittenFeedback({
    score: 40,
    correctCount: 2,
    totalCount: 5,
    assignmentTitle: "IELTS-style reading practice",
    homeworkKind: "routine",
    items: [
      {
        correct: false,
        skill: "Matching headings",
        subject: "IELTS Reading",
        prompt: "Which heading matches paragraph B?",
        finalAnswer: "c",
      },
    ],
  });
  assert.match(feedback, /You finished with 2 of 5 correct/);
  assert.match(feedback, /Matching headings|passage/i);
  assert.match(feedback, /not an official exam score/i);
  assert.doesNotMatch(feedback, /SAT score/i);
  assert.doesNotMatch(feedback, TUTOR_BRIEF);
});

test("a clean set reads as a letter, not a score stub", () => {
  const feedback = buildStudentWrittenFeedback({
    score: 100,
    correctCount: 3,
    totalCount: 3,
    assignmentTitle: "Capability check",
    items: [
      { correct: true, skill: "Evidence", subject: "SAT Reading & Writing", prompt: "Which claim is supported?", finalAnswer: "a" },
      { correct: true, skill: "Evidence", subject: "SAT Reading & Writing", prompt: "Which line supports the claim?", finalAnswer: "b" },
      { correct: true, skill: "Evidence", subject: "SAT Reading & Writing", prompt: "Which quotation fits?", finalAnswer: "c" },
    ],
  });
  assert.match(feedback, /clean run/);
  assert.match(feedback, /harder versions of Evidence/);
  assert.doesNotMatch(feedback, /Accuracy only\./);
  assert.doesNotMatch(feedback, TUTOR_BRIEF);
});

test("item notes keep a real explanation and replace empty or placeholder stubs", () => {
  assert.equal(usableWrittenExplanation("Because."), null);
  assert.equal(usableWrittenExplanation("   "), null);
  assert.equal(
    usableWrittenExplanation("Official explanation is not in the extract yet. Do not invent College Board wording."),
    null,
  );
  assert.equal(
    usableWrittenExplanation("However signals contrast."),
    "However signals contrast.",
  );

  const kept = writtenQuestionNote({
    correct: false,
    skill: "Transitions",
    finalAnswer: "a",
    explanation: "However signals contrast.",
  });
  assert.equal(kept.source, "explanation");
  assert.match(kept.text, /However signals contrast/);

  const coached = writtenQuestionNote({
    correct: false,
    skill: "Transitions",
    finalAnswer: "a",
    explanation: "Because.",
    prompt: "Which transition best connects the paragraphs?",
  });
  assert.equal(coached.source, "coaching");
  assert.match(coached.text, /Transitions/);
  assert.match(coached.text, /contrast, cause, example, or sequence/);
  assert.doesNotMatch(coached.text, /Because/);
  assert.doesNotMatch(coached.text, /College Board/);
});
