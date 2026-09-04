import assert from "node:assert/strict";
import test from "node:test";
import {
  clerkConfigErrorCopy,
  isConfiguredPublishableKey,
  resolveClerkPublishableKey,
} from "./clerk-publishable-key.ts";

const liveKey = "pk_live_configured_example_key";
const testKey = "pk_test_configured_example_key";

test("uses a configured live key on the production app host instead of deriving clerk.app.*", () => {
  const result = resolveClerkPublishableKey(
    "app.acceptedadmissions.org",
    liveKey,
  );
  assert.deepEqual(result, { ok: true, publishableKey: liveKey });
});

test("uses a configured test key on localhost", () => {
  const result = resolveClerkPublishableKey("localhost", testKey);
  assert.deepEqual(result, { ok: true, publishableKey: testKey });
});

test("does not throw when the configured key is missing", () => {
  const result = resolveClerkPublishableKey("app.acceptedadmissions.org", "");
  assert.deepEqual(result, { ok: false, reason: "missing" });
  assert.match(clerkConfigErrorCopy("missing").body, /missing its Clerk publishable key/i);
});

test("does not throw when the configured key is not a publishable key", () => {
  const result = resolveClerkPublishableKey(
    "app.acceptedadmissions.org",
    "not-a-clerk-key",
  );
  assert.deepEqual(result, { ok: false, reason: "invalid" });
  assert.equal(isConfiguredPublishableKey("not-a-clerk-key"), false);
});
