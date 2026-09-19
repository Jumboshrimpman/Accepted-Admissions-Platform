import assert from "node:assert/strict";
import test from "node:test";
import {
  clerkConfigErrorCopy,
  clerkErrorMessage,
  clerkJsScriptUrlFromKey,
  clerkLoadFailureCopy,
  clerkLoadFailureKind,
  frontendApiFromPublishableKey,
  isClerkAllowedSubdomainError,
  isClerkLoadRejection,
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
  assert.equal(copy.kind, "script-missing");
  assert.match(copy.body, /clerk\.acceptedadmissions\.org/);
  assert.match(copy.body, /script did not load/);
  assert.doesNotMatch(copy.body, /clerk\.app\.acceptedadmissions\.org/);
  assert.doesNotMatch(copy.body, /accounts\.app\.acceptedadmissions\.org/);
});

const subdomainError =
  "The request origin subdomain is not in the allowed subdomains list for this instance.";

test("classifies Clerk.load subdomain rejection separately from a missing script", () => {
  assert.equal(isClerkAllowedSubdomainError(new Error(subdomainError)), true);
  assert.equal(isClerkLoadRejection(new Error(subdomainError)), true);
  assert.equal(
    clerkLoadFailureKind({ error: new Error(subdomainError) }),
    "allowed-subdomain",
  );
  assert.equal(
    clerkLoadFailureKind({ clerkPresent: true }),
    "load-rejected",
  );
  assert.equal(
    clerkLoadFailureKind({ error: new TypeError("Failed to fetch") }),
    "script-missing",
  );
  assert.equal(clerkErrorMessage(new Error(subdomainError)), subdomainError);
});

test("failure copy surfaces the Clerk.load reason when the script already ran", () => {
  const subdomainCopy = clerkLoadFailureCopy(productionLiveKey, {
    error: new Error(subdomainError),
    clerkPresent: true,
  });
  assert.equal(subdomainCopy.kind, "allowed-subdomain");
  assert.equal(subdomainCopy.title, "Sign-in cannot start on this host");
  assert.match(subdomainCopy.body, /allowed subdomains/i);
  assert.match(subdomainCopy.body, /script did load/i);
  assert.doesNotMatch(subdomainCopy.body, /script did not load/i);
  assert.match(subdomainCopy.body, /app\.acceptedadmissions\.org\/login/);

  const loadedCopy = clerkLoadFailureCopy(productionLiveKey, {
    clerkPresent: true,
  });
  assert.equal(loadedCopy.kind, "load-rejected");
  assert.match(loadedCopy.body, /script loaded/i);
  assert.doesNotMatch(loadedCopy.body, /script did not load/i);

  const rejectCopy = clerkLoadFailureCopy(productionLiveKey, {
    error: new Error("Clerk.load() failed: origin not allowed"),
  });
  assert.equal(rejectCopy.kind, "load-rejected");
  assert.match(rejectCopy.body, /Clerk\.load\(\) failed: origin not allowed/);
  assert.doesNotMatch(rejectCopy.body, /script did not load/i);
});
