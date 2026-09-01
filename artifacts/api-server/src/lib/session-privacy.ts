import { and, asc, eq, inArray } from "drizzle-orm";
import {
  courseMembershipsTable,
  coursesTable,
  db,
  sessionsTable,
  tutorProfilesTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEETING_URL, TAITO_FALL_2026_SESSIONS, TAITO_SESSION_TIMEZONE, TAITO_STUDENT_DISPLAY_NAME, isFall2026Term, sessionTitle, taitoSessionDateTime } from "./session-schedule.ts";

function subjectFamily(subject: string): string {
  const normalized = subject.trim().toLowerCase();
  if (normalized.startsWith("sat")) return "sat";
  if (normalized.startsWith("ielts") || normalized.startsWith("english")) {
    return "ielts";
  }
  return normalized;
}

export async function reconcileTaitoSessions(courseId: string): Promise<void> {
  const [course, courseSessions, tutorProfiles, users] = await Promise.all([
    db
      .select({ id: coursesTable.id, term: coursesTable.term, meetUrl: coursesTable.meetUrl })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.courseId, courseId)),
    db
      .select({
        id: tutorProfilesTable.id,
        userId: tutorProfilesTable.userId,
        email: tutorProfilesTable.email,
        name: tutorProfilesTable.name,
      })
      .from(tutorProfilesTable)
      .where(
        inArray(tutorProfilesTable.email, [
          "eunice_chon@berkeley.edu",
          "nika.raiffe@gmail.com",
        ]),
      ),
    db
      .select({
        id: usersTable.id,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(
        inArray(usersTable.email, [
          "taito0525@gmail.com",
          "eunice_chon@berkeley.edu",
          "nika.raiffe@gmail.com",
        ]),
      ),
  ]);
  if (!course) return;
  if (isFall2026Term(course.term) && course.meetUrl !== SHARED_FALL_MEETING_URL) {
    await db
      .update(coursesTable)
      .set({ meetUrl: SHARED_FALL_MEETING_URL })
      .where(eq(coursesTable.id, courseId));
  }
  const student = users.find((user) => user.email === "taito0525@gmail.com");
  const sessionsByDate = new Map<string, (typeof courseSessions)[number]>();
  for (const session of courseSessions) {
    const dateKey = session.dateTime.toISOString().slice(0, 10);
    if (!sessionsByDate.has(dateKey)) sessionsByDate.set(dateKey, session);
  }

  for (const scheduled of TAITO_FALL_2026_SESSIONS) {
    const dateTime = taitoSessionDateTime(scheduled.dateKey);
    const existing = sessionsByDate.get(scheduled.dateKey);
    const profile = tutorProfiles.find(
      (candidate) => candidate.email === scheduled.tutorEmail,
    );
    const account = users.find(
      (candidate) => candidate.email === scheduled.tutorEmail,
    );
    const tutorUserId =
      profile?.userId ?? account?.id ?? existing?.tutorUserId ?? null;
    const clientUserId = student?.id ?? existing?.clientUserId ?? null;
    const values = {
      dateTime,
      timezone: TAITO_SESSION_TIMEZONE,
      subject: scheduled.subject,
      title: sessionTitle(
        TAITO_STUDENT_DISPLAY_NAME,
        scheduled.subject,
        scheduled.tutorName,
      ),
      status: "published" as const,
      durationMinutes: 60,
      hasHomework: scheduled.subject === "SAT",
      tutorUserId,
      clientUserId,
    };

    if (existing) {
      if (
        existing.providerEventId &&
        existing.dateTime.getTime() !== dateTime.getTime()
      ) {
        throw new Error(
          `Cannot move Taito session ${existing.id} because it has a provider calendar event.`,
        );
      }
      await db
        .update(sessionsTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(sessionsTable.id, existing.id));
    } else {
      await db.insert(sessionsTable).values({
        courseId,
        ...values,
        bookingStatus: "confirmed",
      });
    }
  }
}

async function canAccessCourse(
  user: AppUser,
  courseId: string,
  subject?: string,
): Promise<boolean> {
  if (user.role === "administrator") return true;
  if (user.role === "viewer") {
    const [link] = await db
      .select({ id: viewerLinksTable.id })
      .from(viewerLinksTable)
      .innerJoin(
        courseMembershipsTable,
        and(
          eq(courseMembershipsTable.userId, viewerLinksTable.studentUserId),
          eq(courseMembershipsTable.courseId, courseId),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .where(
        and(
          eq(viewerLinksTable.viewerUserId, user.id),
          eq(viewerLinksTable.active, true),
        ),
      )
      .limit(1);
    return Boolean(link);
  }
  const [membership] = await db
    .select()
    .from(courseMembershipsTable)
    .where(
      and(
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.userId, user.id),
        eq(courseMembershipsTable.membershipRole, user.role),
      ),
    )
    .limit(1);
  return (
    Boolean(membership) &&
    (!subject ||
      membership!.subject === "all" ||
      subjectFamily(membership!.subject) === subjectFamily(subject))
  );
}

export async function visibleSessionsForUser(
  user: AppUser,
  courseId: string,
) {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, courseId))
    .orderBy(asc(sessionsTable.dateTime));
  return (
    await Promise.all(
      sessions.map(async (session) =>
        (await canViewSession(user, session))
          ? session
          : null,
      ),
    )
  ).filter(
    (session): session is (typeof sessions)[number] => Boolean(session),
  );
}

export async function canViewSession(
  user: AppUser,
  session: typeof sessionsTable.$inferSelect,
): Promise<boolean> {
  if (!(await canAccessCourse(user, session.courseId, session.subject))) {
    return false;
  }
  if (user.role === "administrator") return true;
  if (user.role === "student") return session.clientUserId === user.id;
  if (user.role === "tutor") return session.tutorUserId === user.id;
  if (user.role === "viewer") {
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
    return Boolean(link && session.clientUserId === link.studentUserId);
  }
  return false;
}

type PublicSessionSource = Pick<
  typeof sessionsTable.$inferSelect,
  | "id"
  | "courseId"
  | "dateTime"
  | "timezone"
  | "durationMinutes"
  | "subject"
  | "title"
  | "status"
  | "hasHomework"
  | "hasReport"
>;

export function publicSessionShape(
  session: PublicSessionSource,
  title = session.title,
) {
  return {
    id: session.id,
    courseId: session.courseId,
    dateTime: session.dateTime,
    timezone: session.timezone,
    durationMinutes: session.durationMinutes,
    subject: session.subject,
    title,
    status: session.status,
    hasHomework: session.hasHomework,
    hasReport: session.hasReport,
  };
}