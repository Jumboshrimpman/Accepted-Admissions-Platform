import assert from "node:assert/strict";
import test from "node:test";
import { GetAssignmentResponse } from "@workspace/api-zod";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  assignmentDifficulty,
  assignmentQuestionShape,
  courseIdsForAssignmentList,
  isAssignmentListedForRole,
  isFullLengthDiagnosticAssignment,
  pickDiagnosticKeeper,
} from "./assignment-visibility.ts";

test("assignment list queries an explicit course even when the user has no memberships", () => {
  assert.deepEqual(courseIdsForAssignmentList([], "course-1"), ["course-1"]);
  assert.deepEqual(courseIdsForAssignmentList(["a", "b"]), ["a", "b"]);
  assert.deepEqual(courseIdsForAssignmentList(["a", "b"], "course-1"), ["course-1"]);
  assert.deepEqual(courseIdsForAssignmentList([]), []);
});

test("students do not list draft or archived assignments that staff can still open", () => {
  assert.equal(isAssignmentListedForRole("student", "published"), true);
  assert.equal(isAssignmentListedForRole("student", "draft"), false);
  assert.equal(isAssignmentListedForRole("viewer", "archived"), false);
  assert.equal(isAssignmentListedForRole("administrator", "draft"), true);
  assert.equal(isAssignmentListedForRole("tutor", "archived"), true);
});

test("full-length SAT bank questions coerce onto the assignment API schema", () => {
  const shaped = assignmentQuestionShape(
    {
      id: "q-diag-1",
      subject: "SAT",
      questionType: "multiple_choice",
      prompt: "Which choice completes the text?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "however" },
        { value: "therefore" },
      ],
      skill: "Transitions",
      difficulty: "unspecified",
    },
    { position: 0, predictionFirst: false },
  );
  assert.equal(shaped.difficulty, "foundational");
  assert.equal(assignmentDifficulty("hard"), "hard");
  assert.equal(assignmentDifficulty("easy"), "foundational");
  const parsed = GetAssignmentResponse.parse({
    id: "asg-diag",
    sessionId: "session-oct2",
    deliveryPhase: "before_session",
    title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
    subject: "SAT",
    status: "published",
    deadline: null,
    questionCount: 1,
    timeLimitMinutes: 134,
    attemptCount: 0,
    maxAttempts: 1,
    latestScore: null,
    latestAttemptId: null,
    latestAttemptStatus: null,
    instructions: "Complete this full-length College Board SAT practice test.",
    questions: [shaped],
  });
  assert.equal(parsed.questions[0]?.difficulty, "foundational");
  assert.equal(parsed.questions[0]?.choices?.[1]?.text, "therefore");
});

test("dedupe keeps the published full-length diagnostic with work, not an empty extra", () => {
  assert.equal(
    isFullLengthDiagnosticAssignment({
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      homeworkKind: "diagnostic",
      questionCount: 120,
    }),
    true,
  );
  const keeper = pickDiagnosticKeeper([
    {
      id: "empty-copy",
      status: "published",
      questionCount: 0,
      attemptCount: 0,
    },
    {
      id: "full-length",
      status: "published",
      questionCount: 120,
      attemptCount: 1,
    },
    {
      id: "archived-old",
      status: "archived",
      questionCount: 98,
      attemptCount: 0,
    },
  ]);
  assert.equal(keeper?.id, "full-length");
});
