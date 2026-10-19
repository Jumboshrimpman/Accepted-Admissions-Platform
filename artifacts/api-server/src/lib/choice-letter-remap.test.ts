import assert from "node:assert/strict";
import test from "node:test";
import { choiceTextsMatch, remapStoredChoiceLetter } from "./choice-letter-remap.ts";

test("choice text match ignores letter order", () => {
  const previous = [
    { id: "a", text: "one" },
    { id: "b", text: "two" },
  ];
  assert.equal(
    choiceTextsMatch(previous, [
      { id: "b", text: "one" },
      { id: "a", text: "two" },
    ]),
    true,
  );
  assert.equal(choiceTextsMatch(previous, [{ id: "a", text: "one" }]), false);
  assert.equal(remapStoredChoiceLetter(previous, previous, "a"), "a");
});
