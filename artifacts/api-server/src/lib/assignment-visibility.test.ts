import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(["foundational", "medium", "hard"].includes(shaped.difficulty), true);
  assert.equal(shaped.choices?.[1]?.text, "therefore");
  assert.equal(typeof shaped.choices?.[1]?.id, "string");
  assert.equal(typeof shaped.choices?.[1]?.label, "string");
  assert.equal("correctAnswer" in shaped, false);
  assert.equal("explanation" in shaped, false);
});

test("assignment questions hide extract skill placeholders behind the section label", () => {
  const shaped = assignmentQuestionShape(
    {
      id: "q-cb-1",
      subject: "SAT Math",
      domain: "SAT Math",
      questionType: "multiple_choice",
      prompt: "What is the value of x?",
      skill: "Skill not in extract",
      difficulty: "medium",
    },
    { position: 0 },
  );
  assert.equal(shaped.skill, "SAT Math");
  assert.equal(
    assignmentQuestionShape(
      {
        id: "q-cb-2",
        subject: "SAT Reading & Writing",
        domain: "Reading and Writing",
        prompt: "Which choice completes the text?",
        skill: "",
      },
      { position: 1 },
    ).skill,
    "Reading and Writing",
  );
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
