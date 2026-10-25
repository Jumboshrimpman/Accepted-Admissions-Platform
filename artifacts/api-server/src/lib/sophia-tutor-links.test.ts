import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  courseMembershipsTable,
  coursesTable,
  db,
  tutorAssignmentsTable,
  usersTable,
} from "@workspace/db";
import { ensureSophiaTutorLinks, SOPHIA_TUTOR_LINK_SUBJECT } from "./sophia-tutor-links.ts";

test("Sophia tutor links insert only her four SAT tutors and stay idempotent", async () => {
  const suffix = randomUUID().slice(0, 8);
  const courseTitle = `Sophia roster ${suffix}`;
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: courseTitle,
      subject: "SAT",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const insertUser = async (
    email: string,
    displayName: string,
    role: "student" | "tutor",
  ) => {
    const [created] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `user_${role}_${suffix}_${displayName}`,
        email,
        displayName,
        role,
      })
      .returning();
    return created!;
  };
  const sophia = await insertUser(`sophia-${suffix}@example.invalid`, "Sophia Fixture", "student");
  const other = await insertUser(`other-${suffix}@example.invalid`, "Other Fixture", "student");
  const xavier = await insertUser(`xavier-${suffix}@example.invalid`, "Xavier Fixture", "tutor");
  const eunice = await insertUser(`eunice-${suffix}@example.invalid`, "Eunice Fixture", "tutor");
  const nika = await insertUser(`nika-${suffix}@example.invalid`, "Nika Fixture", "tutor");
  const victoria = await insertUser(`victoria-${suffix}@example.invalid`, "Victoria Fixture", "tutor");
  const stranger = await insertUser(`stranger-${suffix}@example.invalid`, "Stranger Fixture", "tutor");
  await db.insert(tutorAssignmentsTable).values({
    courseId: course!.id,
    tutorUserId: stranger.id,
    studentUserId: other.id,
    subject: "SAT",
  });

  const tutors = [
    { key: "xavier", email: xavier.email },
    { key: "eunice", email: eunice.email },
    { key: "nika", email: nika.email },
    { key: "victoria", userId: victoria.id },
  ];
  try {
    const missing = await ensureSophiaTutorLinks({
      studentUserId: randomUUID(),
      tutors,
      courseTitle,
    });
    assert.equal(missing.action, "skipped");
    assert.equal(missing.reason, "student_missing");
    assert.equal(missing.inserted, 0);

    const first = await ensureSophiaTutorLinks({
      studentUserId: sophia.id,
      tutors,
      courseTitle,
    });
    assert.equal(first.action, "linked");
    assert.equal(first.studentFound, true);
    assert.equal(first.before, 0);
    assert.equal(first.inserted, 4);
    assert.equal(first.already, 0);
    assert.equal(first.missing, 0);

    const rows = await db
      .select({ tutorUserId: tutorAssignmentsTable.tutorUserId, subject: tutorAssignmentsTable.subject })
      .from(tutorAssignmentsTable)
      .where(eq(tutorAssignmentsTable.studentUserId, sophia.id));
    assert.deepEqual(
      rows.map((row) => row.tutorUserId).sort(),
      [xavier.id, eunice.id, nika.id, victoria.id].sort(),
    );
    assert.equal(new Set(rows.map((row) => row.subject)).size, 1);
    assert.equal(rows[0]?.subject, SOPHIA_TUTOR_LINK_SUBJECT);
    assert.equal(rows.some((row) => row.tutorUserId === stranger.id), false);

    const second = await ensureSophiaTutorLinks({
      studentUserId: sophia.id,
      tutors,
      courseTitle,
    });
    assert.equal(second.inserted, 0);
    assert.equal(second.already, 4);
    assert.equal(second.before, 4);

    const otherRows = await db
      .select({ tutorUserId: tutorAssignmentsTable.tutorUserId })
      .from(tutorAssignmentsTable)
      .where(eq(tutorAssignmentsTable.studentUserId, other.id));
    assert.deepEqual(otherRows.map((row) => row.tutorUserId), [stranger.id]);

    const [membership] = await db
      .select({ subject: courseMembershipsTable.subject })
      .from(courseMembershipsTable)
      .where(eq(courseMembershipsTable.userId, sophia.id));
    assert.equal(membership?.subject, "all");
  } finally {
    await db.delete(tutorAssignmentsTable).where(eq(tutorAssignmentsTable.courseId, course!.id));
    await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.courseId, course!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
    for (const user of [sophia, other, xavier, eunice, nika, victoria, stranger]) {
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
    }
  }
});
