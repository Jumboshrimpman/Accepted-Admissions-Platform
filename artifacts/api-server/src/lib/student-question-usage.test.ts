import assert from "node:assert/strict";
import test from "node:test";
import {
  emptySeenStudentQuestions,
  questionContentFingerprint,
  questionIsAlreadyAssignedToStudent,
  normalizeQuizText,
} from "./student-question-fingerprint.ts";

test("normalized fingerprints treat clone snapshots and spacing as the same question", () => {
  const original = {
    prompt: "Economist Elinor Ostrom’s studies...\nWhich choice completes the text?",
    stimulus: null,
    choices: [
      { id: "a", text: "source" },
      { id: "b", text: "rival" },
    ],
  };
  const snapshot = {
    prompt: "Economist Elinor Ostrom’s studies... Which choice completes the text?",
    stimulus: "",
    choices: [
      { id: "d", text: " Rival " },
      { id: "c", text: "Source" },
    ],
  };
  assert.equal(questionContentFingerprint(original), questionContentFingerprint(snapshot));
  assert.equal(normalizeQuizText("  To it.\u200B\nWhich "), "to it. which");
});

test("a student already assigned a question by id, source key, or wording is excluded", () => {
  const seen = emptySeenStudentQuestions();
  seen.questionIds.add("q-1");
  seen.sourceKeys.add("sat-pt4-rw-m1-q1");
  seen.fingerprints.add(
    questionContentFingerprint({
      prompt: "What is 2 + 2?",
      choices: [{ text: "3" }, { text: "4" }],
    }),
  );
  assert.equal(
    questionIsAlreadyAssignedToStudent({ questionId: "q-1", prompt: "unused" }, seen),
    true,
  );
  assert.equal(
    questionIsAlreadyAssignedToStudent(
      { questionId: "q-new", sourceKey: "sat-pt4-rw-m1-q1", prompt: "unused" },
      seen,
    ),
    true,
  );
  assert.equal(
    questionIsAlreadyAssignedToStudent(
      {
        questionId: "q-clone",
        sourceKey: "other-key",
        prompt: "What is 2 + 2?",
        choices: [{ text: "4" }, { text: "3" }],
      },
      seen,
    ),
    true,
  );
  assert.equal(
    questionIsAlreadyAssignedToStudent(
      {
        questionId: "q-fresh",
        sourceKey: "sat-pt9-rw-m1-q2",
        prompt: "What is 3 + 3?",
        choices: [{ text: "5" }, { text: "6" }],
      },
      seen,
    ),
    false,
  );
  assert.equal(
    questionIsAlreadyAssignedToStudent({ questionId: "x", prompt: "", choices: [] }, seen),
    false,
  );
});
