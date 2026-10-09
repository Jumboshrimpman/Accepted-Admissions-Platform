import assert from "node:assert/strict";
import test from "node:test";
import {
  answeredQuestionCount,
  canSubmitStudentAttempt,
  allowsInSessionPerQuestionFeedback,
  allowsPartialInSessionSubmit,
  isCollaborativeSessionPractice,
  isInSessionHomeworkCompletion,
  isInProgressAttemptStatus,
  isQuestionFeedbackRevealed,
  normalizeQuestionIndex,
  shouldAutoSubmitOnExpiry,
  inSessionPracticeHref,
  resolveInSessionPracticeLink,
  studentAssignmentActionLabel,
  quizResponsesForPause,
  quizTimerLeaveAction,
  studentAssignmentHref,
  studentCanSeeAnswerChoices,
  isAttemptUuid,
  isBrokenEmptyClientAttempt,
  shouldRequestAttemptResult,
  studentSeesFinishedResult,
  studentSeesPredictionStep,
  wantsResumeAttempt,
} from "./student-attempt-ui.ts";

test("prediction cannot appear or auto-advance the student flow", () => {
  assert.equal(studentSeesPredictionStep(true), false);
  assert.equal(studentSeesPredictionStep(false), false);
  assert.equal(studentCanSeeAnswerChoices(), true);
});

test("empty submit is blocked and cannot glitch forward to results", () => {
  assert.equal(answeredQuestionCount({}), 0);
  assert.equal(answeredQuestionCount({ q1: { finalAnswer: "" }, q2: { finalAnswer: "   " } }), 0);
  assert.deepEqual(canSubmitStudentAttempt({ answeredCount: 0 }), { ok: false, reason: "empty" });
  assert.equal(shouldAutoSubmitOnExpiry(0), false);
  assert.deepEqual(canSubmitStudentAttempt({ answeredCount: 2 }), { ok: true, reason: "ok" });
  assert.equal(shouldAutoSubmitOnExpiry(1), true);
});

test("an empty submitted attempt is still a takeable quiz", () => {
  assert.equal(
    isBrokenEmptyClientAttempt({ status: "submitted", hasResult: false, responses: [] }),
    true,
  );
  assert.equal(
    isBrokenEmptyClientAttempt({ status: "expired", hasResult: false, responses: [] }),
    true,
  );
  assert.equal(
    isBrokenEmptyClientAttempt({
      status: "submitted",
      hasResult: false,
      responses: [{ finalAnswer: "a" }],
    }),
    false,
  );
  assert.equal(
    isBrokenEmptyClientAttempt({ status: "submitted", hasResult: true, responses: [] }),
    false,
  );
  assert.equal(
    isBrokenEmptyClientAttempt({ status: "active", hasResult: false, responses: [] }),
    false,
  );
});

test("in-session practice is collaborative, not a prediction quiz", () => {
  assert.equal(isCollaborativeSessionPractice("during_session"), true);
  assert.equal(isCollaborativeSessionPractice("before_session"), false);
  assert.equal(
    isCollaborativeSessionPractice("during_session", "In-session homework completion"),
    false,
  );
  assert.equal(
    isInSessionHomeworkCompletion({
      deliveryPhase: "during_session",
      title: "In-session homework completion",
    }),
    true,
  );
  assert.equal(
    allowsPartialInSessionSubmit({
      deliveryPhase: "during_session",
      title: "In-session homework completion",
    }),
    true,
  );
  assert.equal(allowsInSessionPerQuestionFeedback({ deliveryPhase: "during_session" }), true);
  assert.equal(allowsInSessionPerQuestionFeedback({ deliveryPhase: "before_session" }), false);
  assert.equal(isQuestionFeedbackRevealed({ revealed: true, correct: false }), true);
  assert.equal(isQuestionFeedbackRevealed({ revealed: false, correct: null }), false);
});

test("attempt results are not requested without a uuid or before submit", () => {
  const attemptId = "d1e2452c-67f2-42ad-add7-bacaac535714";
  assert.equal(isAttemptUuid(attemptId), true);
  assert.equal(isAttemptUuid(""), false);
  assert.equal(isAttemptUuid("result"), false);
  assert.equal(shouldRequestAttemptResult(null, "submitted"), false);
  assert.equal(shouldRequestAttemptResult("", "submitted"), false);
  assert.equal(shouldRequestAttemptResult(attemptId, "active"), false);
  assert.equal(shouldRequestAttemptResult(attemptId, "paused"), false);
  assert.equal(shouldRequestAttemptResult(attemptId, "submitted"), true);
  assert.equal(shouldRequestAttemptResult(attemptId, "expired"), true);
});

test("resume copy and href restore an in-progress quiz from the portal", () => {
  assert.equal(isInProgressAttemptStatus("paused"), true);
  assert.equal(isInProgressAttemptStatus("submitted"), false);
  assert.equal(studentAssignmentActionLabel("paused"), "Resume");
  assert.equal(studentAssignmentActionLabel("active"), "Resume");
  assert.equal(studentAssignmentActionLabel(null), "Start pre-work");
  assert.equal(studentAssignmentActionLabel("paused", true), "Resume");
  assert.equal(studentAssignmentHref("asg-1", "paused"), "/portal/assignments/asg-1?resume=1");
  assert.equal(studentAssignmentHref("asg-1", null), "/portal/assignments/asg-1");
  assert.equal(wantsResumeAttempt("resume=1"), true);
  assert.equal(wantsResumeAttempt("foo=1"), false);
  assert.equal(normalizeQuestionIndex(7, 3), 2);
});

test("leaving a timed quiz pauses, and a tab switch resumes", () => {
  const active = { viewer: false, status: "active", intentionalExit: false, autoPaused: false };
  assert.equal(quizTimerLeaveAction({ ...active, event: "pause-click" }), "pause");
  assert.equal(quizTimerLeaveAction({ ...active, event: "pagehide" }), "pause");
  assert.equal(quizTimerLeaveAction({ ...active, event: "unmount" }), "pause");
  assert.equal(quizTimerLeaveAction({ ...active, event: "hidden" }), "pause");
  assert.equal(quizTimerLeaveAction({ ...active, event: "visible" }), "none");
  assert.equal(
    quizTimerLeaveAction({ ...active, event: "hidden", autoPaused: true }),
    "none",
  );
  assert.equal(
    quizTimerLeaveAction({ ...active, event: "pagehide", viewer: true }),
    "none",
  );
  const away = { viewer: false, status: "paused", intentionalExit: false, autoPaused: true };
  assert.equal(quizTimerLeaveAction({ ...away, event: "visible" }), "resume");
  assert.equal(quizTimerLeaveAction({ ...away, event: "pause-click" }), "none");
  assert.equal(
    quizTimerLeaveAction({ ...away, event: "visible", intentionalExit: true }),
    "none",
  );
  assert.equal(
    quizTimerLeaveAction({ ...away, event: "visible", autoPaused: false }),
    "none",
  );
  assert.equal(
    quizTimerLeaveAction({
      event: "hidden",
      viewer: false,
      status: "paused",
      intentionalExit: false,
      autoPaused: false,
    }),
    "none",
  );
  assert.equal(
    quizTimerLeaveAction({
      event: "pagehide",
      viewer: false,
      status: "submitted",
      intentionalExit: false,
      autoPaused: false,
    }),
    "none",
  );
});

test("pause stores answered items and review flags", () => {
  assert.deepEqual(
    quizResponsesForPause({
      q1: { finalAnswer: "a", flagged: true },
      q2: { finalAnswer: "  ", flagged: false },
      q3: { finalAnswer: "", flagged: true },
      q4: undefined,
    }),
    [
      { questionId: "q1", finalAnswer: "a", flagged: true },
      { questionId: "q3", finalAnswer: null, flagged: true },
    ],
  );
});

test("in-session practice link targets the quiz generated from homework results", () => {
  assert.equal(
    inSessionPracticeHref("practice-quiz-1", null),
    "/portal/assignments/practice-quiz-1",
  );
  assert.equal(
    inSessionPracticeHref("practice-quiz-1", "paused"),
    "/portal/assignments/practice-quiz-1?resume=1",
  );
  assert.equal(inSessionPracticeHref("  ", null), null);
  const target = resolveInSessionPracticeLink({
    duringAssignmentId: "practice-from-homework",
    attachedQuestionCount: 4,
    assignments: [
      {
        id: "generic-bank",
        deliveryPhase: "during_session",
        questionCount: 12,
        latestAttemptStatus: null,
      },
      {
        id: "practice-from-homework",
        deliveryPhase: "during_session",
        questionCount: 4,
        latestAttemptStatus: "active",
      },
    ],
  });
  assert.deepEqual(target, {
    assignmentId: "practice-from-homework",
    attemptStatus: "active",
  });
  assert.equal(
    inSessionPracticeHref(target?.assignmentId, target?.attemptStatus),
    "/portal/assignments/practice-from-homework?resume=1",
  );
  assert.equal(
    resolveInSessionPracticeLink({
      duringAssignmentId: "practice-from-homework",
      attachedQuestionCount: 3,
      assignments: [],
    })?.assignmentId,
    "practice-from-homework",
  );
});

test("timer expiry with zero answers does not show a finished result", () => {
  assert.equal(
    studentSeesFinishedResult({ status: "expired", hasResult: false, resultError: true }),
    false,
  );
  assert.equal(studentSeesFinishedResult({ status: "expired", hasResult: false }), false);
  assert.equal(studentSeesFinishedResult({ status: "active", hasResult: false }), false);
  assert.equal(studentSeesFinishedResult({ status: "expired", hasResult: true }), true);
});
