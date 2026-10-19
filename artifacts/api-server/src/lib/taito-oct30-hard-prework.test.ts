import assert from "node:assert/strict";
import test from "node:test";
import { isTaitoOct30EuniceSession } from "./sat-hard-sets.ts";
import { taitoSessionDateTime } from "./session-schedule.ts";

test("only Taito's Oct 30 SAT session with Eunice is swapped to the hard pre-work set", () => {
  const taito = "taito0525@gmail.com";
  const eunice = "eunice_chon@berkeley.edu";
  assert.equal(
    isTaitoOct30EuniceSession({
      subject: "SAT",
      dateTime: taitoSessionDateTime("2026-10-30"),
      timezone: "Asia/Tokyo",
      studentEmail: taito,
      tutorEmail: eunice,
    }),
    true,
  );
  assert.equal(
    isTaitoOct30EuniceSession({
      subject: "SAT",
      dateTime: taitoSessionDateTime("2026-10-25"),
      timezone: "America/New_York",
      studentEmail: "makaremmichelle7@gmail.com",
      tutorEmail: "xavier@example.com",
    }),
    false,
  );
  assert.equal(
    isTaitoOct30EuniceSession({
      subject: "IELTS",
      dateTime: taitoSessionDateTime("2026-10-23"),
      timezone: "Asia/Tokyo",
      studentEmail: taito,
      tutorEmail: eunice,
    }),
    false,
  );
  assert.equal(
    isTaitoOct30EuniceSession({
      subject: "SAT",
      dateTime: taitoSessionDateTime("2026-10-16"),
      timezone: "Asia/Tokyo",
      studentEmail: taito,
      tutorEmail: eunice,
    }),
    false,
  );
});
