import assert from "node:assert/strict";
import test from "node:test";
import {
  TUTOR_QUIZ_MAX_QUESTIONS,
  TUTOR_QUIZ_SPR_NOTE,
  TUTOR_QUIZ_UNUSABLE_NOTE,
  isTutorQuizMcq,
  selectBankQuestionsForTutorQuiz,
  tutorQuizTimeLimitMinutes,
} from "./tutor-reusable-quiz-select.ts";

const mcq = {
  id: "q1",
  questionType: "mcq",
  prompt: "Which choice is correct for this practice item?",
  choices: [
    { id: "a", label: "A", text: "One" },
    { id: "b", label: "B", text: "Two" },
    { id: "c", label: "C", text: "Three" },
    { id: "d", label: "D", text: "Four" },
  ],
  correctAnswer: "a",
  estimatedSeconds: 60,
};

const spr = {
  id: "q2",
  questionType: "spr",
  prompt: "Enter the value.",
  choices: [],
  correctAnswer: "9",
  estimatedSeconds: 90,
};

test("treats only SPR-like types as non-MCQ", () => {
  assert.equal(isTutorQuizMcq("mcq"), true);
  assert.equal(isTutorQuizMcq("multiple_choice"), true);
  assert.equal(isTutorQuizMcq("spr"), false);
  assert.equal(isTutorQuizMcq("free_response"), false);
});

test("selects bank questions in requested order and skips duplicates", () => {
  const second = { ...mcq, id: "q3", prompt: "Which choice is correct for the second item?" };
  const planned = selectBankQuestionsForTutorQuiz([second, mcq], ["q1", "q1", "q3"]);
  assert.deepEqual(
    planned.selected.map((row) => row.id),
    ["q1", "q3"],
  );
});

test("rejects SPR rows instead of assembling them into a tutor quiz", () => {
  const planned = selectBankQuestionsForTutorQuiz([mcq, spr], ["q1", "q2"]);
  assert.equal(planned.selected.length, 0);
  assert.equal(planned.error, TUTOR_QUIZ_SPR_NOTE);
});

test("rejects unknown or incomplete items", () => {
  assert.equal(
    selectBankQuestionsForTutorQuiz([mcq], ["missing"]).error,
    "One or more bank questions were not found.",
  );
  assert.equal(
    selectBankQuestionsForTutorQuiz(
      [{ ...mcq, prompt: "" }],
      ["q1"],
    ).error,
    TUTOR_QUIZ_UNUSABLE_NOTE,
  );
  assert.equal(
    selectBankQuestionsForTutorQuiz(
      [
        {
          ...mcq,
          choices: [
            { id: "a", label: "A", text: "" },
            { id: "b", label: "B", text: "" },
            { id: "c", label: "C", text: "" },
            { id: "d", label: "D", text: "Module 2 Reading and Writing" },
          ],
        },
      ],
      ["q1"],
    ).error,
    TUTOR_QUIZ_UNUSABLE_NOTE,
  );
  assert.equal(
    selectBankQuestionsForTutorQuiz(
      [mcq],
      Array.from({ length: TUTOR_QUIZ_MAX_QUESTIONS + 1 }, (_, index) => `q${index}`),
    ).error,
    `Choose at most ${TUTOR_QUIZ_MAX_QUESTIONS} questions.`,
  );
});

test("rejects math items a student cannot solve as shown", () => {
  const mathGraph = {
    id: "math-graph",
    questionType: "mcq",
    section: "math",
    subject: "Math",
    prompt: "The graph of y = f(x) is shown in the xy-plane. What is the vertex of the graph?",
    choices: [
      { id: "a", label: "A", text: "(-2, 3)" },
      { id: "b", label: "B", text: "(0, 0)" },
      { id: "c", label: "C", text: "(2, -1)" },
      { id: "d", label: "D", text: "(3, 4)" },
    ],
    correctAnswer: "A",
    estimatedSeconds: 90,
  };
  assert.equal(
    selectBankQuestionsForTutorQuiz([mathGraph], ["math-graph"]).error,
    TUTOR_QUIZ_UNUSABLE_NOTE,
  );
  assert.deepEqual(
    selectBankQuestionsForTutorQuiz(
      [
        {
          ...mathGraph,
          figures: [
            {
              url: "https://app.acceptedadmissions.org/media/sat-bank/pack/q-question.png",
              alt: "Question region including choices A–D",
              role: "question_region",
            },
          ],
        },
      ],
      ["math-graph"],
    ).selected.map((row) => row.id),
    ["math-graph"],
  );
});

test("time limit stays within a short custom-quiz band", () => {
  assert.equal(tutorQuizTimeLimitMinutes(0, 3), 5);
  assert.equal(tutorQuizTimeLimitMinutes(12 * 60, 8), 12);
  assert.equal(tutorQuizTimeLimitMinutes(400 * 60, 80), 180);
});
