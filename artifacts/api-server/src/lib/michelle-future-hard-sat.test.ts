import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { MICHELLE_MAKAREM_USER_ID, MICHELLE_NOV16_SOPHIA_LAMAS_SESSION_ID } from "./no-auto-prework-clients.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { isMichelleFutureHardSatSession } from "./sat-hard-sets.ts";

const michelle = {
  clientUserId: MICHELLE_MAKAREM_USER_ID,
  subject: "SAT",
  timezone: "America/New_York",
};

test("Michelle's Nov 16 session is never selected for a hard-set refresh", () => {
  assert.equal(
    isMichelleFutureHardSatSession({
      ...michelle,
      id: MICHELLE_NOV16_SOPHIA_LAMAS_SESSION_ID,
      dateTime: new Date("2026-11-16T14:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isMichelleFutureHardSatSession({
      ...michelle,
      id: "91ef8c28-9455-4c9c-aa37-d19881d50666",
      dateTime: new Date("2026-11-22T17:00:00.000Z"),
    }),
    true,
  );
  assert.equal(
    isMichelleFutureHardSatSession({
      ...michelle,
      id: "91ef8c28-9455-4c9c-aa37-d19881d50666",
      dateTime: new Date("2026-11-22T17:00:00.000Z"),
      bookingStatus: "cancelled",
    }),
    false,
  );
  assert.equal(
    isMichelleFutureHardSatSession({
      ...michelle,
      clientUserId: "someone-else",
      id: "91ef8c28-9455-4c9c-aa37-d19881d50666",
      dateTime: new Date("2026-11-22T17:00:00.000Z"),
    }),
    false,
  );
});
