import assert from "node:assert/strict";
import test from "node:test";
import { canShowClearHomework, isBeforeSessionHomework } from "./clear-homework.ts";

test("isBeforeSessionHomework treats missing phase as pre-work and excludes during_session", () => {
  assert.equal(
    isBeforeSessionHomework([{ id: "a1", deliveryPhase: "before_session" }], "a1"),
    true,
  );
  assert.equal(
    isBeforeSessionHomework([{ id: "a1", deliveryPhase: "during_session" }], "a1"),
    false,
  );
  assert.equal(isBeforeSessionHomework([{ id: "a1" }], "a1"), true);
});

test("canShowClearHomework requires a live before_session attempt", () => {
  assert.equal(
    canShowClearHomework({
      deliveryPhase: "before_session",
      assignmentStatus: "published",
      attemptId: "attempt-1",
    }),
    true,
  );
  assert.equal(
    canShowClearHomework({
      deliveryPhase: "during_session",
      assignmentStatus: "published",
      attemptId: "attempt-1",
    }),
    false,
  );
  assert.equal(
    canShowClearHomework({
      deliveryPhase: "before_session",
      assignmentStatus: "published",
      attemptId: null,
    }),
    false,
  );
});
