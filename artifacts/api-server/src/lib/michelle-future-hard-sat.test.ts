import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
      id: "011e67c6-651d-4ab7-9a46-399635e4a4b4",
      dateTime: new Date("2026-11-15T17:00:00.000Z"),
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

test("an unattempted hard in-session set is replaced when it is not the required section", () => {
  const source = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function ensureHardSatInSession(");
  const body = source.slice(start, source.indexOf("\nexport async function fillUnattemptedOfficialHardInSession", start));
  assert.match(body, /assignmentMatchesRequiredSections/);
  assert.match(body, /!item\.everyKeyIsHard \|\| !sectionOk/);
  assert.match(body, /officialHardInSessionItems\(\s*session,\s*shortHard \? \[\.\.\.replaceableIds, shortHard\.row\.id\] : replaceableIds,/);
});
