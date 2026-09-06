import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isPlaceholderDisplayName,
  parseUserProfileEditableFields,
  provisionedDisplayName,
  resolveDisplayName,
} from "./user-profile-fields.ts";

test("treats the generic chrome label as a missing display name", () => {
  assert.equal(isPlaceholderDisplayName("Accepted Admissions user"), true);
  assert.equal(isPlaceholderDisplayName("Accepted Admissions User"), true);
  assert.equal(isPlaceholderDisplayName("  "), true);
  assert.equal(isPlaceholderDisplayName("Sama Noori"), false);
});

test("prefers a real Clerk or stored name over the generic fallback", () => {
  assert.equal(
    resolveDisplayName("Accepted Admissions user", "Sama Noori", "sama@example.com"),
    "Sama Noori",
  );
  assert.equal(
    resolveDisplayName("Sama Noori", "Clerk Name", "sama@example.com"),
    "Sama Noori",
  );
  assert.equal(
    provisionedDisplayName(undefined, "sama.noori@example.com"),
    "sama noori",
  );
});

test("parses title and uploaded photo updates", () => {
  const result = parseUserProfileEditableFields({
    displayName: "  Sama Noori  ",
    title: "  Founder  ",
    avatarUrl: "https://example.com/sama.jpg",
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.updates, {
    displayName: "Sama Noori",
    title: "Founder",
    avatarUrl: "https://example.com/sama.jpg",
  });
});

test("rejects unsafe photos and empty updates", () => {
  assert.equal(
    parseUserProfileEditableFields({
      avatarUrl: "javascript:alert(1)",
    }).error,
    "A photo must be an http(s) image URL, a site-relative media path, or an uploaded jpeg/png/webp/gif under 2 MB.",
  );
  assert.equal(
    parseUserProfileEditableFields({}).error,
    "Provide a display name, title, or photo to update.",
  );
});
