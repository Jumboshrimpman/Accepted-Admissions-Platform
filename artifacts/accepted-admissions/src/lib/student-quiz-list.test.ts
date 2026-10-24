import assert from "node:assert/strict";
import test from "node:test";
import { isPastSession } from "./session-display.ts";
import {
  FACTORING_QUIZ_FOLLOW_UP_TITLE,
  OCT18_SESSION_REVIEW_TITLE,
  GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  SAT_MATH_FOLLOW_UP_TITLE,
  classifyStudentQuizzes,
  collapsedStudentQuizzes,
  isPostSessionFollowUpQuiz,
  isStandaloneStudentTodo,
  sessionCalendarDayIsPast,
  studentQuizActionLabel,
} from "./student-quiz-list.ts";

function quiz(overrides: Record<string, unknown> = {}) {
  return {
    id: "quiz-1",
    title: "Session pre-work",
    sessionId: "session-1",
    subject: "SAT",
    status: "published" as const,
    deadline: null,
    questionCount: 5,
    timeLimitMinutes: 20,
    attemptCount: 0,
    maxAttempts: 1,
    latestScore: null,
    latestAttemptId: null,
    latestAttemptStatus: null,
    ...overrides,
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    dateTime: "2026-09-24T06:00:00.000Z",
    timezone: "Asia/Dubai",
    preparation: { id: "quiz-1" },
    ...overrides,
  };
}

test("student timezone decides the session calendar day ahead of the stored session zone", () => {
  const meeting = {
    id: "session-1",
    dateTime: "2026-09-24T00:00:00.000Z",
    timezone: "America/New_York",
  };
  const now = new Date("2026-09-24T05:00:00.000Z");
  assert.equal(sessionCalendarDayIsPast(meeting, now, "Asia/Dubai"), false);
  assert.equal(sessionCalendarDayIsPast(meeting, now, "America/New_York"), true);
  assert.equal(sessionCalendarDayIsPast(meeting, now, null), true);
});

test("Dubai's next calendar day completes the quiz while UTC is still the session day", () => {
  const meeting = {
    id: "session-1",
    dateTime: "2026-09-23T17:00:00.000Z",
    timezone: "UTC",
  };
  const now = new Date("2026-09-23T22:00:00.000Z");
  assert.equal(sessionCalendarDayIsPast(meeting, now, "Asia/Dubai"), true);
  assert.equal(sessionCalendarDayIsPast(meeting, now, "UTC"), false);
});

test("a session that already ended stays open until that local calendar day ends", () => {
  const meeting = {
    dateTime: "2026-09-24T06:00:00.000Z",
    timezone: "Asia/Dubai",
    durationMinutes: 60,
  };
  const now = new Date("2026-09-24T14:00:00.000Z");
  assert.equal(isPastSession(meeting, now), true);
  assert.equal(sessionCalendarDayIsPast(meeting, now, "Asia/Dubai"), false);
});

test("past-session quizzes are completed and collapsed; today and future stay prominent", () => {
  const now = new Date("2026-09-24T14:00:00.000Z");
  const assignments = [
    quiz({
      id: "past-prework",
      title: "Yesterday pre-work",
      sessionId: "past-session",
      latestAttemptStatus: null,
    }),
    quiz({
      id: "past-live",
      title: "Yesterday in-session work",
      sessionId: "past-session",
      deliveryPhase: "during_session",
      latestAttemptStatus: "active",
    }),
    quiz({
      id: "today-quiz",
      title: "Today pre-work",
      sessionId: "today-session",
      latestAttemptStatus: null,
    }),
    quiz({
      id: "future-quiz",
      title: "Upcoming pre-work",
      sessionId: "future-session",
      latestAttemptStatus: "paused",
    }),
    quiz({
      id: "unlinked",
      title: "Standalone diagnostic",
      sessionId: null,
      deadline: "2000-01-01T00:00:00.000Z",
      latestAttemptStatus: null,
    }),
  ];
  const sessions = [
    session({
      id: "past-session",
      dateTime: "2026-09-23T17:00:00.000Z",
      preparation: { id: "past-prework" },
    }),
    session({
      id: "today-session",
      dateTime: "2026-09-24T06:00:00.000Z",
      preparation: { id: "today-quiz" },
    }),
    session({
      id: "future-session",
      dateTime: "2026-09-26T16:00:00.000Z",
      preparation: { id: "future-quiz" },
    }),
  ];
  const classified = classifyStudentQuizzes(assignments, sessions, {
    now,
    clientTimezone: "Asia/Dubai",
  });
  assert.deepEqual(
    classified.archived.map((item) => [item.assignment.id, item.status]),
    [
      ["past-live", "Complete"],
      ["past-prework", "Complete"],
    ],
  );
  assert.deepEqual(
    classified.open.map((item) => [item.assignment.id, item.status]),
    [
      ["unlinked", "Past due"],
      ["future-quiz", "In progress"],
      ["today-quiz", "Not started"],
    ],
  );

  const collapsed = collapsedStudentQuizzes(assignments, sessions, {
    expanded: false,
    now,
    clientTimezone: "Asia/Dubai",
  });
  assert.deepEqual(
    collapsed.visible.map((item) => item.assignment.id),
    ["today-quiz", "future-quiz", "unlinked"],
  );
  assert.equal(collapsed.canToggle, true);

  const expanded = collapsedStudentQuizzes(assignments, sessions, {
    expanded: true,
    now,
    clientTimezone: "Asia/Dubai",
  });
  assert.deepEqual(
    expanded.visible.map((item) => item.assignment.id),
    ["today-quiz", "future-quiz", "unlinked", "past-live", "past-prework"],
  );
});

test("upcoming session pre-work stays at the top with its real question count", () => {
  const now = new Date("2026-10-16T14:00:00.000Z");
  const fillers = ["Algebra drill", "Biology drill", "Chemistry drill", "History drill"].map(
    (title, index) =>
      quiz({
        id: `filler-${index}`,
        title,
        sessionId: null,
        questionCount: 2,
      }),
  );
  const collapsed = collapsedStudentQuizzes(
    [
      ...fillers,
      quiz({
        id: "empty-english",
        title: "IELTS-style diagnostic reading",
        sessionId: "english-oct-23",
        subject: "IELTS",
        questionCount: 0,
      }),
      quiz({
        id: "english-24",
        title: "IELTS-style diagnostic reading",
        sessionId: "english-oct-23",
        subject: "IELTS",
        questionCount: 24,
      }),
    ],
    [
      session({
        id: "english-oct-23",
        dateTime: "2026-10-23T16:00:00.000Z",
        timezone: "America/New_York",
        preparation: { id: "english-24" },
      }),
    ],
    { expanded: false, now, clientTimezone: "Asia/Tokyo" },
  );
  assert.equal(collapsed.visible[0]?.assignment.id, "english-24");
  assert.equal(collapsed.visible[0]?.assignment.questionCount, 24);
  assert.equal(
    collapsed.visible.some((item) => item.assignment.id === "empty-english"),
    false,
  );
  assert.equal(collapsed.ordered.some((item) => item.assignment.id === "empty-english"), false);
});

test("Geometry SAT Questions stays open after the linked session day", () => {
  const now = new Date("2026-09-24T14:00:00.000Z");
  const followUp = quiz({
    id: "geometry-follow-up",
    title: GEOMETRY_SAT_FOLLOW_UP_TITLE,
    sessionId: "past-session",
    latestAttemptStatus: null,
  });
  const classified = classifyStudentQuizzes(
    [followUp],
    [session({ id: "past-session", dateTime: "2026-09-23T17:00:00.000Z" })],
    { now, clientTimezone: "Asia/Dubai" },
  );
  assert.equal(classified.open.length, 1);
  assert.equal(classified.archived.length, 0);
  assert.equal(classified.open[0]?.status, "Not started");
  assert.equal(classified.open[0]?.pastSessionDay, false);
  assert.equal(
    studentQuizActionLabel(classified.open[0]!, false),
    "Start quiz",
  );
});

test("Geometry Area and Volume stays open as a follow-up after the session day", () => {
  const now = new Date("2026-09-24T14:00:00.000Z");
  const followUp = quiz({
    id: "area-volume-follow-up",
    title: GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
    sessionId: "past-session",
    latestAttemptStatus: null,
  });
  const classified = classifyStudentQuizzes(
    [followUp],
    [session({ id: "past-session", dateTime: "2026-09-23T17:00:00.000Z" })],
    { now, clientTimezone: "Asia/Dubai" },
  );
  assert.equal(classified.open.length, 1);
  assert.equal(classified.archived.length, 0);
  assert.equal(classified.open[0]?.status, "Not started");
  assert.equal(studentQuizActionLabel(classified.open[0]!, false), "Start quiz");
});

test("Geometry Area and Volume with no session is an open standalone to-do", () => {
  const now = new Date("2026-09-24T14:00:00.000Z");
  const followUp = quiz({
    id: "area-volume-todo",
    title: GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
    sessionId: null,
    latestAttemptStatus: null,
  });
  assert.equal(isStandaloneStudentTodo(followUp), true);
  const classified = classifyStudentQuizzes([followUp], [], { now, clientTimezone: "Asia/Dubai" });
  assert.equal(classified.open.length, 1);
  assert.equal(classified.archived.length, 0);
  assert.equal(classified.open[0]?.status, "Not started");
  assert.equal(studentQuizActionLabel(classified.open[0]!, false), "Start quiz");
});

test("SAT Math Problems and Factoring Quiz stay open after the linked session day", () => {
  const now = new Date("2026-09-24T14:00:00.000Z");
  const sessions = [session({ id: "past-session", dateTime: "2026-09-23T17:00:00.000Z" })];
  for (const title of [SAT_MATH_FOLLOW_UP_TITLE, FACTORING_QUIZ_FOLLOW_UP_TITLE]) {
    const followUp = quiz({
      id: title,
      title,
      sessionId: "past-session",
      latestAttemptStatus: null,
    });
    const classified = classifyStudentQuizzes([followUp], sessions, {
      now,
      clientTimezone: "Asia/Dubai",
    });
    assert.equal(classified.open.length, 1);
    assert.equal(classified.archived.length, 0);
    assert.equal(studentQuizActionLabel(classified.open[0]!, false), "Start quiz");
  }
  const preview = quiz({
    id: "factoring-preview",
    title: FACTORING_QUIZ_FOLLOW_UP_TITLE,
    sessionId: null,
    latestAttemptStatus: null,
  });
  assert.equal(isStandaloneStudentTodo(preview), true);
  const standalone = classifyStudentQuizzes([preview], [], { now, clientTimezone: "Asia/Dubai" });
  assert.equal(standalone.open.length, 1);
  assert.equal(studentQuizActionLabel(standalone.open[0]!, false), "Start quiz");
});

test("open follow-up quizzes stay visible when more than three quizzes are open", () => {
  const now = new Date("2026-10-07T14:00:00.000Z");
  const sessions = [session({ id: "past-session", dateTime: "2026-10-04T06:00:00.000Z" })];
  const collapsed = collapsedStudentQuizzes(
    [
      quiz({ id: "algebra", title: "Algebra pre-work", sessionId: "past-session" }),
      quiz({ id: "biology", title: "Biology pre-work", sessionId: null }),
      quiz({ id: "chemistry", title: "Chemistry pre-work", sessionId: null }),
      quiz({
        id: "geometry-sat",
        title: GEOMETRY_SAT_FOLLOW_UP_TITLE,
        sessionId: "past-session",
      }),
      quiz({
        id: "geometry-area",
        title: GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
        sessionId: "past-session",
      }),
      quiz({
        id: "factoring",
        title: FACTORING_QUIZ_FOLLOW_UP_TITLE,
        sessionId: "past-session",
      }),
      quiz({
        id: "sat-math",
        title: SAT_MATH_FOLLOW_UP_TITLE,
        sessionId: "past-session",
      }),
    ],
    sessions,
    { expanded: false, now, clientTimezone: "Asia/Dubai" },
  );
  assert.deepEqual(
    collapsed.visible.map((item) => item.assignment.title),
    [
      "Biology pre-work",
      "Chemistry pre-work",
      FACTORING_QUIZ_FOLLOW_UP_TITLE,
      GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
      GEOMETRY_SAT_FOLLOW_UP_TITLE,
      SAT_MATH_FOLLOW_UP_TITLE,
    ],
  );
  assert.equal(
    collapsed.archived.some((item) => item.assignment.id === "algebra"),
    true,
  );
  assert.equal(collapsed.visible.some((item) => item.assignment.id === "algebra"), false);
  assert.equal(collapsed.canToggle, true);
  for (const title of [
    GEOMETRY_SAT_FOLLOW_UP_TITLE,
    GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
    SAT_MATH_FOLLOW_UP_TITLE,
    FACTORING_QUIZ_FOLLOW_UP_TITLE,
  ]) {
    const item = collapsed.visible.find((quizItem) => quizItem.assignment.title === title);
    assert.equal(item?.status, "Not started");
    assert.equal(item?.pastSessionDay, false);
  }
});

test("a scored past-session quiz keeps its result and still archives", () => {
  const now = new Date("2026-09-24T14:00:00.000Z");
  const collapsed = collapsedStudentQuizzes(
    [
      quiz({
        id: "scored",
        title: "Yesterday scored pre-work",
        latestAttemptStatus: "submitted",
        latestScore: 85,
      }),
    ],
    [session({ dateTime: "2026-09-23T17:00:00.000Z" })],
    { expanded: false, now, clientTimezone: "Asia/Dubai" },
  );
  assert.equal(collapsed.visible.length, 0);
  assert.equal(collapsed.archived[0]?.status, "85%");
  assert.equal(collapsed.canToggle, true);
});

test("Oct 18 session review stays on the dashboard after the session day", () => {
  const now = new Date("2026-10-24T14:00:00.000Z");
  assert.equal(OCT18_SESSION_REVIEW_TITLE, "Oct 18 Session Review Quiz");
  assert.equal(isPostSessionFollowUpQuiz({ title: OCT18_SESSION_REVIEW_TITLE }), true);
  const collapsed = collapsedStudentQuizzes(
    [
      quiz({
        id: "oct18",
        title: OCT18_SESSION_REVIEW_TITLE,
        sessionId: "past-session",
        questionCount: 12,
      }),
    ],
    [session({ id: "past-session", dateTime: "2026-10-18T17:00:00.000Z" })],
    { expanded: false, now, clientTimezone: "Asia/Dubai" },
  );
  assert.equal(collapsed.visible.length, 1);
  assert.equal(collapsed.visible[0]?.assignment.title, OCT18_SESSION_REVIEW_TITLE);
  assert.equal(collapsed.visible[0]?.pastSessionDay, false);
  assert.equal(studentQuizActionLabel(collapsed.visible[0]!, false), "Start quiz");
});
