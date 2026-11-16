import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { formatMichelleHardAssignmentTitle, michelleTutorShortName } from "./michelle-hard-assignment-title.ts";

test("Michelle hard titles use the session date, English or Math, and a short tutor name", () => {
  const nov17 = {
    dateTime: new Date("2026-11-17T14:00:00.000Z"),
    timezone: "Asia/Dubai",
    tutorName: "Sophia Lamas",
    tutorEmail: "sophia.e.lamas@gmail.com",
    sessionTitle: "Michelle’s SAT Session with Sophia",
    sections: ["rw"] as const,
  };
  assert.equal(
    formatMichelleHardAssignmentTitle({ ...nov17, kind: "prework" }),
    "Nov 17 Pre-work SAT English (Hard) — Michelle x Sophia L",
  );
  assert.equal(
    formatMichelleHardAssignmentTitle({ ...nov17, kind: "in-session" }),
    "Nov 17 In-session SAT English (Hard) — Michelle x Sophia L",
  );
  assert.equal(
    formatMichelleHardAssignmentTitle({ ...nov17, kind: "reserve" }),
    "Nov 17 In-session SAT English Reserve (Hard) — Michelle x Sophia L",
  );
  assert.equal(
    formatMichelleHardAssignmentTitle({
      dateTime: new Date("2026-11-22T17:00:00.000Z"),
      timezone: "America/New_York",
      kind: "prework",
      tutorName: "Xavier Morales",
      sessionTitle: "Michelle’s SAT Session with Xavier",
      sections: ["math"],
    }),
    "Nov 22 Pre-work SAT Math (Hard) — Michelle x Xavier",
  );
  assert.equal(michelleTutorShortName({ tutorName: "Sophia Lamas" }), "Sophia L");
});

test("Michelle hard titles still resolve Sophia L from the session title alone", () => {
  assert.equal(
    michelleTutorShortName({ sessionTitle: "Michelle’s SAT Session with Sophia" }),
    "Sophia L",
  );
  assert.equal(
    formatMichelleHardAssignmentTitle({
      dateTime: new Date("2026-11-17T14:00:00.000Z"),
      timezone: "Asia/Dubai",
      kind: "reserve",
      sessionTitle: "Michelle’s SAT Session with Sophia",
      sections: ["rw"],
    }),
    "Nov 17 In-session SAT English Reserve (Hard) — Michelle x Sophia L",
  );
});

test("Michelle hard titles use SAT (Hard) when both sections apply", () => {
  assert.equal(
    formatMichelleHardAssignmentTitle({
      dateTime: new Date("2026-12-01T14:00:00.000Z"),
      timezone: "America/New_York",
      kind: "prework",
      tutorName: "Eunice",
      sessionTitle: "Michelle’s SAT Session with Eunice",
      sections: ["rw", "math"],
    }),
    "Dec 1 Pre-work SAT (Hard) — Michelle x Eunice",
  );
});
