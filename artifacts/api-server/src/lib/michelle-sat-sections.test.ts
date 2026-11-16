import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { michelleSatSectionsForTutor } from "./michelle-sat-sections.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { satSectionsForStudent } from "./sat-set-difficulty.ts";

const michelle = { clientUserId: MICHELLE_MAKAREM_USER_ID, userId: MICHELLE_MAKAREM_USER_ID };

test("Michelle's Xavier sessions are hard math and Sophia Lamas sessions are hard reading and writing", () => {
  assert.deepEqual(
    michelleSatSectionsForTutor({
      ...michelle,
      tutorEmail: "xavier.rmz6@gmail.com",
      sessionTitle: "Michelle’s SAT Session with Xavier",
    }),
    ["math"],
  );
  assert.deepEqual(
    michelleSatSectionsForTutor({
      ...michelle,
      tutorEmail: "xaver.rmz6@gmail.com",
    }),
    ["math"],
  );
  assert.deepEqual(
    michelleSatSectionsForTutor({
      ...michelle,
      tutorName: "Xavier Morales",
    }),
    ["math"],
  );
  assert.deepEqual(
    michelleSatSectionsForTutor({
      ...michelle,
      tutorEmail: "sophia.e.lamas@gmail.com",
      sessionTitle: "Michelle’s SAT Session with Sophia",
    }),
    ["rw"],
  );
  assert.deepEqual(
    michelleSatSectionsForTutor({
      ...michelle,
      tutorName: "Sophia Lamas",
    }),
    ["rw"],
  );
  assert.equal(
    michelleSatSectionsForTutor({
      ...michelle,
      tutorEmail: "eunice@example.com",
    }),
    null,
  );
  assert.equal(
    michelleSatSectionsForTutor({
      clientUserId: "someone-else",
      tutorEmail: "xavier.rmz6@gmail.com",
    }),
    null,
  );
});

test("satSectionsForStudent follows Michelle's tutor even when the subject is SAT", () => {
  assert.deepEqual(
    satSectionsForStudent({
      userId: MICHELLE_MAKAREM_USER_ID,
      subject: "SAT",
      sessionTitle: "Michelle’s SAT Session with Xavier",
      tutorEmail: "xavier.rmz6@gmail.com",
      session: { dateTime: new Date("2026-11-22T17:00:00.000Z"), timezone: "America/New_York" },
    }),
    ["math"],
  );
  assert.deepEqual(
    satSectionsForStudent({
      userId: MICHELLE_MAKAREM_USER_ID,
      subject: "SAT",
      sessionTitle: "Michelle’s SAT Session with Sophia Lamas",
      tutorEmail: "sophia.e.lamas@gmail.com",
      session: { dateTime: new Date("2026-11-16T14:00:00.000Z"), timezone: "America/New_York" },
    }),
    ["rw"],
  );
});
