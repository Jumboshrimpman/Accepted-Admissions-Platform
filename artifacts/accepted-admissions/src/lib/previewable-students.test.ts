import assert from "node:assert/strict";
import test from "node:test";
import { previewableStudents } from "./previewable-students.ts";

test("prefers curriculum clients and falls back to overview students", () => {
  assert.deepEqual(
    previewableStudents({
      curriculumClients: [{ id: "c1", name: "Taito Goto", email: "taito@example.invalid" }],
      overviewUsers: [{ id: "u1", displayName: "Other", email: "other@example.invalid", role: "student" }],
    }),
    [{ id: "c1", name: "Taito Goto", email: "taito@example.invalid" }],
  );
  assert.deepEqual(
    previewableStudents({
      curriculumClients: [],
      overviewUsers: [
        { id: "admin-1", displayName: "Sama", email: "sama@example.invalid", role: "administrator" },
        { id: "student-1", displayName: "Taito Goto", email: "taito@example.invalid", role: "student" },
      ],
    }),
    [{ id: "student-1", name: "Taito Goto", email: "taito@example.invalid" }],
  );
});
