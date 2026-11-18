import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { formatBookingWhen } from "./booking-student-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SOPHIA_SLEIMAN_REMINDER_EMAIL,
  SOPHIA_SLEIMAN_REMINDER_TIMEZONE,
  SOPHIA_SLEIMAN_REMINDER_USER_ID,
  hoursUntilSession,
  isSophiaSleimanReminderRecipient,
  sessionReminderEmail,
  sessionReminderSubject,
  shouldSendSessionReminder,
  startSophiaSessionReminderTick as startTick,
} from "./session-reminders.ts";

const sophiaStart = new Date("2026-11-18T15:00:00.000Z"); // 10:00 AM ET / 7:00 PM GST

const baseEligible = {
  userId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
  email: SOPHIA_SLEIMAN_REMINDER_EMAIL,
  role: "student",
  sessionCancelled: false,
};

test("Sophia S is the only reminder recipient", () => {
  assert.equal(
    isSophiaSleimanReminderRecipient({
      userId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
      email: SOPHIA_SLEIMAN_REMINDER_EMAIL,
      role: "student",
    }),
    true,
  );
  assert.equal(
    isSophiaSleimanReminderRecipient({
      userId: "b21bc32a-82c3-4252-a702-daa3fcdd23af",
      email: "makaremmichelle7@gmail.com",
      role: "student",
    }),
    false,
  );
  assert.equal(
    isSophiaSleimanReminderRecipient({
      userId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
      email: SOPHIA_SLEIMAN_REMINDER_EMAIL,
      role: "tutor",
    }),
    false,
  );
});

test("1-day and 1-hour windows do not overlap and skip started or cancelled sessions", () => {
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_day", hoursUntilSession: 14 }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_hour", hoursUntilSession: 14 }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_day", hoursUntilSession: 0.75 }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_hour", hoursUntilSession: 0.75 }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_hour", hoursUntilSession: 1 }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_day", hoursUntilSession: 24 }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_day", hoursUntilSession: 25 }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_hour", hoursUntilSession: 0 }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({ ...baseEligible, kind: "1_day", hoursUntilSession: 14, sessionCancelled: true }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_day",
      hoursUntilSession: 14,
      email: "makaremmichelle7@gmail.com",
      userId: "b21bc32a-82c3-4252-a702-daa3fcdd23af",
    }),
    false,
  );
});

test("Nov 18 reminder copy shows Dubai and ET, the Meet link, and no calendar invite", () => {
  assert.equal(
    formatBookingWhen(sophiaStart, SOPHIA_SLEIMAN_REMINDER_TIMEZONE, "America/New_York"),
    "Wednesday, November 18, 2026 at 7:00 PM GST (10:00 AM ET)",
  );
  assert.equal(
    hoursUntilSession(sophiaStart, new Date("2026-11-18T14:00:00.000Z")),
    1,
  );
  const day = sessionReminderEmail({
    studentName: "Sophia Sleiman",
    sessionTitle: "Sophia’s SAT Session with Eunice",
    tutorName: "Eunice Chon",
    start: sophiaStart,
    durationMinutes: 90,
    meetUrl: "https://meet.google.com/xqq-zivk-ewx",
    kind: "1_day",
  });
  const hour = sessionReminderEmail({
    studentName: "Sophia Sleiman",
    sessionTitle: "Sophia’s SAT Session with Eunice",
    tutorName: "Eunice Chon",
    start: sophiaStart,
    durationMinutes: 90,
    meetUrl: "https://meet.google.com/xqq-zivk-ewx",
    kind: "1_hour",
  });
  assert.equal(day.subject, sessionReminderSubject("1_day", "Eunice Chon"));
  assert.equal(hour.subject, "Reminder: your session with Eunice Chon starts in 1 hour");
  assert.match(day.subject, /tomorrow/);
  assert.match(day.text, /7:00 PM GST \(10:00 AM ET\)/);
  assert.match(day.text, /1 hour 30 minutes/);
  assert.match(day.text, /https:\/\/meet\.google\.com\/xqq-zivk-ewx/);
  assert.match(day.html, /https:\/\/meet\.google\.com\/xqq-zivk-ewx/);
  assert.doesNotMatch(day.text, /calendar invite/i);
  assert.doesNotMatch(hour.text, /calendar invite/i);
  assert.match(day.from, /noreply@acceptedadmissions\.org/);
});

test("in-app tick can start and stop without an external scheduler", () => {
  let ticks = 0;
  const handles: Array<ReturnType<typeof setTimeout>> = [];
  const { stop } = startTick({
    intervalMs: 10_000,
    runOnStart: true,
    run: async () => {
      ticks += 1;
    },
    setIntervalFn: ((fn: () => void, ms: number) => {
      const handle = setTimeout(fn, ms);
      handles.push(handle);
      return handle as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval,
    clearIntervalFn: ((handle: ReturnType<typeof setInterval>) => {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    }) as typeof clearInterval,
  });
  stop();
  for (const handle of handles) clearTimeout(handle);
  assert.equal(ticks, 1);
});
