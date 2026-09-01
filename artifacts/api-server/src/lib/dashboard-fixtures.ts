import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  assignmentsTable,
  courseMembershipsTable,
  coursesTable,
  db,
  loginActivityTable,
  sessionsTable,
  tutorAssignmentsTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
} from "@workspace/db";

export type DashboardRoleFixture = {
  courseId: string;
  student: AppUser;
  otherStudent: AppUser;
  administrator: AppUser;
  viewer: AppUser;
  satTutor: AppUser;
  englishTutor: AppUser;
  sessionIds: {
    studentSat: string;
    studentEnglish: string;
    otherStudentSat: string;
    unassignedSat: string;
  };
  assignmentIds: {
    published: string;
    draft: string;
  };
  cleanup: () => Promise<void>;
};

export async function createDashboardRoleFixture(): Promise<DashboardRoleFixture> {
  const suffix = randomUUID();
  const users = await db
    .insert(usersTable)
    .values([
      {
        clerkUserId: `dashboard-student:${suffix}`,
        email: `dashboard-student-${suffix}@example.invalid`,
        displayName: "Dashboard Student",
        role: "student",
      },
      {
        clerkUserId: `dashboard-other-student:${suffix}`,
        email: `dashboard-other-student-${suffix}@example.invalid`,
        displayName: "Other Student",
        role: "student",
      },
      {
        clerkUserId: `dashboard-administrator:${suffix}`,
        email: `dashboard-administrator-${suffix}@example.invalid`,
        displayName: "Dashboard Administrator",
        role: "administrator",
      },
      {
        clerkUserId: `dashboard-viewer:${suffix}`,
        email: `dashboard-viewer-${suffix}@example.invalid`,
        displayName: "Dashboard Viewer",
        role: "viewer",
      },
      {
        clerkUserId: `dashboard-sat-tutor:${suffix}`,
        email: `dashboard-sat-tutor-${suffix}@example.invalid`,
        displayName: "SAT Tutor",
        role: "tutor",
      },
      {
        clerkUserId: `dashboard-english-tutor:${suffix}`,
        email: `dashboard-english-tutor-${suffix}@example.invalid`,
        displayName: "English Tutor",
        role: "tutor",
      },
    ])
    .returning();
  const student = users[0]!;
  const otherStudent = users[1]!;
  const administrator = users[2]!;
  const viewer = users[3]!;
  const satTutor = users[4]!;
  const englishTutor = users[5]!;

  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Dashboard role fixture ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
      meetUrl: "https://meet.google.com/course-room",
    })
    .returning();
  const courseId = course!.id;
  const sessionIds = {
    studentSat: randomUUID(),
    studentEnglish: randomUUID(),
    otherStudentSat: randomUUID(),
    unassignedSat: randomUUID(),
  };
  const firstSession = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const secondSession = new Date(firstSession.getTime() + 60 * 60 * 1000);
  const thirdSession = new Date(firstSession.getTime() + 2 * 60 * 60 * 1000);
  const fourthSession = new Date(firstSession.getTime() + 3 * 60 * 60 * 1000);
  await db.insert(courseMembershipsTable).values([
    { courseId, userId: student.id, membershipRole: "student", subject: "all" },
    { courseId, userId: otherStudent.id, membershipRole: "student", subject: "all" },
    { courseId, userId: satTutor.id, membershipRole: "tutor", subject: "SAT" },
    { courseId, userId: englishTutor.id, membershipRole: "tutor", subject: "IELTS" },
  ]);
  await db.insert(viewerLinksTable).values({
    viewerUserId: viewer.id,
    studentUserId: student.id,
    relationship: "view only mirror of Taito’s client account",
    active: true,
  });
  await db.insert(tutorAssignmentsTable).values([
    {
      courseId,
      tutorUserId: satTutor.id,
      studentUserId: student.id,
      subject: "SAT",
    },
    {
      courseId,
      tutorUserId: englishTutor.id,
      studentUserId: student.id,
      subject: "IELTS",
    },
  ]);
  await db.insert(sessionsTable).values([
    {
      id: sessionIds.studentSat,
      courseId,
      clientUserId: student.id,
      tutorUserId: satTutor.id,
      dateTime: firstSession,
      timezone: "America/New_York",
      subject: "SAT",
      title: "Student SAT session",
      status: "published",
      bookingStatus: "confirmed",
      providerEventId: `private-event:${suffix}`,
      providerEventUrl: "https://meet.google.com/private-sat-room",
    },
    {
      id: sessionIds.studentEnglish,
      courseId,
      clientUserId: student.id,
      tutorUserId: englishTutor.id,
      dateTime: secondSession,
      timezone: "America/New_York",
      subject: "IELTS",
      title: "Student IELTS session",
      status: "published",
      bookingStatus: "confirmed",
    },
    {
      id: sessionIds.otherStudentSat,
      courseId,
      clientUserId: otherStudent.id,
      tutorUserId: englishTutor.id,
      dateTime: thirdSession,
      timezone: "America/New_York",
      subject: "SAT",
      title: "Other student's SAT session",
      status: "published",
      bookingStatus: "confirmed",
    },
    {
      id: sessionIds.unassignedSat,
      courseId,
      dateTime: fourthSession,
      timezone: "America/New_York",
      subject: "SAT",
      title: "Unassigned SAT session",
      status: "published",
      bookingStatus: "confirmed",
    },
  ]);

  const [publishedAssignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId,
      sessionId: sessionIds.studentSat,
      deliveryPhase: "before_session",
      title: "Published SAT practice",
      subject: "SAT",
      instructions: "Complete the practice set.",
      status: "published",
      deadline: new Date(firstSession.getTime() + 30 * 60 * 1000),
      timeLimitMinutes: 20,
      maxAttempts: 2,
    })
    .returning();
  const [draftAssignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId,
      sessionId: sessionIds.studentEnglish,
      deliveryPhase: "before_session",
      title: "Draft IELTS practice",
      subject: "IELTS",
      instructions: "This is not ready for students.",
      status: "draft",
      deadline: new Date(firstSession.getTime() + 45 * 60 * 1000),
      timeLimitMinutes: 20,
      maxAttempts: 1,
    })
    .returning();

  return {
    courseId,
    student,
    otherStudent,
    administrator,
    viewer,
    satTutor,
    englishTutor,
    sessionIds,
    assignmentIds: {
      published: publishedAssignment!.id,
      draft: draftAssignment!.id,
    },
    cleanup: async () => {
      const userIds = users.map((user) => user.id);
      await db
        .delete(loginActivityTable)
        .where(inArray(loginActivityTable.userId, userIds));
      await db
        .delete(assignmentsTable)
        .where(inArray(assignmentsTable.id, [publishedAssignment!.id, draftAssignment!.id]));
      await db
        .delete(sessionsTable)
        .where(inArray(sessionsTable.id, Object.values(sessionIds)));
      await db
        .delete(tutorAssignmentsTable)
        .where(
          or(
            eq(tutorAssignmentsTable.courseId, courseId),
            inArray(tutorAssignmentsTable.studentUserId, userIds),
            inArray(tutorAssignmentsTable.tutorUserId, userIds),
          ),
        );
      await db
        .delete(viewerLinksTable)
        .where(eq(viewerLinksTable.viewerUserId, viewer.id));
      await db
        .delete(courseMembershipsTable)
        .where(
          or(
            eq(courseMembershipsTable.courseId, courseId),
            inArray(courseMembershipsTable.userId, userIds),
          ),
        );
      await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
      await db
        .delete(usersTable)
        .where(inArray(usersTable.id, userIds));
    },
  };
}