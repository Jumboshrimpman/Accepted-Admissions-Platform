import assert from "node:assert/strict";
import test from "node:test";
import {
  clerkAccountsHost,
  clerkConfigErrorCopy,
  clerkFrontendApiHost,
  clerkJsScriptUrl,
  clerkLoadFailureCopy,
  isConfiguredPublishableKey,
  resolveClerkPublishableKey,
} from "./clerk-publishable-key.ts";

const liveKey = "pk_live_configured_example_key";
const testKey = "pk_test_configured_example_key";

test("keeps a test key as-is on localhost", () => {
  const result = resolveClerkPublishableKey("localhost", testKey);
  assert.deepEqual(result, { ok: true, publishableKey: testKey });
});

test("does not throw when deriving a live key for the production app host", () => {
  const result = resolveClerkPublishableKey(
    "app.acceptedadmissions.org",
    liveKey,
    (host, fallback) => `derived:${host}:${fallback}`,
  );
  assert.deepEqual(result, {
    ok: true,
    publishableKey: "derived:app.acceptedadmissions.org:pk_live_configured_example_key",
  });
});

test("falls back to the configured key when host derivation throws", () => {
  const result = resolveClerkPublishableKey("app.acceptedadmissions.org", liveKey, () => {
    throw new Error("Host must not be empty.");
  });
  assert.deepEqual(result, { ok: true, publishableKey: liveKey });
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

test("names the clerk.<app-host> script host Clerk tries to load", () => {
  assert.equal(
    clerkFrontendApiHost("app.acceptedadmissions.org"),
    "clerk.app.acceptedadmissions.org",
  );
  assert.equal(
    clerkAccountsHost("app.acceptedadmissions.org"),
    "accounts.app.acceptedadmissions.org",
  );
  assert.equal(
    clerkJsScriptUrl("app.acceptedadmissions.org"),
    "https://clerk.app.acceptedadmissions.org/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
  );
  const copy = clerkLoadFailureCopy("app.acceptedadmissions.org");
  assert.match(copy.body, /clerk\.app\.acceptedadmissions\.org/);
  assert.match(copy.body, /accounts\.app\.acceptedadmissions\.org/);
});
