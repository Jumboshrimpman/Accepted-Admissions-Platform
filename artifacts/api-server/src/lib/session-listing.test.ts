import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  hidesCancelledSessions,
  isCancelledBooking,
  isStudentCurriculumSession,
} from "./session-listing.ts";

test("cancelled bookings are excluded from student and tutor lists", () => {
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
