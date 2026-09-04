import assert from "node:assert/strict";
import test from "node:test";
import {
  clerkConfigErrorCopy,
  clerkJsScriptUrlFromKey,
  clerkLoadFailureCopy,
  frontendApiFromPublishableKey,
  isConfiguredPublishableKey,
  resolveClerkPublishableKey,
} from "./clerk-publishable-key.ts";

function encodePublishableKey(
  frontendApi: string,
  prefix: "pk_live_" | "pk_test_",
): string {
  const encoded = Buffer.from(`${frontendApi}$`, "utf8")
    .toString("base64")
    .replace(/=+$/, "");
  return `${prefix}${encoded}`;
}

const productionLiveKey = encodePublishableKey(
  "clerk.acceptedadmissions.org",
  "pk_live_",
);
const testKey = encodePublishableKey("clerk.example.com", "pk_test_");

test("uses a production live key unchanged on app.acceptedadmissions.org", () => {
  const result = resolveClerkPublishableKey(productionLiveKey);
  assert.deepEqual(result, { ok: true, publishableKey: productionLiveKey });
  assert.equal(
    frontendApiFromPublishableKey(productionLiveKey),
    "clerk.acceptedadmissions.org",
  );
  assert.notEqual(
    frontendApiFromPublishableKey(productionLiveKey),
    "clerk.app.acceptedadmissions.org",
  );
});

test("uses a configured test key unchanged", () => {
  const result = resolveClerkPublishableKey(testKey);
  assert.deepEqual(result, { ok: true, publishableKey: testKey });
});

test("does not throw when the configured key is missing", () => {
  const result = resolveClerkPublishableKey("");
  assert.deepEqual(result, { ok: false, reason: "missing" });
  assert.match(clerkConfigErrorCopy("missing").body, /missing its Clerk publishable key/i);
});

test("does not throw when the configured key is not a publishable key", () => {
  const result = resolveClerkPublishableKey("not-a-clerk-key");
  assert.deepEqual(result, { ok: false, reason: "invalid" });
  assert.equal(isConfiguredPublishableKey("not-a-clerk-key"), false);
});

test("failure copy reports the Frontend API encoded in the configured key", () => {
  assert.equal(
    clerkJsScriptUrlFromKey(productionLiveKey),
    "https://clerk.acceptedadmissions.org/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
  );
  const copy = clerkLoadFailureCopy(productionLiveKey);
  assert.equal(copy.failedHost, "clerk.acceptedadmissions.org");
  assert.match(copy.body, /clerk\.acceptedadmissions\.org/);
  assert.doesNotMatch(copy.body, /clerk\.app\.acceptedadmissions\.org/);
  assert.doesNotMatch(copy.body, /accounts\.app\.acceptedadmissions\.org/);
});
