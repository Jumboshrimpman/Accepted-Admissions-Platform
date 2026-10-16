import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  calendarOAuthNonceAdmission,
  calendarOAuthNonceFailureMessage,
} from "./calendar-oauth-nonce.ts";

const now = Date.parse("2026-10-16T10:39:00.000Z");
const record = {
  nonce: "nonce-xavier",
  tutorProfileId: "tutor-xavier",
  expiresAt: new Date(now + 60_000),
  usedAt: null,
};

test("a reconnect nonce is single-use, expiring, and bound to one tutor", () => {
  assert.deepEqual(
    calendarOAuthNonceAdmission({
      nonce: "nonce-xavier",
      tutorProfileId: "tutor-xavier",
      record,
      now,
    }),
    { ok: true },
  );
  assert.deepEqual(
    calendarOAuthNonceAdmission({
      nonce: "nonce-xavier",
      tutorProfileId: "tutor-xavier",
      record: { ...record, usedAt: new Date(now) },
      now,
    }),
    { ok: false, reason: "used" },
  );
  assert.deepEqual(
    calendarOAuthNonceAdmission({
      nonce: "nonce-xavier",
      tutorProfileId: "tutor-eunice",
      record,
      now,
    }),
    { ok: false, reason: "tutor_mismatch" },
  );
  assert.deepEqual(
    calendarOAuthNonceAdmission({
      nonce: "nonce-xavier",
      tutorProfileId: "tutor-xavier",
      record: { ...record, expiresAt: new Date(now) },
      now,
    }),
    { ok: false, reason: "expired" },
  );
  assert.deepEqual(
    calendarOAuthNonceAdmission({
      nonce: "nonce-xavier",
      tutorProfileId: "tutor-xavier",
      record: null,
      now,
    }),
    { ok: false, reason: "missing" },
  );
  assert.match(calendarOAuthNonceFailureMessage("used").message, /already used/);
  assert.equal(calendarOAuthNonceFailureMessage("used").outcome, "expired");
  assert.match(calendarOAuthNonceFailureMessage("tutor_mismatch").message, /different tutor/);
  assert.match(calendarOAuthNonceFailureMessage("expired").message, /expired/);
});
