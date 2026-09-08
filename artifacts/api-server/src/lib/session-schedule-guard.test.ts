import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isPastSession,
  sessionEffectiveEnd,
  sessionScheduleChangeError,
} from "./session-schedule-guard.ts";

test("past-session cutoff uses end time, or start when there is no end", () => {
  const now = new Date("2026-09-08T18:00:00.000Z");
  assert.equal(
    sessionEffectiveEnd({
      dateTime: new Date("2026-09-08T17:00:00.000Z"),
      durationMinutes: 60,
    }).toISOString(),
    "2026-09-08T18:00:00.000Z",
  );
  assert.equal(
    isPastSession(
      { dateTime: new Date("2026-09-08T17:00:00.000Z"), durationMinutes: 60 },
      now,
    ),
    true,
  );
  assert.equal(
    isPastSession(
      { dateTime: new Date("2026-09-08T17:30:00.000Z"), durationMinutes: 60 },
      now,
    ),
    false,
  );
  assert.equal(
    isPastSession(
      { dateTime: new Date("2026-09-08T17:59:00.000Z"), durationMinutes: 0 },
      now,
    ),
    true,
  );
  assert.equal(
    isPastSession(
      { dateTime: new Date("2026-09-08T18:00:01.000Z"), durationMinutes: null },
      now,
    ),
    false,
  );
});

test("cancel and reschedule reject past and in-progress sessions with distinct errors", () => {
  const now = new Date("2026-09-08T18:00:00.000Z");
  const ended = {
    dateTime: new Date("2026-09-08T16:30:00.000Z"),
    durationMinutes: 60,
  };
  const inProgress = {
    dateTime: new Date("2026-09-08T17:30:00.000Z"),
    durationMinutes: 60,
  };
  const upcoming = {
    dateTime: new Date("2026-09-08T19:00:00.000Z"),
    durationMinutes: 60,
  };

  assert.deepEqual(sessionScheduleChangeError(ended, "cancel", now), {
    status: 409,
    code: "SESSION_IN_THE_PAST",
    message: "A past session cannot be cancelled.",
  });
  assert.deepEqual(sessionScheduleChangeError(ended, "reschedule", now), {
    status: 409,
    code: "SESSION_IN_THE_PAST",
    message: "A past session cannot be rescheduled.",
  });
  assert.deepEqual(sessionScheduleChangeError(inProgress, "cancel", now), {
    status: 409,
    code: "SESSION_STARTED",
    message: "A session that has started cannot be cancelled.",
  });
  assert.deepEqual(sessionScheduleChangeError(inProgress, "reschedule", now), {
    status: 409,
    code: "SESSION_STARTED",
    message: "A session that has started cannot be rescheduled.",
  });
  assert.equal(sessionScheduleChangeError(upcoming, "cancel", now), null);
  assert.equal(sessionScheduleChangeError(upcoming, "reschedule", now), null);
});
