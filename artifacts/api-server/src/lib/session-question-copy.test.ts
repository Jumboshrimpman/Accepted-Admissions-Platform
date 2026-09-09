import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_QUESTION_COPY_METHOD,
  SESSION_QUESTION_MCQ_ONLY_MESSAGE,
  blankSessionMcqValues,
  isSessionLocalQuestionFork,
  sessionQuestionSnapshotValues,
  shouldForkSessionQuestion,
  validateSessionMcqEdit,
} from "./session-question-copy.ts";

test("session-local forks are tagged copies and must not be rematerialized from the bank", () => {
  assert.equal(
    isSessionLocalQuestionFork({ generationMethod: SESSION_QUESTION_COPY_METHOD, tags: [] }),
    true,
  );
  assert.equal(isSessionLocalQuestionFork({ generationMethod: "college-board-extract", tags: ["session-copy"] }), true);
  assert.equal(
    isSessionLocalQuestionFork({ generationMethod: "college-board-extract", tags: ["sat-pt4-rw-m1-q1"] }),
    false,
  );
});

test("shared or bank-linked questions must be forked before a session edit", () => {
  assert.equal(shouldForkSessionQuestion({ bankLinked: true, otherAssignmentCount: 0 }), true);
  assert.equal(shouldForkSessionQuestion({ bankLinked: false, otherAssignmentCount: 2 }), true);
  assert.equal(shouldForkSessionQuestion({ bankLinked: false, otherAssignmentCount: 0 }), false);
});

test("session snapshots copy content without keeping the source question id or bank link", () => {
  const snapshot = sessionQuestionSnapshotValues({
    subject: "SAT",
    domain: "Reading and Writing",
    skill: "Transitions",
    questionType: "multiple_choice",
    difficulty: "medium",
    stimulus: null,
    prompt: "Which choice completes the text?",
    choices: [
      { id: "a", label: "A", text: "however" },
      { id: "b", label: "B", text: "therefore" },
    ],
    correctAnswer: "a",
    explanation: "However signals contrast.",
    sourceType: "college_board",
    sourceId: null,
    tags: ["college-board"],
  });
  assert.equal(snapshot.generationMethod, SESSION_QUESTION_COPY_METHOD);
  assert.equal(snapshot.reviewStatus, "approved");
  assert.deepEqual(snapshot.tags, ["college-board", "session-copy"]);
  assert.equal(snapshot.prompt, "Which choice completes the text?");
  assert.equal(snapshot.correctAnswer, "a");
  assert.equal("id" in snapshot, false);
  assert.equal(snapshot.sourceId, null);
});

test("session question edits stay MCQ-only and require a matching correct choice", () => {
  const valid = validateSessionMcqEdit({
    prompt: "What is 2 + 2?",
    choices: [
      { id: "a", label: "A", text: "3" },
      { id: "b", label: "B", text: "4" },
    ],
    correctAnswer: "B",
    explanation: "2 + 2 = 4",
    questionType: "multiple_choice",
  });
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  assert.equal(valid.correctAnswer, "b");
  assert.equal(valid.choices[1]?.text, "4");

  assert.deepEqual(
    validateSessionMcqEdit({
      prompt: "Enter y",
      choices: [],
      correctAnswer: "9",
      questionType: "spr",
    }),
    { ok: false, error: SESSION_QUESTION_MCQ_ONLY_MESSAGE },
  );
  assert.equal(
    validateSessionMcqEdit({
      prompt: "",
      choices: [
        { id: "a", label: "A", text: "1" },
        { id: "b", label: "B", text: "2" },
      ],
      correctAnswer: "a",
    }).ok,
    false,
  );
});

test("blank session questions are approved MCQs that are not bank-linked", () => {
  const blank = blankSessionMcqValues({ subject: "SAT Math" });
  assert.equal(blank.generationMethod, SESSION_QUESTION_COPY_METHOD);
  assert.equal(blank.questionType, "multiple_choice");
  assert.equal(blank.reviewStatus, "approved");
  assert.equal(blank.sourceId, null);
  assert.equal(blank.choices.length, 4);
  assert.equal(blank.correctAnswer, "a");
});
