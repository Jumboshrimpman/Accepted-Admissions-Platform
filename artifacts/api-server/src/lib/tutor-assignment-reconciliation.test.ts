import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  courseMembershipsTable,
  coursesTable,
  creditLedgerTable,
  db,
  sessionsTable,
  tutorAssignmentsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const reconciliationModule = await import("./tutor-assignment-reconciliation.ts");
const {
  APPROVED_TUTOR_ASSIGNMENTS,
  courseForTutorAssignments,
  reconcileTutorAssignments,
} = reconciliationModule;

test("reconciles only approved tutor relationships regardless of sign-in order", async () => {
  assert.deepEqual(
    APPROVED_TUTOR_ASSIGNMENTS.map(
      ({ tutorEmail, studentEmail, tutorSubject }) => ({
        tutorEmail,
        studentEmail,
        tutorSubject,
      }),
    ),
    [
      {
        tutorEmail: "nika.raiffe@gmail.com",
        studentEmail: "taito0525@gmail.com",
        tutorSubject: "IELTS",
      },
      {
        tutorEmail: "eunice_chon@berkeley.edu",
        studentEmail: "taito0525@gmail.com",
        tutorSubject: "SAT",
      },
      {
        tutorEmail: "xaver.rmz6@gmail.com",
        studentEmail: "michaelmakarem@gmail.com",
        tutorSubject: "SAT",
      },
    ],
  );

  const suffix = randomUUID();
  const emails = {
    nika: `nika-${suffix}@example.invalid`,
    taito: `taito-${suffix}@example.invalid`,
    eunice: `eunice-${suffix}@example.invalid`,
    xavier: `xavier-${suffix}@example.invalid`,
    michelle: `michelle-${suffix}@example.invalid`,
    otherTutor: `other-tutor-${suffix}@example.invalid`,
    otherStudent: `other-student-${suffix}@example.invalid`,
  };
  const roster = [
    {
      tutorEmail: emails.nika,
      studentEmail: emails.taito,
      tutorSubject: "IELTS",
      studentSubject: "all",
    },
    {
      tutorEmail: emails.eunice,
      studentEmail: emails.taito,
      tutorSubject: "SAT",
      studentSubject: "all",
    },
    {
      tutorEmail: emails.xavier,
      studentEmail: emails.michelle,
      tutorSubject: "SAT",
      studentSubject: "SAT",
    },
  ] as const;
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Tutor assignment reconciliation ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const courseId = course!.id;
  const createdUsers: AppUser[] = [];
  const createUser = async (
    email: string,
    displayName: string,
    role: AppUser["role"],
  ) => {
    const [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `assignment-reconciliation:${email}`,
        email,
        displayName,
        role,
      })
      .returning();
    createdUsers.push(user!);
    await reconcileTutorAssignments(courseId, roster);
    return user!;
  };

  try {
    const nika = await createUser(emails.nika, "Nika Fixture", "tutor");
    assert.equal(
      (
        await db
          .select()
          .from(tutorAssignmentsTable)
          .where(eq(tutorAssignmentsTable.courseId, courseId))
      ).length,
      0,
    );
    const taito = await createUser(emails.taito, "Taito Fixture", "student");
    const michelle = await createUser(
      emails.michelle,
      "Michelle Fixture",
      "student",
    );
    const xavier = await createUser(emails.xavier, "Xavier Fixture", "tutor");
    const eunice = await createUser(emails.eunice, "Eunice Fixture", "tutor");
    const otherTutor = await createUser(
      emails.otherTutor,
      "Other Tutor",
      "tutor",
    );
    const otherStudent = await createUser(
      emails.otherStudent,
      "Other Student",
      "student",
    );

    const [satSession, englishSession, bookingSession] = await db
      .insert(sessionsTable)
      .values([
        {
          courseId,
          clientUserId: taito.id,
          tutorUserId: eunice.id,
          dateTime: new Date("2026-10-02T12:00:00.000Z"),
          timezone: "Asia/Tokyo",
          subject: "SAT",
          title: "Taito’s SAT Session with Eunice",
          status: "published",
        },
        {
          courseId,
          clientUserId: taito.id,
          tutorUserId: nika.id,
          dateTime: new Date("2026-10-23T12:00:00.000Z"),
          timezone: "Asia/Tokyo",
          subject: "IELTS",
          title: "Taito’s English Session with Nika",
          status: "published",
        },
        {
          courseId,
          clientUserId: michelle.id,
          tutorUserId: xavier.id,
          dateTime: new Date("2026-09-20T15:00:00.000Z"),
          timezone: "America/New_York",
          subject: "SAT",
          title: "Michelle’s SAT Session with Xavier",
          status: "published",
          bookingStatus: "confirmed",
        },
      ])
      .returning();
    const [credit] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: michelle.id,
        entryType: "original",
        hours: 1,
        note: "Prepaid 60-minute SAT session",
      })
      .returning();

    const allTutorIds = [nika.id, eunice.id, xavier.id];
    const allStudentIds = [taito.id, michelle.id];
    for (const tutorUserId of allTutorIds) {
      for (const studentUserId of allStudentIds) {
        await db
          .insert(tutorAssignmentsTable)
          .values({
            courseId,
            tutorUserId,
            studentUserId,
            subject: "all",
          })
          .onConflictDoNothing();
      }
    }
    await db.insert(tutorAssignmentsTable).values({
      courseId,
      tutorUserId: otherTutor.id,
      studentUserId: otherStudent.id,
      subject: "SAT",
    });

    await reconcileTutorAssignments(courseId, roster);
    const reconciled = await db
      .select()
      .from(tutorAssignmentsTable)
      .where(eq(tutorAssignmentsTable.courseId, courseId));
    assert.deepEqual(
      reconciled
        .filter((assignment) => assignment.tutorUserId !== otherTutor.id)
        .map((assignment) => ({
          tutorUserId: assignment.tutorUserId,
          studentUserId: assignment.studentUserId,
          subject: assignment.subject,
        }))
        .sort((left, right) =>
          `${left.subject}:${left.tutorUserId}`.localeCompare(
            `${right.subject}:${right.tutorUserId}`,
          ),
        ),
      [
        { tutorUserId: nika.id, studentUserId: taito.id, subject: "IELTS" },
        { tutorUserId: eunice.id, studentUserId: taito.id, subject: "SAT" },
        {
          tutorUserId: xavier.id,
          studentUserId: michelle.id,
          subject: "SAT",
        },
      ].sort((left, right) =>
        `${left.subject}:${left.tutorUserId}`.localeCompare(
          `${right.subject}:${right.tutorUserId}`,
        ),
      ),
    );
    assert.equal(
      reconciled.some(
        (assignment) =>
          assignment.tutorUserId === otherTutor.id &&
          assignment.studentUserId === otherStudent.id,
      ),
      true,
      "unrelated assignments outside the named roster remain untouched",
    );

    const stableIds = reconciled
      .filter((assignment) => assignment.tutorUserId !== otherTutor.id)
      .map((assignment) => assignment.id)
      .sort();
    await reconcileTutorAssignments(courseId, roster);
    assert.deepEqual(
      (
        await db
          .select()
          .from(tutorAssignmentsTable)
          .where(eq(tutorAssignmentsTable.courseId, courseId))
      )
        .filter((assignment) => assignment.tutorUserId !== otherTutor.id)
        .map((assignment) => assignment.id)
        .sort(),
      stableIds,
      "a second reconciliation preserves correct assignment rows",
    );

    const memberships = await db
      .select()
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.courseId, courseId),
          inArray(
            courseMembershipsTable.userId,
            [nika.id, taito.id, eunice.id, xavier.id, michelle.id],
          ),
        ),
      );
    assert.deepEqual(
      memberships
        .map((membership) => ({
          userId: membership.userId,
          role: membership.membershipRole,
          subject: membership.subject,
        }))
        .sort((left, right) => left.userId.localeCompare(right.userId)),
      [
        { userId: nika.id, role: "tutor", subject: "IELTS" },
        { userId: taito.id, role: "student", subject: "all" },
        { userId: eunice.id, role: "tutor", subject: "SAT" },
        { userId: xavier.id, role: "tutor", subject: "SAT" },
        { userId: michelle.id, role: "student", subject: "SAT" },
      ].sort((left, right) => left.userId.localeCompare(right.userId)),
    );

    const [taitoTutors, michelleTutors, nikaStudents, euniceStudents, xavierStudents] =
      await Promise.all([
        courseForTutorAssignments(courseId, taito),
        courseForTutorAssignments(courseId, michelle),
        courseForTutorAssignments(courseId, nika),
        courseForTutorAssignments(courseId, eunice),
        courseForTutorAssignments(courseId, xavier),
      ]);
    assert.deepEqual(
      taitoTutors.map(({ user, subject }) => [user.id, subject]).sort(),
      [
        [nika.id, "IELTS"],
        [eunice.id, "SAT"],
      ].sort(),
    );
    assert.deepEqual(
      michelleTutors.map(({ user, subject }) => [user.id, subject]),
      [[xavier.id, "SAT"]],
    );
    assert.deepEqual(
      nikaStudents.map(({ user, subject }) => [user.id, subject]),
      [[taito.id, "IELTS"]],
    );
    assert.deepEqual(
      euniceStudents.map(({ user, subject }) => [user.id, subject]),
      [[taito.id, "SAT"]],
    );
    assert.deepEqual(
      xavierStudents.map(({ user, subject }) => [user.id, subject]),
      [[michelle.id, "SAT"]],
    );

    const preservedSessions = await db
      .select()
      .from(sessionsTable)
      .where(
        inArray(sessionsTable.id, [
          satSession!.id,
          englishSession!.id,
          bookingSession!.id,
        ]),
      );
    assert.deepEqual(
      preservedSessions
        .map((session) => [
          session.clientUserId,
          session.tutorUserId,
          session.subject,
        ])
        .sort(),
      [
        [taito.id, eunice.id, "SAT"],
        [taito.id, nika.id, "IELTS"],
        [michelle.id, xavier.id, "SAT"],
      ].sort(),
    );
    assert.equal(
      (
        await db
          .select()
          .from(creditLedgerTable)
          .where(eq(creditLedgerTable.id, credit!.id))
      ).length,
      1,
    );
  } finally {
    const userIds = createdUsers.map((user) => user.id);
    await db
      .delete(creditLedgerTable)
      .where(
        userIds.length > 0
          ? inArray(creditLedgerTable.clientUserId, userIds)
          : eq(creditLedgerTable.id, randomUUID()),
      );
    await db
      .delete(sessionsTable)
      .where(eq(sessionsTable.courseId, courseId));
    await db
      .delete(tutorAssignmentsTable)
      .where(eq(tutorAssignmentsTable.courseId, courseId));
    await db
      .delete(courseMembershipsTable)
      .where(eq(courseMembershipsTable.courseId, courseId));
    await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
    if (userIds.length > 0) {
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    }
  }
});