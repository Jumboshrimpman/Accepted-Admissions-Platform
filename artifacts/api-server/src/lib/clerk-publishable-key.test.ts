import assert from "node:assert/strict";
import test from "node:test";

const {
  clerkPublishableKeyError,
  frontendApiFromPublishableKey,
  isConfiguredPublishableKey,
  resolveClerkPublishableKey,
} =
  // @ts-expect-error Node's strip-types test runner resolves the source extension directly.
  await import("./clerk-publishable-key.ts");

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

test("uses a production live key unchanged when the request host is app.acceptedadmissions.org", () => {
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

test("trims whitespace around a configured publishable key", () => {
  const result = resolveClerkPublishableKey(`  ${productionLiveKey}  `);
  assert.deepEqual(result, { ok: true, publishableKey: productionLiveKey });
});

test("does not throw when the configured key is missing", () => {
  const result = resolveClerkPublishableKey("");
  assert.deepEqual(result, { ok: false, reason: "missing" });
  const message = clerkPublishableKeyError("missing");
  assert.match(message, /CLERK_PUBLISHABLE_KEY is missing/i);
  assert.doesNotMatch(message, /clerk\.app\./);
});

test("does not throw when the configured key is not a publishable key", () => {
  const result = resolveClerkPublishableKey("not-a-clerk-key");
  assert.deepEqual(result, { ok: false, reason: "invalid" });
  assert.equal(isConfiguredPublishableKey("not-a-clerk-key"), false);
  const message = clerkPublishableKeyError("invalid");
  assert.match(message, /pk_test_ or pk_live_/);
  assert.doesNotMatch(message, /clerk\.app\./);
  assert.doesNotMatch(message, /clerk\.app\.acceptedadmissions\.org/);
});
