import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
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
const capabilityModule = await import("./xavier-sat-capability-session.ts");
const {
  XAVIER_CANONICAL_CLERK_USER_ID,
  XAVIER_DUPLICATE_CLERK_USER_ID,
  XAVIER_SAT_CAPABILITY_SESSION_TITLE,
  XAVIER_SAT_CAPABILITY_TIMEZONE,
  XAVIER_TUTOR_EMAIL,
  SAMA_TEST_CLIENT_CLERK_USER_ID,
  SAMA_TEST_CLIENT_EMAIL,
  ensureXavierSatCapabilitySession,
  isXavierSatCapabilitySession,
  nextWeekdayFourPmEastern,
  sessionDisplayTitle,
} = capabilityModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const privacyModule = await import("./session-privacy.ts");
const { reconcileTaitoSessions } = privacyModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const dashboardModule = await import("./dashboard-data.ts");
const { dashboardSessionShape } = dashboardModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const scheduleModule = await import("./session-schedule.ts");
const { TAITO_FALL_2026_SESSIONS, taitoSessionDateTime } = scheduleModule;

function easternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    time: `${value("hour")}:${value("minute")}`,
  };
}

test("keeps the canonical Xavier Clerk id and capability-test title", () => {
  assert.equal(XAVIER_TUTOR_EMAIL, "xaver.rmz6@gmail.com");
  assert.equal(XAVIER_CANONICAL_CLERK_USER_ID, "user_3IxUfoT1xRnDsqhlx5NN1eGfRg6");
  assert.equal(XAVIER_DUPLICATE_CLERK_USER_ID, "user_3IsvKVDGAg5KdvwHhvODf2VFqtd");
  assert.equal(SAMA_TEST_CLIENT_EMAIL, "samapostgrad@gmail.com");
  assert.equal(
    SAMA_TEST_CLIENT_CLERK_USER_ID,
    "user_3IxQY4GUjQGp9wT1WXzbyCVH67G",
  );
  assert.equal(
    isXavierSatCapabilitySession({ title: XAVIER_SAT_CAPABILITY_SESSION_TITLE }),
    true,
  );
  assert.equal(
    sessionDisplayTitle(
      { title: XAVIER_SAT_CAPABILITY_SESSION_TITLE },
      "Sama’s SAT Session with Xavier",
    ),
    XAVIER_SAT_CAPABILITY_SESSION_TITLE,
  );
});

test("picks the next weekday 4pm Eastern and skips Taito Fall dates", () => {
  const fromSunday = nextWeekdayFourPmEastern(new Date("2026-09-06T18:00:00.000Z"));
  assert.deepEqual(easternParts(fromSunday), {
    date: "2026-09-07",
    weekday: "Mon",
    time: "16:00",
  });
  assert.equal(fromSunday.getTime() > Date.parse("2026-09-06T18:00:00.000Z"), true);

  const afterFridayAfternoon = nextWeekdayFourPmEastern(
    new Date("2026-09-11T21:00:00.000Z"),
  );
  assert.deepEqual(easternParts(afterFridayAfternoon), {
    date: "2026-09-14",
    weekday: "Mon",
    time: "16:00",
  });

  const beforeOct2 = nextWeekdayFourPmEastern(new Date("2026-10-01T23:00:00.000Z"));
  assert.notEqual(easternParts(beforeOct2).date, "2026-10-02");
  assert.ok(
    !TAITO_FALL_2026_SESSIONS.some(
      (session) => session.dateKey === easternParts(beforeOct2).date,
    ),
  );
  assert.deepEqual(easternParts(beforeOct2), {
    date: "2026-10-05",
    weekday: "Mon",
    time: "16:00",
  });
});

async function createCourse(suffix: string) {
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Xavier SAT capability fixture ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  return course!;
}

async function createUser(input: {
  email: string;
  displayName: string;
  role: "tutor" | "student";
  clerkUserId: string;
}) {
  const [user] = await db.insert(usersTable).values(input).returning();
  return user!;
}

test("seeds one Xavier SAT capability session for Sama and stays idempotent", async () => {
  const suffix = randomUUID();
  const title = `SAT capability test — Xavier ${suffix}`;
  const course = await createCourse(suffix);
  const xavier = await createUser({
    email: `xavier-${suffix}@example.invalid`,
    displayName: "Xavier Morales",
    role: "tutor",
    clerkUserId: `xavier-canonical:${suffix}`,
  });
  const duplicate = await createUser({
    email: `xavier-duplicate-${suffix}@example.invalid`,
    displayName: "Xavier Duplicate",
    role: "tutor",
    clerkUserId: `xavier-duplicate:${suffix}`,
  });
  const sama = await createUser({
    email: `sama-${suffix}@example.invalid`,
    displayName: "Sama Test Client",
    role: "student",
    clerkUserId: `sama-client:${suffix}`,
  });
  const taito = await createUser({
    email: `taito-${suffix}@example.invalid`,
    displayName: "Taito Goto",
    role: "student",
    clerkUserId: `taito-client:${suffix}`,
  });

  try {
    const first = await ensureXavierSatCapabilitySession({
      now: new Date("2026-09-06T18:00:00.000Z"),
      courseId: course.id,
      attachPrework: false,
      identities: {
        title,
        xavierEmail: xavier.email,
        xavierClerkUserId: xavier.clerkUserId,
        xavierDuplicateClerkUserId: duplicate.clerkUserId,
        samaEmail: sama.email,
        samaClerkUserId: sama.clerkUserId,
        taitoEmail: taito.email,
      },
    });
    assert.equal(first.created, true);
    assert.equal(first.studentSource, "sama");
    assert.equal(first.tutorUserId, xavier.id);
    assert.equal(first.clientUserId, sama.id);
    assert.notEqual(first.tutorUserId, duplicate.id);

    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, first.sessionId!));
    assert.equal(session?.title, title);
    assert.equal(session?.subject, "SAT");
    assert.equal(session?.status, "published");
    assert.equal(session?.bookingStatus, "confirmed");
    assert.equal(session?.durationMinutes, 60);
    assert.equal(session?.timezone, XAVIER_SAT_CAPABILITY_TIMEZONE);
    assert.equal(session?.tutorUserId, xavier.id);
    assert.equal(session?.clientUserId, sama.id);
    assert.deepEqual(easternParts(session!.dateTime), {
      date: "2026-09-07",
      weekday: "Mon",
      time: "16:00",
    });

    const memberships = await db
      .select()
      .from(courseMembershipsTable)
      .where(eq(courseMembershipsTable.courseId, course.id));
    assert.equal(
      memberships.some(
        (row) => row.userId === xavier.id && row.membershipRole === "tutor",
      ),
      true,
    );
    assert.equal(
      memberships.some(
        (row) => row.userId === sama.id && row.membershipRole === "student",
      ),
      true,
    );

    const second = await ensureXavierSatCapabilitySession({
      now: new Date("2026-09-20T18:00:00.000Z"),
      courseId: course.id,
      attachPrework: false,
      identities: {
        title,
        xavierEmail: xavier.email,
        xavierClerkUserId: xavier.clerkUserId,
        xavierDuplicateClerkUserId: duplicate.clerkUserId,
        samaEmail: sama.email,
        samaClerkUserId: sama.clerkUserId,
        taitoEmail: taito.email,
      },
    });
    assert.equal(second.created, false);
    assert.equal(second.sessionId, first.sessionId);
    const copies = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(
        and(eq(sessionsTable.courseId, course.id), eq(sessionsTable.title, title)),
      );
    assert.equal(copies.length, 1);
    const [unchanged] = await db
      .select({ dateTime: sessionsTable.dateTime })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, first.sessionId!));
    assert.equal(unchanged?.dateTime.toISOString(), session!.dateTime.toISOString());

    const display = dashboardSessionShape(
      { ...session!, title: XAVIER_SAT_CAPABILITY_SESSION_TITLE },
      { id: xavier.id, name: xavier.displayName, specialty: "SAT", avatarUrl: null },
      null,
      { id: sama.id, name: sama.displayName },
      sama.displayName,
    );
    assert.equal(display.title, XAVIER_SAT_CAPABILITY_SESSION_TITLE);
  } finally {
    await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.courseId, course.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course.id));
    await db
      .delete(tutorProfilesTable)
      .where(inArray(tutorProfilesTable.email, [xavier.email, duplicate.email]));
    await db.delete(coursesTable).where(eq(coursesTable.id, course.id));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, [xavier.id, duplicate.id, sama.id, taito.id]));
  }
});

test("remaps Xavier's duplicate Clerk id to the canonical Production id", async () => {
  const suffix = randomUUID();
  const title = `SAT capability test — Xavier remap ${suffix}`;
  const course = await createCourse(suffix);
  const xavier = await createUser({
    email: `xavier-remap-${suffix}@example.invalid`,
    displayName: "Xavier Morales",
    role: "tutor",
    clerkUserId: `xavier-duplicate-remap:${suffix}`,
  });

  try {
    const seeded = await ensureXavierSatCapabilitySession({
      now: new Date("2026-09-06T18:00:00.000Z"),
      courseId: course.id,
      attachPrework: false,
      identities: {
        title,
        xavierEmail: xavier.email,
        xavierClerkUserId: `xavier-canonical-remap:${suffix}`,
        xavierDuplicateClerkUserId: xavier.clerkUserId,
        samaEmail: `missing-sama-remap-${suffix}@example.invalid`,
        samaClerkUserId: `missing-sama-remap:${suffix}`,
        taitoEmail: `missing-taito-remap-${suffix}@example.invalid`,
      },
    });
    const [updated] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, xavier.id));
    assert.equal(updated?.clerkUserId, `xavier-canonical-remap:${suffix}`);
    assert.equal(seeded.tutorUserId, xavier.id);
    assert.notEqual(updated?.clerkUserId, `xavier-duplicate-remap:${suffix}`);
  } finally {
    await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.courseId, course.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course.id));
    await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.email, xavier.email));
    await db.delete(coursesTable).where(eq(coursesTable.id, course.id));
    await db.delete(usersTable).where(eq(usersTable.id, xavier.id));
  }
});

test("falls back to Taito, then tutor-only, and never uses the duplicate Xavier Clerk user", async () => {
  const suffix = randomUUID();
  const title = `SAT capability test — Xavier fallback ${suffix}`;
  const course = await createCourse(suffix);
  const xavier = await createUser({
    email: `xavier-fallback-${suffix}@example.invalid`,
    displayName: "Xavier Morales",
    role: "tutor",
    clerkUserId: `xavier-canonical-fallback:${suffix}`,
  });
  const duplicate = await createUser({
    email: `xavier-dup-fallback-${suffix}@example.invalid`,
    displayName: "Xavier Duplicate",
    role: "tutor",
    clerkUserId: `xavier-duplicate-fallback:${suffix}`,
  });
  const taito = await createUser({
    email: `taito-fallback-${suffix}@example.invalid`,
    displayName: "Taito Goto",
    role: "student",
    clerkUserId: `taito-fallback:${suffix}`,
  });

  try {
    const withTaito = await ensureXavierSatCapabilitySession({
      now: new Date("2026-09-08T18:00:00.000Z"),
      courseId: course.id,
      attachPrework: false,
      identities: {
        title,
        xavierEmail: xavier.email,
        xavierClerkUserId: xavier.clerkUserId,
        xavierDuplicateClerkUserId: duplicate.clerkUserId,
        samaEmail: `missing-sama-${suffix}@example.invalid`,
        samaClerkUserId: `missing-sama:${suffix}`,
        taitoEmail: taito.email,
      },
    });
    assert.equal(withTaito.studentSource, "taito");
    assert.equal(withTaito.clientUserId, taito.id);
    assert.equal(withTaito.tutorUserId, xavier.id);

    await db.delete(sessionsTable).where(eq(sessionsTable.id, withTaito.sessionId!));
    await db
      .delete(courseMembershipsTable)
      .where(eq(courseMembershipsTable.userId, taito.id));
    await db.delete(usersTable).where(eq(usersTable.id, taito.id));

    const tutorOnly = await ensureXavierSatCapabilitySession({
      now: new Date("2026-09-08T18:00:00.000Z"),
      courseId: course.id,
      attachPrework: false,
      identities: {
        title,
        xavierEmail: xavier.email,
        xavierClerkUserId: xavier.clerkUserId,
        xavierDuplicateClerkUserId: duplicate.clerkUserId,
        samaEmail: `missing-sama-${suffix}@example.invalid`,
        samaClerkUserId: `missing-sama:${suffix}`,
        taitoEmail: `missing-taito-${suffix}@example.invalid`,
      },
    });
    assert.equal(tutorOnly.studentSource, "none");
    assert.equal(tutorOnly.clientUserId, null);
    assert.equal(tutorOnly.tutorUserId, xavier.id);
    assert.notEqual(tutorOnly.tutorUserId, duplicate.id);
  } finally {
    await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.courseId, course.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course.id));
    await db
      .delete(tutorProfilesTable)
      .where(inArray(tutorProfilesTable.email, [xavier.email, duplicate.email]));
    await db.delete(coursesTable).where(eq(coursesTable.id, course.id));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, [xavier.id, duplicate.id, taito.id]));
  }
});

test("does not rewrite Taito Oct 2 diagnostic homework or steal the session during reconcile", async () => {
  const suffix = randomUUID();
  const title = `SAT capability test — Xavier ${suffix}`;
  const course = await createCourse(suffix);
  const xavier = await createUser({
    email: `xavier-diag-${suffix}@example.invalid`,
    displayName: "Xavier Morales",
    role: "tutor",
    clerkUserId: `xavier-diag:${suffix}`,
  });
  const eunice = await createUser({
    email: `eunice-diag-${suffix}@example.invalid`,
    displayName: "Eunice Chon",
    role: "tutor",
    clerkUserId: `eunice-diag:${suffix}`,
  });
  const [existingTaito] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, "taito0525@gmail.com"))
    .limit(1);
  const taito =
    existingTaito ??
    (await createUser({
      email: "taito0525@gmail.com",
      displayName: "Taito Goto",
      role: "student",
      clerkUserId: `taito-diag:${suffix}`,
    }));

  const [diagnosticSession] = await db
    .insert(sessionsTable)
    .values({
      courseId: course.id,
      clientUserId: taito.id,
      tutorUserId: eunice.id,
      dateTime: taitoSessionDateTime("2026-10-02"),
      timezone: "Asia/Tokyo",
      subject: "SAT",
      title: "Taito’s SAT Session with Eunice",
      status: "published",
      hasHomework: true,
    })
    .returning();
  const [diagnostic] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course.id,
      sessionId: diagnosticSession!.id,
      deliveryPhase: "before_session",
      title: "Full SAT Practice Diagnostic",
      subject: "SAT Reading & Writing",
      instructions: "Do not reset this diagnostic.",
      status: "published",
      timeLimitMinutes: 65,
      maxAttempts: 1,
    })
    .returning();

  try {
    const seeded = await ensureXavierSatCapabilitySession({
      now: new Date("2026-09-06T18:00:00.000Z"),
      courseId: course.id,
      attachPrework: false,
      identities: {
        title,
        xavierEmail: xavier.email,
        xavierClerkUserId: xavier.clerkUserId,
        samaEmail: `missing-sama-diag-${suffix}@example.invalid`,
        samaClerkUserId: `missing-sama-diag:${suffix}`,
        taitoEmail: taito.email,
      },
    });
    assert.equal(seeded.created, true);
    assert.notEqual(seeded.sessionId, diagnosticSession!.id);

    await reconcileTaitoSessions(course.id);

    const [capability] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, seeded.sessionId!));
    assert.equal(capability?.tutorUserId, xavier.id);
    assert.equal(capability?.title, title);
    assert.equal(capability?.clientUserId, taito.id);

    const [stillDiagnostic] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, diagnostic!.id));
    assert.equal(stillDiagnostic?.title, "Full SAT Practice Diagnostic");
    assert.equal(stillDiagnostic?.sessionId, diagnosticSession!.id);
    assert.equal(stillDiagnostic?.status, "published");
    assert.equal(stillDiagnostic?.timeLimitMinutes, 65);

    const [oct2] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, diagnosticSession!.id));
    assert.equal(oct2?.title, "Taito’s SAT Session with Eunice");
    assert.equal(oct2?.hasHomework, true);
  } finally {
    await db.delete(assignmentsTable).where(eq(assignmentsTable.courseId, course.id));
    await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.courseId, course.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, course.id));
    await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.email, xavier.email));
    await db.delete(coursesTable).where(eq(coursesTable.id, course.id));
    await db.delete(usersTable).where(inArray(usersTable.id, [xavier.id, eunice.id]));
  }
});
