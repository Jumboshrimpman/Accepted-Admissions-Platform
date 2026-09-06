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
