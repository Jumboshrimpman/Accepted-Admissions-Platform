import assert from "node:assert/strict";
import test from "node:test";
import {
  formatStudentDueInstant,
  resolveStudentPreworkDue,
  studentPreworkDeadlineCopy,
} from "./student-prework-deadline.ts";

const session = {
  dateTime: "2026-10-02T12:00:00.000Z",
  timezone: "Asia/Tokyo",
};

test("formats a session start in the student's timezone", () => {
  assert.equal(
    formatStudentDueInstant("2026-10-02T12:00:00.000Z", "Asia/Tokyo"),
    "Friday, October 2, 2026 at 9:00 PM JST",
  );
  assert.equal(
    formatStudentDueInstant("2026-10-02T12:00:00.000Z", "Asia/Dubai"),
    "Friday, October 2, 2026 at 4:00 PM GST",
  );
});

test("unfinished pre-work with no stored deadline is due before the session", () => {
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: {
        deliveryPhase: "before_session",
        deadline: null,
        latestAttemptStatus: null,
      },
      session,
      clientTimezone: "Asia/Tokyo",
    }),
    "Due before your session: Friday, October 2, 2026 at 9:00 PM JST",
  );
});

test("the student timezone wins over the stored session timezone", () => {
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: { deadline: null, latestAttemptStatus: "paused" },
      session: { ...session, timezone: "America/New_York" },
      clientTimezone: "Asia/Dubai",
    }),
    "Due before your session: Friday, October 2, 2026 at 4:00 PM GST",
  );
});

test("an earlier stored deadline wins; a later one does not move past the session", () => {
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: {
        deadline: "2026-10-01T12:00:00.000Z",
        latestAttemptStatus: "active",
      },
      session,
      clientTimezone: "Asia/Tokyo",
    }),
    "Due before Thursday, October 1, 2026 at 9:00 PM JST",
  );
  const later = resolveStudentPreworkDue({
    assignment: { deadline: "2026-10-03T12:00:00.000Z" },
    session,
  });
  assert.equal(later?.source, "session_start");
  assert.equal(later?.at.toISOString(), "2026-10-02T12:00:00.000Z");
});

test("finished, in-session, and past-session work does not get a deadline label", () => {
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: { deadline: null, latestAttemptStatus: "submitted" },
      session,
    }),
    null,
  );
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: { deadline: null, latestAttemptStatus: "expired" },
      session,
    }),
    null,
  );
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: {
        deliveryPhase: "during_session",
        deadline: null,
        latestAttemptStatus: null,
      },
      session,
    }),
    null,
  );
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: { deadline: null, latestAttemptStatus: null },
      session,
      pastSessionDay: true,
    }),
    null,
  );
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: { deadline: null, latestAttemptStatus: null },
      session: null,
    }),
    null,
  );
});

test("a standalone quiz uses its stored deadline in the student timezone", () => {
  assert.equal(
    studentPreworkDeadlineCopy({
      assignment: {
        deadline: "2026-10-01T03:00:00.000Z",
        latestAttemptStatus: null,
      },
      clientTimezone: "Asia/Tokyo",
    }),
    "Due before Thursday, October 1, 2026 at 12:00 PM JST",
  );
});
