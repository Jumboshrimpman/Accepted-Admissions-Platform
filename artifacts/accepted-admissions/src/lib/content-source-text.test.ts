import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_SOURCE_EXTRACTED_TEXT_LENGTH,
  SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE,
  validateExtractedSourceText,
} from "./content-source-text.ts";

test("frontend source validation matches the API 40-character pasted-text rule", () => {
  assert.equal(MIN_SOURCE_EXTRACTED_TEXT_LENGTH, 40);
  assert.deepEqual(validateExtractedSourceText(""), {
    ok: false,
    error: SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE,
  });
  assert.equal(validateExtractedSourceText("https://example.invalid/only-a-url").ok, false);
  assert.equal(validateExtractedSourceText("a".repeat(40)).ok, true);
});
