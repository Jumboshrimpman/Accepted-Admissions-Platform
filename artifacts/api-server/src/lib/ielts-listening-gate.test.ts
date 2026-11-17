import assert from "node:assert/strict";
import test from "node:test";
import {
  isIeltsListeningWrittenItem,
  isStudentUsableQuizItem,
} from "./sat-bank-diagnostic-quality.ts";
import { answersMatch } from "./sat-bank-retry.ts";
import { isSkillPracticeAssignment, SKILL_PRACTICE_PHASE } from "./skill-practice.ts";

const gap = {
  subject: "IELTS Listening",
  domain: "IELTS Listening",
  questionType: "spr",
  prompt: "Question 2 (ONE WORD AND/OR A NUMBER)\nStart date: (2) __________",
  stimulus: "[[audio:/media/ielts-listening/p1.mp3|Part 1 recording]]\n\nStart date: (2) __________",
  choices: [],
  correctAnswer: "14 April;14th April;April 14",
};

test("IELTS Listening written answers pass the English quiz gate", () => {
  assert.equal(isIeltsListeningWrittenItem(gap), true);
  assert.equal(isStudentUsableQuizItem(gap), true);
});

test("written items still need a key and a readable prompt", () => {
  assert.equal(isStudentUsableQuizItem({ ...gap, correctAnswer: "" }), false);
  assert.equal(isStudentUsableQuizItem({ ...gap, prompt: "Q2" }), false);
});

test("IELTS Reading free-response items are still rejected", () => {
  const reading = { ...gap, subject: "IELTS Reading", domain: "IELTS Reading" };
  assert.equal(isIeltsListeningWrittenItem(reading), false);
  assert.equal(isStudentUsableQuizItem(reading), false);
});

test("IELTS Listening multiple choice keeps the A–D rule", () => {
  const mcq = {
    subject: "IELTS Listening",
    domain: "IELTS Listening",
    questionType: "mcq",
    prompt: "11 Why has the centre changed its opening time?",
    choices: [
      { id: "a", label: "A", text: "to reduce staff costs" },
      { id: "b", label: "B", text: "to give birds an undisturbed period" },
      { id: "c", label: "C", text: "because few visitors came early" },
      { id: "d", label: "D", text: "to allow maintenance first" },
    ],
    correctAnswer: "b",
  };
  assert.equal(isStudentUsableQuizItem(mcq), true);
  assert.equal(isStudentUsableQuizItem({ ...mcq, choices: mcq.choices.slice(0, 3) }), false);
});

test("listening keys accept listed variants, any case", () => {
  assert.equal(answersMatch("14th april", gap.correctAnswer), true);
  assert.equal(answersMatch("April 14", gap.correctAnswer), true);
  assert.equal(answersMatch("12 April", gap.correctAnswer), false);
  assert.equal(answersMatch("THWAITE", "Thwaite"), true);
  assert.equal(answersMatch("Thwait", "Thwaite"), false);
  assert.equal(answersMatch("6.5", "6.50;6.5;£6.50"), true);
  assert.equal(answersMatch("g", "G"), true);
  assert.equal(answersMatch("f", "G"), false);
});

test("skill practice phase is separate from pre-work and in-session phases", () => {
  assert.equal(SKILL_PRACTICE_PHASE, "skill_practice");
  assert.equal(isSkillPracticeAssignment({ deliveryPhase: "skill_practice" }), true);
  assert.equal(isSkillPracticeAssignment({ deliveryPhase: "before_session" }), false);
  assert.equal(isSkillPracticeAssignment(null), false);
});

test("audio token and numbered gaps are not treated as extraction bleed", () => {
  const stimulus = [
    "[[audio:/media/ielts-listening/taito-2026-11-20-part1.mp3|Part 1 recording]]",
    "",
    "Questions 1–10",
    "Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer.",
    "",
    "Customer surname: (1) __________",
    "Fuel deposit: £(6) __________",
  ].join("\n");
  assert.equal(isStudentUsableQuizItem({ ...gap, stimulus }), true);
});
