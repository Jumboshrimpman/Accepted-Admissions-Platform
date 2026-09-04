import { and, eq, inArray, or } from "drizzle-orm";
import {
  courseMembershipsTable,
  db,
  tutorAssignmentsTable,
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

    const namedTutorIds = approvedMemberships
      .filter((membership) => membership.role === "tutor")
      .map((membership) => usersByEmail.get(normalizeProvisionedEmail(membership.email))?.id)
      .filter((id): id is string => Boolean(id));
    const namedStudentIds = approvedMemberships
      .filter((membership) => membership.role === "student")
      .map((membership) => usersByEmail.get(normalizeProvisionedEmail(membership.email))?.id)
      .filter((id): id is string => Boolean(id));
    const staleAssignmentScopes = [
      namedTutorIds.length > 0
        ? inArray(tutorAssignmentsTable.tutorUserId, namedTutorIds)
        : null,
      namedStudentIds.length > 0
        ? inArray(tutorAssignmentsTable.studentUserId, namedStudentIds)
        : null,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

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
    const assignmentKey = (assignment: {
      tutorUserId: string;
      studentUserId: string;
      subject: string;
    }) =>
      `${assignment.tutorUserId}:${assignment.studentUserId}:${assignment.subject.trim().toLowerCase()}`;
    const desiredKeys = new Set(desiredAssignments.map(assignmentKey));
    if (staleAssignmentScopes.length > 0) {
      const scopedAssignments = await tx
        .select()
        .from(tutorAssignmentsTable)
        .where(
          and(eq(tutorAssignmentsTable.courseId, courseId), or(...staleAssignmentScopes)),
        );
      const staleIds = scopedAssignments
        .filter((assignment) => !desiredKeys.has(assignmentKey(assignment)))
        .map((assignment) => assignment.id);
      if (staleIds.length > 0) {
        await tx
          .delete(tutorAssignmentsTable)
          .where(inArray(tutorAssignmentsTable.id, staleIds));
      }
    }

    for (const assignment of desiredAssignments) {
      await tx
        .insert(tutorAssignmentsTable)
        .values(assignment)
        .onConflictDoNothing();
    }
  });
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