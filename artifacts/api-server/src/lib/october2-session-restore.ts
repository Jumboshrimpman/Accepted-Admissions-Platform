import { eq, inArray } from "drizzle-orm";
import {
  assignmentsTable,
  courseMembershipsTable,
  coursesTable,
  db,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { assignPreworkFromBank } from "./sat-bank-service.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { selectActivePrework } from "./session-homework.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { reconcileTaitoSessions } from "./session-privacy.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  EUNICE_TUTOR_EMAIL,
  TAITO_STUDENT_EMAIL,
  isFall2026Term,
  isOctober2FallSatSession,
  isTaitoFirstSatSession,
  resolveOctober2SessionPeople,
  sessionNeedsVisibilityRestore,
  sessionTitle,
  sessionVisibilityRestoreFields,
} from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  FALL_SAT_COURSE_TITLE,
  SAMA_TEST_CLIENT_EMAIL,
  XAVIER_TUTOR_EMAIL,
  isXavierSatCapabilitySession,
} from "./xavier-sat-capability-session.ts";

export type October2SessionSnapshot = {
  sessionId: string;
  status: string;
  bookingStatus: string;
  clientUserId: string | null;
  clientEmail: string | null;
  tutorUserId: string | null;
  tutorEmail: string | null;
  title: string;
  dateTime: string;
  timezone: string;
  durationMinutes: number;
  assignmentCount: number;
  hasActivePrework: boolean;
};

export type RestoreOctober2SatSessionResult = {
  dryRun: boolean;
  courseId: string;
  created: boolean;
  restoredSessionIds: string[];
  alreadyActiveSessionIds: string[];
  preworkAttached: boolean;
  samaAssigned: boolean;
  session: October2SessionSnapshot | null;
  bankUntouched: true;
  attemptsUntouched: true;
};

export type RestoreOctober2SatSessionOptions = {
  dryRun?: boolean;
  courseId?: string;
  attachDiagnostic?: boolean;
};

async function findFall2026Course(courseId?: string) {
  if (courseId) {
    const [course] = await db
      .select({
        id: coursesTable.id,
        title: coursesTable.title,
        term: coursesTable.term,
      })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId))
      .limit(1);
    return course ?? null;
  }
  const [byTitle] = await db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      term: coursesTable.term,
    })
    .from(coursesTable)
    .where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE))
    .limit(1);
  if (byTitle) return byTitle;
  const courses = await db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      term: coursesTable.term,
    })
    .from(coursesTable);
  return courses.find((course) => isFall2026Term(course.term)) ?? null;
}

function isRestoreCandidate(session: {
  dateTime: Date;
  subject: string;
  title?: string | null;
}): boolean {
  return (
    isOctober2FallSatSession(session) && !isXavierSatCapabilitySession(session)
  );
}

async function emailForUser(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user?.email ?? null;
}

async function snapshotsFor(
  sessions: Array<typeof sessionsTable.$inferSelect>,
): Promise<October2SessionSnapshot[]> {
  return Promise.all(
    sessions.map(async (session) => {
      const assignments = await db
        .select({
          id: assignmentsTable.id,
          deliveryPhase: assignmentsTable.deliveryPhase,
          status: assignmentsTable.status,
        })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.sessionId, session.id));
      return {
        sessionId: session.id,
        status: session.status,
        bookingStatus: session.bookingStatus,
        clientUserId: session.clientUserId,
        clientEmail: await emailForUser(session.clientUserId),
        tutorUserId: session.tutorUserId,
        tutorEmail: await emailForUser(session.tutorUserId),
        title: session.title,
        dateTime: session.dateTime.toISOString(),
        timezone: session.timezone,
        durationMinutes: session.durationMinutes,
        assignmentCount: assignments.length,
        hasActivePrework: Boolean(selectActivePrework(assignments)),
      };
    }),
  );
}

async function ensureOctober2Memberships(courseId: string): Promise<void> {
  const people = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(inArray(usersTable.email, [SAMA_TEST_CLIENT_EMAIL, XAVIER_TUTOR_EMAIL]));
  for (const person of people) {
    const membershipRole =
      person.email === XAVIER_TUTOR_EMAIL && person.role === "tutor"
        ? "tutor"
        : person.email === SAMA_TEST_CLIENT_EMAIL && person.role === "student"
          ? "student"
          : null;
    if (!membershipRole) continue;
    await db
      .insert(courseMembershipsTable)
      .values({
        courseId,
        userId: person.id,
        membershipRole,
        subject: membershipRole === "tutor" ? "SAT" : "all",
      })
      .onConflictDoUpdate({
        target: [courseMembershipsTable.courseId, courseMembershipsTable.userId],
        set: {
          membershipRole,
          subject: membershipRole === "tutor" ? "SAT" : "all",
        },
      });
  }
}

async function assignOctober2TestPeople(sessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  if (!session) return;
  const extras = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(
      inArray(usersTable.email, [
        SAMA_TEST_CLIENT_EMAIL,
        TAITO_STUDENT_EMAIL,
        XAVIER_TUTOR_EMAIL,
        EUNICE_TUTOR_EMAIL,
      ]),
    );
  const sama = extras.find(
    (user) => user.email === SAMA_TEST_CLIENT_EMAIL && user.role === "student",
  );
  const taito = extras.find((user) => user.email === TAITO_STUDENT_EMAIL);
  const xavier = extras.find(
    (user) => user.email === XAVIER_TUTOR_EMAIL && user.role === "tutor",
  );
  const eunice = extras.find(
    (user) => user.email === EUNICE_TUTOR_EMAIL && user.role === "tutor",
  );
  const next = resolveOctober2SessionPeople({
    samaUserId: sama?.id,
    taitoUserId: taito?.id,
    xavierUserId: xavier?.id,
    euniceUserId: eunice?.id,
    existingClientUserId: session.clientUserId,
    existingTutorUserId: session.tutorUserId,
  });
  const clientName = sama?.displayName ?? taito?.displayName ?? "Sama";
  const tutorName =
    next.tutorUserId && xavier && next.tutorUserId === xavier.id
      ? xavier.displayName
      : (eunice?.displayName ?? "Eunice Chon");
  await db
    .update(sessionsTable)
    .set({
      clientUserId: next.clientUserId,
      tutorUserId: next.tutorUserId,
      title: sessionTitle(clientName, session.subject, tutorName),
      ...sessionVisibilityRestoreFields(),
      updatedAt: new Date(),
    })
    .where(eq(sessionsTable.id, session.id));
}

async function ensureDiagnosticIfMissing(sessionId: string): Promise<boolean> {
  const assignments = await db
    .select({
      deliveryPhase: assignmentsTable.deliveryPhase,
      status: assignmentsTable.status,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.sessionId, sessionId));
  if (selectActivePrework(assignments)) return false;
  try {
    await assignPreworkFromBank({
      sessionId,
      homeworkKind: "diagnostic",
    });
    return true;
  } catch {
    return false;
  }
}

export async function restoreTaitoOctober2SatSession(
  options: RestoreOctober2SatSessionOptions = {},
): Promise<RestoreOctober2SatSessionResult> {
  const course = await findFall2026Course(options.courseId);
  if (!course) {
    throw Object.assign(
      new Error("Fall 2026 SAT & IELTS course was not found."),
      { status: 404, code: "FALL_COURSE_NOT_FOUND" },
    );
  }

  const courseSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, course.id));
  const before = courseSessions.filter(isRestoreCandidate);
  const hidden = before.filter(sessionNeedsVisibilityRestore);

  if (options.dryRun) {
    const snapshots = await snapshotsFor(before);
    return {
      dryRun: true,
      courseId: course.id,
      created: !before.some(isTaitoFirstSatSession),
      restoredSessionIds: hidden.map((session) => session.id),
      alreadyActiveSessionIds: before
        .filter((session) => !sessionNeedsVisibilityRestore(session))
        .map((session) => session.id),
      preworkAttached: false,
      samaAssigned:
        (snapshots.find((row) =>
          before.some(
            (session) =>
              session.id === row.sessionId && isTaitoFirstSatSession(session),
          ),
        ) ?? snapshots[0])?.clientEmail === SAMA_TEST_CLIENT_EMAIL,
      session:
        snapshots.find((row) =>
          before.some(
            (session) =>
              session.id === row.sessionId && isTaitoFirstSatSession(session),
          ),
        ) ??
        snapshots[0] ??
        null,
      bankUntouched: true,
      attemptsUntouched: true,
    };
  }

  for (const session of hidden) {
    await db
      .update(sessionsTable)
      .set({
        ...sessionVisibilityRestoreFields(),
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, session.id));
  }

  const hadCanonical = before.some(isTaitoFirstSatSession);
  await ensureOctober2Memberships(course.id);
  await reconcileTaitoSessions(course.id);

  const afterSessions = (
    await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.courseId, course.id))
  ).filter(isRestoreCandidate);
  const canonicalRow =
    afterSessions.find(isTaitoFirstSatSession) ?? afterSessions[0] ?? null;
  if (canonicalRow) {
    await assignOctober2TestPeople(canonicalRow.id);
  }

  let preworkAttached = false;
  if (canonicalRow && options.attachDiagnostic !== false) {
    preworkAttached = await ensureDiagnosticIfMissing(canonicalRow.id);
  }

  const snapshots = await snapshotsFor(
    canonicalRow
      ? (
          await db
            .select()
            .from(sessionsTable)
            .where(eq(sessionsTable.id, canonicalRow.id))
        )
      : afterSessions,
  );

  return {
    dryRun: false,
    courseId: course.id,
    created: !hadCanonical && snapshots.length > 0,
    restoredSessionIds: hidden.map((session) => session.id),
    alreadyActiveSessionIds: before
      .filter((session) => !sessionNeedsVisibilityRestore(session))
      .map((session) => session.id),
    preworkAttached,
    samaAssigned: snapshots[0]?.clientEmail === SAMA_TEST_CLIENT_EMAIL,
    session: snapshots[0] ?? null,
    bankUntouched: true,
    attemptsUntouched: true,
  };
}

export const ensureOctober2SatSession = restoreTaitoOctober2SatSession;
