import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  canShowClearHomework,
  hydrateMistakePrompts,
  selectActivePrework,
} from "./session-homework.ts";

test("selectActivePrework ignores archived session copies left by replace/remove", () => {
  const archived = {
    id: "old-clone",
    deliveryPhase: "before_session" as const,
    status: "archived",
  };
  const live = {
    id: "new-clone",
    deliveryPhase: "before_session" as const,
    status: "published",
  };
  const during = {
    id: "during",
    deliveryPhase: "during_session" as const,
    status: "draft",
  };
  assert.equal(selectActivePrework([archived, during, live])?.id, "new-clone");
  assert.equal(selectActivePrework([archived, during]), null);
});

test("canShowClearHomework is only for live before_session attempts, including empty ones", () => {
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
      assignmentStatus: "archived",
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

test("hydrateMistakePrompts fills empty prompts from the question bank so review focus is not hidden", () => {
  const hydrated = hydrateMistakePrompts(
    [
      { questionId: "q1", skill: "Transitions", prompt: "" },
      { questionId: "q2", skill: "Evidence", prompt: "Which claim is supported?" },
    ],
    new Map([["q1", "Which transition best connects the paragraphs?"]]),
  );
  assert.equal(hydrated[0]?.prompt, "Which transition best connects the paragraphs?");
  assert.equal(hydrated[1]?.prompt, "Which claim is supported?");
});
