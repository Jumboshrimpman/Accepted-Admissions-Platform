import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MIN_SOURCE_EXTRACTED_TEXT_LENGTH, SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE, validateExtractedSourceText } from "./content-source-text.ts";

test("source imports require 40 characters of pasted text and ignore URL-only payloads", () => {
  assert.equal(MIN_SOURCE_EXTRACTED_TEXT_LENGTH, 40);
  assert.deepEqual(validateExtractedSourceText(null), {
    ok: false,
    error: SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE,
  });
  assert.deepEqual(validateExtractedSourceText("https://example.invalid/lesson"), {
    ok: false,
    error: SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE,
  });
  assert.equal(validateExtractedSourceText("short notes").ok, false);
  assert.equal(
    validateExtractedSourceText("a".repeat(39)).ok,
    false,
  );

  const accepted = validateExtractedSourceText(
    `  ${"Authorized lesson notes about evidence and inference. ".repeat(1).trim()} extra detail.`,
  );
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.ok(accepted.text.length >= MIN_SOURCE_EXTRACTED_TEXT_LENGTH);
  }
});
