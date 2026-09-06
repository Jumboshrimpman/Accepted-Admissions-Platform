import { and, eq, inArray } from "drizzle-orm";
import {
  courseMembershipsTable,
  coursesTable,
  db,
  tutorAssignmentsTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";

function normalizeProvisionedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const APPROVED_TUTOR_ASSIGNMENTS = [
  {
    tutorEmail: "nika.raiffe@gmail.com",
    studentEmail: "taito0525@gmail.com",
    tutorSubject: "IELTS",
    studentSubject: "all",
  },
  {
    tutorEmail: "eunice_chon@berkeley.edu",
    studentEmail: "taito0525@gmail.com",
    tutorSubject: "SAT",
    studentSubject: "all",
  },
  {
    tutorEmail: "xaver.rmz6@gmail.com",
    studentEmail: "michaelmakarem@gmail.com",
    tutorSubject: "SAT",
    studentSubject: "SAT",
  },
] as const;

type ApprovedTutorAssignment = {
  tutorEmail: string;
  studentEmail: string;
  tutorSubject: string;
  studentSubject: string;
};

export async function reconcileTutorAssignments(
  courseId: string,
  approvedAssignments: readonly ApprovedTutorAssignment[] = APPROVED_TUTOR_ASSIGNMENTS,
): Promise<void> {
  const approvedMemberships = [
    ...approvedAssignments.map(({ tutorEmail, tutorSubject }) => ({
      email: tutorEmail,
      role: "tutor" as const,
      subject: tutorSubject,
    })),
    ...approvedAssignments.map(({ studentEmail, studentSubject }) => ({
      email: studentEmail,
      role: "student" as const,
      subject: studentSubject,
    })),
  ];
  await db.transaction(async (tx) => {
    const emails = [
      ...new Set(
        approvedMemberships.map(({ email }) => normalizeProvisionedEmail(email)),
      ),
    ];
    const users = await tx
      .select({
        id: usersTable.id,
        email: usersTable.email,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(inArray(usersTable.email, emails));
    const usersByEmail = new Map(
      users.map((user) => [normalizeProvisionedEmail(user.email), user]),
    );

    for (const membership of approvedMemberships) {
      const user = usersByEmail.get(
        normalizeProvisionedEmail(membership.email),
      );
      if (!user || user.role !== membership.role) continue;
      await tx
        .insert(courseMembershipsTable)
        .values({
          courseId,
          userId: user.id,
          membershipRole: membership.role,
          subject: membership.subject,
        })
        .onConflictDoUpdate({
          target: [courseMembershipsTable.courseId, courseMembershipsTable.userId],
          set: {
            membershipRole: membership.role,
            subject: membership.subject,
          },
        });
    }

    // Ensure the approved seed pairs exist. Never delete extras — People assign
    // is the source of truth for additional tutor–student links.
    const desiredAssignments = approvedAssignments.flatMap((assignment) => {
      const tutor = usersByEmail.get(
        normalizeProvisionedEmail(assignment.tutorEmail),
      );
      const student = usersByEmail.get(
        normalizeProvisionedEmail(assignment.studentEmail),
      );
      if (
        !tutor ||
        tutor.role !== "tutor" ||
        !student ||
        student.role !== "student"
      ) {
        return [];
      }
      return [{
        courseId,
        tutorUserId: tutor.id,
        studentUserId: student.id,
        subject: assignment.tutorSubject,
      }];
    });

    for (const assignment of desiredAssignments) {
      await tx
        .insert(tutorAssignmentsTable)
        .values(assignment)
        .onConflictDoNothing();
    }
  });
}

export class TutorAssignmentError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409) {
    super(message);
    this.name = "TutorAssignmentError";
    this.status = status;
  }
}

export type AdminTutorAssignmentRecord = {
  id: string;
  tutorUserId: string;
  studentUserId: string;
  courseId: string;
  courseTitle: string;
  subject: string;
};

function normalizeAssignmentSubject(subject: string): string {
  return subject.trim();
}

export async function createTutorStudentAssignment(input: {
  tutorUserId: string;
  studentUserId: string;
  courseId: string;
  subject: string;
}): Promise<AdminTutorAssignmentRecord> {
  const subject = normalizeAssignmentSubject(input.subject);
  if (!subject) {
    throw new TutorAssignmentError("A subject is required.", 400);
  }
  if (input.tutorUserId === input.studentUserId) {
    throw new TutorAssignmentError("Choose a tutor and a student.", 400);
  }

  return db.transaction(async (tx) => {
    const [course] = await tx
      .select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable)
      .where(eq(coursesTable.id, input.courseId))
      .limit(1);
    if (!course) {
      throw new TutorAssignmentError("Program not found.", 404);
    }

    const [tutor] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.tutorUserId))
      .limit(1);
    const [student] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.studentUserId))
      .limit(1);
    if (!tutor) {
      throw new TutorAssignmentError("The selected tutor was not found.", 404);
    }
    if (tutor.role !== "tutor") {
      throw new TutorAssignmentError("The selected person is not a tutor.", 400);
    }
    if (!student) {
      throw new TutorAssignmentError("The selected student was not found.", 404);
    }
    if (student.role !== "student") {
      throw new TutorAssignmentError("The selected person is not a student.", 400);
    }

    await tx
      .insert(courseMembershipsTable)
      .values({
        courseId: course.id,
        userId: tutor.id,
        membershipRole: "tutor",
        subject,
      })
      .onConflictDoNothing();
    await tx
      .insert(courseMembershipsTable)
      .values({
        courseId: course.id,
        userId: student.id,
        membershipRole: "student",
        subject: "all",
      })
      .onConflictDoNothing();

    const [existingProfile] = await tx
      .select({ id: tutorProfilesTable.id, userId: tutorProfilesTable.userId })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.email, tutor.email))
      .limit(1);
    if (existingProfile) {
      if (!existingProfile.userId) {
        await tx
          .update(tutorProfilesTable)
          .set({
            userId: tutor.id,
            name: tutor.displayName,
            active: true,
            bookingEligible: true,
            updatedAt: new Date(),
          })
          .where(eq(tutorProfilesTable.id, existingProfile.id));
      }
    } else {
      await tx.insert(tutorProfilesTable).values({
        userId: tutor.id,
        email: tutor.email,
        name: tutor.displayName,
        title: "Tutor",
        subjects: [subject],
        active: true,
        bookingEligible: true,
        publicApproved: false,
      });
    }

    const [created] = await tx
      .insert(tutorAssignmentsTable)
      .values({
        courseId: course.id,
        tutorUserId: tutor.id,
        studentUserId: student.id,
        subject,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      throw new TutorAssignmentError(
        "That tutor is already assigned to this student for this program and subject.",
        409,
      );
    }

    return {
      id: created.id,
      tutorUserId: created.tutorUserId,
      studentUserId: created.studentUserId,
      courseId: created.courseId,
      courseTitle: course.title,
      subject: created.subject,
    };
  });
}

export async function deleteTutorStudentAssignment(
  assignmentId: string,
): Promise<boolean> {
  const [deleted] = await db
    .delete(tutorAssignmentsTable)
    .where(eq(tutorAssignmentsTable.id, assignmentId))
    .returning({ id: tutorAssignmentsTable.id });
  return Boolean(deleted);
}

export async function courseForTutorAssignments(
  courseId: string,
  user: { id: string; role: "tutor" | "student" | "viewer" | "administrator" },
  studentUserId?: string,
) {
  const rows = await db
    .select({
      user: usersTable,
      subject: tutorAssignmentsTable.subject,
    })
    .from(tutorAssignmentsTable)
    .innerJoin(
      usersTable,
      eq(
        usersTable.id,
        user.role === "tutor"
          ? tutorAssignmentsTable.studentUserId
          : tutorAssignmentsTable.tutorUserId,
      ),
    )
    .where(
      and(
        eq(tutorAssignmentsTable.courseId, courseId),
        user.role === "tutor"
          ? eq(tutorAssignmentsTable.tutorUserId, user.id)
          : eq(
              tutorAssignmentsTable.studentUserId,
              studentUserId ?? user.id,
            ),
      ),
    );
  return rows;
}