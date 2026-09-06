import assert from "node:assert/strict";
import test from "node:test";
import { portalAvatarUrl, portalDisplayName } from "./portal-profile.ts";

test("header uses a real name instead of Accepted Admissions User", () => {
  assert.equal(
    portalDisplayName("Accepted Admissions user", "Sama Noori"),
    "Sama Noori",
  );
  assert.equal(
    portalDisplayName("Accepted Admissions User", "Sama Noori"),
    "Sama Noori",
  );
  assert.equal(portalDisplayName("Sama Noori", "Clerk Name"), "Sama Noori");
  assert.notEqual(portalDisplayName("Accepted Admissions user", null), "Accepted Admissions User");
  assert.notEqual(portalDisplayName("Accepted Admissions user", null), "Accepted Admissions user");
});

test("prefers the persisted avatar over the Clerk image", () => {
  assert.equal(
    portalAvatarUrl("https://cdn.example/app.jpg", "https://img.clerk.com/x"),
    "https://cdn.example/app.jpg",
  );
  assert.equal(portalAvatarUrl(null, "https://img.clerk.com/x"), "https://img.clerk.com/x");
});
