import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { CreateAdminSessionBody, UpdateAdminSessionBody } from "../../../../lib/api-zod/src/generated/api.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  providerConflictOverrideLog,
  sessionConflictsAfterProviderOverride,
} from "./admin-provider-conflict.ts";

const PROVIDER =
  "Tutor's connected calendar is busy during 2026-11-01T14:00:00.000Z–2026-11-01T15:30:00.000Z.";
const TUTOR_DOUBLE =
  "Xavier’s SAT Session with Sophia · 2026-11-01T14:00:00.000Z (90 min)";
const CLIENT_DOUBLE =
  "Sophia’s SAT Session with Eunice · 2026-11-01T14:00:00.000Z (90 min)";
const SHARED_MEET =
  "Shared Google Meet · Taito’s SAT Session with Eunice · 2026-11-01T14:00:00.000Z (90 min)";

test("a provider-only conflict is overridden when the flag is true", () => {
  const result = sessionConflictsAfterProviderOverride([PROVIDER], true);
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(result.overridden, [PROVIDER]);
});

test("without the flag a provider conflict still blocks exactly as today", () => {
  const result = sessionConflictsAfterProviderOverride([PROVIDER, TUTOR_DOUBLE], false);
  assert.deepEqual(result.blocking, [PROVIDER, TUTOR_DOUBLE]);
  assert.deepEqual(result.overridden, []);
});

test("a tutor double-booking is still refused when the flag is true", () => {
  const result = sessionConflictsAfterProviderOverride([PROVIDER, TUTOR_DOUBLE], true);
  assert.deepEqual(result.blocking, [TUTOR_DOUBLE]);
  assert.deepEqual(result.overridden, [PROVIDER]);
});

test("a client double-booking is still refused when the flag is true", () => {
  const result = sessionConflictsAfterProviderOverride([CLIENT_DOUBLE, PROVIDER], true);
  assert.deepEqual(result.blocking, [CLIENT_DOUBLE]);
});

test("a shared-Meet collision is still enforced when the flag is true", () => {
  const result = sessionConflictsAfterProviderOverride([SHARED_MEET, PROVIDER], true);
  assert.deepEqual(result.blocking, [SHARED_MEET]);
  assert.equal(result.overridden.includes(SHARED_MEET), false);
});

test("the override log names the session, tutor, time, and provider conflict only", () => {
  const logged = providerConflictOverrideLog({
    sessionId: "session-1",
    tutorUserId: "tutor-1",
    dateTime: new Date("2026-11-01T14:00:00.000Z"),
    conflicts: [PROVIDER],
  });
  assert.equal(logged.sessionId, "session-1");
  assert.equal(logged.tutorUserId, "tutor-1");
  assert.equal(logged.dateTime, "2026-11-01T14:00:00.000Z");
  assert.equal(logged.conflict, PROVIDER);
  assert.equal(JSON.stringify(logged).includes("@"), false);
});

test("overrideProviderConflict defaults to false on admin session bodies", () => {
  const created = CreateAdminSessionBody.parse({
    courseId: "course-1",
    dateTime: "2026-11-01T14:00:00.000Z",
    timezone: "America/New_York",
    subject: "SAT",
    durationMinutes: 90,
  });
  assert.equal(created.overrideProviderConflict, false);
  const updated = UpdateAdminSessionBody.parse({});
  assert.equal(updated.overrideProviderConflict, false);
  assert.equal(
    CreateAdminSessionBody.parse({
      courseId: "course-1",
      dateTime: "2026-11-01T14:00:00.000Z",
      timezone: "America/New_York",
      subject: "SAT",
      durationMinutes: 90,
      overrideProviderConflict: true,
    }).overrideProviderConflict,
    true,
  );
});
