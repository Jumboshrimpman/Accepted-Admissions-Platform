import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  QUIZ_SUBMISSION_PORTAL_BASE_URL,
  canReceiveQuizSubmissionAlert,
  quizSubmissionAlertEmail,
  quizSubmissionAlertRecipient,
  quizSubmissionNotificationMessage,
  quizSubmissionNotificationTitle,
  truncateQuizTitle,
  wholePercent,
  type QuizSubmissionAlertEmailInput,
} from "./submission-alerts.ts";

function baseInput(
  overrides: Partial<QuizSubmissionAlertEmailInput> = {},
): QuizSubmissionAlertEmailInput {
  return {
    studentName: "Michelle Chen",
    studentEmail: "michelle@example.org",
    assignmentTitle: "Nov 1 Pre-work: Algebra and Functions",
    subject: "SAT Math",
    questionCount: 40,
    scorePercent: 72.5,
    correctCount: 29,
    totalCount: 40,
    sessionDateTime: new Date("2026-11-01T12:00:00.000Z"),
    sessionTimezone: "America/New_York",
    attemptId: "11111111-1111-4111-8111-111111111111",
    assignmentId: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}

test("subject names the student and the quiz", () => {
  const { subject } = quizSubmissionAlertEmail(baseInput());
  assert.match(subject, /^Quiz submitted: Michelle Chen — /);
  assert.match(subject, /Nov 1 Pre-work: Algebra and Functions/);
});

test("body carries the student, quiz, subject and a whole-number percent", () => {
  const { text } = quizSubmissionAlertEmail(baseInput());
  assert.match(text, /Student: Michelle Chen <michelle@example\.org>/);
  assert.match(text, /Quiz: Nov 1 Pre-work: Algebra and Functions/);
  assert.match(text, /Subject: SAT Math/);
  assert.match(text, /Score: 73% \(29 of 40 correct\)/);
  assert.doesNotMatch(text, /72\.5/);
});

test("body carries the attempt and assignment ids and points at the portal queue", () => {
  const { text } = quizSubmissionAlertEmail(baseInput());
  assert.match(text, /Attempt: 11111111-1111-4111-8111-111111111111/);
  assert.match(text, /Assignment: 22222222-2222-4222-8222-222222222222/);
  assert.match(text, /in the portal review queue/);
  assert.ok(text.includes(QUIZ_SUBMISSION_PORTAL_BASE_URL));
});

test("session date and start time render in the session's stored timezone", () => {
  // 13:00 UTC on Nov 1 is 8:00 AM EST: the clocks went back at 2 AM that morning.
  const { text } = quizSubmissionAlertEmail(
    baseInput({ sessionDateTime: new Date("2026-11-01T13:00:00.000Z") }),
  );
  assert.match(text, /Session: Sun, Nov 1, 2026, 8:00 AM EST \(America\/New_York\)/);
});

test("a session before the November clock change renders in daylight time", () => {
  // 13:00 UTC on Oct 25 is 9:00 AM EDT.
  const { text } = quizSubmissionAlertEmail(
    baseInput({ sessionDateTime: new Date("2026-10-25T13:00:00.000Z") }),
  );
  assert.match(text, /Session: Sun, Oct 25, 2026, 9:00 AM EDT \(America\/New_York\)/);
});

test("session date renders in a non-portal timezone the session actually stores", () => {
  const { text } = quizSubmissionAlertEmail(
    baseInput({
      sessionDateTime: new Date("2026-11-01T12:00:00.000Z"),
      sessionTimezone: "Asia/Dubai",
    }),
  );
  assert.match(text, /4:00 PM/);
  assert.match(text, /Asia\/Dubai/);
});

test("a missing session does not pretend to have a date", () => {
  const { text } = quizSubmissionAlertEmail(baseInput({ sessionDateTime: null }));
  assert.match(text, /Session: not scheduled/);
});

test("a null score says so plainly and never prints the string null", () => {
  const { subject, text } = quizSubmissionAlertEmail(
    baseInput({ scorePercent: null, correctCount: null, totalCount: null }),
  );
  assert.match(text, /Score: unavailable/);
  assert.doesNotMatch(text, /null/i);
  assert.doesNotMatch(subject, /null/i);
});

test("100% and 0% both render correctly", () => {
  const perfect = quizSubmissionAlertEmail(
    baseInput({ scorePercent: 100, correctCount: 40, totalCount: 40 }),
  );
  assert.match(perfect.text, /Score: 100% \(40 of 40 correct\)/);

  const zero = quizSubmissionAlertEmail(
    baseInput({ scorePercent: 0, correctCount: 0, totalCount: 40 }),
  );
  assert.match(zero.text, /Score: 0% \(0 of 40 correct\)/);
  assert.doesNotMatch(zero.text, /unavailable/);
});

test("a rounded percent never carries decimals from the stored float", () => {
  assert.equal(wholePercent(92.3076923076923), 92);
  assert.equal(wholePercent(66.666), 67);
  assert.equal(wholePercent(0), 0);
  assert.equal(wholePercent(100), 100);
  assert.equal(wholePercent(null), null);
  assert.equal(wholePercent(Number.NaN), null);
});

test("only tutors and administrators can ever be emailed", () => {
  assert.equal(canReceiveQuizSubmissionAlert("tutor"), true);
  assert.equal(canReceiveQuizSubmissionAlert("administrator"), true);
  assert.equal(canReceiveQuizSubmissionAlert("student"), false);
  assert.equal(canReceiveQuizSubmissionAlert("viewer"), false);
  assert.equal(canReceiveQuizSubmissionAlert(null), false);
  assert.equal(canReceiveQuizSubmissionAlert(undefined), false);
  assert.equal(canReceiveQuizSubmissionAlert(""), false);
});

test("a null or blank tutor email yields no recipient", () => {
  assert.equal(
    quizSubmissionAlertRecipient({ role: "tutor", email: null }),
    null,
  );
  assert.equal(quizSubmissionAlertRecipient({ role: "tutor", email: "" }), null);
  assert.equal(quizSubmissionAlertRecipient({ role: "tutor", email: "   " }), null);
  assert.equal(quizSubmissionAlertRecipient({ role: null, email: null }), null);
});

test("a wrong role with a real email still yields no recipient", () => {
  assert.equal(
    quizSubmissionAlertRecipient({ role: "student", email: "michelle@example.org" }),
    null,
  );
  assert.equal(
    quizSubmissionAlertRecipient({ role: "viewer", email: "parent@example.org" }),
    null,
  );
});

test("a tutor with a real email is the one recipient", () => {
  assert.equal(
    quizSubmissionAlertRecipient({ role: "tutor", email: " eunice_chon@berkeley.edu " }),
    "eunice_chon@berkeley.edu",
  );
});

test("a long assignment title is truncated in the subject", () => {
  const long = "Practice set ".repeat(20).trim();
  const { subject } = quizSubmissionAlertEmail(baseInput({ assignmentTitle: long }));
  assert.ok(subject.length < 160, `subject was ${subject.length} chars`);
  assert.match(subject, /…$/);
  assert.ok(!subject.includes(long));
  assert.equal(truncateQuizTitle("Short title"), "Short title");
});

test("notification copy names the student, the quiz and the percent", () => {
  const title = quizSubmissionNotificationTitle({
    studentName: "Michelle Chen",
    assignmentTitle: "Nov 1 Pre-work",
  });
  assert.match(title, /Quiz submitted/);
  assert.match(title, /Michelle Chen/);
  assert.match(title, /Nov 1 Pre-work/);

  const message = quizSubmissionNotificationMessage({
    studentName: "Michelle Chen",
    assignmentTitle: "Nov 1 Pre-work",
    scorePercent: 72.5,
  });
  assert.equal(message, "Michelle Chen submitted Nov 1 Pre-work — 73%");

  const noScore = quizSubmissionNotificationMessage({
    studentName: "Michelle Chen",
    assignmentTitle: "Nov 1 Pre-work",
    scorePercent: null,
  });
  assert.match(noScore, /score unavailable/);
  assert.doesNotMatch(noScore, /null/i);
});
