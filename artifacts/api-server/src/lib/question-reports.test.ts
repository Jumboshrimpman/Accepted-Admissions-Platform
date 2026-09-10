import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isQuestionReportReason,
  questionReportEmailBody,
  stemSnippetForReport,
} from "./question-report-copy.ts";

test("report reasons and stem snippets are student-safe", () => {
  assert.equal(isQuestionReportReason("incorrect"), true);
  assert.equal(isQuestionReportReason("bug"), true);
  assert.equal(isQuestionReportReason("spam"), false);
  assert.equal(stemSnippetForReport("Short stem"), "Short stem");
  assert.match(stemSnippetForReport("A".repeat(200)), /…$/);
});

test("report email includes quiz, question, student, and reason context", () => {
  const body = questionReportEmailBody({
    studentName: "Taito Goto",
    studentEmail: "taito0525@gmail.com",
    assignmentTitle: "Full-length SAT diagnostic",
    assignmentId: "assign-1",
    attemptId: "attempt-1",
    questionId: "q-15",
    questionIndex: 14,
    reason: "bug",
    note: "Table is smashed",
    stemSnippet: "Ablation rates for three elements",
  });
  assert.match(body, /Taito Goto/);
  assert.match(body, /assign-1/);
  assert.match(body, /q-15/);
  assert.match(body, /index 15/);
  assert.match(body, /bug/);
  assert.match(body, /Table is smashed/);
  assert.match(body, /Ablation rates/);
});
