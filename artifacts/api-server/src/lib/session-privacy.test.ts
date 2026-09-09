import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  canClearSessionHomework,
  hidesCancelledSessions,
  isCancelledBooking,
  isStudentCurriculumSession,
} from "./session-privacy.ts";

const session = { tutorUserId: "tutor-assigned" };

test("admin and the session tutor can clear homework; student, viewer, and unrelated tutor cannot", () => {
  assert.equal(
    canClearSessionHomework({ id: "admin-1", role: "administrator" }, session),
    true,
  );
  assert.equal(
    canClearSessionHomework({ id: "tutor-assigned", role: "tutor" }, session),
    true,
  );
  assert.equal(
    canClearSessionHomework({ id: "tutor-other", role: "tutor" }, session),
    false,
  );
  assert.equal(
    canClearSessionHomework({ id: "student-1", role: "student" }, session),
    false,
  );
  assert.equal(
    canClearSessionHomework({ id: "viewer-1", role: "viewer" }, session),
    false,
  );
});

test("cancelled bookings are excluded from student curriculum destinations", () => {
  assert.equal(isCancelledBooking({ bookingStatus: "cancelled" }), true);
  assert.equal(isCancelledBooking({ bookingStatus: "confirmed" }), false);
  assert.equal(isCancelledBooking({ bookingStatus: "rescheduled" }), false);
  assert.equal(isStudentCurriculumSession({ bookingStatus: "cancelled", status: "published" }), false);
  assert.equal(isStudentCurriculumSession({ bookingStatus: "confirmed", status: "completed" }), true);
  assert.equal(isStudentCurriculumSession({ bookingStatus: "confirmed", status: "published" }), true);
  assert.equal(hidesCancelledSessions("student"), true);
  assert.equal(hidesCancelledSessions("tutor"), true);
  assert.equal(hidesCancelledSessions("viewer"), true);
  assert.equal(hidesCancelledSessions("administrator"), false);
});
