import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEETING_URL, TAITO_FALL_2026_SESSIONS, TAITO_SESSION_TIMEZONE, TAITO_STUDENT_EMAIL, calendarEventUrlForSession, isFall2026Term, isGoogleCalendarEventUrl, isTaitoFallSession, meetingUrlForTerm, normalizedSessionSubject, selfServeSatBookingForEmail, sessionTitle, taitoSessionDateTime } from "./session-schedule.ts";

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
      sessionTitle("Taito Goto", session.subject, session.tutorName),
      session.subject === "SAT"
        ? "Taito’s SAT Session with Eunice"
        : "Taito’s English Session with Nika",
    );
  }
});

test("builds participant-driven appointment names with normalized subjects and fallbacks", () => {
  assert.equal(normalizedSessionSubject("IELTS"), "English");
  assert.equal(normalizedSessionSubject("English conversation"), "English");
  assert.equal(
    sessionTitle("Michelle Lee", "SAT Reading & Writing", "Xavier Morales"),
    "Michelle’s SAT Session with Xavier",
  );
  assert.equal(
    sessionTitle(null, "Math", null),
    "Client’s Math Session with Tutor",
  );
});

test("uses one exact shared Meet room for Fall sessions", () => {
  assert.equal(SHARED_FALL_MEETING_URL, "https://meet.google.com/rih-iayt-okb");
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

test("recognizes only the approved Fall date and subject pairs", () => {
  for (const scheduled of TAITO_FALL_2026_SESSIONS) {
    assert.equal(
      isTaitoFallSession({
        dateTime: taitoSessionDateTime(scheduled.dateKey),
        subject: scheduled.subject,
      }),
      true,
    );
  }
  assert.equal(
    isTaitoFallSession({
      dateTime: taitoSessionDateTime("2026-10-23"),
      subject: "SAT",
    }),
    false,
  );
});

test("Taito billing stays off-platform while Michelle can self-serve SAT booking", () => {
  assert.equal(TAITO_STUDENT_EMAIL, "taito0525@gmail.com");
  assert.equal(selfServeSatBookingForEmail("taito0525@gmail.com"), false);
  assert.equal(selfServeSatBookingForEmail("TAITO0525@gmail.com"), false);
  assert.equal(selfServeSatBookingForEmail("michaelmakarem@gmail.com"), true);
  assert.equal(selfServeSatBookingForEmail("xsfam6@gmail.com"), true);
});

test("calendar deep-links prefer Google event htmlLinks and never Meet URLs", () => {
  const fallStart = taitoSessionDateTime("2026-10-02");
  assert.equal(isGoogleCalendarEventUrl("https://meet.google.com/rih-iayt-okb"), false);
  assert.equal(
    isGoogleCalendarEventUrl(
      "https://www.google.com/calendar/event?eid=abc123",
    ),
    true,
  );
  assert.equal(
    calendarEventUrlForSession({
      dateTime: fallStart,
      timezone: TAITO_SESSION_TIMEZONE,
      providerEventUrl: "https://meet.google.com/rih-iayt-okb",
    }),
    "https://calendar.google.com/calendar/r/day?date=20261002",
  );
  assert.equal(
    calendarEventUrlForSession({
      dateTime: fallStart,
      timezone: TAITO_SESSION_TIMEZONE,
      providerEventUrl: "https://www.google.com/calendar/event?eid=abc123",
    }),
    "https://www.google.com/calendar/event?eid=abc123",
  );
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