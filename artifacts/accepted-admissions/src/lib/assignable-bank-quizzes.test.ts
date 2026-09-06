import assert from "node:assert/strict";
import test from "node:test";
import {
  BANK_QUIZ_EMPTY_STATE,
  assignableBankQuizzes,
  bankQuizOptionLabel,
  isReusableBankQuiz,
  type BankQuizCandidate,
} from "./assignable-bank-quizzes.ts";

function quiz(overrides: Partial<BankQuizCandidate> = {}): BankQuizCandidate {
  return {
    id: "quiz-bank",
    courseId: "course-1",
    sessionId: null,
    title: "Full SAT Practice Diagnostic",
    status: "published",
    deliveryPhase: "before_session",
    questionCount: 10,
    ...overrides,
  };
}

test("reusable bank quizzes are session-less, published or draft, and before-session", () => {
  assert.equal(isReusableBankQuiz(quiz()), true);
  assert.equal(isReusableBankQuiz(quiz({ status: "draft" })), true);
  assert.equal(isReusableBankQuiz(quiz({ sessionId: "session-1" })), false);
  assert.equal(isReusableBankQuiz(quiz({ status: "archived" })), false);
  assert.equal(isReusableBankQuiz(quiz({ status: "completed" })), false);
  assert.equal(isReusableBankQuiz(quiz({ deliveryPhase: "during_session" })), false);
});

test("assign dropdown only includes sessionId-null bank quizzes and dedupes by id", () => {
  const assignable = assignableBankQuizzes(
    [
      quiz({ id: "quiz-bank" }),
      quiz({ id: "quiz-bank" }),
      quiz({
        id: "quiz-clone",
        sessionId: "session-2",
        title: "Full SAT Practice Diagnostic",
      }),
      quiz({
        id: "quiz-other-program",
        courseId: "course-2",
      }),
      quiz({
        id: "quiz-archived",
        status: "archived",
      }),
    ],
    { id: "session-1", courseId: "course-1" },
  );

  assert.deepEqual(
    assignable.map((item) => item.id),
    ["quiz-bank"],
  );
});

test("option labels are title and question count without currently-session text", () => {
  const label = bankQuizOptionLabel({
    title: "Full SAT Practice Diagnostic",
    questionCount: 10,
  });
  assert.equal(label, "Full SAT Practice Diagnostic · 10 questions");
  assert.doesNotMatch(label, /currently/i);
  assert.equal(
    BANK_QUIZ_EMPTY_STATE,
    "Create a quiz in the Quizzes workspace (no session) first.",
  );
});

test("a bank quiz already cloned onto the current session is not offered again", () => {
  const assignable = assignableBankQuizzes(
    [
      quiz({ id: "quiz-bank" }),
      quiz({
        id: "quiz-clone",
        sessionId: "session-1",
        title: "Full SAT Practice Diagnostic",
      }),
    ],
    { id: "session-1", courseId: "course-1" },
  );
  assert.deepEqual(assignable, []);
});

test("a renamed session clone does not hide the bank quiz (no clone lineage on payload)", () => {
  const assignable = assignableBankQuizzes(
    [
      quiz({ id: "quiz-bank" }),
      quiz({
        id: "quiz-clone",
        sessionId: "session-1",
        title: "Renamed session copy",
      }),
    ],
    { id: "session-1", courseId: "course-1" },
  );
  assert.deepEqual(
    assignable.map((item) => item.id),
    ["quiz-bank"],
  );
});
