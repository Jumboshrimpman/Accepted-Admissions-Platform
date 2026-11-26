import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { mergeListedPreworkAttempts, tutorPreworkStatus } from "./tutor-prework-status.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MANAGE_SESSION_POLL_MS, manageSessionLiveQuery } from "./manage-session-live-query.ts";

test("tutor pre-work status: none, not started, in progress, submitted (ET)", () => {
  assert.equal(tutorPreworkStatus([], []).kind, "none");
  const pending = tutorPreworkStatus([{ assignmentId: "p", attemptStatus: null }], ["p"]);
  assert.equal(pending.kind, "not_submitted");
  assert.equal(pending.label, "Not started");
  const started = tutorPreworkStatus(
    [{ assignmentId: "p", attemptStatus: "active", attemptId: "attempt-live" }],
    ["p"],
  );
  assert.equal(started.kind, "in_progress");
  assert.equal(started.label, "In progress");
  assert.equal(started.attemptId, "attempt-live");
  // An in-session set that was submitted does not count as pre-work.
  assert.equal(
    tutorPreworkStatus([{ assignmentId: "d", attemptStatus: "submitted" }], ["p"]).kind,
    "not_submitted",
  );
  const done = tutorPreworkStatus(
    [{
      assignmentId: "p",
      attemptStatus: "submitted",
      score: 87.4,
      submittedAt: "2026-11-03T23:05:00Z",
      attemptId: "attempt-done",
    }],
    ["p"],
  );
  assert.equal(done.kind, "submitted");
  assert.equal(done.label, "Submitted");
  assert.equal(done.attemptId, "attempt-done");
  assert.match(done.detail ?? "", /^87% · Nov 3, 2026, 6:05 PM EST$/);
});

test("manage session uses the assignment summary when homework missed the submission", () => {
  const rows = mergeListedPreworkAttempts(
    [{
      id: "p",
      latestAttemptStatus: "submitted",
      latestScore: 91,
      latestAttemptId: "attempt-from-summary",
    }],
    [{ assignmentId: "p", attemptStatus: null, score: null, attemptId: null }],
  );
  const status = tutorPreworkStatus(rows, ["p"]);
  assert.equal(status.kind, "submitted");
  assert.equal(status.label, "Submitted");
  assert.equal(status.attemptId, "attempt-from-summary");
  assert.match(status.detail ?? "", /^91%/);

  const started = tutorPreworkStatus(
    mergeListedPreworkAttempts(
      [{ id: "p", latestAttemptStatus: "paused", latestAttemptId: "attempt-paused" }],
      [],
    ),
    ["p"],
  );
  assert.equal(started.kind, "in_progress");
  assert.equal(started.label, "In progress");
  assert.equal(started.attemptId, "attempt-paused");
});

test("manage session live query refetches on focus and on an interval", () => {
  assert.equal(manageSessionLiveQuery.staleTime, 0);
  assert.equal(manageSessionLiveQuery.refetchOnWindowFocus, true);
  assert.equal(manageSessionLiveQuery.refetchOnReconnect, true);
  assert.equal(manageSessionLiveQuery.refetchInterval, MANAGE_SESSION_POLL_MS);
  assert.equal(manageSessionLiveQuery.refetchIntervalInBackground, false);
  assert.ok(MANAGE_SESSION_POLL_MS > 0 && MANAGE_SESSION_POLL_MS <= 30_000);
});
