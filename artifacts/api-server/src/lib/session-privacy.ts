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
import {
  EUNICE_TUTOR_EMAIL,
  NIKA_TUTOR_EMAIL,
  SHARED_FALL_MEETING_URL,
  TAITO_FALL_2026_SESSIONS,
  TAITO_SESSION_TIMEZONE,
  TAITO_STUDENT_DISPLAY_NAME,
  TAITO_STUDENT_EMAIL,
  isFall2026Term,
  matchesTaitoScheduledDate,
  normalizedSessionSubject,
  sessionTitle,
  taitoSessionDateTime,
} from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isXavierSatCapabilitySession } from "./xavier-sat-capability-session.ts";

function subjectFamily(subject: string): string {
  const normalized = subject.trim().toLowerCase();
  if (normalized.startsWith("sat")) return "sat";
  if (normalized.startsWith("ielts") || normalized.startsWith("english")) {
    return "ielts";
  }
  return normalized;
}

function subjectMatchesTaitoSchedule(sessionSubject: string, scheduledSubject: string): boolean {
  if (scheduledSubject === "SAT") return normalizedSessionSubject(sessionSubject) === "SAT";
  if (scheduledSubject === "IELTS") {
    const family = normalizedSessionSubject(sessionSubject);
    return family === "English" || sessionSubject.trim().toUpperCase() === "IELTS";
  }
  return sessionSubject === scheduledSubject;
}

function pickTaitoScheduledKeeper<
  T extends {
    id: string;
    status: string;
    bookingStatus: string;
    hasHomework: boolean;
    createdAt?: Date;
  },
>(candidates: readonly T[]): T | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((left, right) => {
    const live = (session: T) =>
      session.status !== "archived" && session.bookingStatus !== "cancelled";
    const liveDelta = Number(live(right)) - Number(live(left));
    if (liveDelta !== 0) return liveDelta;
    const publishedDelta =
      Number(right.status === "published") - Number(left.status === "published");
    if (publishedDelta !== 0) return publishedDelta;
    const homeworkDelta = Number(right.hasHomework) - Number(left.hasHomework);
    if (homeworkDelta !== 0) return homeworkDelta;
    const leftCreated = left.createdAt?.getTime() ?? 0;
    const rightCreated = right.createdAt?.getTime() ?? 0;
    return leftCreated - rightCreated;
  })[0];
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
        inArray(tutorProfilesTable.email, [EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL]),
      ),
    db
      .select({
        id: usersTable.id,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(
        inArray(usersTable.email, [
          TAITO_STUDENT_EMAIL,
          EUNICE_TUTOR_EMAIL,
          NIKA_TUTOR_EMAIL,
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
  const student = users.find((user) => user.email === TAITO_STUDENT_EMAIL);
  const claimed = new Set<string>();

  for (const scheduled of TAITO_FALL_2026_SESSIONS) {
    const dateTime = taitoSessionDateTime(scheduled.dateKey);
    const candidates = courseSessions.filter((session) => {
      if (claimed.has(session.id) || isXavierSatCapabilitySession(session)) {
        return false;
      }
      if (
        student?.id &&
        session.clientUserId &&
        session.clientUserId !== student.id
      ) {
        return false;
      }
      if (!subjectMatchesTaitoSchedule(session.subject, scheduled.subject)) {
        return false;
      }
      return matchesTaitoScheduledDate(session, scheduled.dateKey);
    });
    const existing = pickTaitoScheduledKeeper(candidates);
    const extras = candidates.filter((session) => session.id !== existing?.id);
    const profile = tutorProfiles.find(
      (candidate) => candidate.email === scheduled.tutorEmail,
    );
    const account = users.find(
      (candidate) => candidate.email === scheduled.tutorEmail,
    );
    const tutorUserId =
      profile?.userId ?? account?.id ?? existing?.tutorUserId ?? null;
    const clientUserId = student?.id ?? existing?.clientUserId ?? null;
    const title = sessionTitle(
      TAITO_STUDENT_DISPLAY_NAME,
      scheduled.subject,
      scheduled.tutorName,
    );

    if (existing) {
      claimed.add(existing.id);
      const live =
        existing.status !== "archived" && existing.bookingStatus !== "cancelled";
      if (live) {
        await db
          .update(sessionsTable)
          .set({
            subject: scheduled.subject,
            title,
            status: existing.status === "draft" ? "published" : existing.status,
            hasHomework: scheduled.subject === "SAT" ? true : existing.hasHomework,
            tutorUserId,
            clientUserId,
            updatedAt: new Date(),
          })
          .where(eq(sessionsTable.id, existing.id));
      }
      for (const extra of extras) {
        claimed.add(extra.id);
        if (extra.status === "archived" && extra.bookingStatus === "cancelled") {
          continue;
        }
        await db
          .update(sessionsTable)
          .set({
            status: "archived",
            bookingStatus: "cancelled",
            updatedAt: new Date(),
          })
          .where(eq(sessionsTable.id, extra.id));
      }
    } else {
      const [created] = await db
        .insert(sessionsTable)
        .values({
          courseId,
          dateTime,
          timezone: TAITO_SESSION_TIMEZONE,
          subject: scheduled.subject,
          title,
          status: "published",
          durationMinutes: 60,
          hasHomework: scheduled.subject === "SAT",
          tutorUserId,
          clientUserId,
          bookingStatus: "confirmed",
        })
        .returning({ id: sessionsTable.id });
      if (created) claimed.add(created.id);
    }
  }

  await assignKnownPeopleOnCourse(courseId, {
    studentId: student?.id ?? null,
    satTutorId:
      tutorProfiles.find((profile) => profile.email === EUNICE_TUTOR_EMAIL)?.userId ??
      users.find((user) => user.email === EUNICE_TUTOR_EMAIL)?.id ??
      null,
    englishTutorId:
      tutorProfiles.find((profile) => profile.email === NIKA_TUTOR_EMAIL)?.userId ??
      users.find((user) => user.email === NIKA_TUTOR_EMAIL)?.id ??
      null,
  });
}

/** Data-only assignment for current course sessions. Does not create users. */
export async function assignKnownPeopleOnCourse(
  courseId: string,
  people: {
    studentId: string | null;
    satTutorId: string | null;
    englishTutorId: string | null;
  },
): Promise<void> {
  if (!people.studentId && !people.satTutorId && !people.englishTutorId) return;
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, courseId));
  for (const session of sessions) {
    if (session.status === "archived" || session.bookingStatus === "cancelled") continue;
    if (isXavierSatCapabilitySession(session)) continue;
    const otherClient =
      Boolean(session.clientUserId) &&
      Boolean(people.studentId) &&
      session.clientUserId !== people.studentId;
    if (otherClient) continue;
    const family = subjectFamily(session.subject);
    const nextClient = session.clientUserId ?? people.studentId ?? null;
    const nextTutor =
      family === "sat"
        ? people.satTutorId ?? session.tutorUserId
        : family === "ielts"
          ? people.englishTutorId ?? session.tutorUserId
          : session.tutorUserId;
    if (nextClient === session.clientUserId && nextTutor === session.tutorUserId) continue;
    await db
      .update(sessionsTable)
      .set({
        clientUserId: nextClient,
        tutorUserId: nextTutor,
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, session.id));
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

/** Staff-only: admin, or the tutor assigned to this student’s session. */
export function canClearSessionHomework(
  user: Pick<AppUser, "id" | "role">,
  session: Pick<typeof sessionsTable.$inferSelect, "tutorUserId">,
): boolean {
  if (user.role === "administrator") return true;
  return user.role === "tutor" && session.tutorUserId === user.id;
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
  | "bookingStatus"
>;

export {
  assignmentTiedToCancelledSession,
  hidesCancelledSessions,
  isCancelledBooking,
  isStudentCurriculumSession,
} from "./session-listing.ts";

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
    bookingStatus: session.bookingStatus,
  };
}