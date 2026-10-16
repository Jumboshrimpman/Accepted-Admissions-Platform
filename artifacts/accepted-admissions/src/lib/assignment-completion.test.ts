import assert from "node:assert/strict";
import test from "node:test";
import { describeAssignmentCompletion } from "./assignment-completion.ts";

test("assignment completion badges name not started, in progress, paused, and submitted", () => {
  assert.equal(describeAssignmentCompletion({ attemptStatus: null }).label, "Not started");
  assert.equal(describeAssignmentCompletion({}).label, "Not started");
  assert.equal(describeAssignmentCompletion({ attemptStatus: "active" }).label, "In progress");
  assert.equal(describeAssignmentCompletion({ attemptStatus: "paused" }).label, "Paused");
  assert.equal(
    describeAssignmentCompletion({
      attemptStatus: "submitted",
      score: 80,
      submittedAt: "2026-10-15T12:04:00.000Z",
      timezone: "America/New_York",
    }).label,
    "Submitted · 80% · Oct 15, 2026, 8:04 AM EDT",
  );
  assert.equal(
    describeAssignmentCompletion({ attemptStatus: "expired", score: 40 }).label,
    "Submitted · 40%",
  );
});
