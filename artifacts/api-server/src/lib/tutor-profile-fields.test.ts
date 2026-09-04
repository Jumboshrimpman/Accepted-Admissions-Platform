import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { parseTutorProfileEditableFields } from "./tutor-profile-fields.ts";

test("requires a name when creating a profile", () => {
  const result = parseTutorProfileEditableFields({ email: "a@b.com" }, { requireName: true });
  assert.equal(result.error, "A profile name is required.");
});

test("accepts name and photo updates on file", () => {
  const result = parseTutorProfileEditableFields({
    name: "  Xavier Morales  ",
    photoUrl: "https://example.com/xavier.jpg",
    photoAltText: "Xavier Morales",
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.updates, {
    name: "Xavier Morales",
    photoUrl: "https://example.com/xavier.jpg",
    photoAltText: "Xavier Morales",
  });
});

test("rejects unsafe photo URLs", () => {
  const result = parseTutorProfileEditableFields({
    name: "Tutor",
    photoUrl: "javascript:alert(1)",
  });
  assert.equal(result.error, "A photo URL must use http or https.");
});
