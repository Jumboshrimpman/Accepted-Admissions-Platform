import assert from "node:assert/strict";
import test from "node:test";
import {
  isStandaloneStudentQuiz,
  tutorOwnsStandaloneQuiz,
} from "./standalone-quiz-access.ts";

const geometry = {
  sessionId: null,
  assignedStudentUserId: "michelle",
  assignedTutorUserId: "xavier",
};

test("a session-less assigned quiz is a standalone student to-do", () => {
  assert.equal(isStandaloneStudentQuiz(geometry), true);
  assert.equal(
    isStandaloneStudentQuiz({ sessionId: "session-1", assignedStudentUserId: "michelle" }),
    false,
  );
  assert.equal(isStandaloneStudentQuiz({ sessionId: null, assignedStudentUserId: null }), false);
});

test("only the assigned tutor reviews a standalone quiz for that student", () => {
  assert.equal(
    tutorOwnsStandaloneQuiz({
      tutorUserId: "xavier",
      studentUserId: "michelle",
      assignment: geometry,
    }),
    true,
  );
  assert.equal(
    tutorOwnsStandaloneQuiz({
      tutorUserId: "xavier",
      studentUserId: "sama",
      assignment: { ...geometry, assignedStudentUserId: "sama" },
    }),
    true,
  );
  assert.equal(
    tutorOwnsStandaloneQuiz({
      tutorUserId: "eunice",
      studentUserId: "michelle",
      assignment: geometry,
    }),
    false,
  );
  assert.equal(
    tutorOwnsStandaloneQuiz({
      tutorUserId: "xavier",
      studentUserId: "taito",
      assignment: geometry,
    }),
    false,
  );
  assert.equal(
    tutorOwnsStandaloneQuiz({
      tutorUserId: "xavier",
      studentUserId: "michelle",
      assignment: { ...geometry, sessionId: "session-1" },
    }),
    false,
  );
});
