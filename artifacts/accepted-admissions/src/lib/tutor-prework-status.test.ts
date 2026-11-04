import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { tutorPreworkStatus } from "./tutor-prework-status.ts";

test("tutor pre-work status: none, not started, in progress, submitted (ET)", () => {
  assert.equal(tutorPreworkStatus([], []).kind, "none");
  const pending = tutorPreworkStatus([{ assignmentId: "p", attemptStatus: null }], ["p"]);
  assert.equal(pending.kind, "not_submitted");
  assert.equal(pending.label, "Pre-work not submitted yet");
  const started = tutorPreworkStatus([{ assignmentId: "p", attemptStatus: "active" }], ["p"]);
  assert.equal(started.kind, "in_progress");
  assert.equal(started.detail, "In progress");
  // An in-session set that was submitted does not count as pre-work.
  assert.equal(
    tutorPreworkStatus([{ assignmentId: "d", attemptStatus: "submitted" }], ["p"]).kind,
    "not_submitted",
  );
  const done = tutorPreworkStatus(
    [{ assignmentId: "p", attemptStatus: "submitted", score: 87.4, submittedAt: "2026-11-03T23:05:00Z" }],
    ["p"],
  );
  assert.equal(done.kind, "submitted");
  assert.equal(done.label, "Pre-work submitted");
  assert.match(done.detail ?? "", /^87% · Nov 3, 2026, 6:05 PM EST$/);
});
