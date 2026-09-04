import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { buildAttemptAnalysis, describeSessionPrepMode, projectSatScores, projectSatSectionScore } from "./assessment-analysis.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { FULL_SAT_DIAGNOSTIC_QUESTIONS } from "./sat-assessment-content.ts";

test("projects section accuracy onto the Digital SAT 200–800 band", () => {
  assert.equal(projectSatSectionScore(0), 200);
  assert.equal(projectSatSectionScore(100), 800);
  assert.equal(projectSatSectionScore(50), 500);
});

test("builds combined RW + Math projections for the full diagnostic", () => {
  const items = [
    { correct: true, skill: "Transitions", subject: "SAT Reading & Writing", domain: "Expression of Ideas" },
    { correct: false, skill: "Transitions", subject: "SAT Reading & Writing", domain: "Expression of Ideas" },
    { correct: true, skill: "Linear equations", subject: "SAT Math", domain: "Algebra" },
    { correct: true, skill: "Linear equations", subject: "SAT Math", domain: "Algebra" },
  ];
  const projection = projectSatScores(items);
  assert.equal(projection.readingWriting, 500);
  assert.equal(projection.math, 800);
  assert.equal(projection.total, 1300);
});

test("diagnostic analysis includes estimated score coaching for tutors and students", () => {
  const analysis = buildAttemptAnalysis(
    [
      { skill: "Transitions", correct: 0, total: 1, accuracy: 0 },
      { skill: "Linear equations", correct: 1, total: 1, accuracy: 100 },
    ],
    [
      {
        correct: false,
        skill: "Transitions",
        finalAnswer: "a",
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
      },
      {
        correct: true,
        skill: "Linear equations",
        finalAnswer: "b",
        subject: "SAT Math",
        domain: "Algebra",
      },
    ],
    50,
    { assignmentTitle: "Full SAT Practice Diagnostic" },
  );
  assert.match(analysis.label, /diagnostic/i);
  assert.match(analysis.feedback, /Estimated SAT projection/);
  assert.match(analysis.feedback, /Tutor focus/);
  assert.deepEqual(analysis.nextFocus, ["Transitions"]);
});

test("full diagnostic seed covers RW and Math with explanations", () => {
  assert.ok(FULL_SAT_DIAGNOSTIC_QUESTIONS.length >= 30);
  assert.ok(
    FULL_SAT_DIAGNOSTIC_QUESTIONS.some((question) =>
      /math/i.test(question.subject ?? question.domain),
    ),
  );
  for (const question of FULL_SAT_DIAGNOSTIC_QUESTIONS) {
    assert.ok(question.explanation.length > 10);
    assert.equal(question.choices.length, 4);
    assert.ok(question.choices.some((choice) => choice.id === question.correctAnswer));
  }
});

test("session prep modes explain the live curriculum behavior", () => {
  assert.match(
    describeSessionPrepMode("complete_homework_in_session"),
    /not finished/i,
  );
  assert.match(describeSessionPrepMode("mistake_focus"), /similar/i);
  assert.match(describeSessionPrepMode("hard_bank"), /hard-question bank/i);
});
