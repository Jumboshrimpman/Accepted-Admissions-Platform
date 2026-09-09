import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTaitoStudentSchedule,
  canCancelOrRescheduleSession,
  displaySessionTitle,
  collapsedListedSessions,
  disclosedSessions,
  listedSessionMeetingKey,
  uniqueListedSessions,
  isSessionWorkComplete,
  formatAdminBrowserLocalHint,
  formatSessionDate,
  formatSessionDateTime,
  formatSessionTimeRange,
  isPastSession,
  isTaitoSessionPerson,
  sessionDateKey,
  sessionDateTimeLocalValue,
  sessionEffectiveEnd,
  sessionScheduleChangeMessage,
  sessionStartTimeFieldLabel,
  sessionSubjectLabel,
  shouldApplyTaitoTimezone,
  taitoCreateSessionSchedule,
  utcIsoFromSessionLocalValue,
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

test("Oct 2 Taito/Eunice UTC noon is 9:00 PM JST, not 8:00 AM Tokyo", () => {
  const session = {
    id: "1cc3dea5-9532-4dc2-9cea-3d1e5d65d119",
    dateTime: "2026-10-02T12:00:00.000Z",
    timezone: "Asia/Tokyo",
    durationMinutes: 60,
  };
  assert.equal(formatSessionTimeRange(session), "9:00–10:00 PM JST");
  assert.equal(formatSessionDate(session), "Friday, October 2, 2026");
  assert.equal(sessionDateTimeLocalValue(session.dateTime, session.timezone), "2026-10-02T21:00");
  assert.match(formatSessionDateTime(session), /9:00–10:00 PM JST/);
  assert.doesNotMatch(formatSessionDateTime(session), /8:00\s*AM/);
});

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
    assert.equal(sessionDateTimeLocalValue(session.dateTime, session.timezone), `${dateKey}T21:00`);
    assert.equal(
      utcIsoFromSessionLocalValue(`${dateKey}T21:00`, "Asia/Tokyo"),
      `${dateKey}T12:00:00.000Z`,
    );
    assert.equal(
      formatSessionDateTime(session),
      `${FALL_DISPLAY_DATES[index]} · 9:00–10:00 PM JST`,
    );
  }
});

test("labels the start-time field with the session timezone, not browser local", () => {
  assert.equal(sessionStartTimeFieldLabel("Asia/Tokyo"), "Start time (JST)");
  assert.equal(sessionStartTimeFieldLabel("America/New_York"), "Start time (America/New_York)");
  assert.equal(sessionStartTimeFieldLabel("  "), "Start time (session timezone)");
});

test("formats an optional admin browser-local readout for the same instant", () => {
  assert.equal(
    formatAdminBrowserLocalHint("2026-10-02T12:00:00.000Z", "America/New_York"),
    "Your local: Friday, October 2, 2026 at 8:00 AM EDT",
  );
  assert.equal(
    formatAdminBrowserLocalHint("2026-10-02T12:00:00.000Z", "UTC"),
    "Your local: Friday, October 2, 2026 at 12:00 PM UTC",
  );
});

test("identifies Taito from the clients list by name or email", () => {
  assert.equal(isTaitoSessionPerson({ name: "Taito Goto", email: "taito0525@gmail.com" }), true);
  assert.equal(isTaitoSessionPerson({ name: "Taito", email: null }), true);
  assert.equal(isTaitoSessionPerson({ name: "Other Student", email: "TAITO0525@gmail.com" }), true);
  assert.equal(isTaitoSessionPerson({ name: "Michelle Chen", email: "michelle@example.com" }), false);
  assert.equal(isTaitoSessionPerson(null), false);
});

test("create path for Taito prefers Asia/Tokyo at 21:00 JST without rewriting edit instants", () => {
  const created = taitoCreateSessionSchedule("2026-10-02T00:00:00.000Z");
  assert.equal(created.timezone, "Asia/Tokyo");
  assert.equal(created.dateTime, "2026-10-02T12:00:00.000Z");
  assert.equal(sessionDateTimeLocalValue(created.dateTime, created.timezone), "2026-10-02T21:00");
  assert.equal(shouldApplyTaitoTimezone(""), true);
  assert.equal(shouldApplyTaitoTimezone("America/New_York"), true);
  assert.equal(shouldApplyTaitoTimezone("Asia/Tokyo"), false);
  assert.equal(shouldApplyTaitoTimezone("Pacific/Honolulu"), false);

  const createDraft = applyTaitoStudentSchedule(
    { dateTime: "2026-10-02T16:00:00.000Z", timezone: "America/New_York", clientUserId: "taito" },
    { name: "Taito Goto", email: "taito0525@gmail.com" },
    "create",
  );
  assert.deepEqual(createDraft, {
    dateTime: "2026-10-02T12:00:00.000Z",
    timezone: "Asia/Tokyo",
    clientUserId: "taito",
  });

  const editWrongZone = applyTaitoStudentSchedule(
    { dateTime: "2026-10-02T12:00:00.000Z", timezone: "America/New_York" },
    { name: "Taito Goto" },
    "edit",
  );
  assert.deepEqual(editWrongZone, {
    dateTime: "2026-10-02T12:00:00.000Z",
    timezone: "Asia/Tokyo",
  });

  const editIntentional = applyTaitoStudentSchedule(
    { dateTime: "2026-10-02T11:00:00.000Z", timezone: "Pacific/Honolulu" },
    { name: "Taito Goto" },
    "edit",
  );
  assert.deepEqual(editIntentional, {
    dateTime: "2026-10-02T11:00:00.000Z",
    timezone: "Pacific/Honolulu",
  });

  const nonTaito = applyTaitoStudentSchedule(
    { dateTime: "2026-10-02T16:00:00.000Z", timezone: "America/New_York" },
    { name: "Michelle Chen", email: "michelle@example.com" },
    "create",
  );
  assert.deepEqual(nonTaito, {
    dateTime: "2026-10-02T16:00:00.000Z",
    timezone: "America/New_York",
  });
});

test("discloses three sessions before expansion without reordering", () => {
  const sessions = ["first", "second", "third", "fourth", "fifth"];
  assert.deepEqual(disclosedSessions(sessions, false), sessions.slice(0, 3));
  assert.deepEqual(disclosedSessions(sessions, true), sessions);
});

test("uniqueListedSessions drops duplicate ids and same-day tutor meetings", () => {
  const tokyo = {
    id: "tokyo-oct2",
    dateTime: "2026-10-02T12:00:00.000Z",
    timezone: "Asia/Tokyo",
    subject: "SAT",
    meetingUrl: "https://meet.google.com/rih-iayt-okb",
    tutor: { id: "eunice", name: "Eunice Chon" },
  };
  const easternTwin = {
    id: "eastern-oct2",
    dateTime: "2026-10-02T16:00:00.000Z",
    timezone: "America/New_York",
    subject: "SAT",
    meetingUrl: "https://meet.google.com/rih-iayt-okb",
    tutor: { id: "eunice", name: "Eunice Chon" },
  };
  const sameIdCopy = { ...tokyo, meetingUrl: null };
  const english = {
    id: "nika-oct23",
    dateTime: "2026-10-23T12:00:00.000Z",
    timezone: "Asia/Tokyo",
    subject: "IELTS",
    tutor: { id: "nika", name: "Nika Raiffe" },
  };

  const unique = uniqueListedSessions([tokyo, sameIdCopy, easternTwin, english]);
  assert.equal(unique.length, 2);
  assert.equal(unique[0]?.id, "tokyo-oct2");
  assert.equal(unique[1]?.id, "nika-oct23");
  assert.equal(
    listedSessionMeetingKey(tokyo),
    listedSessionMeetingKey(easternTwin),
  );
});

test("collapsedListedSessions shows three upcoming and hides the rest until expanded", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  const sessions = [
    {
      id: "past",
      dateTime: "2026-09-01T16:00:00.000Z",
      timezone: "America/New_York",
      durationMinutes: 60,
      subject: "SAT",
      status: "completed",
    },
    {
      id: "one",
      dateTime: "2026-10-02T12:00:00.000Z",
      timezone: "Asia/Tokyo",
      durationMinutes: 60,
      subject: "SAT",
    },
    {
      id: "two",
      dateTime: "2026-10-09T12:00:00.000Z",
      timezone: "Asia/Tokyo",
      durationMinutes: 60,
      subject: "SAT",
    },
    {
      id: "three",
      dateTime: "2026-10-16T12:00:00.000Z",
      timezone: "Asia/Tokyo",
      durationMinutes: 60,
      subject: "SAT",
    },
    {
      id: "four",
      dateTime: "2026-10-23T12:00:00.000Z",
      timezone: "Asia/Tokyo",
      durationMinutes: 60,
      subject: "IELTS",
    },
  ];
  const collapsed = collapsedListedSessions(sessions, false, now);
  assert.deepEqual(collapsed.visible.map((session) => session.id), ["one", "two", "three"]);
  assert.equal(collapsed.hiddenCount, 2);
  assert.equal(collapsed.canToggle, true);
  const expanded = collapsedListedSessions(sessions, true, now);
  assert.deepEqual(
    expanded.visible.map((session) => session.id),
    ["one", "two", "three", "four", "past"],
  );
});

test("treats a session as past at its end, or start when it has no end", () => {
  const now = new Date("2026-09-08T18:00:00.000Z");
  assert.equal(
    sessionEffectiveEnd({
      dateTime: "2026-09-08T17:00:00.000Z",
      durationMinutes: 60,
    }).toISOString(),
    "2026-09-08T18:00:00.000Z",
  );
  assert.equal(
    isPastSession({ dateTime: "2026-09-08T17:00:00.000Z", durationMinutes: 60 }, now),
    true,
  );
  assert.equal(
    isPastSession({ dateTime: "2026-09-08T17:30:00.000Z", durationMinutes: 60 }, now),
    false,
  );
  assert.equal(
    isPastSession({ dateTime: "2026-09-08T17:59:59.000Z", durationMinutes: 0 }, now),
    true,
  );
  assert.equal(
    isPastSession({ dateTime: "2026-09-08T18:00:01.000Z", durationMinutes: null }, now),
    false,
  );
});

test("blocks cancel and reschedule once a session is past or already started", () => {
  const now = new Date("2026-09-08T18:00:00.000Z");
  const ended = { dateTime: "2026-09-08T16:30:00.000Z", durationMinutes: 60 };
  const inProgress = { dateTime: "2026-09-08T17:30:00.000Z", durationMinutes: 60 };
  const upcoming = { dateTime: "2026-09-08T19:00:00.000Z", durationMinutes: 60 };

  assert.equal(canCancelOrRescheduleSession(ended, now), false);
  assert.equal(canCancelOrRescheduleSession(inProgress, now), false);
  assert.equal(canCancelOrRescheduleSession(upcoming, now), true);
  assert.equal(
    sessionScheduleChangeMessage("cancel", ended, now),
    "A past session cannot be cancelled.",
  );
  assert.equal(
    sessionScheduleChangeMessage("reschedule", ended, now),
    "A past session cannot be rescheduled.",
  );
  assert.equal(
    sessionScheduleChangeMessage("cancel", inProgress, now),
    "A session that has started cannot be cancelled.",
  );
  assert.equal(
    sessionScheduleChangeMessage("reschedule", inProgress, now),
    "A session that has started cannot be rescheduled.",
  );
  assert.equal(sessionScheduleChangeMessage("cancel", upcoming, now), null);
});

test("treats submitted quiz work as completed progress even when readiness is still ready", () => {
  assert.equal(isSessionWorkComplete({ readiness: "ready", status: "published" }), false);
  assert.equal(isSessionWorkComplete({ readiness: "complete" }), true);
  assert.equal(isSessionWorkComplete({ status: "completed" }), true);
  assert.equal(isSessionWorkComplete({ latestResult: { analysis: {} } }), true);
  assert.equal(
    isSessionWorkComplete({ preparation: { latestAttemptStatus: "submitted" } }),
    true,
  );
  assert.equal(
    isSessionWorkComplete({ preparation: { latestAttemptStatus: "expired" } }),
    true,
  );
  assert.equal(
    isSessionWorkComplete({ preparation: { latestAttemptStatus: "active" } }),
    false,
  );
});

test("keeps English as the user-facing label for IELTS sessions", () => {
  assert.equal(sessionSubjectLabel("IELTS"), "English");
  assert.equal(
    displaySessionTitle("IELTS session with Nika Raiffe", "IELTS"),
    "English session with Nika Raiffe",
  );
});