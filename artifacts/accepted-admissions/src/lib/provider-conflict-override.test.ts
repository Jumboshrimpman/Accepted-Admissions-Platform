import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { canOfferProviderConflictOverride } from "./provider-conflict-override.ts";

const PROVIDER =
  "Tutor's connected calendar is busy during 2026-11-01T14:00:00.000Z–2026-11-01T15:30:00.000Z.";

test("a provider-only schedule conflict can be overridden from the form", () => {
  assert.deepEqual(
    canOfferProviderConflictOverride({
      data: { code: "SCHEDULE_CONFLICT", conflicts: [PROVIDER] },
    }),
    [PROVIDER],
  );
});

test("a tutor or client double-booking does not offer the calendar override", () => {
  assert.equal(
    canOfferProviderConflictOverride({
      data: {
        code: "SCHEDULE_CONFLICT",
        conflicts: [
          PROVIDER,
          "Sophia’s SAT Session with Xavier · 2026-11-01T14:00:00.000Z (90 min)",
        ],
      },
    }),
    null,
  );
});

test("a shared-Meet conflict does not offer the calendar override", () => {
  assert.equal(
    canOfferProviderConflictOverride({
      data: {
        code: "SCHEDULE_CONFLICT",
        conflicts: [
          "Shared Google Meet · Taito’s SAT Session with Eunice · 2026-11-01T14:00:00.000Z (90 min)",
        ],
      },
    }),
    null,
  );
});
