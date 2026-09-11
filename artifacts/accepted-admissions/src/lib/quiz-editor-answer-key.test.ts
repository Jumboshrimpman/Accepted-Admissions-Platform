import assert from "node:assert/strict";
import test from "node:test";
import {
  quizEditorChoiceValue,
  quizEditorLetterToken,
  resolveQuizEditorAnswerKey,
} from "./quiz-editor-answer-key.ts";

const abcd = [
  { id: "a", label: "A", text: "Decreasing exponential" },
  { id: "b", label: "B", text: "Decreasing linear" },
  { id: "c", label: "C", text: "Increasing exponential" },
  { id: "d", label: "D", text: "Increasing linear" },
];

test("editor option values are lowercase a–d even when labels are uppercase", () => {
  assert.equal(quizEditorChoiceValue({ id: "D", label: "D" }, 3), "d");
  assert.equal(quizEditorChoiceValue({ label: "C" }, 2), "c");
  assert.equal(quizEditorLetterToken("D"), "d");
  assert.equal(quizEditorLetterToken("9; 9.0"), "");
  assert.equal(quizEditorLetterToken(""), "");
});

test("admin curriculum uses the assignment letter key, not a silent A default", () => {
  assert.equal(
    resolveQuizEditorAnswerKey({
      assignmentAnswer: "D",
      bankAnswer: undefined,
      choices: abcd,
    }),
    "d",
  );
  assert.equal(
    resolveQuizEditorAnswerKey({
      assignmentAnswer: "b",
      bankAnswer: "a",
      choices: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
        { id: "d", label: "D" },
      ],
    }),
    "b",
  );
  assert.equal(
    resolveQuizEditorAnswerKey({
      assignmentAnswer: undefined,
      bankAnswer: "C",
      choices: abcd,
    }),
    "c",
  );
});

test("SAT diagnostic items missing from the course bank do not coerce to A", () => {
  assert.equal(
    resolveQuizEditorAnswerKey({
      assignmentAnswer: undefined,
      bankAnswer: undefined,
      choices: abcd,
    }),
    "",
  );
  assert.equal(
    resolveQuizEditorAnswerKey({
      assignmentAnswer: "",
      bankAnswer: null,
      choices: abcd,
    }),
    "",
  );
  assert.equal(
    resolveQuizEditorAnswerKey({
      assignmentAnswer: "9; 9.0",
      bankAnswer: "a",
      choices: abcd,
    }),
    "",
    "a stored non-letter key must not be replaced with bank A",
  );
});

test("a letter that is not one of the choices is rejected rather than shown as A", () => {
  assert.equal(
    resolveQuizEditorAnswerKey({
      assignmentAnswer: "c",
      choices: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    }),
    "",
  );
});
