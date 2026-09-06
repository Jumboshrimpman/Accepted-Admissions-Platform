import { and, eq, ilike, or } from "drizzle-orm";
import {
  assignmentsTable,
  courseMembershipsTable,
  coursesTable,
  db,
  sessionsTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { normalizeProvisionedEmail } from "./access-config.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { zonedDateTimeToUtc } from "./booking.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { assignPreworkFromBank } from "./sat-bank-service.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  TAITO_FALL_2026_SESSIONS,
  TAITO_STUDENT_EMAIL,
} from "./session-schedule.ts";

export const XAVIER_SAT_CAPABILITY_SESSION_TITLE = "SAT capability test — Xavier";
export const XAVIER_TUTOR_EMAIL = "xaver.rmz6@gmail.com";
export const XAVIER_CANONICAL_CLERK_USER_ID =
  "user_3IxUfoT1xRnDsqhlx5NN1eGfRg6";
export const XAVIER_DUPLICATE_CLERK_USER_ID =
  "user_3IsvKVDGAg5KdvwHhvODf2VFqtd";
export const SAMA_TEST_CLIENT_EMAIL = "samapostgrad@gmail.com";
export const SAMA_TEST_CLIENT_CLERK_USER_ID =
  "user_3IxQY4GUjQGp9wT1WXzbyCVH67G";
export const XAVIER_SAT_CAPABILITY_TIMEZONE = "America/New_York";
export const FALL_SAT_COURSE_TITLE = "Fall 2026 SAT & IELTS";

export type XavierSatCapabilityStudentSource = "sama" | "taito" | "none";

export type XavierSatCapabilitySeedResult = {
  created: boolean;
  sessionId: string | null;
  courseId: string | null;
  tutorUserId: string | null;
  clientUserId: string | null;
  studentSource: XavierSatCapabilityStudentSource;
  preworkAttached: boolean;
  skippedReason?: string;
};

export type XavierSatCapabilitySeedOptions = {
  now?: Date;
  courseId?: string;
  attachPrework?: boolean;
  identities?: {
    title?: string;
    xavierEmail?: string;
    xavierClerkUserId?: string;
    xavierDuplicateClerkUserId?: string;
    samaEmail?: string;
    samaClerkUserId?: string;
    taitoEmail?: string;
  };
};

export function isXavierSatCapabilitySession(session: {
  title?: string | null;
}): boolean {
  return (session.title ?? "")
    .trim()
    .startsWith(XAVIER_SAT_CAPABILITY_SESSION_TITLE);
}

export function sessionDisplayTitle(
  session: { title: string },
  generatedTitle: string,
): string {
  return isXavierSatCapabilitySession(session) ? session.title : generatedTitle;
}

function easternDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: XAVIER_SAT_CAPABILITY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function weekdayOfDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Next Mon–Fri 4:00 PM America/New_York, skipping Taito Fall dates (incl. Oct 2). */
export function nextWeekdayFourPmEastern(now = new Date()): Date {
  const reservedDates = new Set(
    TAITO_FALL_2026_SESSIONS.map((session) => session.dateKey),
  );
  let dateKey = easternDateKey(now);
  for (let offset = 0; offset < 21; offset += 1) {
    const weekday = weekdayOfDateKey(dateKey);
    if (weekday >= 1 && weekday <= 5 && !reservedDates.has(dateKey)) {
      const start = zonedDateTimeToUtc(
        dateKey,
        "16:00",
        XAVIER_SAT_CAPABILITY_TIMEZONE,
      );
      if (start.getTime() > now.getTime()) return start;
    }
    dateKey = addCalendarDays(dateKey, 1);
  }
  return zonedDateTimeToUtc(dateKey, "16:00", XAVIER_SAT_CAPABILITY_TIMEZONE);
}

async function findUserByEmail(email: string) {
  const normalized = normalizeProvisionedEmail(email);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalized))
    .limit(1);
  return user ?? null;
}

async function findUserByClerkId(clerkUserId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  return user ?? null;
}

async function resolveXavierUser(options: XavierSatCapabilitySeedOptions) {
  const email = normalizeProvisionedEmail(
    options.identities?.xavierEmail ?? XAVIER_TUTOR_EMAIL,
  );
  const canonicalClerkId =
    options.identities?.xavierClerkUserId ?? XAVIER_CANONICAL_CLERK_USER_ID;
  const duplicateClerkId =
    options.identities?.xavierDuplicateClerkUserId ??
    XAVIER_DUPLICATE_CLERK_USER_ID;

  const byCanonical = await findUserByClerkId(canonicalClerkId);
  const byEmail = await findUserByEmail(email);

  let user = byCanonical;
  if (!user && byEmail && byEmail.clerkUserId !== duplicateClerkId) {
    user = byEmail;
  }
  if (!user && byEmail && byEmail.clerkUserId === duplicateClerkId && !byCanonical) {
    user = byEmail;
  }

  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({
        clerkUserId: canonicalClerkId,
        email,
        displayName: "Xavier Morales",
        role: "tutor",
        timezone: XAVIER_SAT_CAPABILITY_TIMEZONE,
      })
      .returning();
    user = created!;
  }

  const canClaimCanonical = !byCanonical || byCanonical.id === user.id;
  const shouldRemapClerk =
    canClaimCanonical &&
    (user.clerkUserId === duplicateClerkId ||
      user.clerkUserId.startsWith("pending:"));

  if (user.role !== "tutor" || user.email !== email || shouldRemapClerk) {
    const [updated] = await db
      .update(usersTable)
      .set({
        email,
        displayName: user.displayName.trim() || "Xavier Morales",
        role: "tutor",
        clerkUserId: shouldRemapClerk ? canonicalClerkId : user.clerkUserId,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id))
      .returning();
    user = updated ?? user;
  }

  const [profile] = await db
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.email, email))
    .limit(1);
  if (profile) {
    if (profile.userId !== user.id) {
      await db
        .update(tutorProfilesTable)
        .set({ userId: user.id, updatedAt: new Date() })
        .where(eq(tutorProfilesTable.id, profile.id));
    }
  } else {
    await db
      .insert(tutorProfilesTable)
      .values({
        userId: user.id,
        email,
        name: "Xavier Morales",
        title: "SAT & Math Tutor",
        subjects: ["SAT", "Math"],
        bookingEligible: true,
        publicApproved: true,
      })
      .onConflictDoNothing();
  }

  return user;
}

async function resolveStudent(options: XavierSatCapabilitySeedOptions): Promise<{
  user: typeof usersTable.$inferSelect | null;
  source: XavierSatCapabilityStudentSource;
}> {
  const samaEmail = normalizeProvisionedEmail(
    options.identities?.samaEmail ?? SAMA_TEST_CLIENT_EMAIL,
  );
  const samaClerkId =
    options.identities?.samaClerkUserId ?? SAMA_TEST_CLIENT_CLERK_USER_ID;
  const taitoEmail = normalizeProvisionedEmail(
    options.identities?.taitoEmail ?? TAITO_STUDENT_EMAIL,
  );

  const sama =
    (await findUserByClerkId(samaClerkId)) ?? (await findUserByEmail(samaEmail));
  if (sama && sama.role === "student") {
    return { user: sama, source: "sama" };
  }

  const taito = await findUserByEmail(taitoEmail);
  if (taito && taito.role === "student") {
    return { user: taito, source: "taito" };
  }

  return { user: null, source: "none" };
}

async function resolveCourse(courseId?: string) {
  if (courseId) {
    const [course] = await db
      .select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId))
      .limit(1);
    return course ?? null;
  }
  const [fall] = await db
    .select({ id: coursesTable.id, title: coursesTable.title })
    .from(coursesTable)
    .where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE))
    .limit(1);
  if (fall) return fall;
  const [sat] = await db
    .select({ id: coursesTable.id, title: coursesTable.title })
    .from(coursesTable)
    .where(
      or(
        ilike(coursesTable.title, "%SAT%"),
        ilike(coursesTable.subject, "%SAT%"),
      ),
    )
    .limit(1);
  return sat ?? null;
}

async function ensureMembership(
  courseId: string,
  userId: string,
  role: "tutor" | "student",
  subject: string,
) {
  await db
    .insert(courseMembershipsTable)
    .values({
      courseId,
      userId,
      membershipRole: role,
      subject,
    })
    .onConflictDoUpdate({
      target: [courseMembershipsTable.courseId, courseMembershipsTable.userId],
      set: { membershipRole: role, subject },
    });
}

async function attachRoutinePrework(sessionId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, sessionId),
        eq(assignmentsTable.deliveryPhase, "before_session"),
      ),
    )
    .limit(1);
  if (existing) return false;
  try {
    await assignPreworkFromBank({
      sessionId,
      homeworkKind: "routine",
      targetMinutes: 60,
    });
    return true;
  } catch {
    return false;
  }
}

export async function ensureXavierSatCapabilitySession(
  options: XavierSatCapabilitySeedOptions = {},
): Promise<XavierSatCapabilitySeedResult> {
  const title =
    options.identities?.title?.trim() || XAVIER_SAT_CAPABILITY_SESSION_TITLE;
  const course = await resolveCourse(options.courseId);
  if (!course) {
    return {
      created: false,
      sessionId: null,
      courseId: null,
      tutorUserId: null,
      clientUserId: null,
      studentSource: "none",
      preworkAttached: false,
      skippedReason: "No SAT course is available to attach the session.",
    };
  }

  const xavier = await resolveXavierUser(options);
  const student = await resolveStudent(options);
  await ensureMembership(course.id, xavier.id, "tutor", "SAT");
  if (student.user) {
    await ensureMembership(course.id, student.user.id, "student", "all");
  }

  const [existing] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.tutorUserId, xavier.id),
        eq(sessionsTable.title, title),
      ),
    )
    .limit(1);

  if (existing) {
    const needsPeopleUpdate =
      existing.tutorUserId !== xavier.id ||
      existing.clientUserId !== (student.user?.id ?? existing.clientUserId);
    if (needsPeopleUpdate) {
      await db
        .update(sessionsTable)
        .set({
          tutorUserId: xavier.id,
          clientUserId: student.user?.id ?? existing.clientUserId,
          updatedAt: new Date(),
        })
        .where(eq(sessionsTable.id, existing.id));
    }
    const preworkAttached =
      options.attachPrework === false
        ? false
        : await attachRoutinePrework(existing.id);
    return {
      created: false,
      sessionId: existing.id,
      courseId: existing.courseId,
      tutorUserId: xavier.id,
      clientUserId: student.user?.id ?? existing.clientUserId,
      studentSource: student.source,
      preworkAttached,
    };
  }

  const dateTime = nextWeekdayFourPmEastern(options.now);
  const [created] = await db
    .insert(sessionsTable)
    .values({
      courseId: course.id,
      clientUserId: student.user?.id ?? null,
      tutorUserId: xavier.id,
      dateTime,
      timezone: XAVIER_SAT_CAPABILITY_TIMEZONE,
      subject: "SAT",
      title,
      status: "published",
      durationMinutes: 60,
      bookingStatus: "confirmed",
      hasHomework: false,
    })
    .returning();

  const preworkAttached =
    options.attachPrework === false
      ? false
      : await attachRoutinePrework(created!.id);

  return {
    created: true,
    sessionId: created!.id,
    courseId: course.id,
    tutorUserId: xavier.id,
    clientUserId: student.user?.id ?? null,
    studentSource: student.source,
    preworkAttached,
  };
}
