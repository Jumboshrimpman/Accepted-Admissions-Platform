import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  assignmentTiedToCancelledSession,
  hidesCancelledSessions,
  isCancelledBooking,
  isStudentCurriculumSession,
  isUpcomingListedSession,
  liveClientBookingSessions,
} from "./session-listing.ts";

test("cancelled bookings are excluded from student and tutor lists", () => {
  assert.equal(isCancelledBooking({ bookingStatus: "cancelled" }), true);
  assert.equal(isCancelledBooking({ bookingStatus: "Canceled" }), true);
  assert.equal(isCancelledBooking({ cancelledAt: "2026-09-07T20:00:00.000Z" }), true);
  assert.equal(isCancelledBooking({ bookingStatus: "confirmed" }), false);
  assert.equal(isCancelledBooking({ bookingStatus: "rescheduled" }), false);
  assert.equal(isStudentCurriculumSession({ bookingStatus: "cancelled", status: "published" }), false);
  assert.equal(isStudentCurriculumSession({ bookingStatus: "confirmed", status: "archived" }), false);
  assert.equal(isStudentCurriculumSession({ bookingStatus: "confirmed", status: "completed" }), true);
  assert.equal(isStudentCurriculumSession({ bookingStatus: "confirmed", status: "published" }), true);
  assert.equal(hidesCancelledSessions("student"), true);
  assert.equal(hidesCancelledSessions("tutor"), true);
  assert.equal(hidesCancelledSessions("viewer"), true);
  assert.equal(hidesCancelledSessions("administrator"), false);
});

test("client booked-session lists drop the cancelled Sep 7 Xavier meeting", () => {
  const live = {
    id: "live",
    title: "Michelle’s SAT Session with Xavier",
    bookingStatus: "confirmed",
    status: "published",
  };
  const cancelledXavier = {
    id: "e66d31e8-b953-4a0c-a067-f30f142b4461",
    title: "SAT capability test — Xavier",
    dateTime: "2026-09-07T20:00:00.000Z",
    bookingStatus: "cancelled",
    status: "published",
  };
  assert.deepEqual(
    liveClientBookingSessions([live, cancelledXavier]).map((session) => session.id),
    ["live"],
  );
});

test("student curriculum hides homework still attached to cancelled samapostgrad sessions", () => {
  const cancelledSessionIds = new Set([
    "e66d31e8-b953-4a0c-a067-f30f142b4461",
    "d04f811e-724d-4ece-8939-d26de486817e",
    "e362b8c7-542d-41df-9ac9-67da66af3f0c",
  ]);
  for (const sessionId of cancelledSessionIds) {
    assert.equal(assignmentTiedToCancelledSession({ sessionId }, cancelledSessionIds), true);
  }
  assert.equal(
    assignmentTiedToCancelledSession(
      { sessionId: "1cc3dea5-9532-4dc2-9cea-3d1e5d65d119" },
      cancelledSessionIds,
    ),
    false,
  );
  assert.equal(assignmentTiedToCancelledSession({ sessionId: null }, cancelledSessionIds), false);
});

test("upcoming lists omit cancelled meetings even when the date is still in the future", () => {
  const now = Date.parse("2026-09-10T00:00:00.000Z");
  const live = {
    dateTime: "2026-10-02T16:00:00.000Z",
    bookingStatus: "confirmed",
    status: "published",
  };
  const cancelled = {
    dateTime: "2026-10-02T17:00:00.000Z",
    bookingStatus: "cancelled",
    status: "published",
  };
  const cancelledAtOnly = {
    dateTime: "2026-10-02T18:00:00.000Z",
    bookingStatus: "confirmed",
    status: "published",
    cancelledAt: "2026-09-07T20:00:00.000Z",
  };
  assert.equal(isUpcomingListedSession(live, now), true);
  assert.equal(isUpcomingListedSession(cancelled, now), false);
  assert.equal(isUpcomingListedSession(cancelledAtOnly, now), false);
});
