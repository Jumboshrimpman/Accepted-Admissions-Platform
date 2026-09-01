import { and, eq } from "drizzle-orm";
import {
  courseMembershipsTable,
  db,
  coursesTable,
  sessionsTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { publicSessionShape, visibleSessionsForUser } from "./session-privacy.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isTaitoFallSession, sessionTitle, TAITO_STUDENT_DISPLAY_NAME } from "./session-schedule.ts";

async function visibleCourseIds(user: AppUser): Promise<string[]> {
  if (user.role === "administrator") {
    return (await db.select({ id: coursesTable.id }).from(coursesTable)).map(
      (row) => row.id,
    );
  }
  if (user.role === "viewer") {
    return (
      await db
        .select({ id: courseMembershipsTable.courseId })
        .from(viewerLinksTable)
        .innerJoin(
          courseMembershipsTable,
          eq(courseMembershipsTable.userId, viewerLinksTable.studentUserId),
        )
        .where(
          and(
            eq(viewerLinksTable.viewerUserId, user.id),
            eq(viewerLinksTable.active, true),
            eq(courseMembershipsTable.membershipRole, "student"),
          ),
        )
    ).map((row) => row.id);
  }
  return (
    await db
      .select({ id: courseMembershipsTable.courseId })
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.userId, user.id),
          eq(courseMembershipsTable.membershipRole, user.role),
        ),
      )
  ).map((row) => row.id);
}

async function dataSubjectUserId(user: AppUser): Promise<string> {
  if (user.role !== "viewer") return user.id;
  const [link] = await db
    .select({ studentUserId: viewerLinksTable.studentUserId })
    .from(viewerLinksTable)
    .where(
      and(
        eq(viewerLinksTable.viewerUserId, user.id),
        eq(viewerLinksTable.active, true),
      ),
    )
    .limit(1);
  return link?.studentUserId ?? user.id;
}

export async function dashboardSessionsForUser(user: AppUser) {
  const ids = await visibleCourseIds(user);
  const subjectUserId = await dataSubjectUserId(user);
  const sessions =
    ids.length === 0
      ? []
      : (
          await Promise.all(
            ids.map((courseId) => visibleSessionsForUser(user, courseId)),
          )
        )
          .flat()
          .filter((session) => {
            if (user.role === "student" || user.role === "viewer") {
              return session.clientUserId === subjectUserId;
            }
            if (user.role === "tutor") return session.tutorUserId === user.id;
            return true;
          });
  return sessions
    .sort((left, right) => left.dateTime.getTime() - right.dateTime.getTime())
}

export async function clientForAdminPreview(
  requester: AppUser,
  clientId: string,
): Promise<AppUser | null> {
  if (requester.role !== "administrator") return null;
  const [client] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, clientId),
        eq(usersTable.role, "student"),
      ),
    )
    .limit(1);
  return client ?? null;
}

type DashboardTutor = {
  id: string;
  name: string;
  specialty: string | null;
  avatarUrl: string | null;
} | null;

type DashboardStudent = {
  id?: string;
  name: string;
} | null;

export function dashboardSessionShape(
  session: typeof sessionsTable.$inferSelect,
  tutor: DashboardTutor,
  meetingUrl: string | null,
  student?: DashboardStudent,
  clientName?: string | null,
) {
  const resolvedStudent =
    student ??
    (isTaitoFallSession(session)
      ? { name: TAITO_STUDENT_DISPLAY_NAME }
      : null);
  return {
    ...publicSessionShape(
      session,
      sessionTitle(clientName ?? resolvedStudent?.name, session.subject, tutor?.name),
    ),
    tutor,
    meetingUrl,
    ...(student === undefined
      ? {}
      : {
          student: resolvedStudent,
        }),
  };
}
