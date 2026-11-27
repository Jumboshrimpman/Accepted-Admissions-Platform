import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { formatBookingWhen, STUDENT_BOOKING_CONFIRMATION_PORTAL_URL } from "./booking-student-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MICHELLE_MAKAREM_MEET_URL, SOPHIA_SLEIMAN_EMAIL, SOPHIA_SLEIMAN_MEET_URL } from "./session-meeting-url.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEETING_URL, TAITO_STUDENT_EMAIL } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { DEFAULT_SESSION_REMINDER_STUDENT_EMAILS, MICHELLE_MAKAREM_REMINDER_CLERK_USER_ID, SESSION_REMINDER_INTERVAL_MS, SOPHIA_SLEIMAN_REMINDER_TIMEZONE, SOPHIA_SLEIMAN_REMINDER_USER_ID, dayBeforePreclaims, deliverSessionReminders, hoursUntilSession, isSessionReminderStudent, isSophiaSleimanReminderRecipient, planSessionReminders, sessionReminderAllowlistFromEnv, sessionReminderClaimKey, sessionReminderDayWord, sessionReminderEmail, sessionReminderLeadHours, sessionReminderSubject, sessionReminderTimezone, shouldSendSessionReminder, startSessionReminderTick, type PlannedSessionReminder, type SessionReminderCandidate } from "./session-reminders.ts";

const NOW = new Date("2026-11-27T15:00:00.000Z");
const START = new Date("2026-11-28T12:00:00.000Z"); // 7:00 AM ET, 9:00 PM JST
const DAY_BEFORE_NOW = new Date(START.getTime() - 23.5 * 60 * 60 * 1000);
const CREATED = new Date("2026-11-20T12:00:00.000Z");
const ALLOWLIST = new Set(DEFAULT_SESSION_REMINDER_STUDENT_EMAILS);

function person(overrides: Partial<SessionReminderCandidate["student"]> & { email: string }) {
  return {
    userId: "user-1",
    displayName: "Student",
    timezone: "America/New_York",
    timezoneSource: "default",
    ...overrides,
  };
}

function candidate(overrides: Partial<SessionReminderCandidate> = {}): SessionReminderCandidate {
  const student = overrides.student ?? person({
    userId: "taito",
    email: TAITO_STUDENT_EMAIL,
    displayName: "Taito Goto",
    timezone: "Asia/Tokyo",
    timezoneSource: "admin",
  });
  return {
    sessionId: "session-1",
    title: "Taito's SAT Session with Eunice",
    start: START,
    createdAt: CREATED,
    durationMinutes: 60,
    cancelled: false,
    archived: false,
    confirmed: true,
    student,
    tutor: person({
      userId: "eunice",
      email: "eunice_chon@berkeley.edu",
      displayName: "Eunice Chon",
      timezone: "America/Los_Angeles",
      timezoneSource: "browser",
    }),
    meeting: {
      meetUrl: null,
      providerEventUrl: null,
      courseMeetUrl: null,
      term: "Fall 2026",
      clientEmail: student.email,
      clientUserId: student.userId,
      dateTime: START,
      subject: "SAT",
      timezone: "Asia/Tokyo",
      tutorName: "Eunice Chon",
      tutorEmail: "eunice_chon@berkeley.edu",
    },
    ...overrides,
  };
}

const baseEligible = {
  studentEmail: SOPHIA_SLEIMAN_EMAIL,
  allowlist: ALLOWLIST,
  sessionCancelled: false,
  sessionArchived: false,
  confirmed: true,
  leadHours: 48,
};

test("the allowlist is the three students unless an env var replaces it", () => {
  assert.deepEqual(
    [...DEFAULT_SESSION_REMINDER_STUDENT_EMAILS].sort(),
    [TAITO_STUDENT_EMAIL, "makaremmichelle7@gmail.com", SOPHIA_SLEIMAN_EMAIL].sort(),
  );
  assert.equal(isSessionReminderStudent(TAITO_STUDENT_EMAIL, ALLOWLIST), true);
  assert.equal(isSessionReminderStudent("MakaremMichelle7@gmail.com", ALLOWLIST), true);
  assert.equal(isSessionReminderStudent(SOPHIA_SLEIMAN_EMAIL, ALLOWLIST), true);
  assert.equal(isSessionReminderStudent("eunice_chon@berkeley.edu", ALLOWLIST), false);
  assert.equal(isSessionReminderStudent("someone@example.com", ALLOWLIST), false);

  const previous = process.env.SESSION_REMINDER_STUDENT_EMAILS;
  delete process.env.SESSION_REMINDER_STUDENT_EMAILS;
  try {
    const defaults = sessionReminderAllowlistFromEnv();
    assert.equal(defaults.has(TAITO_STUDENT_EMAIL), true);
    assert.equal(defaults.has(SOPHIA_SLEIMAN_EMAIL), true);
    assert.equal(defaults.has("someone@example.com"), false);
    process.env.SESSION_REMINDER_STUDENT_EMAILS = "   ";
    assert.equal(sessionReminderAllowlistFromEnv().has(TAITO_STUDENT_EMAIL), true);
  } finally {
    if (previous === undefined) delete process.env.SESSION_REMINDER_STUDENT_EMAILS;
    else process.env.SESSION_REMINDER_STUDENT_EMAILS = previous;
  }

  const custom = sessionReminderAllowlistFromEnv({
    SESSION_REMINDER_STUDENT_EMAILS: "New.Student@school.edu, taito0525@gmail.com",
  } as NodeJS.ProcessEnv);
  assert.equal(custom.has("new.student@school.edu"), true);
  assert.equal(custom.has(TAITO_STUDENT_EMAIL), true);
  assert.equal(custom.has(SOPHIA_SLEIMAN_EMAIL), false);
  assert.equal(custom.has("makaremmichelle7@gmail.com"), false);
});

test("1-day and 1-hour windows do not overlap, and a late booking only gets the 1-hour reminder", () => {
  assert.equal(SESSION_REMINDER_INTERVAL_MS, 5 * 60 * 1000);
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
    shouldSendSessionReminder({ ...baseEligible, kind: "1_hour", hoursUntilSession: -1 }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_day",
      hoursUntilSession: 14,
      sessionCancelled: true,
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_day",
      hoursUntilSession: 14,
      sessionArchived: true,
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_day",
      hoursUntilSession: 14,
      confirmed: false,
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_day",
      hoursUntilSession: 14,
      studentEmail: "someone@example.com",
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_day",
      hoursUntilSession: 14,
      leadHours: 23.9,
    }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_hour",
      hoursUntilSession: 0.5,
      leadHours: 2,
    }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({
      ...baseEligible,
      kind: "1_day",
      hoursUntilSession: 14,
      leadHours: 24,
    }),
    true,
  );
  assert.equal(hoursUntilSession(START, new Date("2026-11-28T11:00:00.000Z")), 1);
  assert.equal(sessionReminderLeadHours(START, new Date("2026-11-27T13:00:00.000Z")), 23);
});

test("each recipient sees their own timezone, or ET when it was never set", () => {
  assert.equal(
    sessionReminderTimezone({ timezone: "Asia/Tokyo", timezoneSource: "admin" }),
    "Asia/Tokyo",
  );
  assert.equal(
    sessionReminderTimezone({ timezone: "Asia/Tokyo", timezoneSource: "default" }),
    "America/New_York",
  );
  assert.equal(
    sessionReminderTimezone({ timezone: "Not/AZone", timezoneSource: "browser" }),
    "America/New_York",
  );

  const known = sessionReminderEmail({
    recipientName: "Taito Goto",
    studentName: "Taito Goto",
    tutorName: "Eunice Chon",
    sessionTitle: "Taito's SAT Session with Eunice",
    start: START,
    durationMinutes: 60,
    meetUrl: SHARED_FALL_MEETING_URL,
    kind: "1_day",
    audience: "student",
    timezone: "Asia/Tokyo",
    timezoneSource: "admin",
  });
  const unknown = sessionReminderEmail({
    recipientName: "Taito Goto",
    studentName: "Taito Goto",
    tutorName: "Eunice Chon",
    sessionTitle: "Taito's SAT Session with Eunice",
    start: START,
    durationMinutes: 60,
    meetUrl: SHARED_FALL_MEETING_URL,
    kind: "1_hour",
    audience: "student",
    timezone: "Asia/Tokyo",
    timezoneSource: "default",
  });
  assert.match(known.text, /9:00 PM JST/);
  assert.doesNotMatch(known.text, /\bET\b/);
  assert.match(unknown.text, /7:00 AM ET/);
  assert.doesNotMatch(unknown.text, /JST/);
  assert.equal(
    known.subject,
    sessionReminderSubject({
      kind: "1_day",
      audience: "student",
      tutorName: "Eunice Chon",
      studentName: "Taito Goto",
    }),
  );
  assert.equal(unknown.subject, "Reminder: your session with Eunice Chon starts in 1 hour");
  assert.match(known.text, /Sama\nacceptedadmissions\.org$/);
  assert.match(known.html, /Sama/);
  assert.match(known.html, /acceptedadmissions\.org/);
  assert.match(known.from, /noreply@acceptedadmissions\.org/);
  assert.doesNotMatch(known.text, /calendar invite/i);
  assert.doesNotMatch(unknown.html, /calendar invite/i);
});

test("the join link is the student-facing meeting URL, and a missing one uses the portal", () => {
  const taito = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: ALLOWLIST,
    sessions: [candidate()],
  });
  assert.equal(taito.length, 2);
  assert.equal(taito[0]?.audience, "student");
  assert.equal(taito[1]?.audience, "tutor");
  assert.match(taito[0]!.text, new RegExp(SHARED_FALL_MEETING_URL.replace(/[.]/g, "\\.")));
  assert.match(taito[1]!.text, /4:00 AM PT/);
  assert.match(taito[0]!.text, /Tutor: Eunice Chon/);
  assert.match(taito[1]!.text, /Student: Taito Goto/);
  assert.equal(taito[1]?.subject, "Reminder: your session with Taito Goto is tomorrow at 4:00 AM PT");
  assert.match(taito[0]!.subject, /is tomorrow at 9:00 PM JST/);

  const michelle = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: ALLOWLIST,
    sessions: [
      candidate({
        sessionId: "michelle-session",
        title: "Michelle's SAT Session with Xavier",
        student: person({
          userId: "michelle",
          email: "makaremmichelle7@gmail.com",
          displayName: "Michelle Makarem",
          timezone: "America/New_York",
          timezoneSource: "browser",
        }),
        tutor: person({
          userId: "xavier",
          email: "xavier@acceptedadmissions.org",
          displayName: "Xavier Morales",
          timezone: "America/New_York",
          timezoneSource: "admin",
        }),
        meeting: {
          meetUrl: null,
          clientEmail: "makaremmichelle7@gmail.com",
          clientUserId: "michelle",
          tutorName: "Xavier Morales",
        },
      }),
    ],
  });
  assert.match(michelle[0]!.text, new RegExp(MICHELLE_MAKAREM_MEET_URL.replace(/[.]/g, "\\.")));

  const sophia = planSessionReminders({
    now: new Date("2026-11-18T14:00:00.000Z"),
    allowlist: ALLOWLIST,
    sessions: [
      candidate({
        sessionId: "sophia-session",
        title: "Sophia’s SAT Session with Eunice",
        start: new Date("2026-11-18T15:00:00.000Z"),
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
        durationMinutes: 90,
        student: person({
          userId: "sophia",
          email: SOPHIA_SLEIMAN_EMAIL,
          displayName: "Sophia Sleiman",
          timezone: "Asia/Dubai",
          timezoneSource: "admin",
        }),
        tutor: person({
          userId: "eunice",
          email: "eunice_chon@berkeley.edu",
          displayName: "Eunice Chon",
        }),
        meeting: {
          meetUrl: null,
          clientEmail: SOPHIA_SLEIMAN_EMAIL,
          clientUserId: "sophia",
        },
      }),
    ],
  });
  assert.equal(sophia.length, 2);
  assert.equal(sophia[0]?.kind, "1_hour");
  assert.match(sophia[0]!.text, /7:00 PM GST/);
  assert.match(sophia[0]!.text, /1 hour 30 minutes/);
  assert.match(sophia[0]!.text, new RegExp(SOPHIA_SLEIMAN_MEET_URL.replace(/[.]/g, "\\.")));

  const noMeeting = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: new Set(["new.student@school.edu"]),
    sessions: [
      candidate({
        title: "Essay review",
        student: person({
          userId: "new-student",
          email: "new.student@school.edu",
          displayName: "New Student",
          timezone: "America/Chicago",
          timezoneSource: "browser",
        }),
        tutor: person({
          userId: "nika",
          email: "nika.raiffe@gmail.com",
          displayName: "Nika Raiffe",
          timezone: "America/New_York",
          timezoneSource: "default",
        }),
        meeting: {
          meetUrl: null,
          providerEventUrl: "https://www.google.com/calendar/event?eid=abc",
          courseMeetUrl: null,
          term: null,
          clientEmail: "new.student@school.edu",
          clientUserId: "new-student",
          tutorName: "Nika Raiffe",
        },
      }),
    ],
  });
  assert.equal(noMeeting.length, 2);
  for (const email of noMeeting) {
    assert.match(email.text, new RegExp(`Join: ${STUDENT_BOOKING_CONFIRMATION_PORTAL_URL}`));
    assert.doesNotMatch(email.text, /meet\.google\.com/);
    assert.doesNotMatch(email.text, /calendar\/event/);
    assert.match(email.html, /Join from your portal/);
  }
  assert.match(noMeeting[0]!.text, /6:00 AM CT/);

  const direct = sessionReminderEmail({
    recipientName: "New Student",
    studentName: "New Student",
    tutorName: "Nika Raiffe",
    sessionTitle: "Essay review",
    start: START,
    durationMinutes: 60,
    meetUrl: "https://www.google.com/calendar/event?eid=abc",
    kind: "1_day",
    audience: "student",
    timezone: "America/New_York",
    timezoneSource: "default",
  });
  assert.match(direct.text, new RegExp(`Join: ${STUDENT_BOOKING_CONFIRMATION_PORTAL_URL}`));
  assert.doesNotMatch(direct.text, /meet\.google\.com/);
  assert.doesNotMatch(direct.html, /calendar\/event/);
});

test("a linked parent viewer gets nothing, and other students' tutors do not", () => {
  const withParent = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: ALLOWLIST,
    sessions: [
      candidate({
        linkedViewers: [
          person({
            userId: "ryo",
            email: "ryo@jaac.co.jp",
            displayName: "Ryo",
            timezone: "Asia/Tokyo",
            timezoneSource: "admin",
          }),
        ],
      }),
    ],
  });
  assert.deepEqual(
    withParent.map((item) => item.to),
    [TAITO_STUDENT_EMAIL, "eunice_chon@berkeley.edu"],
  );
  assert.deepEqual(
    withParent.map((item) => item.audience),
    ["student", "tutor"],
  );
  assert.equal(withParent.some((item) => item.to === "ryo@jaac.co.jp"), false);
  for (const email of withParent) {
    assert.doesNotMatch(email.text, /Hi Ryo/);
    assert.doesNotMatch(email.text, /ryo@jaac\.co\.jp/);
  }

  const outsider = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: ALLOWLIST,
    sessions: [
      candidate({
        student: person({
          userId: "other",
          email: "someone@example.com",
          displayName: "Someone Else",
        }),
        tutor: person({
          userId: "eunice",
          email: "eunice_chon@berkeley.edu",
          displayName: "Eunice Chon",
        }),
        linkedViewers: [
          person({ userId: "parent", email: "parent@example.com", displayName: "Parent" }),
        ],
      }),
    ],
  });
  assert.equal(outsider.length, 0);

  const late = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: ALLOWLIST,
    sessions: [
      candidate({
        createdAt: new Date(START.getTime() - 10 * 60 * 60 * 1000),
      }),
    ],
  });
  assert.equal(late.length, 0);

  const lateInsideHour = planSessionReminders({
    now: new Date(START.getTime() - 30 * 60 * 1000),
    allowlist: ALLOWLIST,
    sessions: [
      candidate({
        createdAt: new Date(START.getTime() - 2 * 60 * 60 * 1000),
      }),
    ],
  });
  assert.equal(lateInsideHour.length, 2);
  assert.equal(lateInsideHour.every((item) => item.kind === "1_hour"), true);

  const passed = planSessionReminders({
    now: new Date(START.getTime() + 60 * 1000),
    allowlist: ALLOWLIST,
    sessions: [candidate()],
  });
  assert.equal(passed.length, 0);

  const cancelled = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: ALLOWLIST,
    sessions: [candidate({ cancelled: true })],
  });
  assert.equal(cancelled.length, 0);
});

test("Sophia keeps the #268 reminder: Abu Dhabi plus ET, wide window, and original sign-off", () => {
  assert.equal(
    isSophiaSleimanReminderRecipient({
      userId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
      email: "someone-else@example.com",
      role: "student",
    }),
    true,
  );
  assert.equal(
    isSophiaSleimanReminderRecipient({
      userId: "other-user",
      email: SOPHIA_SLEIMAN_EMAIL,
      role: "student",
    }),
    true,
  );
  assert.equal(
    isSophiaSleimanReminderRecipient({
      userId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
      email: SOPHIA_SLEIMAN_EMAIL,
      role: "tutor",
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentUserId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
      studentEmail: "renamed@example.com",
      audience: "student",
      allowlist: new Set(["taito0525@gmail.com"]),
      sessionCancelled: false,
      hoursUntilSession: 14,
      leadHours: 2,
      remindersEnabled: false,
    }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentUserId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
      studentEmail: SOPHIA_SLEIMAN_EMAIL,
      audience: "tutor",
      allowlist: ALLOWLIST,
      sessionCancelled: false,
      hoursUntilSession: 5,
      leadHours: 48,
      remindersEnabled: true,
    }),
    false,
  );

  const sophiaStart = new Date("2026-11-18T15:00:00.000Z");
  assert.equal(
    formatBookingWhen(sophiaStart, SOPHIA_SLEIMAN_REMINDER_TIMEZONE, "America/New_York"),
    "Wednesday, November 18, 2026 at 7:00 PM GST (10:00 AM ET)",
  );
  const email = sessionReminderEmail({
    recipientName: "Sophia Sleiman",
    studentName: "Sophia Sleiman",
    tutorName: "Eunice Chon",
    sessionTitle: "Sophia’s SAT Session with Eunice",
    start: sophiaStart,
    durationMinutes: 90,
    meetUrl: SOPHIA_SLEIMAN_MEET_URL,
    kind: "1_day",
    audience: "student",
    timezone: "America/Los_Angeles",
    timezoneSource: "browser",
    legacySophia: true,
    now: new Date("2026-11-17T15:00:00.000Z"),
  });
  assert.equal(email.subject, "Reminder: your session with Eunice Chon is tomorrow");
  assert.match(email.text, /This is a reminder that your session is tomorrow\./);
  assert.match(email.text, /7:00 PM GST \(10:00 AM ET\)/);
  assert.match(email.text, /1 hour 30 minutes/);
  assert.doesNotMatch(email.text, /^Student:/m);
  assert.doesNotMatch(email.html, /Student:/);
  assert.match(email.text, /— Accepted Admissions$/);
  assert.match(email.html, /&mdash; Accepted Admissions/);
  assert.doesNotMatch(email.text, /Sama/);
  assert.doesNotMatch(email.text, /today at/i);

  const planned = planSessionReminders({
    now: new Date(sophiaStart.getTime() - 5 * 60 * 60 * 1000),
    allowlist: ALLOWLIST,
    remindersEnabled: true,
    sessions: [
      candidate({
        sessionId: "sophia-soon",
        title: "Sophia’s SAT Session with Eunice",
        start: sophiaStart,
        createdAt: new Date(sophiaStart.getTime() - 2 * 60 * 60 * 1000),
        student: person({
          userId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
          email: "renamed-sophia@example.com",
          displayName: "Sophia Sleiman",
          timezone: "America/New_York",
          timezoneSource: "default",
        }),
        meeting: {
          meetUrl: null,
          clientEmail: "renamed-sophia@example.com",
          clientUserId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
        },
      }),
    ],
  });
  const studentMail = planned.filter((item) => item.audience === "student");
  assert.equal(studentMail.length, 1);
  assert.equal(studentMail[0]?.kind, "1_day");
  assert.match(studentMail[0]!.text, /7:00 PM GST \(10:00 AM ET\)/);
  assert.equal(planned.filter((item) => item.audience === "tutor").length, 0);
});

test("a session 5 hours out gets no day-before email, and copy says today or tomorrow", () => {
  const fiveHoursOut = planSessionReminders({
    now: new Date(START.getTime() - 5 * 60 * 60 * 1000),
    allowlist: ALLOWLIST,
    remindersEnabled: true,
    sessions: [candidate({ createdAt: new Date("2026-11-01T00:00:00.000Z") })],
  });
  assert.equal(fiveHoursOut.length, 0);
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentEmail: TAITO_STUDENT_EMAIL,
      audience: "student",
      allowlist: ALLOWLIST,
      sessionCancelled: false,
      hoursUntilSession: 5,
      leadHours: 100,
      remindersEnabled: true,
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentEmail: TAITO_STUDENT_EMAIL,
      audience: "student",
      allowlist: ALLOWLIST,
      sessionCancelled: false,
      hoursUntilSession: 23.5,
      leadHours: 10,
      remindersEnabled: true,
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentEmail: TAITO_STUDENT_EMAIL,
      audience: "student",
      allowlist: ALLOWLIST,
      sessionCancelled: false,
      hoursUntilSession: 23.5,
      leadHours: 48,
      remindersEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentEmail: TAITO_STUDENT_EMAIL,
      audience: "student",
      allowlist: ALLOWLIST,
      sessionCancelled: false,
      hoursUntilSession: 23,
      leadHours: 48,
      remindersEnabled: true,
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_hour",
      studentEmail: TAITO_STUDENT_EMAIL,
      audience: "student",
      allowlist: ALLOWLIST,
      sessionCancelled: false,
      hoursUntilSession: 0.5,
      leadHours: 2,
      remindersEnabled: true,
    }),
    true,
  );

  const todayStart = new Date("2026-11-28T04:45:00.000Z"); // 11:45 PM ET Nov 27
  const todayNow = new Date("2026-11-27T05:15:00.000Z"); // 12:15 AM ET Nov 27
  assert.equal(sessionReminderDayWord(todayStart, todayNow, "America/New_York"), "today");
  const todayMail = sessionReminderEmail({
    recipientName: "Taito Goto",
    studentName: "Taito Goto",
    tutorName: "Eunice Chon",
    sessionTitle: "Taito's SAT Session with Eunice",
    start: todayStart,
    durationMinutes: 60,
    meetUrl: SHARED_FALL_MEETING_URL,
    kind: "1_day",
    audience: "student",
    timezone: "America/New_York",
    timezoneSource: "admin",
    now: todayNow,
  });
  assert.match(todayMail.subject, /is today at 11:45 PM ET/);
  assert.match(todayMail.text, /your session is today at 11:45 PM ET/);
  assert.doesNotMatch(todayMail.subject, /tomorrow/);
  assert.doesNotMatch(todayMail.text, /is tomorrow/);

  const tomorrowStart = new Date("2026-11-28T17:30:00.000Z"); // 12:30 PM ET Nov 28
  const tomorrowNow = new Date("2026-11-27T18:00:00.000Z"); // 1:00 PM ET Nov 27
  assert.equal(sessionReminderDayWord(tomorrowStart, tomorrowNow, "America/New_York"), "tomorrow");
  const tomorrowMail = sessionReminderEmail({
    recipientName: "Eunice Chon",
    studentName: "Taito Goto",
    tutorName: "Eunice Chon",
    sessionTitle: "Taito's SAT Session with Eunice",
    start: tomorrowStart,
    durationMinutes: 60,
    kind: "1_day",
    audience: "tutor",
    timezone: "America/New_York",
    timezoneSource: "browser",
    now: tomorrowNow,
  });
  assert.match(tomorrowMail.subject, /is tomorrow at 12:30 PM ET/);
  assert.match(tomorrowMail.text, /your session with Taito Goto is tomorrow at 12:30 PM ET/);
});

test("deploy pre-claims the day-before email inside the 24h horizon, except Sophia", () => {
  const soon = new Date(START.getTime() - 5 * 60 * 60 * 1000);
  const taitoSoon = candidate({ sessionId: "taito-soon", start: START, createdAt: new Date("2026-11-01T00:00:00.000Z") });
  const taitoLater = candidate({
    sessionId: "taito-later",
    start: new Date(soon.getTime() + 30 * 60 * 60 * 1000),
  });
  const sophiaSoon = candidate({
    sessionId: "sophia-soon",
    start: START,
    student: person({
      userId: SOPHIA_SLEIMAN_REMINDER_USER_ID,
      email: SOPHIA_SLEIMAN_EMAIL,
      displayName: "Sophia Sleiman",
    }),
  });
  const michelleByClerk = candidate({
    sessionId: "michelle-clerk",
    start: START,
    student: person({
      userId: "michelle-row",
      clerkUserId: MICHELLE_MAKAREM_REMINDER_CLERK_USER_ID,
      email: "michelle.other@example.com",
      displayName: "Michelle Makarem",
    }),
  });
  const claims = dayBeforePreclaims({
    now: soon,
    allowlist: new Set([TAITO_STUDENT_EMAIL]),
    sessions: [taitoSoon, taitoLater, sophiaSoon, michelleByClerk],
  });
  const keys = claims.map((claim) => `${claim.sessionId}:${claim.audience}:${claim.recipientEmail}`);
  assert.ok(keys.includes(`taito-soon:student:${TAITO_STUDENT_EMAIL}`));
  assert.ok(keys.includes("taito-soon:tutor:eunice_chon@berkeley.edu"));
  assert.equal(keys.some((key) => key.startsWith("taito-later:")), false);
  assert.equal(keys.some((key) => key.includes(SOPHIA_SLEIMAN_EMAIL)), false);
  assert.ok(keys.includes("sophia-soon:tutor:eunice_chon@berkeley.edu"));
  assert.ok(keys.includes("michelle-clerk:student:michelle.other@example.com"));
  assert.equal(claims.every((claim) => claim.kind === "1_day"), true);

  assert.equal(
    isSessionReminderStudent("michelle.other@example.com", new Set(), {
      clerkUserId: MICHELLE_MAKAREM_REMINDER_CLERK_USER_ID,
    }),
    true,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentEmail: TAITO_STUDENT_EMAIL,
      audience: "student",
      allowlist: ALLOWLIST,
      remindersEnabled: false,
      sessionCancelled: false,
      hoursUntilSession: 23.5,
      leadHours: 48,
    }),
    false,
  );
  assert.equal(
    shouldSendSessionReminder({
      kind: "1_day",
      studentEmail: SOPHIA_SLEIMAN_EMAIL,
      audience: "student",
      allowlist: ALLOWLIST,
      remindersEnabled: false,
      sessionCancelled: false,
      hoursUntilSession: 14,
      leadHours: 2,
    }),
    true,
  );
});

test("claims are per session, recipient, and kind, and a failed send can be retried", async () => {
  const planned = planSessionReminders({
    now: DAY_BEFORE_NOW,
    allowlist: ALLOWLIST,
    sessions: [candidate()],
  });
  assert.equal(planned.length, 2);
  const keys = planned.map((item) => sessionReminderClaimKey(item));
  assert.equal(new Set(keys).size, 2);
  assert.notEqual(keys[0], keys[1]);

  const rows = new Map<string, string>();
  const sent: string[] = [];
  let fail = true;
  const claim = async (item: PlannedSessionReminder) => {
    const key = sessionReminderClaimKey(item);
    if (rows.has(key)) return null;
    const id = `id-${rows.size + 1}`;
    rows.set(key, id);
    return id;
  };
  const release = async (claimId: string) => {
    for (const [key, id] of rows) {
      if (id === claimId) rows.delete(key);
    }
  };
  const send = async (item: PlannedSessionReminder) => {
    if (fail) return { status: "failed" as const, error: "mailbox unavailable" };
    sent.push(`${item.to}:${item.kind}`);
    return { status: "sent" as const, id: "resend-id" };
  };

  const studentOnly = planned.filter((item) => item.audience === "student");
  const failed = await deliverSessionReminders({
    planned: studentOnly,
    claim,
    release,
    send,
  });
  assert.equal(failed.failed, 1);
  assert.equal(failed.sent, 0);
  assert.equal(rows.size, 0);
  assert.equal(sent.length, 0);

  fail = false;
  const first = await deliverSessionReminders({ planned, claim, release, send });
  assert.equal(first.sent, 2);
  assert.equal(first.failed, 0);
  assert.deepEqual(sent, [
    "taito0525@gmail.com:1_day",
    "eunice_chon@berkeley.edu:1_day",
  ]);

  const overlapping = await deliverSessionReminders({ planned, claim, release, send });
  assert.equal(overlapping.sent, 0);
  assert.equal(overlapping.alreadySent, 2);
  assert.equal(sent.length, 2);

  const fromRecord = await deliverSessionReminders({
    planned,
    alreadySentKeys: new Set(keys),
    claim,
    release,
    send,
  });
  assert.equal(fromRecord.alreadySent, 2);
  assert.equal(fromRecord.sent, 0);
  assert.equal(sent.length, 2);

  const dry = await deliverSessionReminders({
    planned: studentOnly,
    dryRun: true,
    claim,
    release,
    send,
  });
  assert.equal(dry.considered, 1);
  assert.equal(dry.sent, 0);
  assert.equal(sent.length, 2);
});

test("the reminder job reuses the in-app tick and does not send calendar or Clerk invites", () => {
  let ticks = 0;
  const handles: Array<ReturnType<typeof setTimeout>> = [];
  const { stop } = startSessionReminderTick({
    intervalMs: SESSION_REMINDER_INTERVAL_MS,
    runOnStart: true,
    run: async () => {
      ticks += 1;
    },
    setIntervalFn: ((fn: () => void, ms: number) => {
      assert.equal(ms, 5 * 60 * 1000);
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

  const rules = readFileSync(new URL("./session-reminders.ts", import.meta.url), "utf8");
  const run = readFileSync(new URL("./session-reminder-run.ts", import.meta.url), "utf8");
  const migration = readFileSync(
    new URL("../../../../lib/db/drizzle/0093_session_reminder_recipients.sql", import.meta.url),
    "utf8",
  );
  const journal = readFileSync(
    new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  );
  assert.match(rules, /studentFacingMeetingUrl/);
  assert.match(rules, /formatBookingWhen/);
  assert.match(rules, /SOPHIA_SLEIMAN_REMINDER_TIMEZONE/);
  assert.match(run, /planSessionReminders/);
  assert.match(migration, /interval '24 hours'/);
  assert.match(migration, /user_3JCRGfBj8dgWSjO1r2zeKovFVE7/);
  assert.match(migration, /sophiasleiman13@gmail.com/);
  assert.match(migration, /ON CONFLICT \("session_id", "recipient_email", "kind"\) DO NOTHING/);
  assert.doesNotMatch(run, /viewerLinksTable|viewer_links/);
  assert.doesNotMatch(rules, /"viewer"/);
  assert.doesNotMatch(migration, /'viewer'/);
  assert.doesNotMatch(`${rules}\n${run}`, /clerkClient|createGoogleEvent|sendInvite|calendar\.events/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "recipient_email"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "audience"/);
  assert.match(
    migration,
    /student_session_reminder_sends_session_recipient_kind_idx/,
  );
  assert.match(migration, /"session_id", "recipient_email", "kind"/);
  assert.match(migration, /DROP INDEX IF EXISTS "student_session_reminder_sends_session_kind_idx"/);
  assert.equal(/DROP\s+TABLE/i.test(migration), false);
  assert.equal(/DROP\s+COLUMN/i.test(migration), false);
  assert.match(journal, /"tag": "0093_session_reminder_recipients"/);
});
