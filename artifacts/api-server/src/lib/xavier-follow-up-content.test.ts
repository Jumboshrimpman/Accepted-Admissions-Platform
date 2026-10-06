import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { studentFacingFigurePrimaryFields } from "./sat-bank-figure-primary.ts";
import { answersMatch } from "./sat-bank-retry.ts";
import { isStudentAnswerableQuizQuestion } from "../../../accepted-admissions/src/lib/quiz-figure-primary.ts";
import {
  FACTORING_NOTES_PUBLIC_PATH,
  FACTORING_QUIZ_QUESTIONS,
  FACTORING_QUIZ_TIME_LIMIT_MINUTES,
  SAT_MATH_FOLLOW_UP_QUESTIONS,
  SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES,
  SAT_MATH_SET_10_ANSWERS,
  XAVIER_AUTHORED_FOLLOW_UP_TAG,
  assertFollowUpSelection,
  factorOrderAnswers,
  isXavierAuthoredFollowUpQuestion,
} from "./xavier-follow-up-content.ts";
import {
  FACTORING_QUIZ_FOLLOW_UP_TITLE,
  GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  SAT_MATH_FOLLOW_UP_TITLE,
  isPostSessionFollowUpTitle,
} from "./post-session-follow-up.ts";

test("SAT Math and Factoring follow-ups keep the requested counts and timers", () => {
  assertFollowUpSelection();
  assert.equal(SAT_MATH_FOLLOW_UP_QUESTIONS.length, 22);
  assert.equal(FACTORING_QUIZ_QUESTIONS.length, 26);
  assert.equal(SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES, 33);
  assert.equal(FACTORING_QUIZ_TIME_LIMIT_MINUTES, 39);
  assert.equal(SAT_MATH_FOLLOW_UP_TITLE, "SAT Math Problems");
  assert.equal(FACTORING_QUIZ_FOLLOW_UP_TITLE, "Factoring Quiz");
  assert.equal(isPostSessionFollowUpTitle(SAT_MATH_FOLLOW_UP_TITLE), true);
  assert.equal(isPostSessionFollowUpTitle(FACTORING_QUIZ_FOLLOW_UP_TITLE), true);
  assert.equal(isPostSessionFollowUpTitle(GEOMETRY_SAT_FOLLOW_UP_TITLE), true);
  assert.equal(isPostSessionFollowUpTitle(GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE), true);
});

test("SAT Math omits originals 5 and 6 and everything before problem 5", () => {
  const keys = SAT_MATH_FOLLOW_UP_QUESTIONS.map((question) => question.sourceKey);
  assert.deepEqual(keys.slice(0, 4), ["sat-5a", "sat-5b", "sat-6a", "sat-6b"]);
  assert.equal(keys.includes("sat-5"), false);
  assert.equal(keys.includes("sat-6"), false);
  assert.equal(keys.filter((key) => /^sat-[1-4](?:[ab])?$/.test(key)).length, 0);
  assert.deepEqual(keys.slice(4, 7), ["sat-7", "sat-7a", "sat-7b"]);
  assert.equal(keys.at(-1), "sat-12b");
});

test("factoring quiz is practice A and B only, in set order", () => {
  const keys = FACTORING_QUIZ_QUESTIONS.map((question) => question.sourceKey);
  assert.deepEqual(keys.slice(0, 4), ["fac-1a", "fac-1b", "fac-2a", "fac-2b"]);
  assert.equal(keys.includes("fac-1"), false);
  assert.equal(keys.filter((key) => key.endsWith("a") || key.endsWith("b")).length, 26);
  assert.equal(keys.at(-1), "fac-13b");
});

test("multiple choice keeps Xavier's letter and grid-ins keep numeric keys", () => {
  const byKey = new Map(SAT_MATH_FOLLOW_UP_QUESTIONS.map((question) => [question.sourceKey, question]));
  assert.equal(byKey.get("sat-6a")?.correctAnswer, "c");
  assert.equal(byKey.get("sat-6a")?.choices[2]?.text, "150");
  assert.equal(byKey.get("sat-6b")?.correctAnswer, "b");
  assert.equal(byKey.get("sat-5a")?.correctAnswer, "75");
  assert.equal(byKey.get("sat-5b")?.correctAnswer, "35");
  assert.equal(byKey.get("sat-7")?.correctAnswer, "-13");
  assert.equal(byKey.get("sat-7a")?.correctAnswer, "-9");
  assert.equal(byKey.get("sat-7b")?.correctAnswer, "-3");
  assert.equal(byKey.get("sat-8")?.correctAnswer, "46");
  assert.equal(byKey.get("sat-8a")?.correctAnswer, "64");
  assert.equal(byKey.get("sat-8b")?.correctAnswer, "110");
  assert.equal(byKey.get("sat-9")?.correctAnswer, "b");
  assert.equal(byKey.get("sat-9a")?.correctAnswer, "b");
  assert.equal(byKey.get("sat-9b")?.correctAnswer, "c");
  assert.equal(byKey.get("sat-11")?.correctAnswer, "d");
  assert.equal(byKey.get("sat-11")?.choices[3]?.text, "14/r");
  assert.equal(byKey.get("sat-11a")?.correctAnswer, "d");
  assert.equal(byKey.get("sat-11b")?.correctAnswer, "a");
  assert.equal(byKey.get("sat-12")?.correctAnswer, "d");
  assert.equal(byKey.get("sat-12")?.choices[3]?.text, "h(x) = 6(2)^x");
  assert.equal(byKey.get("sat-12a")?.correctAnswer, "b");
  assert.equal(byKey.get("sat-12b")?.correctAnswer, "c");
});

test("set 10 is graded from the printed problem, not the off-by-one key", () => {
  assert.deepEqual(SAT_MATH_SET_10_ANSWERS, { original: "3", practiceA: "5", practiceB: "4" });
  const byKey = new Map(SAT_MATH_FOLLOW_UP_QUESTIONS.map((question) => [question.sourceKey, question]));
  assert.equal(byKey.get("sat-10")?.questionType, "spr");
  assert.equal(byKey.get("sat-10")?.correctAnswer, "3");
  assert.equal(byKey.get("sat-10a")?.correctAnswer, "5");
  assert.equal(byKey.get("sat-10b")?.correctAnswer, "4");
});

test("factoring answer key letters and values match the handout", () => {
  const byKey = new Map(FACTORING_QUIZ_QUESTIONS.map((question) => [question.sourceKey, question]));
  assert.equal(byKey.get("fac-1a")?.correctAnswer, "a");
  assert.equal(byKey.get("fac-1a")?.choices[0]?.text, "21x + 6");
  assert.equal(byKey.get("fac-1b")?.correctAnswer, "d");
  assert.equal(byKey.get("fac-2a")?.correctAnswer, "-9");
  assert.equal(byKey.get("fac-2b")?.correctAnswer, "-4");
  assert.equal(byKey.get("fac-6a")?.correctAnswer, "9");
  assert.equal(byKey.get("fac-6b")?.correctAnswer, "8");
  assert.equal(byKey.get("fac-7a")?.correctAnswer, "c");
  assert.equal(byKey.get("fac-7b")?.correctAnswer, "d");
  assert.equal(byKey.get("fac-8a")?.correctAnswer, "a");
  assert.equal(byKey.get("fac-8b")?.correctAnswer, "c");
  assert.equal(byKey.get("fac-9a")?.correctAnswer, "c");
  assert.equal(byKey.get("fac-9b")?.correctAnswer, "d");
  assert.equal(byKey.get("fac-10a")?.correctAnswer, "11");
  assert.equal(byKey.get("fac-10b")?.correctAnswer, "1");
  assert.equal(byKey.get("fac-11a")?.correctAnswer, "14");
  assert.equal(byKey.get("fac-11b")?.correctAnswer, "3");
  assert.equal(byKey.get("fac-12a")?.correctAnswer, "6");
  assert.equal(byKey.get("fac-12b")?.correctAnswer, "7");
  assert.equal(byKey.get("fac-13a")?.correctAnswer, "29");
  assert.equal(byKey.get("fac-13b")?.correctAnswer, "23");
  assert.equal(answersMatch("(x - 3)(x + 6)", byKey.get("fac-4a")!.correctAnswer), true);
  assert.equal(answersMatch("5x^2(3x-5)", byKey.get("fac-3a")!.correctAnswer), true);
  assert.equal(answersMatch("(3x - 5)(5x^2)", byKey.get("fac-3a")!.correctAnswer), true);
  assert.equal(answersMatch("7xy(2x + 3y)", byKey.get("fac-3b")!.correctAnswer), true);
});

test("grid-in grading accepts equivalent spacing, minus signs, and factor order", () => {
  assert.equal(answersMatch("−13", "-13"), true);
  assert.equal(answersMatch("-13.0", "-13"), true);
  assert.equal(answersMatch("9.0", "9; 9.0"), true);
  assert.equal(answersMatch("a", "A"), true);
  const factors = factorOrderAnswers("(x+6)", "(x-3)");
  assert.equal(answersMatch("(x + 6)(x - 3)", factors), true);
  assert.equal(answersMatch("(x-3)(x+6)", factors), true);
  assert.equal(answersMatch("(x+6)(x-4)", factors), false);
});

test("authored follow-up tag is required before a grid-in is served", () => {
  const draft = SAT_MATH_FOLLOW_UP_QUESTIONS[0]!;
  assert.equal(
    isXavierAuthoredFollowUpQuestion({
      tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG],
      questionType: draft.questionType,
      prompt: draft.prompt,
      correctAnswer: draft.correctAnswer,
      choices: draft.choices,
    }),
    true,
  );
  assert.equal(
    isXavierAuthoredFollowUpQuestion({
      tags: ["sat-bank"],
      questionType: "spr",
      prompt: draft.prompt,
      correctAnswer: "75",
      choices: [],
    }),
    false,
  );
});

test("every follow-up item stays answerable after the student-facing gates", () => {
  const hidden: string[] = [];
  for (const draft of [...SAT_MATH_FOLLOW_UP_QUESTIONS, ...FACTORING_QUIZ_QUESTIONS]) {
    const facing = studentFacingFigurePrimaryFields({
      prompt: draft.prompt,
      stimulus: null,
      choices: draft.choices,
      questionType: draft.questionType,
      correctAnswer: draft.correctAnswer,
    });
    const answerable = isStudentAnswerableQuizQuestion({
      prompt: facing.prompt,
      stimulus: facing.stimulus,
      choices: facing.choices,
      presentation: facing.presentation,
      questionType: facing.questionType,
    });
    if (!answerable || facing.presentation !== "text") hidden.push(draft.sourceKey);
  }
  assert.deepEqual(hidden, []);
});

test("factoring notes PDF is hosted with the session media", () => {
  const pdf = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../accepted-admissions/public/media/factoring/xavier-factoring-notes.pdf",
  );
  assert.equal(FACTORING_NOTES_PUBLIC_PATH, "/media/factoring/xavier-factoring-notes.pdf");
  assert.equal(existsSync(pdf), true);
});
