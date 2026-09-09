import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { buildAttemptAnalysis, describeSessionPrepMode, hasExtractPlaceholder, projectSatScores, projectSatSectionScore, qualitativeClientCopy, toClientAdaptiveGuidance, tutorAlertFields } from "./assessment-analysis.ts";
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
  assert.ok(projection.rangeLow != null && projection.rangeHigh != null);
  assert.match(projection.methodology ?? "", /not an official College Board adaptive/i);
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
  assert.match(analysis.label, /estimated SAT score range/i);
  assert.match(analysis.feedback, /Estimated SAT score range/);
  assert.match(analysis.feedback, /not an official College Board adaptive/i);
  assert.match(analysis.sessionOpener ?? "", /Transitions/i);
  assert.match(analysis.nextFocus[0] ?? "", /Practice Transitions next/);
  assert.equal(hasExtractPlaceholder(JSON.stringify(analysis)), false);
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

test("routine 60-minute pre-work does not invent an official SAT score", () => {
  const analysis = buildAttemptAnalysis(
    [{ skill: "Transitions", correct: 0, total: 1, accuracy: 0 }],
    [
      {
        correct: false,
        skill: "Transitions",
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
      },
    ],
    0,
    { assignmentTitle: "60-minute SAT pre-work — October 9", homeworkKind: "routine" },
  );
  assert.doesNotMatch(analysis.feedback, /Estimated SAT projection/);
  assert.doesNotMatch(analysis.label, /diagnostic/i);
});

test("session prep modes explain the live curriculum behavior", () => {
  assert.match(
    describeSessionPrepMode("complete_homework_in_session"),
    /not finished/i,
  );
  assert.match(describeSessionPrepMode("mistake_focus"), /similar/i);
  assert.match(describeSessionPrepMode("hard_bank"), /hard-question bank/i);
});

test("clusters coarse section skills by domain and writes a concrete tutor brief", () => {
  const analysis = buildAttemptAnalysis(
    [
      { skill: "SAT Math", correct: 1, total: 20, accuracy: 5 },
      { skill: "Math", correct: 0, total: 10, accuracy: 0 },
      { skill: "Reading and Writing", correct: 4, total: 20, accuracy: 20 },
      { skill: "Transitions", correct: 3, total: 3, accuracy: 100 },
    ],
    [
      ...Array.from({ length: 12 }, (_, index) => ({
        correct: false,
        skill: "SAT Math",
        subject: "SAT Math",
        domain: "Algebra",
        prompt: `Solve the linear system in item ${index + 1}.`,
        finalAnswer: "a",
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        correct: false,
        skill: "Math",
        subject: "SAT Math",
        domain: "Geometry and Trigonometry",
        prompt: `Find the circle measure ${index + 1}.`,
        finalAnswer: "b",
      })),
      {
        correct: false,
        skill: "Reading and Writing",
        subject: "SAT Reading & Writing",
        domain: "Information and Ideas",
        prompt: "Which claim is best supported by the passage?",
        finalAnswer: "c",
      },
      {
        correct: true,
        skill: "Transitions",
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
        prompt: "Choose the best transition.",
        finalAnswer: "a",
      },
    ],
    8,
    { assignmentTitle: "Full-length SAT diagnostic" },
  );

  assert.doesNotMatch(analysis.feedback, /start with the focus areas below/i);
  assert.match(analysis.nextFocus[0] ?? "", /Practice Algebra next/);
  assert.match(analysis.weaknesses[0] ?? "", /Algebra is where most misses landed/);
  assert.equal(analysis.missClusters?.[0]?.label, "Algebra");
  assert.equal(analysis.missClusters?.[0]?.missCount, 12);
  assert.equal(analysis.missClusters?.[0]?.kind, "domain");
  assert.match(analysis.sessionOpener ?? "", /Algebra/i);
  assert.match(analysis.sessionOpener ?? "", /linear system/i);
  assert.ok(analysis.skipRehash?.some((item) => /Transitions/i.test(item)));
  const math = analysis.sectionBreakdown?.find((row) => row.section === "math");
  const rw = analysis.sectionBreakdown?.find((row) => row.section === "rw");
  assert.ok((math?.missCount ?? 0) >= 20);
  assert.ok((rw?.missCount ?? 0) >= 1);
  assert.equal(
    analysis.feedback.includes("Reading and Writing, Math, SAT Math"),
    false,
  );
});

test("tutor alert fields drop filler and coarse focus labels", () => {
  const fields = tutorAlertFields({
    source: "deterministic",
    label: "Adaptive skill analysis",
    provider: null,
    strengths: ["SAT Math (8% accuracy)"],
    weaknesses: ["Reading and Writing (8% accuracy)"],
    mistakePatterns: ["SAT Math: 40 misses", "Math: 30 misses", "Reading and Writing: 28 misses"],
    nextFocus: ["SAT Math", "Math", "Reading and Writing"],
    feedback:
      "Start with the focus areas below and explain each missed answer before moving to another timed set. The session should rebuild those skills together.",
  });
  assert.equal(fields.analysisPreview, null);
  assert.deepEqual(fields.nextFocus, []);
});

test("never emits Skill not in extract on student adaptive guidance", () => {
  const analysis = buildAttemptAnalysis(
    [{ skill: "Skill not in extract", correct: 5, total: 16, accuracy: 31.25 }],
    [
      ...Array.from({ length: 11 }, (_, index) => ({
        correct: false,
        skill: "Skill not in extract",
        subject: "SAT Math",
        domain: "Algebra",
        prompt: `Solve for x in item ${index + 1}.`,
      })),
      ...Array.from({ length: 5 }, () => ({
        correct: true,
        skill: "Skill not in extract",
        subject: "SAT Math",
        domain: "Algebra",
        prompt: "Evaluate the linear expression.",
      })),
    ],
    31,
  );
  assert.equal(hasExtractPlaceholder(JSON.stringify(analysis)), false);
  assert.match(analysis.weaknesses[0] ?? "", /Algebra/);
  assert.match(analysis.nextFocus[0] ?? "", /Practice Algebra next/);
  assert.doesNotMatch(analysis.nextFocus[0] ?? "", /^SAT Math$/);
  assert.doesNotMatch(analysis.weaknesses[0] ?? "", /Skill not in extract/i);

  const stored = toClientAdaptiveGuidance({
    strengths: ["Skill not in extract (80% accuracy)"],
    weaknesses: ["Skill not in extract (31% accuracy)"],
    nextFocus: ["Skill not in extract"],
    missClusters: [{ label: "Algebra", kind: "domain" as const, missCount: 8 }],
  });
  assert.equal(hasExtractPlaceholder(JSON.stringify(stored)), false);
  assert.match(stored.nextFocus[0] ?? "", /Algebra/);

  const sectionOnly = qualitativeClientCopy({
    weaknesses: ["Skill not in extract (31% accuracy)"],
    nextFocus: ["SAT Math"],
    sectionBreakdown: [{ section: "math", label: "Math", accuracy: 31, missCount: 11 }],
  });
  assert.match(sectionOnly.missedSkill, /Math is the leak/);
  assert.match(sectionOnly.nextPractice, /Practice Math next/);
});
