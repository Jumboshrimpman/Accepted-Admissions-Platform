import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isValidIanaTimeZone,
  MICHELLE_TIMEZONE,
  normalizeIanaTimeZone,
  shouldPersistDetectedTimezone,
} from "./client-timezone.ts";

test("accepts IANA zones used by Michelle and New York clients", () => {
  assert.equal(isValidIanaTimeZone("Asia/Dubai"), true);
  assert.equal(isValidIanaTimeZone("America/New_York"), true);
  assert.equal(normalizeIanaTimeZone("  Asia/Dubai  "), "Asia/Dubai");
  assert.equal(MICHELLE_TIMEZONE, "Asia/Dubai");
});

test("rejects empty or invented timezone ids", () => {
  assert.equal(isValidIanaTimeZone(""), false);
  assert.equal(isValidIanaTimeZone("Dubai"), false);
  assert.equal(isValidIanaTimeZone("Not/AZone"), false);
  assert.equal(normalizeIanaTimeZone(12), undefined);
});

test("only first-load browser detect overwrites an unset client timezone", () => {
  assert.equal(shouldPersistDetectedTimezone("default"), true);
  assert.equal(shouldPersistDetectedTimezone(null), true);
  assert.equal(shouldPersistDetectedTimezone("admin"), false);
  assert.equal(shouldPersistDetectedTimezone("browser"), false);
});
