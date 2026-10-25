import { and, eq } from "drizzle-orm";
import {
  courseMembershipsTable,
  coursesTable,
  db,
  tutorAssignmentsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger.ts";
import { VICTORIA_USER_ID } from "./college-consulting.ts";
import { CANONICAL_XAVIER_EMAIL } from "./xavier-identity.ts";
import { EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL } from "./session-schedule.ts";
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";
import { isVictoriaBookingProfile } from "./victoria-booking.ts";

/** Same course title as FALL_SAT_COURSE_TITLE. Inlined so this seed does not load the SAT bank. */
const SOPHIA_FALL_COURSE_TITLE = "Fall 2026 SAT & IELTS";

/**
 * Sophia Sleiman's SAT roster. Inserts tutor_assignments only.
 * Does not email, notify, invite, or change any other student's links.
 * Victoria stays unbookable for every other client.
 */
export const SOPHIA_TUTOR_LINK_SUBJECT = "SAT";

export const SOPHIA_TUTOR_LINK_SPECS = [
  { key: "xavier", email: CANONICAL_XAVIER_EMAIL },
  { key: "eunice", email: EUNICE_TUTOR_EMAIL },
  { key: "nika", email: NIKA_TUTOR_EMAIL },
  { key: "victoria", userId: VICTORIA_USER_ID },
] as const;

export type SophiaTutorLinkSpec = {
  key: string;
  email?: string;
  userId?: string;
};

export type SophiaTutorLinkResult = {
  action: "linked" | "skipped";
  reason: string | null;
  studentFound: boolean;
  before: number;
  inserted: number;
  already: number;
  missing: number;
};

type VictoriaBookerProfile = {
  name?: string | null;
  email?: string | null;
  userId?: string | null;
  tutorKey?: string | null;
  calendarStatus?: string | null;
};

export function sophiaVictoriaIdentity(
  profile: VictoriaBookerProfile,
  bookerUserId?: string | null,
): boolean {
  return bookerUserId === SOPHIA_SLEIMAN_SAT_USER_ID && isVictoriaBookingProfile(profile);
}

/** Connected calendar: Sophia books Victoria like her other SAT tutors. */
export function sophiaMayBookVictoria(
  profile: VictoriaBookerProfile,
  bookerUserId?: string | null,
): boolean {
  return sophiaVictoriaIdentity(profile, bookerUserId) && profile.calendarStatus === "connected";
}

/** Disconnected calendar: Sophia sees Victoria as Coming soon, with no slots. */
export function sophiaVictoriaComingSoon(
  profile: VictoriaBookerProfile,
  bookerUserId?: string | null,
): boolean {
  return sophiaVictoriaIdentity(profile, bookerUserId) && profile.calendarStatus !== "connected";
}

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function empty(reason: string, studentFound = false): SophiaTutorLinkResult {
  return {
    action: "skipped",
    reason,
    studentFound,
    before: 0,
    inserted: 0,
    already: 0,
    missing: 0,
  };
}

export async function ensureSophiaTutorLinks(options?: {
  studentUserId?: string;
  tutors?: readonly SophiaTutorLinkSpec[];
  courseTitle?: string;
}): Promise<SophiaTutorLinkResult> {
  const studentUserId = options?.studentUserId ?? SOPHIA_SLEIMAN_SAT_USER_ID;
  const tutors = options?.tutors ?? SOPHIA_TUTOR_LINK_SPECS;
  const courseTitle = options?.courseTitle ?? SOPHIA_FALL_COURSE_TITLE;

  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.title, courseTitle))
    .limit(1);
  if (!course) {
    const skipped = empty("course_missing");
    logger.info(skipped, "Sophia tutor links skipped");
    return skipped;
  }

  const [student] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, studentUserId))
    .limit(1);
  if (!student || student.role !== "student") {
    const skipped = empty("student_missing", Boolean(student));
    logger.info(skipped, "Sophia tutor links skipped");
    return skipped;
  }

  const tutorUsers = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.role, "tutor"));

  const desiredIds: string[] = [];
  let missing = 0;
  for (const spec of tutors) {
    const match = tutorUsers.find((tutor) => {
      if (spec.userId && tutor.id === spec.userId) return true;
      if (spec.email && normalizeEmail(tutor.email) === normalizeEmail(spec.email)) return true;
      return false;
    });
    if (!match) {
      missing += 1;
      continue;
    }
    if (!desiredIds.includes(match.id)) desiredIds.push(match.id);
  }

  const existing = await db
    .select({ tutorUserId: tutorAssignmentsTable.tutorUserId })
    .from(tutorAssignmentsTable)
    .where(
      and(
        eq(tutorAssignmentsTable.courseId, course.id),
        eq(tutorAssignmentsTable.studentUserId, student.id),
        eq(tutorAssignmentsTable.subject, SOPHIA_TUTOR_LINK_SUBJECT),
      ),
    );
  const existingIds = new Set(existing.map((row) => row.tutorUserId));
  const before = desiredIds.filter((id) => existingIds.has(id)).length;
  let inserted = 0;
  for (const tutorUserId of desiredIds) {
    if (existingIds.has(tutorUserId)) continue;
    const created = await db
      .insert(tutorAssignmentsTable)
      .values({
        courseId: course.id,
        tutorUserId,
        studentUserId: student.id,
        subject: SOPHIA_TUTOR_LINK_SUBJECT,
      })
      .onConflictDoNothing()
      .returning({ id: tutorAssignmentsTable.id });
    if (created.length > 0) inserted += 1;
  }

  await db
    .insert(courseMembershipsTable)
    .values({
      courseId: course.id,
      userId: student.id,
      membershipRole: "student",
      subject: "all",
    })
    .onConflictDoNothing();

  const result: SophiaTutorLinkResult = {
    action: "linked",
    reason: null,
    studentFound: true,
    before,
    inserted,
    already: before,
    missing,
  };
  logger.info(result, "Sophia tutor links ready");
  return result;
}
