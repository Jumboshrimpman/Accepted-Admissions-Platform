import assert from "node:assert/strict";
import test from "node:test";
import { questionStatusHelp, questionStatusLabel } from "./question-status.ts";

test("maps stored reviewStatus to draft vs ready-for-quiz copy", () => {
  assert.equal(questionStatusLabel("draft"), "Draft");
  assert.equal(questionStatusLabel("approved"), "Ready for quiz");
  assert.equal(questionStatusLabel("reviewed"), "Ready for quiz");
  assert.equal(questionStatusLabel("rejected"), "Not using");
  assert.match(questionStatusHelp("draft"), /Adding marks it ready/i);
  assert.match(questionStatusHelp("approved"), /one quiz/i);
});
