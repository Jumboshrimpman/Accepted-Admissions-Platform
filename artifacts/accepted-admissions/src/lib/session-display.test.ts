import assert from "node:assert/strict";
import test from "node:test";
import {
  displaySessionTitle,
  disclosedSessions,
  formatSessionDate,
  formatSessionTimeRange,
  sessionDateKey,
  sessionSubjectLabel,
} from "./session-display.ts";

const FALL_DATES = [
  "2026-10-02",
  "2026-10-09",
  "2026-10-16",
  "2026-10-23",
  "2026-10-30",
  "2026-11-06",
  "2026-11-13",
  "2026-11-20",
  "2026-11-27",
  "2026-12-04",
  "2026-12-11",
  "2026-12-18",
];
const FALL_DISPLAY_DATES = [
  "Friday, October 2, 2026",
  "Friday, October 9, 2026",
  "Friday, October 16, 2026",
  "Friday, October 23, 2026",
  "Friday, October 30, 2026",
  "Friday, November 6, 2026",
  "Friday, November 13, 2026",
  "Friday, November 20, 2026",
  "Friday, November 27, 2026",
  "Friday, December 4, 2026",
  "Friday, December 11, 2026",
  "Friday, December 18, 2026",
];

test("formats every approved Fall meeting in its declared timezone", () => {
  for (const [index, dateKey] of FALL_DATES.entries()) {
    const session = {
      dateTime: `${dateKey}T12:00:00.000Z`,
      timezone: "Asia/Tokyo",
      durationMinutes: 60,
    };
    assert.equal(sessionDateKey(session), dateKey);
    assert.equal(formatSessionTimeRange(session), "9:00–10:00 PM JST");
    assert.equal(formatSessionDate(session), FALL_DISPLAY_DATES[index]);
  }
});

test("discloses three sessions before expansion without reordering", () => {
  const sessions = ["first", "second", "third", "fourth", "fifth"];
  assert.deepEqual(disclosedSessions(sessions, false), sessions.slice(0, 3));
  assert.deepEqual(disclosedSessions(sessions, true), sessions);
});

test("keeps English as the user-facing label for IELTS sessions", () => {
  assert.equal(sessionSubjectLabel("IELTS"), "English");
  assert.equal(
    displaySessionTitle("IELTS session with Nika Raiffe", "IELTS"),
    "English session with Nika Raiffe",
  );
});