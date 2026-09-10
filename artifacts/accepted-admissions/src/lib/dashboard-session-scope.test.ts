import assert from "node:assert/strict";
import test from "node:test";
import { sessionsForDashboardRole, upcomingSessionsForDashboard } from "./dashboard-session-scope.ts";

const sat = { id: "sat", tutor: { id: "eunice" }, student: { id: "taito" } };
const english = { id: "eng", tutor: { id: "nika" }, student: { id: "taito" } };
const other = { id: "other", tutor: { id: "eunice" }, student: { id: "michelle" } };

test("tutors only see their assigned sessions", () => {
  assert.deepEqual(
    sessionsForDashboardRole([sat, english, other], { id: "eunice", role: "tutor" }).map((item) => item.id),
    ["sat", "other"],
  );
  assert.deepEqual(
    sessionsForDashboardRole([sat, english, other], { id: "nika", role: "tutor" }).map((item) => item.id),
    ["eng"],
  );
});

test("clients only see their assigned sessions", () => {
  assert.deepEqual(
    sessionsForDashboardRole([sat, english, other], { id: "taito", role: "student" }).map((item) => item.id),
    ["sat", "eng"],
  );
  assert.deepEqual(
    sessionsForDashboardRole([sat, english, other], { id: "michelle", role: "student" }).map((item) => item.id),
    ["other"],
  );
});

test("sessions with no student do not appear for a student or viewer", () => {
  const unassigned = { id: "open", tutor: { id: "eunice" }, student: null };
  assert.deepEqual(
    sessionsForDashboardRole([sat, unassigned], { id: "taito", role: "student" }).map((item) => item.id),
    ["sat"],
  );
  assert.deepEqual(
    sessionsForDashboardRole([unassigned], { id: "michelle", role: "viewer" }).map((item) => item.id),
    [],
  );
});

test("viewers see assigned student sessions without matching the viewer id", () => {
  assert.deepEqual(
    sessionsForDashboardRole([sat, english, other], { id: "parent", role: "viewer" }).map((item) => item.id),
    ["sat", "eng", "other"],
  );
});

test("student and tutor lists hide cancelled bookings; admin history may keep them", () => {
  const cancelled = { id: "cancelled", tutor: { id: "eunice" }, student: { id: "taito" }, bookingStatus: "cancelled" };
  const archived = { id: "archived", tutor: { id: "eunice" }, student: { id: "taito" }, status: "archived", bookingStatus: "confirmed" };
  const xavier = {
    id: "e66d31e8-b953-4a0c-a067-f30f142b4461",
    tutor: { id: "xavier" },
    student: { id: "sama" },
    bookingStatus: "cancelled",
    title: "SAT capability test — Xavier",
  };
  const live = { ...sat, bookingStatus: "confirmed" };
  assert.deepEqual(
    sessionsForDashboardRole([live, cancelled, archived], { id: "taito", role: "student" }).map((item) => item.id),
    ["sat"],
  );
  assert.deepEqual(
    sessionsForDashboardRole([live, cancelled], { id: "eunice", role: "tutor" }).map((item) => item.id),
    ["sat"],
  );
  assert.deepEqual(
    sessionsForDashboardRole([xavier], { id: "sama", role: "student" }).map((item) => item.id),
    [],
  );
  assert.deepEqual(
    sessionsForDashboardRole([live, cancelled], { id: "admin", role: "administrator" }).map((item) => item.id),
    ["sat", "cancelled"],
  );
  assert.deepEqual(
    upcomingSessionsForDashboard([live, cancelled, archived, xavier], { id: "admin", role: "administrator" }).map(
      (item) => item.id,
    ),
    ["sat"],
  );
});
