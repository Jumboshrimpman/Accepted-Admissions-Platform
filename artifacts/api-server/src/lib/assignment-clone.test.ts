import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ASSIGNMENT_ALREADY_ON_SESSION_MESSAGE,
  assignmentAlreadyOnSession,
  buildAssignmentCloneValues,
  evaluateAssignmentClone,
} from "./assignment-clone.ts";

const sourceQuestions = [
  { questionId: "q-1", position: 0, predictionFirst: true },
  { questionId: "q-2", position: 1, predictionFirst: false },
];

const reusableQuiz = {
  id: "quiz-bank",
  courseId: "course-1",
  sessionId: "session-original" as string | null,
  subjectFamily: "sat",
  title: "October pre-session mini-section",
  status: "published",
  deliveryPhase: "before_session",
};

test("assigning one reusable quiz to two sessions plans two independent clones", () => {
  const first = evaluateAssignmentClone({
    source: reusableQuiz,
    targetSession: { id: "session-a", courseId: "course-1", subjectFamily: "sat" },
    sourceQuestions,
    existingOnTarget: [],
  });
  const second = evaluateAssignmentClone({
    source: reusableQuiz,
    targetSession: { id: "session-b", courseId: "course-1", subjectFamily: "sat" },
    sourceQuestions,
    existingOnTarget: [],
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.equal(first.sourceAssignmentId, reusableQuiz.id);
  assert.equal(second.sourceAssignmentId, reusableQuiz.id);
  assert.equal(first.targetSessionId, "session-a");
  assert.equal(second.targetSessionId, "session-b");
  assert.notEqual(first.targetSessionId, second.targetSessionId);
  assert.deepEqual(first.copiedQuestions, sourceQuestions);
  assert.deepEqual(second.copiedQuestions, sourceQuestions);
  assert.deepEqual(first.mutations, {
    updateSource: false,
    updateAttempts: false,
    insertAssignment: true,
    insertQuestions: true,
  });
});

test("clone plan leaves the original assignment and historical attempts untouched", () => {
  const original = {
    ...reusableQuiz,
    instructions: "Complete before the meeting.",
    timeLimitMinutes: 20,
    maxAttempts: 1,
    deadline: null,
    subject: "SAT",
  };
  const historical = {
    id: "attempt-1",
    assignmentId: original.id,
    sessionId: "session-original",
    score: 80,
    studentFeedback: "Review line references",
    result: { correct: 4, total: 5 },
  };

  const planned = evaluateAssignmentClone({
    source: reusableQuiz,
    targetSession: { id: "session-a", courseId: "course-1", subjectFamily: "sat" },
    sourceQuestions,
    existingOnTarget: [],
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(planned.mutations.updateSource, false);
  assert.equal(planned.mutations.updateAttempts, false);

  const inserts = buildAssignmentCloneValues(original, planned.targetSessionId, planned.copiedQuestions);
  assert.equal(inserts.assignment.sessionId, "session-a");
  assert.equal(original.sessionId, "session-original");
  assert.equal(historical.assignmentId, original.id);
  assert.equal(historical.score, 80);
  assert.equal(historical.studentFeedback, "Review line references");
});

test("editing or completing one cloned assignment does not rewrite the other", () => {
  const source = {
    ...reusableQuiz,
    instructions: "Complete before the meeting.",
    timeLimitMinutes: 20,
    maxAttempts: 1,
    deadline: null,
    subject: "SAT",
  };
  const cloneA = buildAssignmentCloneValues(source, "session-a", sourceQuestions);
  const cloneB = buildAssignmentCloneValues(source, "session-b", sourceQuestions);
  const store = {
    assignments: [
      { id: "clone-a", ...cloneA.assignment, title: cloneA.assignment.title },
      { id: "clone-b", ...cloneB.assignment, title: cloneB.assignment.title },
    ],
    attempts: [] as Array<{ assignmentId: string; score: number }>,
  };

  store.assignments[0]!.title = "Edited clone A only";
  store.assignments[0]!.timeLimitMinutes = 45;
  store.attempts.push({ assignmentId: "clone-a", score: 100 });

  assert.equal(store.assignments[1]!.title, "October pre-session mini-section");
  assert.equal(store.assignments[1]!.timeLimitMinutes, 20);
  assert.equal(store.assignments[1]!.sessionId, "session-b");
  assert.deepEqual(
    store.attempts.filter((attempt) => attempt.assignmentId === "clone-b"),
    [],
  );
});

test("duplicate assignment to the same session is rejected unless explicitly allowed", () => {
  const existing = [
    {
      id: "clone-a",
      title: "October pre-session mini-section",
      status: "published",
      deliveryPhase: "before_session",
    },
  ];
  assert.equal(assignmentAlreadyOnSession(reusableQuiz, existing), true);

  const blocked = evaluateAssignmentClone({
    source: reusableQuiz,
    targetSession: { id: "session-a", courseId: "course-1", subjectFamily: "sat" },
    sourceQuestions,
    existingOnTarget: existing,
  });
  assert.deepEqual(blocked, {
    ok: false,
    status: 409,
    error: ASSIGNMENT_ALREADY_ON_SESSION_MESSAGE,
  });

  const allowed = evaluateAssignmentClone({
    source: reusableQuiz,
    targetSession: { id: "session-a", courseId: "course-1", subjectFamily: "sat" },
    sourceQuestions,
    existingOnTarget: existing,
    allowDuplicate: true,
  });
  assert.equal(allowed.ok, true);
});
