import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import {
  coursesTable,
  db,
  sessionsTable,
  studentSessionReminderSendsTable,
  usersTable,
  viewerLinksTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { isCancelledBooking } from "./session-listing.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { logger } from "./logger.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { sendTransactionalEmail } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { SESSION_REMINDER_INTERVAL_MS, SESSION_REMINDER_ONE_DAY_HOURS, deliverSessionReminders, isSessionReminderStudent, planSessionReminders, sessionReminderAllowlistFromEnv, sessionReminderClaimKey, startSessionReminderTick as startTick, type PlannedSessionReminder, type SessionReminderAudience, type SessionReminderCandidate, type SessionReminderKind, type SessionReminderPerson } from "./session-reminders.ts";

export type SessionReminderRunResult = {
  dryRun: boolean;
  considered: number;
  sent: number;
  alreadySent: number;
  skipped: number;
  failed: number;
  planned: Array<{
    sessionId: string;
    kind: SessionReminderKind;
    audience: SessionReminderAudience;
    to: string;
    subject: string;
  }>;
};

function personFrom(row: {
  id: string;
  email: string | null;
  displayName: string | null;
  timezone: string | null;
  timezoneSource: string | null;
}): SessionReminderPerson {
  return {
    userId: row.id,
    email: row.email,
    displayName: row.displayName,
    timezone: row.timezone,
    timezoneSource: row.timezoneSource,
  };
}

export async function runSessionReminders(input?: {
  now?: Date;
  dryRun?: boolean;
  allowlist?: ReadonlySet<string>;
}): Promise<SessionReminderRunResult> {
  const now = input?.now ?? new Date();
  const dryRun = input?.dryRun === true;
  const allowlist = input?.allowlist ?? sessionReminderAllowlistFromEnv();
  const windowEnd = new Date(now.getTime() + SESSION_REMINDER_ONE_DAY_HOURS * 60 * 60 * 1000);
  const result: SessionReminderRunResult = {
    dryRun,
    considered: 0,
    sent: 0,
    alreadySent: 0,
    skipped: 0,
    failed: 0,
    planned: [],
  };
  if (allowlist.size === 0) return result;

  const rows = await db
    .select({
      sessionId: sessionsTable.id,
      title: sessionsTable.title,
      dateTime: sessionsTable.dateTime,
      createdAt: sessionsTable.createdAt,
      durationMinutes: sessionsTable.durationMinutes,
      meetUrl: sessionsTable.meetUrl,
      providerEventUrl: sessionsTable.providerEventUrl,
      bookingStatus: sessionsTable.bookingStatus,
      cancelledAt: sessionsTable.cancelledAt,
      status: sessionsTable.status,
      subject: sessionsTable.subject,
      timezone: sessionsTable.timezone,
      courseId: sessionsTable.courseId,
      clientUserId: sessionsTable.clientUserId,
      tutorUserId: sessionsTable.tutorUserId,
      studentEmail: usersTable.email,
      studentName: usersTable.displayName,
      studentRole: usersTable.role,
      studentTimezone: usersTable.timezone,
      studentTimezoneSource: usersTable.timezoneSource,
      studentDedicatedMeetUrl: usersTable.dedicatedMeetUrl,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.clientUserId))
    .where(
      and(
        gte(sessionsTable.dateTime, now),
        lte(sessionsTable.dateTime, windowEnd),
        isNull(sessionsTable.cancelledAt),
        eq(sessionsTable.bookingStatus, "confirmed"),
        ne(sessionsTable.status, "archived"),
        eq(usersTable.role, "student"),
      ),
    );

  const eligible = rows.filter(
    (row) => row.clientUserId && isSessionReminderStudent(row.studentEmail, allowlist),
  );
  if (eligible.length === 0) return result;

  const tutorIds = [
    ...new Set(eligible.map((row) => row.tutorUserId).filter((id): id is string => Boolean(id))),
  ];
  const courseIds = [...new Set(eligible.map((row) => row.courseId))];
  const studentIds = eligible.map((row) => row.clientUserId).filter((id): id is string => Boolean(id));
  const sessionIds = eligible.map((row) => row.sessionId);

  const [tutors, courses, viewers, priorSends] = await Promise.all([
    loadReminderTutors(tutorIds),
    loadReminderCourses(courseIds),
    db
      .select({
        studentUserId: viewerLinksTable.studentUserId,
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        role: usersTable.role,
        timezone: usersTable.timezone,
        timezoneSource: usersTable.timezoneSource,
      })
      .from(viewerLinksTable)
      .innerJoin(usersTable, eq(usersTable.id, viewerLinksTable.viewerUserId))
      .where(
        and(
          inArray(viewerLinksTable.studentUserId, studentIds),
          eq(viewerLinksTable.active, true),
          eq(usersTable.role, "viewer"),
        ),
      ),
    db
      .select({
        sessionId: studentSessionReminderSendsTable.sessionId,
        recipientEmail: studentSessionReminderSendsTable.recipientEmail,
        kind: studentSessionReminderSendsTable.kind,
      })
      .from(studentSessionReminderSendsTable)
      .where(inArray(studentSessionReminderSendsTable.sessionId, sessionIds)),
  ]);

  const tutorById = new Map(tutors.map((tutor) => [tutor.id, tutor]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const viewersByStudent = new Map<string, SessionReminderPerson[]>();
  for (const viewer of viewers) {
    if (viewer.role !== "viewer") continue;
    const list = viewersByStudent.get(viewer.studentUserId) ?? [];
    list.push(personFrom(viewer));
    viewersByStudent.set(viewer.studentUserId, list);
  }

  const sessions: SessionReminderCandidate[] = eligible.map((session) => {
    const tutor = session.tutorUserId ? tutorById.get(session.tutorUserId) : undefined;
    const course = courseById.get(session.courseId);
    return {
      sessionId: session.sessionId,
      title: session.title,
      start: session.dateTime,
      createdAt: session.createdAt,
      durationMinutes: Number(session.durationMinutes) || 0,
      cancelled: isCancelledBooking({
        bookingStatus: session.bookingStatus,
        cancelledAt: session.cancelledAt,
      }),
      archived: session.status === "archived",
      confirmed: session.bookingStatus === "confirmed",
      student: {
        userId: session.clientUserId,
        email: session.studentEmail,
        displayName: session.studentName,
        timezone: session.studentTimezone,
        timezoneSource: session.studentTimezoneSource,
      },
      tutor: tutor ? personFrom(tutor) : null,
      viewers: session.clientUserId ? viewersByStudent.get(session.clientUserId) ?? [] : [],
      meeting: {
        meetUrl: session.meetUrl,
        providerEventUrl: session.providerEventUrl,
        courseMeetUrl: course?.meetUrl ?? null,
        term: course?.term ?? null,
        clientEmail: session.studentEmail,
        clientUserId: session.clientUserId,
        dateTime: session.dateTime,
        subject: session.subject,
        timezone: session.timezone,
        tutorName: tutor?.displayName ?? null,
        tutorEmail: tutor?.email ?? null,
        dedicatedMeetUrl: session.studentDedicatedMeetUrl,
      },
    };
  });

  const planned = planSessionReminders({ now, allowlist, sessions });
  const alreadySentKeys = new Set(
    priorSends.map((row) =>
      sessionReminderClaimKey({
        sessionId: row.sessionId,
        to: row.recipientEmail,
        kind: row.kind,
      }),
    ),
  );
  const delivery = await deliverSessionReminders({
    planned,
    dryRun,
    alreadySentKeys,
    claim: claimReminderSend,
    release: releaseReminderSend,
    send: (item) =>
      sendTransactionalEmail({
        to: item.to,
        from: item.from,
        subject: item.subject,
        text: item.text,
        html: item.html,
      }),
  });

  result.considered = delivery.considered;
  result.sent = delivery.sent;
  result.alreadySent = delivery.alreadySent;
  result.skipped = delivery.skipped;
  result.failed = delivery.failed;
  result.planned = planned.map((item) => ({
    sessionId: item.sessionId,
    kind: item.kind,
    audience: item.audience,
    to: item.to,
    subject: item.subject,
  }));
  return result;
}

type ReminderTutorRow = {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  timezoneSource: string;
};

type ReminderCourseRow = {
  id: string;
  meetUrl: string | null;
  term: string;
};

async function loadReminderTutors(tutorIds: string[]): Promise<ReminderTutorRow[]> {
  if (tutorIds.length === 0) return [];
  return db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      timezone: usersTable.timezone,
      timezoneSource: usersTable.timezoneSource,
    })
    .from(usersTable)
    .where(and(inArray(usersTable.id, tutorIds), eq(usersTable.role, "tutor")));
}

async function loadReminderCourses(courseIds: string[]): Promise<ReminderCourseRow[]> {
  if (courseIds.length === 0) return [];
  return db
    .select({
      id: coursesTable.id,
      meetUrl: coursesTable.meetUrl,
      term: coursesTable.term,
    })
    .from(coursesTable)
    .where(inArray(coursesTable.id, courseIds));
}

async function claimReminderSend(item: PlannedSessionReminder): Promise<string | null> {
  const claimed = await db
    .insert(studentSessionReminderSendsTable)
    .values({
      sessionId: item.sessionId,
      recipientUserId: item.recipientUserId,
      recipientEmail: item.to,
      audience: item.audience,
      kind: item.kind,
    })
    .onConflictDoNothing({
      target: [
        studentSessionReminderSendsTable.sessionId,
        studentSessionReminderSendsTable.recipientEmail,
        studentSessionReminderSendsTable.kind,
      ],
    })
    .returning({ id: studentSessionReminderSendsTable.id });
  return claimed[0]?.id ?? null;
}

async function releaseReminderSend(claimId: string): Promise<void> {
  await db
    .delete(studentSessionReminderSendsTable)
    .where(eq(studentSessionReminderSendsTable.id, claimId));
}

export function startSessionReminderTick(options?: {
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  run?: () => Promise<unknown>;
  runOnStart?: boolean;
}): { stop: () => void } {
  const run =
    options?.run ??
    (() =>
      runSessionReminders()
        .then((result) => {
          if (result.sent > 0 || result.failed > 0 || result.skipped > 0) {
            logger.info(
              {
                considered: result.considered,
                sent: result.sent,
                alreadySent: result.alreadySent,
                skipped: result.skipped,
                failed: result.failed,
              },
              "session reminder tick",
            );
          }
          return result;
        })
        .catch((err) => {
          logger.warn({ err }, "session reminder tick skipped");
        }));
  return startTick({
    run,
    intervalMs: options?.intervalMs ?? SESSION_REMINDER_INTERVAL_MS,
    setIntervalFn: options?.setIntervalFn,
    clearIntervalFn: options?.clearIntervalFn,
    runOnStart: options?.runOnStart,
  });
}

/** @deprecated Use runSessionReminders. Sophia is one student on the allowlist. */
export const runSophiaSessionReminders = runSessionReminders;
/** @deprecated Use startSessionReminderTick. */
export const startSophiaSessionReminderTick = startSessionReminderTick;
