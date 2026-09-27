import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { CANONICAL_XAVIER_CLERK_USER_ID, RETIRED_XAVIER_CLERK_USER_ID } from "./xavier-identity.ts";
import { EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL, TAITO_STUDENT_EMAIL } from "./session-schedule.ts";
import {
  CAPABILITY_RESET_SAMA_EMAIL,
  CAPABILITY_RESET_SESSION_TITLE_PREFIX,
  capabilityAssignmentFixes,
  capabilityResetScope,
  capabilitySessionDayIsPast,
  capabilitySessionNeedsVisibilityRestore,
  isSamaXavierCapabilityResetTarget,
  shouldRefreshCapabilitySchedule,
} from "./reset-sama-xavier-capability-select.ts";

const XAVIER_EMAIL = "xaver.rmz6@gmail.com";
const MICHELLE_EMAIL = "makaremmichelle7@gmail.com";
const RYO_EMAIL = "ryo@jaac.co.jp";

test("scope guard accepts only samapostgrad on Xavier's capability session", () => {
  assert.equal(CAPABILITY_RESET_SAMA_EMAIL, "samapostgrad@gmail.com");
  assert.equal(
    isSamaXavierCapabilityResetTarget({
      sessionTitle: CAPABILITY_RESET_SESSION_TITLE_PREFIX,
      clientEmail: "SamaPostgrad@gmail.com",
      tutorEmail: "Xaver.rmz6@gmail.com",
      tutorClerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
    }),
    true,
  );
  assert.equal(
    isSamaXavierCapabilityResetTarget({
      sessionTitle: `${CAPABILITY_RESET_SESSION_TITLE_PREFIX} fixture`,
      clientEmail: CAPABILITY_RESET_SAMA_EMAIL,
      tutorEmail: XAVIER_EMAIL,
      tutorClerkUserId: RETIRED_XAVIER_CLERK_USER_ID,
    }),
    true,
  );
});

test("scope guard refuses Taito, Michelle, Ryo, Eunice, and Nika", () => {
  const capability = {
    sessionTitle: CAPABILITY_RESET_SESSION_TITLE_PREFIX,
    tutorEmail: XAVIER_EMAIL,
    tutorClerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
  };
  for (const clientEmail of [
    TAITO_STUDENT_EMAIL,
    MICHELLE_EMAIL,
    RYO_EMAIL,
    EUNICE_TUTOR_EMAIL,
    NIKA_TUTOR_EMAIL,
  ]) {
    assert.equal(
      isSamaXavierCapabilityResetTarget({ ...capability, clientEmail }),
      false,
      clientEmail,
    );
    const refused = capabilityResetScope({ samaEmail: clientEmail });
    assert.equal(refused.ok, false, clientEmail);
  }

  assert.equal(
    isSamaXavierCapabilityResetTarget({
      sessionTitle: "Sama’s SAT Session with Eunice",
      clientEmail: CAPABILITY_RESET_SAMA_EMAIL,
      tutorEmail: EUNICE_TUTOR_EMAIL,
      tutorClerkUserId: "user_eunice",
    }),
    false,
  );
  assert.equal(
    isSamaXavierCapabilityResetTarget({
      sessionTitle: CAPABILITY_RESET_SESSION_TITLE_PREFIX,
      clientEmail: CAPABILITY_RESET_SAMA_EMAIL,
      tutorEmail: NIKA_TUTOR_EMAIL,
      tutorClerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
    }),
    false,
  );
  assert.equal(
    isSamaXavierCapabilityResetTarget({
      sessionTitle: "60-minute SAT pre-work — SAT capability test — Xavier",
      clientEmail: CAPABILITY_RESET_SAMA_EMAIL,
      tutorEmail: XAVIER_EMAIL,
      tutorClerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
    }),
    false,
  );
  assert.equal(
    isSamaXavierCapabilityResetTarget({
      sessionTitle: CAPABILITY_RESET_SESSION_TITLE_PREFIX,
      clientEmail: CAPABILITY_RESET_SAMA_EMAIL,
      tutorEmail: XAVIER_EMAIL,
      tutorClerkUserId: "user_someone_else",
    }),
    false,
  );
  assert.equal(
    capabilityResetScope({ titlePrefix: "Sama’s SAT Session with Eunice" }).ok,
    false,
  );
  assert.equal(capabilityResetScope({ xavierEmail: EUNICE_TUTOR_EMAIL }).ok, false);
});

test("republishes one archived capability quiz and clears only past deadlines", () => {
  const now = new Date("2026-09-20T18:00:00.000Z");
  const fixes = capabilityAssignmentFixes(
    [
      {
        id: "archived-empty",
        deliveryPhase: "before_session",
        status: "archived",
        deadline: new Date("2026-09-01T00:00:00.000Z"),
        questionCount: 0,
      },
      {
        id: "archived-quiz",
        deliveryPhase: "before_session",
        status: "archived",
        deadline: new Date("2026-09-01T00:00:00.000Z"),
        questionCount: 12,
      },
      {
        id: "during",
        deliveryPhase: "during_session",
        status: "published",
        deadline: new Date("2026-10-01T00:00:00.000Z"),
        questionCount: 3,
      },
    ],
    now,
  );
  assert.deepEqual(fixes.publishIds, ["archived-quiz"]);
  assert.deepEqual(fixes.clearDeadlineIds, ["archived-empty", "archived-quiz"]);

  const live = capabilityAssignmentFixes(
    [
      {
        id: "live",
        deliveryPhase: "before_session",
        status: "published",
        deadline: null,
        questionCount: 4,
      },
      {
        id: "extra",
        deliveryPhase: "before_session",
        status: "archived",
        deadline: null,
        questionCount: 9,
      },
    ],
    now,
  );
  assert.deepEqual(live.publishIds, []);
  assert.deepEqual(live.clearDeadlineIds, []);

  const completed = capabilityAssignmentFixes(
    [
      {
        id: "done",
        deliveryPhase: "before_session",
        status: "completed",
        deadline: null,
        questionCount: 2,
      },
    ],
    now,
  );
  assert.deepEqual(completed.publishIds, ["done"]);
});

test("a past capability session day is refreshed and a cancelled booking is restored", () => {
  const now = new Date("2026-09-20T18:00:00.000Z");
  assert.equal(
    capabilitySessionDayIsPast(
      new Date("2026-09-01T20:00:00.000Z"),
      "America/New_York",
      now,
    ),
    true,
  );
  assert.equal(
    capabilitySessionDayIsPast(
      new Date("2026-09-21T20:00:00.000Z"),
      "America/New_York",
      now,
    ),
    false,
  );
  assert.equal(
    shouldRefreshCapabilitySchedule({
      dateTime: new Date("2026-09-01T20:00:00.000Z"),
      timezone: "America/New_York",
      providerEventId: "google-event",
      now,
    }),
    false,
  );
  assert.deepEqual(
    capabilitySessionNeedsVisibilityRestore({
      status: "archived",
      bookingStatus: "cancelled",
      cancelledAt: now,
      hasHomework: false,
      willHavePrework: true,
    }),
    { publishSession: true, restoreBooking: true, setHasHomework: true },
  );
  assert.deepEqual(
    capabilitySessionNeedsVisibilityRestore({
      status: "published",
      bookingStatus: "confirmed",
      cancelledAt: null,
      hasHomework: true,
      willHavePrework: true,
    }),
    { publishSession: false, restoreBooking: false, setHasHomework: false },
  );
});

test("reset deletes only samapostgrad attempts on the Xavier capability session", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const { and, eq, inArray } = await import("drizzle-orm");
  const {
    assignmentQuestionsTable,
    assignmentsTable,
    attemptsTable,
    auditLogsTable,
    coursesTable,
    db,
    homeworkWeaknessGroupsTable,
    questionReportsTable,
    questionsTable,
    remediationRetriesTable,
    responsesTable,
    reviewQueueTable,
    sessionsTable,
    timerEventsTable,
    usersTable,
  } = await import("@workspace/db");
  const { resetSamaXavierSatCapabilityAttempts } = await import(
    "./reset-sama-xavier-capability.ts"
  );
  const { SAMA_XAVIER_CAPABILITY_RESET_ACTION } = await import(
    "./reset-sama-xavier-capability-select.ts"
  );

  const suffix = randomUUID();
  const title = `${CAPABILITY_RESET_SESSION_TITLE_PREFIX} ${suffix}`;
  const now = new Date("2026-09-20T18:00:00.000Z");
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Capability reset fixture ${suffix}`,
      subject: "SAT",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const [sama] = await db
    .insert(usersTable)
    .values({
      email: `sama-${suffix}@example.invalid`,
      displayName: "Sama Test",
      role: "student",
      clerkUserId: `sama-reset:${suffix}`,
    })
    .returning();
  const [xavier] = await db
    .insert(usersTable)
    .values({
      email: `xavier-${suffix}@example.invalid`,
      displayName: "Xavier Morales",
      role: "tutor",
      clerkUserId: `xavier-reset:${suffix}`,
    })
    .returning();
  const [eunice] = await db
    .insert(usersTable)
    .values({
      email: `eunice-${suffix}@example.invalid`,
      displayName: "Eunice Chon",
      role: "tutor",
      clerkUserId: `eunice-reset:${suffix}`,
    })
    .returning();
  const [taito] = await db
    .insert(usersTable)
    .values({
      email: `taito-${suffix}@example.invalid`,
      displayName: "Taito Goto",
      role: "student",
      clerkUserId: `taito-reset:${suffix}`,
    })
    .returning();
  const [capability] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: sama!.id,
      tutorUserId: xavier!.id,
      dateTime: new Date("2026-09-01T20:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title,
      status: "archived",
      bookingStatus: "cancelled",
      cancelledAt: new Date("2026-09-02T00:00:00.000Z"),
      hasHomework: false,
    })
    .returning();
  const [euniceSession] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: sama!.id,
      tutorUserId: eunice!.id,
      dateTime: new Date("2026-09-01T20:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title: `Sama’s SAT Session with Eunice ${suffix}`,
      status: "published",
      bookingStatus: "confirmed",
      hasHomework: true,
    })
    .returning();
  const [taitoSession] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: taito!.id,
      tutorUserId: xavier!.id,
      dateTime: new Date("2026-09-01T20:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title: `${CAPABILITY_RESET_SESSION_TITLE_PREFIX} taito ${suffix}`,
      status: "published",
      bookingStatus: "confirmed",
    })
    .returning();
  const [question] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Algebra",
      skill: "Linear equations",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: `Capability reset question ${suffix}`,
      choices: [
        { id: "a", label: "A", text: "One" },
        { id: "b", label: "B", text: "Two" },
      ],
      correctAnswer: "a",
      explanation: "One is the keyed choice.",
      reviewStatus: "approved",
    })
    .returning();
  const [euniceQuestion] = await db
    .insert(questionsTable)
    .values({
      subject: "SAT",
      domain: "Algebra",
      skill: "Linear equations",
      questionType: "multiple_choice",
      difficulty: "medium",
      prompt: `Eunice question ${suffix}`,
      choices: [
        { id: "a", label: "A", text: "One" },
        { id: "b", label: "B", text: "Two" },
      ],
      correctAnswer: "a",
      explanation: "Leave this attempt in place.",
      reviewStatus: "approved",
    })
    .returning();
  const [quiz] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: capability!.id,
      deliveryPhase: "before_session",
      title: `60-minute SAT pre-work — ${title}`,
      subject: "SAT",
      instructions: "Start from the first question after the reset.",
      status: "archived",
      deadline: new Date("2026-09-01T00:00:00.000Z"),
      timeLimitMinutes: 60,
      maxAttempts: 1,
    })
    .returning();
  const [during] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: capability!.id,
      deliveryPhase: "during_session",
      title: `In-session capability ${suffix}`,
      subject: "SAT",
      instructions: "In session.",
      status: "published",
      deadline: new Date("2026-10-20T00:00:00.000Z"),
      timeLimitMinutes: 15,
      maxAttempts: 1,
    })
    .returning();
  const [euniceHomework] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: euniceSession!.id,
      deliveryPhase: "before_session",
      title: `Eunice pre-work ${suffix}`,
      subject: "SAT",
      instructions: "Do not clear.",
      status: "published",
      deadline: new Date("2026-09-01T00:00:00.000Z"),
      timeLimitMinutes: 60,
      maxAttempts: 1,
    })
    .returning();
  const [taitoHomework] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course!.id,
      sessionId: taitoSession!.id,
      deliveryPhase: "before_session",
      title: `Taito capability copy ${suffix}`,
      subject: "SAT",
      instructions: "Do not clear.",
      status: "published",
      timeLimitMinutes: 60,
      maxAttempts: 1,
    })
    .returning();
  await db.insert(assignmentQuestionsTable).values({
    assignmentId: quiz!.id,
    questionId: question!.id,
    position: 0,
  });
  const [submitted] = await db
    .insert(attemptsTable)
    .values({
      assignmentId: quiz!.id,
      userId: sama!.id,
      status: "submitted",
      submittedAt: now,
      currentQuestionIndex: 4,
      score: 0,
      result: { correctCount: 0, totalCount: 1 },
    })
    .returning();
  const [paused] = await db
    .insert(attemptsTable)
    .values({
      assignmentId: during!.id,
      userId: sama!.id,
      status: "paused",
      currentQuestionIndex: 2,
    })
    .returning();
  const [taitoAttempt] = await db
    .insert(attemptsTable)
    .values({
      assignmentId: taitoHomework!.id,
      userId: taito!.id,
      status: "submitted",
      submittedAt: now,
      result: { correctCount: 1, totalCount: 1 },
    })
    .returning();
  const [euniceAttempt] = await db
    .insert(attemptsTable)
    .values({
      assignmentId: euniceHomework!.id,
      userId: sama!.id,
      status: "submitted",
      submittedAt: now,
      score: 100,
      result: { correctCount: 1, totalCount: 1 },
    })
    .returning();
  await db.insert(responsesTable).values({
    attemptId: submitted!.id,
    questionId: question!.id,
    finalAnswer: "b",
    flagged: true,
    correct: false,
  });
  await db.insert(timerEventsTable).values({ attemptId: submitted!.id, type: "submitted" });
  await db.insert(questionReportsTable).values({
    attemptId: submitted!.id,
    assignmentId: quiz!.id,
    questionId: question!.id,
    studentUserId: sama!.id,
    reason: "stuck",
    stemSnippet: "Capability reset question",
  });
  await db.insert(reviewQueueTable).values({
    attemptId: submitted!.id,
    questionId: question!.id,
    studentUserId: sama!.id,
    skill: "Linear equations",
    reason: "missed",
  });
  await db.insert(homeworkWeaknessGroupsTable).values({
    sessionId: capability!.id,
    attemptId: submitted!.id,
    skill: "Linear equations",
    missCount: 1,
    priority: 1,
  });
  await db.insert(remediationRetriesTable).values({
    sessionId: capability!.id,
    sourceAttemptId: submitted!.id,
    source: "capability-reset-fixture",
  });

  const identities = {
    titlePrefix: title,
    samaEmail: sama!.email,
    xavierEmail: xavier!.email,
    xavierClerkUserId: xavier!.clerkUserId,
    xavierDuplicateClerkUserId: `xavier-duplicate-reset:${suffix}`,
    now,
  };
  const sessionIds = [capability!.id, euniceSession!.id, taitoSession!.id];
  const assignmentIds = [quiz!.id, during!.id, euniceHomework!.id, taitoHomework!.id];
  const questionIds = [question!.id, euniceQuestion!.id];
  const userIds = [sama!.id, xavier!.id, eunice!.id, taito!.id];

  try {
    const refused = await resetSamaXavierSatCapabilityAttempts({
      samaEmail: TAITO_STUDENT_EMAIL,
      now,
    });
    assert.equal(refused.applied, false);
    assert.match(refused.skippedReason ?? "", /outside the samapostgrad/);

    const otherTutor = await resetSamaXavierSatCapabilityAttempts({
      ...identities,
      xavierEmail: eunice!.email,
      xavierClerkUserId: eunice!.clerkUserId,
    });
    assert.equal(otherTutor.applied, false);
    assert.equal(otherTutor.deletedAttempts, 0);
    assert.equal(
      (
        await db
          .select({ id: attemptsTable.id })
          .from(attemptsTable)
          .where(eq(attemptsTable.id, submitted!.id))
      ).length,
      1,
    );

    const reset = await resetSamaXavierSatCapabilityAttempts(identities);
    assert.equal(reset.applied, true);
    assert.equal(reset.alreadyApplied, false);
    assert.deepEqual(reset.sessionIds, [capability!.id]);
    assert.equal(reset.deletedAttempts, 2);
    assert.equal(reset.questionsKept, 1);
    assert.equal(reset.scheduleRefreshed, true);

    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, capability!.id));
    assert.equal(session?.clientUserId, sama!.id);
    assert.equal(session?.tutorUserId, xavier!.id);
    assert.equal(session?.status, "published");
    assert.equal(session?.bookingStatus, "confirmed");
    assert.equal(session?.cancelledAt, null);
    assert.equal(session?.hasHomework, true);
    assert.ok(session!.dateTime.getTime() > now.getTime());

    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, quiz!.id));
    assert.equal(assignment?.status, "published");
    assert.equal(assignment?.deadline, null);
    const links = await db
      .select()
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, quiz!.id));
    assert.equal(links.length, 1);
    const [duringRow] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, during!.id));
    assert.equal(duringRow?.deadline?.toISOString(), "2026-10-20T00:00:00.000Z");

    const capabilityAttempts = await db
      .select({ id: attemptsTable.id })
      .from(attemptsTable)
      .where(inArray(attemptsTable.assignmentId, [quiz!.id, during!.id]));
    assert.equal(capabilityAttempts.length, 0);
    const flags = await db
      .select({ id: responsesTable.id })
      .from(responsesTable)
      .where(eq(responsesTable.attemptId, submitted!.id));
    assert.equal(flags.length, 0);

    const [euniceRow] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, euniceAttempt!.id));
    assert.equal(euniceRow?.status, "submitted");
    const [euniceAssignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, euniceHomework!.id));
    assert.equal(euniceAssignment?.deadline?.toISOString(), "2026-09-01T00:00:00.000Z");
    const [taitoRow] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, taitoAttempt!.id));
    assert.equal(taitoRow?.status, "submitted");
    const [taitoSessionRow] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, taitoSession!.id));
    assert.equal(taitoSessionRow?.dateTime.toISOString(), "2026-09-01T20:00:00.000Z");

    const [retake] = await db
      .insert(attemptsTable)
      .values({
        assignmentId: quiz!.id,
        userId: sama!.id,
        status: "active",
        currentQuestionIndex: 0,
      })
      .returning();
    const again = await resetSamaXavierSatCapabilityAttempts({
      ...identities,
      now: new Date("2026-10-01T18:00:00.000Z"),
    });
    assert.equal(again.applied, false);
    assert.equal(again.alreadyApplied, true);
    assert.equal(again.deletedAttempts, 0);
    const [retakeRow] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, retake!.id));
    assert.equal(retakeRow?.status, "active");
    const [sessionAfter] = await db
      .select({ dateTime: sessionsTable.dateTime })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, capability!.id));
    assert.equal(sessionAfter?.dateTime.toISOString(), session!.dateTime.toISOString());
    const markers = await db
      .select({ id: auditLogsTable.id })
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.action, SAMA_XAVIER_CAPABILITY_RESET_ACTION),
          eq(auditLogsTable.entityId, capability!.id),
        ),
      );
    assert.equal(markers.length, 1);
  } finally {
    const attemptIds = (
      await db
        .select({ id: attemptsTable.id })
        .from(attemptsTable)
        .where(inArray(attemptsTable.assignmentId, assignmentIds))
    ).map((row) => row.id);
    if (attemptIds.length > 0) {
      await db
        .delete(questionReportsTable)
        .where(inArray(questionReportsTable.attemptId, attemptIds));
      await db.delete(reviewQueueTable).where(inArray(reviewQueueTable.attemptId, attemptIds));
      await db.delete(timerEventsTable).where(inArray(timerEventsTable.attemptId, attemptIds));
      await db.delete(responsesTable).where(inArray(responsesTable.attemptId, attemptIds));
      await db
        .delete(homeworkWeaknessGroupsTable)
        .where(inArray(homeworkWeaknessGroupsTable.attemptId, attemptIds));
      await db
        .delete(remediationRetriesTable)
        .where(inArray(remediationRetriesTable.sourceAttemptId, attemptIds));
      await db.delete(attemptsTable).where(inArray(attemptsTable.id, attemptIds));
    }
    await db
      .delete(auditLogsTable)
      .where(inArray(auditLogsTable.entityId, sessionIds));
    await db
      .delete(assignmentQuestionsTable)
      .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds));
    await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, assignmentIds));
    await db.delete(questionsTable).where(inArray(questionsTable.id, questionIds));
    await db.delete(sessionsTable).where(inArray(sessionsTable.id, sessionIds));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});
