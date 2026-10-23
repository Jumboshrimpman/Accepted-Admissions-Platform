import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { dedupeListedQuestions } from "./adaptive-question-list.ts";

test("hard-question bank drops duplicate ids and repeated prompts", () => {
  const listed = dedupeListedQuestions([
    { id: "a", prompt: "Find the main idea." },
    { id: "a", prompt: "Find the main idea." },
    { id: "b", prompt: "Find the main idea." },
    { id: "c", prompt: "  Find   the main idea. " },
    { id: "d", prompt: "Name the writer's view." },
    { id: "e", prompt: "" },
    { id: "f", prompt: null },
  ]);
  assert.deepEqual(
    listed.map((question) => question.id),
    ["a", "d", "e", "f"],
  );
});
