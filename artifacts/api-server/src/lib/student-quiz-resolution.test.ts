import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolutionStudentIdForListedAssignment,
  studentMayResolveQuizzes,
} from "./student-quiz-resolution.ts";

test("only the student can resolve a quiz", () => {
  assert.equal(studentMayResolveQuizzes("student"), true);
  assert.equal(studentMayResolveQuizzes("viewer"), false);
  assert.equal(studentMayResolveQuizzes("tutor"), false);
  assert.equal(studentMayResolveQuizzes("administrator"), false);
  assert.equal(studentMayResolveQuizzes(null), false);
});

test("resolution is stored for the student the list is about", () => {
  assert.equal(
    resolutionStudentIdForListedAssignment({
      role: "student",
      subjectUserId: "student-1",
      sessionScoped: false,
      sessionClientUserId: "someone-else",
      assignedStudentUserId: null,
    }),
    "student-1",
  );
  assert.equal(
    resolutionStudentIdForListedAssignment({
      role: "viewer",
      subjectUserId: "student-1",
      sessionScoped: false,
      sessionClientUserId: null,
      assignedStudentUserId: "student-1",
    }),
    "student-1",
  );
  assert.equal(
    resolutionStudentIdForListedAssignment({
      role: "tutor",
      subjectUserId: "tutor-1",
      sessionScoped: true,
      sessionClientUserId: "student-1",
      assignedStudentUserId: null,
    }),
    "student-1",
  );
  assert.equal(
    resolutionStudentIdForListedAssignment({
      role: "administrator",
      subjectUserId: "admin-1",
      sessionScoped: false,
      sessionClientUserId: "student-1",
      assignedStudentUserId: "student-2",
    }),
    "student-2",
  );
});

test("migration is additive and resolution does not touch grading records", () => {
  const sql = readFileSync(
    new URL("../../../../lib/db/drizzle/0081_student_quiz_resolutions.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "student_quiz_resolutions"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "student_quiz_resolutions_student_assignment_idx"/);
  assert.match(sql, /ON DELETE cascade/i);
  assert.equal(/DROP\s+TABLE/i.test(sql), false);
  assert.equal(/INSERT\s+INTO/i.test(sql), false);
  assert.equal(/ALTER\s+TABLE\s+"assignments"/i.test(sql), false);
  assert.equal(/ALTER\s+TABLE\s+"attempts"/i.test(sql), false);
  assert.equal(/ALTER\s+TABLE\s+"responses"/i.test(sql), false);
  assert.equal(/email/i.test(sql), false);

  const journal = readFileSync(
    new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  );
  assert.match(journal, /"tag": "0081_student_quiz_resolutions"/);

  const store = readFileSync(new URL("./student-quiz-resolution.ts", import.meta.url), "utf8");
  assert.match(store, /onConflictDoNothing/);
  assert.match(store, /\.delete\(studentQuizResolutionsTable\)/);
  assert.equal(/attemptsTable/.test(store), false);
  assert.equal(/responsesTable/.test(store), false);
  assert.equal(/assignmentsTable/.test(store), false);
  assert.equal(/adminNotificationsTable/.test(store), false);
  assert.equal(/send[A-Z]/.test(store), false);

  const route = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const start = route.indexOf('router.post(\n  "/assignments/:assignmentId/resolution"');
  const end = route.indexOf('router.post(\n  "/assignments/:assignmentId/attempts"', start);
  assert.ok(start > 0 && end > start);
  const handlers = route.slice(start, end);
  assert.match(handlers, /studentMayResolveQuizzes/);
  assert.match(handlers, /resolveStudentQuizRecord/);
  assert.match(handlers, /clearStudentQuizResolution/);
  assert.equal(/attemptsTable/.test(handlers), false);
  assert.equal(/responsesTable/.test(handlers), false);
  assert.equal(/\.delete\(assignmentsTable\)/.test(handlers), false);
  assert.equal(/adminNotificationsTable/.test(handlers), false);
  assert.equal(/send[A-Z]/.test(handlers), false);
});

test("resolving twice keeps one row and leaves the assignment and attempts", async (t) => {
  if (!process.env.DATABASE_URL?.trim()) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const { pool } = await import("@workspace/db");
  const { clearStudentQuizResolution, resolveStudentQuizRecord } = await import(
    "./student-quiz-resolution.ts"
  );
  try {
  const migration = readFileSync(
    new URL("../../../../lib/db/drizzle/0081_student_quiz_resolutions.sql", import.meta.url),
    "utf8",
  );
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }

  const student = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'student' ORDER BY created_at ASC LIMIT 1`,
  );
  const assignment = await pool.query<{
    id: string;
    status: string;
    deadline: Date | null;
    time_limit_minutes: string;
    max_attempts: string;
  }>(
    `SELECT id, status, deadline, time_limit_minutes, max_attempts
     FROM assignments
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  const studentId = student.rows[0]?.id;
  const assignmentRow = assignment.rows[0];
  if (!studentId || !assignmentRow) {
    t.skip("local database has no student and assignment to resolve");
    return;
  }

  const beforeAttempts = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM attempts WHERE assignment_id = $1`,
    [assignmentRow.id],
  );
  const beforeResponses = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM responses
     WHERE attempt_id IN (SELECT id FROM attempts WHERE assignment_id = $1)`,
    [assignmentRow.id],
  );

  try {
    const first = await resolveStudentQuizRecord({
      studentUserId: studentId,
      assignmentId: assignmentRow.id,
    });
    const second = await resolveStudentQuizRecord({
      studentUserId: studentId,
      assignmentId: assignmentRow.id,
    });
    assert.equal(second.getTime(), first.getTime());
    const rows = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM student_quiz_resolutions
       WHERE student_user_id = $1 AND assignment_id = $2`,
      [studentId, assignmentRow.id],
    );
    assert.equal(rows.rows[0]?.count, "1");

    const afterAssignment = await pool.query<{
      status: string;
      deadline: Date | null;
      time_limit_minutes: string;
      max_attempts: string;
    }>(
      `SELECT status, deadline, time_limit_minutes, max_attempts FROM assignments WHERE id = $1`,
      [assignmentRow.id],
    );
    const after = afterAssignment.rows[0];
    assert.equal(after?.status, assignmentRow.status);
    assert.equal(after?.time_limit_minutes, assignmentRow.time_limit_minutes);
    assert.equal(after?.max_attempts, assignmentRow.max_attempts);
    assert.equal(after?.deadline?.getTime() ?? null, assignmentRow.deadline?.getTime() ?? null);
    const afterAttempts = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM attempts WHERE assignment_id = $1`,
      [assignmentRow.id],
    );
    const afterResponses = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM responses
       WHERE attempt_id IN (SELECT id FROM attempts WHERE assignment_id = $1)`,
      [assignmentRow.id],
    );
    assert.equal(afterAttempts.rows[0]?.count, beforeAttempts.rows[0]?.count);
    assert.equal(afterResponses.rows[0]?.count, beforeResponses.rows[0]?.count);

    await clearStudentQuizResolution({
      studentUserId: studentId,
      assignmentId: assignmentRow.id,
    });
    await clearStudentQuizResolution({
      studentUserId: studentId,
      assignmentId: assignmentRow.id,
    });
    const gone = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM student_quiz_resolutions
       WHERE student_user_id = $1 AND assignment_id = $2`,
      [studentId, assignmentRow.id],
    );
    assert.equal(gone.rows[0]?.count, "0");
    const stillThere = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM assignments WHERE id = $1`,
      [assignmentRow.id],
    );
    assert.equal(stillThere.rows[0]?.count, "1");
  } finally {
    await pool.query(
      `DELETE FROM student_quiz_resolutions WHERE student_user_id = $1 AND assignment_id = $2`,
      [studentId, assignmentRow.id],
    );
  }
  } finally {
    await pool.end();
  }
});
