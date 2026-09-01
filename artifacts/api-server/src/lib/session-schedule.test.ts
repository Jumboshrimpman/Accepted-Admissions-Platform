import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEETING_URL, TAITO_FALL_2026_SESSIONS, TAITO_SESSION_TIMEZONE, isFall2026Term, meetingUrlForTerm, sessionTitle, taitoSessionDateTime } from "./session-schedule.ts";

function easternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
    zone: value("timeZoneName"),
  };
}

test("defines Taito's 12 unique Fall 2026 sessions with the requested tutors", () => {
  assert.equal(TAITO_FALL_2026_SESSIONS.length, 12);
  assert.equal(
    new Set(TAITO_FALL_2026_SESSIONS.map((session) => session.dateKey)).size,
    12,
  );
  for (const session of TAITO_FALL_2026_SESSIONS) {
    assert.equal(
      session.tutorName,
      session.subject === "SAT" ? "Eunice Chon" : "Nika Raiffe",
    );
    assert.equal(
      sessionTitle(session.subject, session.tutorName),
      `${session.subject} session with ${session.tutorName}`,
    );
  }
});

test("uses one exact shared Meet room for Fall sessions", () => {
  assert.equal(SHARED_FALL_MEETING_URL, "http://meet.google.com/rih-iayt-okb");
  assert.equal(isFall2026Term("Fall 2026"), true);
  assert.equal(meetingUrlForTerm("Fall 2026", "https://meet.google.com/provider-event"), SHARED_FALL_MEETING_URL);
  assert.equal(meetingUrlForTerm("Spring 2027", "https://meet.google.com/provider-event"), "https://meet.google.com/provider-event");
});

test("stores every 9 PM JST session as noon UTC", () => {
  assert.equal(TAITO_SESSION_TIMEZONE, "Asia/Tokyo");
  for (const session of TAITO_FALL_2026_SESSIONS) {
    assert.equal(
      taitoSessionDateTime(session.dateKey).toISOString(),
      `${session.dateKey}T12:00:00.000Z`,
    );
  }
});

test("Eastern display changes from 8 AM EDT to 7 AM EST after daylight saving time", () => {
  assert.deepEqual(easternParts(taitoSessionDateTime("2026-10-30")), {
    date: "2026-10-30",
    time: "08:00",
    zone: "EDT",
  });
  assert.deepEqual(easternParts(taitoSessionDateTime("2026-11-06")), {
    date: "2026-11-06",
    time: "07:00",
    zone: "EST",
  });
});