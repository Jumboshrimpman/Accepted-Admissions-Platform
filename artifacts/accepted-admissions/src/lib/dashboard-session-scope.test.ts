import assert from "node:assert/strict";
import test from "node:test";
import { sessionsForDashboardRole } from "./dashboard-session-scope.ts";

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
