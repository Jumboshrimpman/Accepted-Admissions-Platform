import { inArray } from "drizzle-orm";
import { coursesTable, db, usersTable } from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { type MeetingContext } from "./session-meeting-url.ts";

export async function loadMeetingContext(
  sessions: readonly { courseId: string; clientUserId?: string | null }[],
): Promise<MeetingContext> {
  const courseIds = [...new Set(sessions.map((session) => session.courseId))];
  const clientIds = [
    ...new Set(
      sessions
        .map((session) => session.clientUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [courses, users] = await Promise.all([
    courseIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: coursesTable.id,
            meetUrl: coursesTable.meetUrl,
            term: coursesTable.term,
          })
          .from(coursesTable)
          .where(inArray(coursesTable.id, courseIds)),
    clientIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: usersTable.id, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, clientIds)),
  ]);
  return {
    courses: new Map(courses.map((course) => [course.id, course])),
    emails: new Map(users.map((user) => [user.id, user.email])),
  };
}
