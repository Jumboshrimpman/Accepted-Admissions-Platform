import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AttachQuestionToAssignmentBody,
  AttachQuestionToAssignmentParams,
  AttachQuestionToAssignmentResponse,
  CreateContentSourceBody,
  CreateContentSourceResponse,
  CreateCurriculumBlockBody,
  GeneratePracticeQuestionsBody,
  GeneratePracticeQuestionsParams,
  GeneratePracticeQuestionsResponse,
  CreateCurriculumBlockParams,
  CreateCurriculumBlockResponse,
  GetAssignmentParams,
  GetAssignmentResponse,
  GetAttemptParams,
  GetAttemptResponse,
  GetCourseParams,
  GetCourseResponse,
  GetCurrentUserResponse,
  GetDashboardResponse,
  GetSessionParams,
  GetSessionResponse,
  ListAssignmentsQueryParams,
  ListAssignmentsResponse,
  ListCoursesResponse,
  ListContentSourcesQueryParams,
  ListContentSourcesResponse,
  ListQuestionBankQueryParams,
  ListQuestionBankResponse,
  ListReviewQueueResponse,
  ListSessionArtifactsParams,
  ListSessionArtifactsResponse,
  UpdateQuestionBankItemBody,
  UpdateQuestionBankItemParams,
  UpdateQuestionBankItemResponse,
  PauseAttemptParams,
  PauseAttemptResponse,
  ResumeAttemptParams,
  ResumeAttemptResponse,
  SaveAttemptResponseBody,
  SaveAttemptResponseParams,
  SaveAttemptResponseResponse,
  StartAttemptParams,
  StartAttemptResponse,
  SubmitAttemptBody,
  SubmitAttemptParams,
  SubmitAttemptResponse,
  UpdateCurriculumBlockBody,
  UpdateCurriculumBlockParams,
  UpdateCurriculumBlockResponse,
  UpdateReviewQueueItemBody,
  UpdateReviewQueueItemParams,
  UpdateReviewQueueItemResponse,
  UpsertSessionArtifactBody,
  UpsertSessionArtifactParams,
  UpsertSessionArtifactResponse,
} from "@workspace/api-zod";
import {
  contentSourcesTable,
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  auditLogsTable,
  courseMembershipsTable,
  coursesTable,
  curriculumBlocksTable,
  db,
  questionsTable,
  responsesTable,
  reviewQueueTable,
  sessionArtifactsTable,
  sessionsTable,
  timerEventsTable,
  tutorAssignmentsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";

type AuthedRequest = Request & { appUser?: AppUser };

const router: IRouter = Router();

function claimString(claims: unknown, key: string): string | undefined {
  if (!claims || typeof claims !== "object") return undefined;
  const value = (claims as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function envIdSet(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

type ConfiguredAccess = {
  role: AppUser["role"];
  subject: string;
};

function configuredAccess(clerkUserId: string): ConfiguredAccess | null {
  const adminIds = envIdSet("ACCEPTED_ADMIN_CLERK_USER_IDS");
  const satTutorIds = envIdSet("ACCEPTED_SAT_TUTOR_CLERK_USER_IDS");
  const englishTutorIds = envIdSet("ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS");
  const tutorIds = envIdSet("ACCEPTED_TUTOR_CLERK_USER_IDS");
  const studentIds = envIdSet("ACCEPTED_STUDENT_CLERK_USER_IDS");

  if (adminIds.has(clerkUserId)) return { role: "administrator", subject: "all" };
  if (satTutorIds.has(clerkUserId)) return { role: "tutor", subject: "SAT" };
  if (englishTutorIds.has(clerkUserId)) {
    return { role: "tutor", subject: "IELTS" };
  }
  if (tutorIds.has(clerkUserId)) return { role: "tutor", subject: "all" };
  if (studentIds.has(clerkUserId)) return { role: "student", subject: "all" };
  return null;
}

function subjectFamily(subject: string): string {
  const normalized = subject.trim().toLowerCase();
  if (normalized.startsWith("sat")) return "sat";
  if (normalized.startsWith("ielts") || normalized.startsWith("english")) {
    return "ielts";
  }
  return normalized;
}

async function ensureSeedData(): Promise<string> {
  const [existing] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.title, "Fall 2026 SAT & IELTS"))
    .limit(1);
  if (existing) return existing.id;

  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Fall 2026 SAT & IELTS",
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
      goalSummary:
        "Build SAT Reading & Writing accuracy, pacing, and IELTS confidence through focused weekly practice.",
      meetUrl: "https://meet.google.com/",
      driveUrl: "https://drive.google.com/",
    })
    .returning();

  const progression = [
    ["2026-10-02T12:00:00.000Z", "SAT", "Summer review, baseline & goal setting"],
    ["2026-10-09T12:00:00.000Z", "SAT", "Standard English Conventions"],
    ["2026-10-16T12:00:00.000Z", "SAT", "Information, evidence & inference"],
    ["2026-10-23T12:00:00.000Z", "IELTS", "Integrated IELTS diagnostic"],
    ["2026-10-30T12:00:00.000Z", "SAT", "Craft and Structure"],
    ["2026-11-06T12:00:00.000Z", "SAT", "Expression of Ideas"],
    ["2026-11-13T12:00:00.000Z", "IELTS", "Coherence, evidence & speaking"],
    ["2026-11-20T12:00:00.000Z", "SAT", "Advanced evidence & synthesis"],
    ["2026-11-27T12:00:00.000Z", "SAT", "Mixed timed module & pacing"],
    ["2026-12-04T12:00:00.000Z", "IELTS", "Timed mini-mock & revision"],
    ["2026-12-11T12:00:00.000Z", "SAT", "Hard mixed SAT practice"],
    ["2026-12-18T12:00:00.000Z", "SAT", "Cumulative review & next-term plan"],
  ] as const;

  const seededSessions = await db
    .insert(sessionsTable)
    .values(
      progression.map(([dateTime, subject, title]) => ({
        courseId: course.id,
        dateTime: new Date(dateTime),
        timezone: "Asia/Tokyo",
        subject,
        title,
        status: "published" as const,
        hasHomework: subject === "SAT",
      })),
    )
    .returning();

  await db.insert(curriculumBlocksTable).values([
    {
      sessionId: seededSessions[0]!.id,
      kind: "objectives",
      position: 0,
      visibility: "both",
      status: "published",
      config: {
        title: "Session goals",
        items: [
          "Review summer progress",
          "Complete a baseline timed mini-section",
          "Set measurable Fall goals",
        ],
      },
    },
    {
      sessionId: seededSessions[0]!.id,
      kind: "timeline",
      position: 1,
      visibility: "both",
      status: "published",
      config: {
        items: [
          { minutes: 10, label: "SAT Math focus drill" },
          { minutes: 45, label: "Reading & Writing review" },
          { minutes: 5, label: "Goals and next steps" },
        ],
      },
    },
  ]);

  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course.id,
      sessionId: seededSessions[0]!.id,
      title: "Baseline Reading & Writing Mini-Section",
      subject: "SAT Reading & Writing",
      instructions:
        "Complete this original mini-section independently. You may pause, but all question content will be hidden while paused.",
      status: "published",
      deadline: new Date("2026-10-01T12:00:00.000Z"),
      timeLimitMinutes: 12,
      maxAttempts: 2,
    })
    .returning();

  const createdQuestions = await db
    .insert(questionsTable)
    .values([
      {
        subject: "SAT Reading & Writing",
        domain: "Standard English Conventions",
        skill: "Boundaries",
        questionType: "multiple_choice",
        difficulty: "medium",
        stimulus:
          "The community archive contains letters, maps, and photographs from the town's earliest residents. Together, these materials reveal how the waterfront changed over time.",
        prompt:
          "Which choice most effectively combines the sentences while maintaining standard English conventions?",
        choices: [
          { id: "a", label: "A", text: "residents, together these" },
          { id: "b", label: "B", text: "residents; together, these" },
          { id: "c", label: "C", text: "residents together these" },
          { id: "d", label: "D", text: "residents: together these" },
        ],
        correctAnswer: "b",
        explanation:
          "A semicolon correctly joins two independent clauses, and the introductory adverb is followed by a comma.",
      },
      {
        subject: "SAT Reading & Writing",
        domain: "Information and Ideas",
        skill: "Command of Evidence",
        questionType: "multiple_choice",
        difficulty: "hard",
        stimulus:
          "In a greenhouse study, seedlings receiving six hours of filtered light grew taller than seedlings receiving six hours of direct light, while both groups received equal water and nutrients.",
        prompt: "Which conclusion is best supported by the study?",
        choices: [
          { id: "a", label: "A", text: "Filtered light always improves plant health." },
          { id: "b", label: "B", text: "Water affected the groups differently." },
          { id: "c", label: "C", text: "Light conditions may influence seedling height." },
          { id: "d", label: "D", text: "Direct light prevents all seedling growth." },
        ],
        correctAnswer: "c",
        explanation:
          "The controlled comparison supports a limited conclusion about a possible relationship between light conditions and height.",
      },
      {
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
        skill: "Transitions",
        questionType: "multiple_choice",
        difficulty: "medium",
        stimulus:
          "The first prototype was inexpensive to produce. _____, it was too fragile for repeated classroom use.",
        prompt: "Which choice completes the text with the most logical transition?",
        choices: [
          { id: "a", label: "A", text: "Similarly" },
          { id: "b", label: "B", text: "However" },
          { id: "c", label: "C", text: "For example" },
          { id: "d", label: "D", text: "Therefore" },
        ],
        correctAnswer: "b",
        explanation:
          "The second sentence contrasts the prototype's low cost with its lack of durability, so “However” is logical.",
      },
    ])
    .returning();

  await db.insert(assignmentQuestionsTable).values(
    createdQuestions.map((question, index) => ({
      assignmentId: assignment.id,
      questionId: question.id,
      position: index,
      predictionFirst: index !== 1,
    })),
  );

  return course.id;
}

async function syncConfiguredAccess(
  user: AppUser,
  access: ConfiguredAccess,
): Promise<void> {
  if (access.role === "administrator") return;

  const courseId = await ensureSeedData();
  await db
    .insert(courseMembershipsTable)
    .values({
      courseId,
      userId: user.id,
      membershipRole: access.role,
      subject: access.subject,
    })
    .onConflictDoUpdate({
      target: [courseMembershipsTable.courseId, courseMembershipsTable.userId],
      set: { membershipRole: access.role, subject: access.subject },
    });

  const students = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(
      courseMembershipsTable,
      and(
        eq(courseMembershipsTable.userId, usersTable.id),
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.membershipRole, "student"),
      ),
    );
  const tutors = await db
    .select({
      userId: courseMembershipsTable.userId,
      subject: courseMembershipsTable.subject,
    })
    .from(courseMembershipsTable)
    .where(
      and(
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.membershipRole, "tutor"),
      ),
    );
  for (const tutor of tutors) {
    for (const student of students) {
      await db
        .insert(tutorAssignmentsTable)
        .values({
          courseId,
          tutorUserId: tutor.userId,
          studentUserId: student.id,
          subject: tutor.subject,
        })
        .onConflictDoNothing();
    }
  }
}

async function requireAppUser(
  req: AuthedRequest,
  res: Response,
  next: () => void,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId =
    claimString(auth.sessionClaims, "userId") ?? auth.userId ?? undefined;
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let [appUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  const configured = configuredAccess(clerkUserId);
  if (!configured) {
    if (appUser) {
      await db.insert(auditLogsTable).values({
        actorUserId: appUser.id,
        action: "access.denied",
        entityType: "portal",
        entityId: req.path,
        metadata: { method: req.method, reason: "identity_not_provisioned" },
      });
    }
    res.status(403).json({
      error: "Portal access has not been provisioned for this account",
    });
    return;
  }
  if (!appUser) {
    const email =
      claimString(auth.sessionClaims, "email") ??
      `${clerkUserId.replace(/[^a-zA-Z0-9_-]/g, "")}@users.accepted.local`;
    const displayName =
      claimString(auth.sessionClaims, "name") ??
      claimString(auth.sessionClaims, "firstName") ??
      "Accepted Admissions user";
    [appUser] = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email,
        displayName,
        role: configured.role,
      })
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: appUser.id,
      action: "access.provisioned",
      entityType: "user",
      entityId: appUser.id,
      metadata: { role: configured.role, subject: configured.subject },
    });
  }
  if (appUser.role !== configured.role) {
    await db.insert(auditLogsTable).values({
      actorUserId: appUser.id,
      action: "access.denied",
      entityType: "portal",
      entityId: req.path,
      metadata: { method: req.method, reason: "role_provisioning_mismatch" },
    });
    res.status(403).json({
      error: "Portal role provisioning is out of sync; contact an administrator",
    });
    return;
  }
  await syncConfiguredAccess(appUser, configured);
  req.appUser = appUser;
  next();
}

function ensureRole(
  roles: AppUser["role"][],
): (req: AuthedRequest, res: Response, next: () => void) => void {
  return (req, res, next) => {
    if (!req.appUser || !roles.includes(req.appUser.role)) {
      res.status(403).json({ error: "Insufficient permission" });
      return;
    }
    next();
  };
}

async function visibleCourseIds(user: AppUser): Promise<string[]> {
  if (user.role === "administrator") {
    return (await db.select({ id: coursesTable.id }).from(coursesTable)).map(
      (row) => row.id,
    );
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

async function canAccessCourse(
  user: AppUser,
  courseId: string,
  subject?: string,
): Promise<boolean> {
  if (user.role === "administrator") return true;
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
  if (!membership) return false;
  return (
    !subject ||
    membership.subject === "all" ||
    subjectFamily(membership.subject) === subjectFamily(subject)
  );
}

async function courseSubjectForUser(
  user: AppUser,
  courseId: string,
): Promise<string> {
  if (user.role === "administrator") return "all";
  const [membership] = await db
    .select({ subject: courseMembershipsTable.subject })
    .from(courseMembershipsTable)
    .where(
      and(
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.userId, user.id),
        eq(courseMembershipsTable.membershipRole, user.role),
      ),
    )
    .limit(1);
  return membership?.subject ?? "";
}

async function canAccessStudent(
  user: AppUser,
  courseId: string,
  studentUserId: string,
  subject?: string,
): Promise<boolean> {
  if (user.role === "administrator") return true;
  if (user.role === "student") return user.id === studentUserId;
  const conditions = [
    eq(tutorAssignmentsTable.courseId, courseId),
    eq(tutorAssignmentsTable.tutorUserId, user.id),
    eq(tutorAssignmentsTable.studentUserId, studentUserId),
  ];
  if (subject) {
    conditions.push(
      sql`(
        lower(${tutorAssignmentsTable.subject}) = 'all'
        OR lower(${tutorAssignmentsTable.subject}) LIKE ${subjectFamily(subject) + "%"}
      )`,
    );
  }
  const [assignment] = await db
    .select({ id: tutorAssignmentsTable.id })
    .from(tutorAssignmentsTable)
    .where(and(...conditions))
    .limit(1);
  return Boolean(assignment);
}

function tutorShape(user: AppUser | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.displayName,
    specialty: user.role === "tutor" ? "Assigned tutor" : "Program administrator",
    avatarUrl: null,
  };
}

async function courseShape(courseId: string, user?: AppUser) {
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  if (!course) return null;
  const courseSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, course.id));
  const membership = user && user.role !== "administrator"
    ? (
        await db
          .select({ subject: courseMembershipsTable.subject })
          .from(courseMembershipsTable)
          .where(
            and(
              eq(courseMembershipsTable.courseId, course.id),
              eq(courseMembershipsTable.userId, user.id),
              eq(courseMembershipsTable.membershipRole, user.role),
            ),
          )
          .limit(1)
      )[0]
    : null;
  const sessionsForUser = membership && membership.subject !== "all"
    ? courseSessions.filter(
        (session) =>
          subjectFamily(session.subject) === subjectFamily(membership.subject),
      )
    : courseSessions;
  const tutorMemberships = await db
    .select({ user: usersTable, subject: courseMembershipsTable.subject })
    .from(courseMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, courseMembershipsTable.userId))
    .where(
      and(
        eq(courseMembershipsTable.courseId, course.id),
        eq(courseMembershipsTable.membershipRole, "tutor"),
      ),
    );
  const visibleTutorMemberships =
    user?.role === "tutor" && membership && membership.subject !== "all"
      ? tutorMemberships.filter(
          ({ user: tutor, subject: tutorSubject }) =>
            tutor.id === user.id ||
            subjectFamily(membership.subject) === subjectFamily(tutorSubject),
        )
      : tutorMemberships;
  return {
    id: course.id,
    title: course.title,
    subject: course.subject,
    term: course.term,
    status: course.status,
    sessionCount: sessionsForUser.length,
    completedSessionCount: sessionsForUser.filter((s) => s.status === "completed")
      .length,
    tutors: visibleTutorMemberships.map(({ user }) => tutorShape(user)!),
  };
}

async function timerSummary(attemptId: string) {
  const events = await db
    .select()
    .from(timerEventsTable)
    .where(eq(timerEventsTable.attemptId, attemptId))
    .orderBy(asc(timerEventsTable.at));
  let activeSeconds = 0;
  let pausedSeconds = 0;
  let pauseCount = 0;
  let activeStart: Date | null = null;
  let pauseStart: Date | null = null;
  for (const event of events) {
    if (event.type === "started" || event.type === "resumed") {
      if (pauseStart) {
        pausedSeconds += Math.max(
          0,
          Math.floor((event.at.getTime() - pauseStart.getTime()) / 1000),
        );
        pauseStart = null;
      }
      activeStart = event.at;
    } else if (event.type === "paused" || event.type === "submitted") {
      if (activeStart) {
        activeSeconds += Math.max(
          0,
          Math.floor((event.at.getTime() - activeStart.getTime()) / 1000),
        );
        activeStart = null;
      }
      if (event.type === "paused") {
        pauseCount += 1;
        pauseStart = event.at;
      }
    }
  }
  const now = new Date();
  if (activeStart) {
    activeSeconds += Math.max(
      0,
      Math.floor((now.getTime() - activeStart.getTime()) / 1000),
    );
  }
  if (pauseStart) {
    pausedSeconds += Math.max(
      0,
      Math.floor((now.getTime() - pauseStart.getTime()) / 1000),
    );
  }
  return {
    activeSeconds,
    pausedSeconds,
    pauseCount,
    timerEvents: events.map((event) => ({ type: event.type, at: event.at })),
  };
}

async function attemptShape(attemptId: string) {
  const [attempt] = await db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt) return null;
  const saved = await db
    .select()
    .from(responsesTable)
    .where(eq(responsesTable.attemptId, attempt.id));
  return {
    id: attempt.id,
    assignmentId: attempt.assignmentId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    ...(await timerSummary(attempt.id)),
    responses: saved.map((response) => ({
      questionId: response.questionId,
      prediction: response.prediction,
      predictionLocked: response.predictionLocked,
      finalAnswer: response.finalAnswer,
      flagged: response.flagged,
      savedAt: response.savedAt,
    })),
  };
}

async function canAccessAttempt(user: AppUser, attemptId: string) {
  const [record] = await db
    .select({
      attempt: attemptsTable,
      courseId: assignmentsTable.courseId,
      subject: assignmentsTable.subject,
    })
    .from(attemptsTable)
    .innerJoin(
      assignmentsTable,
      eq(assignmentsTable.id, attemptsTable.assignmentId),
    )
    .where(eq(attemptsTable.id, attemptId));
  if (!record) return null;
  if (user.role === "student") {
    return record.attempt.userId === user.id ? record : null;
  }
  if (!(await canAccessCourse(user, record.courseId, record.subject))) return null;
  if (
    user.role === "tutor" &&
    !(await canAccessStudent(
      user,
      record.courseId,
      record.attempt.userId,
      record.subject,
    ))
  ) {
    return null;
  }
  return record;
}

async function enforceTimeLimit(attemptId: string) {
  const [record] = await db
    .select({
      attempt: attemptsTable,
      timeLimitMinutes: assignmentsTable.timeLimitMinutes,
    })
    .from(attemptsTable)
    .innerJoin(
      assignmentsTable,
      eq(assignmentsTable.id, attemptsTable.assignmentId),
    )
    .where(eq(attemptsTable.id, attemptId));
  if (!record || record.attempt.status === "submitted") return record?.attempt;
  const timing = await timerSummary(attemptId);
  if (timing.activeSeconds >= record.timeLimitMinutes * 60) {
    const [expired] = await db
      .update(attemptsTable)
      .set({ status: "expired" })
      .where(eq(attemptsTable.id, attemptId))
      .returning();
    return expired;
  }
  return record.attempt;
}

router.use(requireAppUser);

router.get(
  "/admin/overview",
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    await ensureSeedData();
    const [users, memberships, assignments, audit] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          clerkUserId: usersTable.clerkUserId,
          email: usersTable.email,
          displayName: usersTable.displayName,
          role: usersTable.role,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .orderBy(asc(usersTable.displayName)),
      db
        .select({
          id: courseMembershipsTable.id,
          courseId: courseMembershipsTable.courseId,
          courseTitle: coursesTable.title,
          userId: courseMembershipsTable.userId,
          userName: usersTable.displayName,
          membershipRole: courseMembershipsTable.membershipRole,
          subject: courseMembershipsTable.subject,
        })
        .from(courseMembershipsTable)
        .innerJoin(coursesTable, eq(coursesTable.id, courseMembershipsTable.courseId))
        .innerJoin(usersTable, eq(usersTable.id, courseMembershipsTable.userId))
        .orderBy(asc(coursesTable.title), asc(usersTable.displayName)),
      db
        .select({
          id: tutorAssignmentsTable.id,
          courseId: tutorAssignmentsTable.courseId,
          courseTitle: coursesTable.title,
          tutorUserId: tutorAssignmentsTable.tutorUserId,
          studentUserId: tutorAssignmentsTable.studentUserId,
          subject: tutorAssignmentsTable.subject,
        })
        .from(tutorAssignmentsTable)
        .innerJoin(coursesTable, eq(coursesTable.id, tutorAssignmentsTable.courseId)),
      db
        .select({
          id: auditLogsTable.id,
          action: auditLogsTable.action,
          entityType: auditLogsTable.entityType,
          entityId: auditLogsTable.entityId,
          metadata: auditLogsTable.metadata,
          createdAt: auditLogsTable.createdAt,
        })
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(100),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    res.json({
      users,
      memberships,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        tutorName: userById.get(assignment.tutorUserId)?.displayName ?? "Unknown tutor",
        studentName: userById.get(assignment.studentUserId)?.displayName ?? "Unknown student",
      })),
      audit,
    });
  },
);

router.get("/me", async (req: AuthedRequest, res): Promise<void> => {
  const user = req.appUser!;
  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      avatarUrl: null,
    }),
  );
});

router.get("/courses", async (req: AuthedRequest, res): Promise<void> => {
  await ensureSeedData();
  const ids = await visibleCourseIds(req.appUser!);
  const courses = await Promise.all(ids.map((id) => courseShape(id, req.appUser!)));
  res.json(ListCoursesResponse.parse(courses.filter(Boolean)));
});

router.get("/courses/:courseId", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await canAccessCourse(req.appUser!, params.data.courseId))) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const base = await courseShape(params.data.courseId, req.appUser!);
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, params.data.courseId));
  if (!base || !course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const courseSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, params.data.courseId))
    .orderBy(asc(sessionsTable.dateTime));
  const resolvedSessions = (
    await Promise.all(
      courseSessions.map(async (session) =>
        (await canAccessCourse(req.appUser!, session.courseId, session.subject))
          ? session
          : null,
      ),
    )
  ).filter((session): session is (typeof courseSessions)[number] => Boolean(session));
  res.json(
    GetCourseResponse.parse({
      ...base,
      meetUrl: course?.meetUrl ?? null,
      driveUrl: course?.driveUrl ?? null,
      goalSummary: course?.goalSummary ?? null,
      sessions: resolvedSessions.map((session) => ({
        ...session,
        tutor: null,
      })),
    }),
  );
});

router.get("/dashboard", async (req: AuthedRequest, res): Promise<void> => {
  await ensureSeedData();
  const user = req.appUser!;
  const ids = await visibleCourseIds(user);
  const courses = (
    await Promise.all(ids.map((id) => courseShape(id, user)))
  ).filter(Boolean);
  const upcomingSessions =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(sessionsTable)
          .where(inArray(sessionsTable.courseId, ids))
          .orderBy(asc(sessionsTable.dateTime))
          .limit(12);
  const scopedUpcomingSessions = (
    await Promise.all(
      upcomingSessions
        .map(async (session) =>
          (await canAccessCourse(user, session.courseId, session.subject))
            ? session
            : null,
        ),
    )
  ).filter(Boolean).slice(0, 4);
  const assignments =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.courseId, ids))
          .orderBy(asc(assignmentsTable.deadline));
  const scopedAssignments = (
    await Promise.all(
      assignments.map(async (assignment) =>
        (await canAccessCourse(user, assignment.courseId, assignment.subject))
          ? assignment
          : null,
      ),
    )
  ).filter(
    (assignment): assignment is (typeof assignments)[number] =>
      Boolean(assignment),
  );
  const assignmentIds = scopedAssignments.map((item) => item.id);
  const counts =
    assignmentIds.length === 0
      ? []
      : await db
          .select({
            assignmentId: assignmentQuestionsTable.assignmentId,
            count: sql<number>`count(*)`,
          })
          .from(assignmentQuestionsTable)
          .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds))
          .groupBy(assignmentQuestionsTable.assignmentId);
  const attempts = await db
    .select({ assignmentId: attemptsTable.assignmentId, score: attemptsTable.score })
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, user.id))
    .orderBy(desc(attemptsTable.startedAt));
  const assignmentSummaries = scopedAssignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject,
    status: assignment.status,
    deadline: assignment.deadline,
    questionCount:
      Number(counts.find((count) => count.assignmentId === assignment.id)?.count) ||
      0,
    timeLimitMinutes: assignment.timeLimitMinutes,
    attemptCount: attempts.filter((attempt) => attempt.assignmentId === assignment.id)
      .length,
    maxAttempts: assignment.maxAttempts,
    latestScore:
      attempts.find((attempt) => attempt.assignmentId === assignment.id)?.score ??
      null,
  }));
  res.json(
    GetDashboardResponse.parse({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        avatarUrl: null,
      },
      welcomeMessage: "Your Fall program is ready. Keep building on each session.",
      courses,
      upcomingSessions: scopedUpcomingSessions.map((session) => ({
        ...session,
        tutor: null,
      })),
      assignments: assignmentSummaries,
      recentScores: attempts
        .filter((attempt) => attempt.score !== null)
        .slice(0, 4)
        .map((attempt, index) => ({
          label: `Mini-section ${attempts.length - index}`,
          score: attempt.score!,
          date: new Date(),
        })),
      reviewSkills: ["Transitions", "Command of Evidence", "Pacing"],
    }),
  );
});

router.get("/sessions/:sessionId", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.sessionId));
  if (
    !session ||
    !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
  ) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const blocks = await db
    .select()
    .from(curriculumBlocksTable)
    .where(eq(curriculumBlocksTable.sessionId, session.id))
    .orderBy(asc(curriculumBlocksTable.position));
  const assignments = await assignmentSummariesForUser(
    req.appUser!,
    session.courseId,
    session.id,
  );
  res.json(
    GetSessionResponse.parse({
      ...session,
      tutor: null,
      blocks:
        req.appUser!.role === "student"
          ? blocks.filter(
              (block) =>
                block.status === "published" && block.visibility !== "tutor",
            )
          : blocks,
      assignments,
      studentNotes: null,
      tutorNotes:
        req.appUser!.role === "student"
          ? null
          : "Review predictions before revealing answer choices.",
      postSessionReportId: null,
    }),
  );
});

async function assignmentSummariesForUser(
  user: AppUser,
  courseId?: string,
  sessionId?: string,
) {
  const ids = await visibleCourseIds(user);
  if (courseId && !(await canAccessCourse(user, courseId))) return [];
  const conditions = [
    inArray(assignmentsTable.courseId, courseId ? [courseId] : ids),
  ];
  if (sessionId) conditions.push(eq(assignmentsTable.sessionId, sessionId));
  const rows =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(assignmentsTable)
          .where(and(...conditions))
          .orderBy(asc(assignmentsTable.deadline));
  const scopedRows = (
    await Promise.all(
      rows.map(async (assignment) =>
        (await canAccessCourse(user, assignment.courseId, assignment.subject))
          ? assignment
          : null,
      ),
    )
  ).filter(
    (assignment): assignment is (typeof rows)[number] => Boolean(assignment),
  );
  return Promise.all(
    scopedRows.map(async (assignment) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, assignment.id));
      const attempts = await db
        .select()
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.assignmentId, assignment.id),
            eq(attemptsTable.userId, user.id),
          ),
        )
        .orderBy(desc(attemptsTable.startedAt));
      return {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        status: assignment.status,
        deadline: assignment.deadline,
        questionCount: Number(count),
        timeLimitMinutes: assignment.timeLimitMinutes,
        attemptCount: attempts.length,
        maxAttempts: assignment.maxAttempts,
        latestScore: attempts[0]?.score ?? null,
      };
    }),
  );
}

router.get("/assignments", async (req: AuthedRequest, res): Promise<void> => {
  const query = ListAssignmentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let assignments = await assignmentSummariesForUser(
    req.appUser!,
    query.data.courseId,
  );
  if (query.data.status) {
    assignments = assignments.filter((item) => item.status === query.data.status);
  }
  res.json(ListAssignmentsResponse.parse(assignments));
});

router.get(
  "/assignments/:assignmentId",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GetAssignmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId));
    if (
      !assignment ||
      !(await canAccessCourse(
        req.appUser!,
        assignment.courseId,
        assignment.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    const joined = await db
      .select({
        assignmentQuestion: assignmentQuestionsTable,
        question: questionsTable,
      })
      .from(assignmentQuestionsTable)
      .innerJoin(
        questionsTable,
        eq(questionsTable.id, assignmentQuestionsTable.questionId),
      )
      .where(eq(assignmentQuestionsTable.assignmentId, assignment.id))
      .orderBy(asc(assignmentQuestionsTable.position));
    const [latestAttempt] = await db
      .select()
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.assignmentId, assignment.id),
          eq(attemptsTable.userId, req.appUser!.id),
        ),
      )
      .orderBy(desc(attemptsTable.startedAt))
      .limit(1);
    const savedResponses = latestAttempt
      ? await db
          .select()
          .from(responsesTable)
          .where(eq(responsesTable.attemptId, latestAttempt.id))
      : [];
    const summary = (
      await assignmentSummariesForUser(req.appUser!, assignment.courseId)
    ).find((item) => item.id === assignment.id)!;
    res.json(
      GetAssignmentResponse.parse({
        ...summary,
        instructions: assignment.instructions,
        questions: joined.map(({ assignmentQuestion, question }) => ({
          id: question.id,
          position: assignmentQuestion.position,
          subject: question.subject,
          questionType: question.questionType,
          prompt: question.prompt,
          stimulus: question.stimulus,
          choices:
            !assignmentQuestion.predictionFirst ||
            savedResponses.some(
              (response) =>
                response.questionId === question.id &&
                response.predictionLocked,
            )
              ? question.choices
              : [],
          skill: question.skill,
          difficulty: question.difficulty,
          predictionFirst: assignmentQuestion.predictionFirst,
        })),
      }),
    );
  },
);

router.post(
  "/assignments/:assignmentId/attempts",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = StartAttemptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId));
    if (
      !assignment ||
      !(await canAccessCourse(
        req.appUser!,
        assignment.courseId,
        assignment.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    if (assignment.deadline && assignment.deadline.getTime() < Date.now()) {
      res.status(409).json({ error: "Assignment deadline has passed" });
      return;
    }
    const existing = await db
      .select()
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.assignmentId, assignment.id),
          eq(attemptsTable.userId, req.appUser!.id),
        ),
      )
      .orderBy(desc(attemptsTable.startedAt));
    const resumable = existing.find(
      (attempt) => attempt.status === "active" || attempt.status === "paused",
    );
    if (resumable) {
      res.status(201).json(StartAttemptResponse.parse(await attemptShape(resumable.id)));
      return;
    }
    if (existing.length >= assignment.maxAttempts) {
      res.status(409).json({ error: "Attempt limit reached" });
      return;
    }
    const [attempt] = await db
      .insert(attemptsTable)
      .values({ assignmentId: assignment.id, userId: req.appUser!.id })
      .returning();
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "started" });
    res.status(201).json(StartAttemptResponse.parse(await attemptShape(attempt.id)));
  },
);

router.get("/attempts/:attemptId", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetAttemptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await canAccessAttempt(req.appUser!, params.data.attemptId);
  if (!access) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }
  const attempt = await enforceTimeLimit(access.attempt.id);
  if (!attempt) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }
  res.json(GetAttemptResponse.parse(await attemptShape(attempt.id)));
});

router.put(
  "/attempts/:attemptId/responses",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = SaveAttemptResponseParams.safeParse(req.params);
    const body = SaveAttemptResponseBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (!attempt || attempt.userId !== req.appUser!.id) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    const [belongsToAssignment] = await db
      .select({ id: assignmentQuestionsTable.id })
      .from(assignmentQuestionsTable)
      .where(
        and(
          eq(assignmentQuestionsTable.assignmentId, attempt.assignmentId),
          eq(assignmentQuestionsTable.questionId, body.data.questionId),
        ),
      );
    if (!belongsToAssignment) {
      res.status(400).json({ error: "Question is not part of this assignment" });
      return;
    }
    if (attempt.status !== "active") {
      res.status(409).json({ error: "Responses can only be saved while active" });
      return;
    }
    const [existing] = await db
      .select()
      .from(responsesTable)
      .where(
        and(
          eq(responsesTable.attemptId, attempt.id),
          eq(responsesTable.questionId, body.data.questionId),
        ),
      );
    if (
      existing?.predictionLocked &&
      body.data.prediction !== undefined &&
      body.data.prediction !== existing.prediction
    ) {
      res.status(409).json({ error: "Prediction is locked" });
      return;
    }
    const values = {
      attemptId: attempt.id,
      questionId: body.data.questionId,
      prediction: body.data.prediction ?? existing?.prediction ?? null,
      predictionLocked:
        existing?.predictionLocked || body.data.lockPrediction === true,
      finalAnswer: body.data.finalAnswer ?? existing?.finalAnswer ?? null,
      flagged: body.data.flagged ?? existing?.flagged ?? false,
      timeSpentSeconds:
        body.data.timeSpentSeconds ?? existing?.timeSpentSeconds ?? 0,
      savedAt: new Date(),
    };
    const [saved] = await db
      .insert(responsesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [responsesTable.attemptId, responsesTable.questionId],
        set: values,
      })
      .returning();
    res.json(
      SaveAttemptResponseResponse.parse({
        questionId: saved.questionId,
        prediction: saved.prediction,
        predictionLocked: saved.predictionLocked,
        finalAnswer: saved.finalAnswer,
        flagged: saved.flagged,
        savedAt: saved.savedAt,
      }),
    );
  },
);

router.post(
  "/attempts/:attemptId/pause",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = PauseAttemptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (!attempt || attempt.userId !== req.appUser!.id) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    if (attempt.status !== "active") {
      res.status(409).json({ error: "Attempt is not active" });
      return;
    }
    await db
      .update(attemptsTable)
      .set({ status: "paused" })
      .where(eq(attemptsTable.id, attempt.id));
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "paused" });
    res.json(PauseAttemptResponse.parse(await attemptShape(attempt.id)));
  },
);

router.post(
  "/attempts/:attemptId/resume",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = ResumeAttemptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (!attempt || attempt.userId !== req.appUser!.id) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    if (attempt.status !== "paused") {
      res.status(409).json({ error: "Attempt is not paused" });
      return;
    }
    await db
      .update(attemptsTable)
      .set({ status: "active" })
      .where(eq(attemptsTable.id, attempt.id));
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "resumed" });
    res.json(ResumeAttemptResponse.parse(await attemptShape(attempt.id)));
  },
);

router.post(
  "/attempts/:attemptId/submit",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = SubmitAttemptParams.safeParse(req.params);
    const body = SubmitAttemptBody.safeParse(req.body);
    if (!params.success || !body.success || !body.data.confirm) {
      res.status(400).json({ error: "Submission confirmation is required" });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (
      !attempt ||
      attempt.userId !== req.appUser!.id ||
      attempt.status === "submitted"
    ) {
      res.status(409).json({ error: "Attempt cannot be submitted" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    const assignedQuestions = await db
      .select({ question: questionsTable })
      .from(assignmentQuestionsTable)
      .innerJoin(
        questionsTable,
        eq(questionsTable.id, assignmentQuestionsTable.questionId),
      )
      .where(eq(assignmentQuestionsTable.assignmentId, attempt.assignmentId))
      .orderBy(asc(assignmentQuestionsTable.position));
    const submittedResponses = await db
      .select()
      .from(responsesTable)
      .where(eq(responsesTable.attemptId, attempt.id));
    const joined = assignedQuestions.map(({ question }) => ({
      question,
      response:
        submittedResponses.find((response) => response.questionId === question.id) ??
        null,
    }));
    let correctCount = 0;
    for (const item of joined) {
      const correct =
        item.response?.finalAnswer === item.question.correctAnswer;
      if (correct) correctCount += 1;
      if (item.response) {
        await db
          .update(responsesTable)
          .set({ correct })
          .where(eq(responsesTable.id, item.response.id));
      }
      if (!correct) {
        await db.insert(reviewQueueTable).values({
          attemptId: attempt.id,
          questionId: item.question.id,
          studentUserId: req.appUser!.id,
          skill: item.question.skill,
          reason: "Incorrect answer — review during the next session",
        });
      }
    }
    const totalCount = joined.length;
    const score = totalCount === 0 ? 0 : (correctCount / totalCount) * 100;
    await db
      .update(attemptsTable)
      .set({ status: "submitted", submittedAt: new Date(), score })
      .where(eq(attemptsTable.id, attempt.id));
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "submitted" });
    const timing = await timerSummary(attempt.id);
    const bySkill = new Map<string, { correct: number; total: number }>();
    for (const item of joined) {
      const current = bySkill.get(item.question.skill) ?? { correct: 0, total: 0 };
      current.total += 1;
      if (item.response?.finalAnswer === item.question.correctAnswer) {
        current.correct += 1;
      }
      bySkill.set(item.question.skill, current);
    }
    res.json(
      SubmitAttemptResponse.parse({
        attemptId: attempt.id,
        score,
        correctCount,
        totalCount,
        activeSeconds: timing.activeSeconds,
        pausedSeconds: timing.pausedSeconds,
        breakdown: [...bySkill.entries()].map(([skill, value]) => ({
          skill,
          ...value,
          accuracy: value.total === 0 ? 0 : (value.correct / value.total) * 100,
        })),
        items: joined.map(({ response, question }) => ({
          questionId: question.id,
          correct: response?.finalAnswer === question.correctAnswer,
          prediction: response?.prediction ?? null,
          finalAnswer: response?.finalAnswer ?? null,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          skill: question.skill,
          questionType: question.questionType,
          difficulty: question.difficulty,
          timeSpentSeconds: response?.timeSpentSeconds ?? 0,
          flagged: response?.flagged ?? false,
        })),
      }),
    );
  },
);

router.post(
  "/sessions/:sessionId/blocks",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = CreateCurriculumBlockParams.safeParse(req.params);
    const body = CreateCurriculumBlockBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId));
    if (
      !session ||
      !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
    ) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const [created] = await db
      .insert(curriculumBlocksTable)
      .values({
        sessionId: params.data.sessionId,
        kind: body.data.kind,
        position: body.data.position ?? 0,
        visibility: body.data.visibility,
        status: "draft",
        config: body.data.config,
      })
      .returning();
    res.status(201).json(CreateCurriculumBlockResponse.parse(created));
  },
);

router.patch(
  "/blocks/:blockId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateCurriculumBlockParams.safeParse(req.params);
    const body = UpdateCurriculumBlockBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [visibleBlock] = await db
      .select({
        id: curriculumBlocksTable.id,
        courseId: sessionsTable.courseId,
        subject: sessionsTable.subject,
      })
      .from(curriculumBlocksTable)
      .innerJoin(
        sessionsTable,
        eq(sessionsTable.id, curriculumBlocksTable.sessionId),
      )
      .where(eq(curriculumBlocksTable.id, params.data.blockId));
    if (
      !visibleBlock ||
      !(await canAccessCourse(
        req.appUser!,
        visibleBlock.courseId,
        visibleBlock.subject,
      ))
    ) {
      res.status(404).json({ error: "Block not found" });
      return;
    }
    const [updated] = await db
      .update(curriculumBlocksTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(curriculumBlocksTable.id, params.data.blockId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Block not found" });
      return;
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "curriculum_block.updated",
      entityType: "curriculum_block",
      entityId: updated.id,
      metadata: { status: updated.status },
    });
    res.json(UpdateCurriculumBlockResponse.parse(updated));
  },
);

function contentSourceShape(source: typeof contentSourcesTable.$inferSelect) {
  return {
    id: source.id,
    courseId: source.courseId,
    subject: source.subject,
    title: source.title,
    sourceKind: source.sourceKind,
    sourceUrl: source.sourceUrl,
    originalFilename: source.originalFilename,
    authorizationNote: source.authorizationNote,
    provenance: source.provenance,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function questionBankShape(question: typeof questionsTable.$inferSelect) {
  return {
    id: question.id,
    subject: question.subject,
    domain: question.domain,
    skill: question.skill,
    questionType: question.questionType,
    difficulty: question.difficulty,
    stimulus: question.stimulus,
    prompt: question.prompt,
    choices: question.choices,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    sourceType: question.sourceType,
    sourceId: question.sourceId,
    reviewStatus: question.reviewStatus,
    tags: question.tags,
    generationMethod: question.generationMethod,
    rejectionReason: question.rejectionReason,
    reviewedAt: question.reviewedAt,
    createdAt: question.createdAt,
  };
}

function sourceConcepts(text: string, focus: string): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "because",
    "before",
    "being",
    "between",
    "could",
    "every",
    "first",
    "from",
    "have",
    "into",
    "lesson",
    "more",
    "other",
    "should",
    "their",
    "there",
    "these",
    "they",
    "this",
    "through",
    "using",
    "were",
    "which",
    "while",
    "with",
    "would",
  ]);
  const counts = new Map<string, number>();
  const words = text
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g) ?? [];
  for (const word of words) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const extracted = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([word]) => word)
    .slice(0, 16);
  return [
    ...new Set([
      ...focus.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [],
      ...extracted,
    ]),
  ];
}

router.get(
  "/content-sources",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const query = ListContentSourcesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (!(await canAccessCourse(req.appUser!, query.data.courseId))) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const sources = await db
      .select()
      .from(contentSourcesTable)
      .where(eq(contentSourcesTable.courseId, query.data.courseId))
      .orderBy(desc(contentSourcesTable.createdAt));
    const visibleSources = (
      await Promise.all(
        sources.map(async (source) =>
          req.appUser!.role === "administrator" ||
          (await canAccessCourse(
            req.appUser!,
            source.courseId,
            source.subject,
          ))
            ? source
            : null,
        ),
      )
    ).filter(
      (source): source is (typeof sources)[number] => Boolean(source),
    );
    res.json(ListContentSourcesResponse.parse(visibleSources.map(contentSourceShape)));
  },
);

router.post(
  "/content-sources",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = CreateContentSourceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const subject =
      req.appUser!.role === "tutor"
        ? await courseSubjectForUser(req.appUser!, body.data.courseId)
        : "all";
    if (
      !(await canAccessCourse(
        req.appUser!,
        body.data.courseId,
        subject || undefined,
      ))
    ) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!body.data.sourceUrl && !body.data.extractedText) {
      res.status(400).json({
        error: "Provide a source URL or authorized extracted text",
      });
      return;
    }
    const [source] = await db
      .insert(contentSourcesTable)
      .values({
        courseId: body.data.courseId,
        importedBy: req.appUser!.id,
        subject: subject || "all",
        title: body.data.title.trim(),
        sourceKind: body.data.sourceKind,
        sourceUrl: body.data.sourceUrl ?? null,
        originalFilename: body.data.originalFilename ?? null,
        authorizationNote: body.data.authorizationNote.trim(),
        extractedText: body.data.extractedText ?? null,
        provenance: {
          ...(body.data.provenance ?? {}),
          importedAt: new Date().toISOString(),
          importedByRole: req.appUser!.role,
        },
      })
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "content_source.imported",
      entityType: "content_source",
      entityId: source!.id,
      metadata: {
        courseId: source!.courseId,
        sourceKind: source!.sourceKind,
      },
    });
    res
      .status(201)
      .json(CreateContentSourceResponse.parse(contentSourceShape(source!)));
  },
);

router.post(
  "/content-sources/:sourceId/generate",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GeneratePracticeQuestionsParams.safeParse(req.params);
    const body = GeneratePracticeQuestionsBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [record] = await db
      .select({ source: contentSourcesTable, course: coursesTable })
      .from(contentSourcesTable)
      .innerJoin(coursesTable, eq(coursesTable.id, contentSourcesTable.courseId))
      .where(eq(contentSourcesTable.id, params.data.sourceId));
    if (
      !record ||
      !(await canAccessCourse(
        req.appUser!,
        record.source.courseId,
        record.source.subject,
      ))
    ) {
      res.status(404).json({ error: "Content source not found" });
      return;
    }

    if (!record.source.extractedText?.trim() || record.source.extractedText.trim().length < 40) {
      res.status(400).json({
        error:
          "Authorized extracted text is required before practice can be generated",
      });
      return;
    }

    // Extract concepts, never sentences or answer keys. Drafts use newly written
    // scenarios so the source informs the practice without being reproduced.
    const focus = body.data.focus.trim().replace(/\s+/g, " ");
    const count = body.data.count ?? 3;
    const concepts = sourceConcepts(record.source.extractedText, focus);
    if (concepts.length < 2) {
      res.status(400).json({
        error: "The extracted text does not contain enough distinct concepts",
      });
      return;
    }
    const templates = [
      {
        prompt: (primary: string, secondary: string) =>
          `Which plan best helps the student explain the relationship between ${primary} and ${secondary}?`,
        choices: [
          "State a specific relationship and test it against a new example.",
          "List both terms without explaining how they connect.",
          "Replace both terms with a broader unsupported claim.",
          "Ignore the relationship and summarize an unrelated detail.",
        ],
        correctAnswer: "a",
        explanation:
          "A specific relationship tested with a new example demonstrates transferable understanding without copying the source.",
      },
      {
        prompt: (primary: string, secondary: string) =>
          `A student is comparing ${primary} and ${secondary}. Which revision produces the clearest evidence-based distinction?`,
        choices: [
          "Treat the two concepts as identical without support.",
          "Name a relevant difference and explain why it matters in a new case.",
          "Choose whichever concept appears first.",
          "Add a conclusion that neither concept supports.",
        ],
        correctAnswer: "b",
        explanation:
          "Naming and applying a relevant distinction shows accurate analysis while keeping the example original.",
      },
      {
        prompt: (primary: string, secondary: string) =>
          `Which question would best check whether a learner can transfer ideas about ${primary} and ${secondary} to unfamiliar material?`,
        choices: [
          "Can the learner repeat a sentence from the source?",
          "Can the learner identify which word appeared more often?",
          "Can the learner apply the relationship to a new scenario and justify it?",
          "Can the learner recall the source title?",
        ],
        correctAnswer: "c",
        explanation:
          "Transfer requires applying the underlying relationship to a new context and supporting the choice.",
      },
      {
        prompt: (primary: string, secondary: string) =>
          `Which response best synthesizes the lesson's treatment of ${primary} and ${secondary}?`,
        choices: [
          "A copied sentence with no interpretation.",
          "A claim based only on personal preference.",
          "A summary of one term that omits the other.",
          "An original claim that connects both concepts and stays within the available support.",
        ],
        correctAnswer: "d",
        explanation:
          "A synthesis must connect both concepts in an original, supportable claim.",
      },
    ];
    const created = await db
      .insert(questionsTable)
      .values(
        Array.from({ length: count }, (_, index) => {
          const primary = concepts[(index * 2) % concepts.length]!;
          const secondary = concepts[(index * 2 + 1) % concepts.length]!;
          const template = templates[index % templates.length]!;
          return {
            subject: record.source.subject === "all"
              ? record.course.subject
              : record.source.subject,
            domain: "Source-guided practice",
            skill: focus,
            questionType: "multiple_choice",
            difficulty: body.data.difficulty ?? "medium",
            stimulus:
              `In a new learning scenario, a student must connect the concepts of ${primary} and ${secondary} without relying on memorized wording.`,
            prompt: template.prompt(primary, secondary),
            choices: template.choices.map((text, choiceIndex) => ({
              id: String.fromCharCode(97 + choiceIndex),
              label: String.fromCharCode(65 + choiceIndex),
              text,
            })),
            correctAnswer: template.correctAnswer,
            explanation: template.explanation,
            sourceType: "authorized-source-derived",
            sourceId: record.source.id,
            reviewStatus: "draft",
            tags: [focus.toLowerCase(), primary, secondary],
            generationMethod: "source-aware-generator",
          };
        }),
      )
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "practice_questions.generated",
      entityType: "content_source",
      entityId: record.source.id,
      metadata: { count: created.length, reviewStatus: "draft" },
    });
    res
      .status(201)
      .json(
        GeneratePracticeQuestionsResponse.parse(created.map(questionBankShape)),
      );
  },
);

router.get(
  "/question-bank",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const query = ListQuestionBankQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (!(await canAccessCourse(req.appUser!, query.data.courseId))) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const conditions = [eq(contentSourcesTable.courseId, query.data.courseId)];
    if (query.data.reviewStatus) {
      conditions.push(eq(questionsTable.reviewStatus, query.data.reviewStatus));
    }
    const rows = await db
      .select({ question: questionsTable })
      .from(questionsTable)
      .innerJoin(
        contentSourcesTable,
        eq(contentSourcesTable.id, questionsTable.sourceId),
      )
      .where(and(...conditions))
      .orderBy(desc(questionsTable.createdAt));
    const visibleRows = (
      await Promise.all(
        rows.map(async ({ question }) =>
          (await canAccessCourse(
            req.appUser!,
            query.data.courseId,
            question.subject,
          ))
            ? question
            : null,
        ),
      )
    ).filter((question): question is (typeof rows)[number]["question"] =>
      Boolean(question),
    );
    res.json(ListQuestionBankResponse.parse(visibleRows.map(questionBankShape)));
  },
);

router.patch(
  "/question-bank/:questionId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateQuestionBankItemParams.safeParse(req.params);
    const body = UpdateQuestionBankItemBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [visibleQuestion] = await db
      .select({
        question: questionsTable,
        courseId: contentSourcesTable.courseId,
        subject: contentSourcesTable.subject,
      })
      .from(questionsTable)
      .innerJoin(
        contentSourcesTable,
        eq(contentSourcesTable.id, questionsTable.sourceId),
      )
      .where(eq(questionsTable.id, params.data.questionId));
    if (
      !visibleQuestion ||
      !(await canAccessCourse(
        req.appUser!,
        visibleQuestion.courseId,
      visibleQuestion.question.subject || visibleQuestion.subject,
      ))
    ) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    if (
      body.data.reviewStatus === "rejected" &&
      !body.data.rejectionReason?.trim()
    ) {
      res.status(400).json({ error: "A rejection reason is required" });
      return;
    }
    const isReviewed =
      body.data.reviewStatus === "approved" ||
      body.data.reviewStatus === "rejected";
    const [updated] = await db
      .update(questionsTable)
      .set({
        ...body.data,
        rejectionReason:
          body.data.reviewStatus === "approved"
            ? null
            : body.data.rejectionReason,
        reviewedBy: isReviewed ? req.appUser!.id : null,
        reviewedAt: isReviewed ? new Date() : null,
      })
      .where(eq(questionsTable.id, params.data.questionId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "practice_question.reviewed",
      entityType: "question",
      entityId: updated!.id,
      metadata: { reviewStatus: updated!.reviewStatus },
    });
    res.json(
      UpdateQuestionBankItemResponse.parse(questionBankShape(updated!)),
    );
  },
);

router.post(
  "/assignments/:assignmentId/questions",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = AttachQuestionToAssignmentParams.safeParse(req.params);
    const body = AttachQuestionToAssignmentBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId));
    const [questionRecord] = await db
      .select({ question: questionsTable, courseId: contentSourcesTable.courseId })
      .from(questionsTable)
      .innerJoin(
        contentSourcesTable,
        eq(contentSourcesTable.id, questionsTable.sourceId),
      )
      .where(eq(questionsTable.id, body.data.questionId));
    if (
      !assignment ||
      !questionRecord ||
      assignment.courseId !== questionRecord.courseId ||
      !(await canAccessCourse(
        req.appUser!,
        assignment.courseId,
        assignment.subject,
      )) ||
      !(await canAccessCourse(
        req.appUser!,
        questionRecord.courseId,
        questionRecord.question.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment or question not found" });
      return;
    }
    if (questionRecord.question.reviewStatus !== "approved") {
      res.status(400).json({
        error: "Only tutor-approved questions can be attached to assignments",
      });
      return;
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, assignment.id));
    await db
      .insert(assignmentQuestionsTable)
      .values({
        assignmentId: assignment.id,
        questionId: questionRecord.question.id,
        position: body.data.position ?? Number(count),
        predictionFirst: body.data.predictionFirst ?? false,
      })
      .onConflictDoNothing();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "practice_question.attached",
      entityType: "assignment",
      entityId: assignment.id,
      metadata: { questionId: questionRecord.question.id },
    });
    res
      .status(201)
      .json(
        AttachQuestionToAssignmentResponse.parse(
          questionBankShape(questionRecord.question),
        ),
      );
  },
);

router.get(
  "/sessions/:sessionId/artifacts",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = ListSessionArtifactsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId));
    if (
      !session ||
      !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
    ) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const artifacts = await db
      .select()
      .from(sessionArtifactsTable)
      .where(eq(sessionArtifactsTable.sessionId, session.id))
      .orderBy(asc(sessionArtifactsTable.kind));
    const visible =
      req.appUser!.role === "student"
        ? artifacts.filter(
            (artifact) =>
              artifact.kind === "report" &&
              artifact.visibility === "course" &&
              artifact.status === "published",
          )
        : artifacts;
    res.json(ListSessionArtifactsResponse.parse(visible));
  },
);

router.put(
  "/sessions/:sessionId/artifacts",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpsertSessionArtifactParams.safeParse(req.params);
    const body = UpsertSessionArtifactBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId));
    if (
      !session ||
      !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
    ) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const isPublishedReport =
      body.data.kind === "report" && body.data.status === "published";
    const values = {
      sessionId: session.id,
      createdBy: req.appUser!.id,
      kind: body.data.kind,
      content: body.data.content.trim(),
      visibility: isPublishedReport ? "course" : "tutor",
      status: isPublishedReport ? "published" : "draft",
      updatedAt: new Date(),
    };
    const [saved] = await db
      .insert(sessionArtifactsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [sessionArtifactsTable.sessionId, sessionArtifactsTable.kind],
        set: {
          content: values.content,
          visibility: values.visibility,
          status: values.status,
          updatedAt: values.updatedAt,
        },
      })
      .returning();
    if (isPublishedReport) {
      await db
        .update(sessionsTable)
        .set({ hasReport: true })
        .where(eq(sessionsTable.id, session.id));
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: `session_${body.data.kind}.saved`,
      entityType: "session",
      entityId: session.id,
      metadata: { visibility: values.visibility },
    });
    res.json(UpsertSessionArtifactResponse.parse(saved));
  },
);

router.get(
  "/review-queue",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const courseIds = await visibleCourseIds(req.appUser!);
    const rows =
      courseIds.length === 0
        ? []
        : await db
      .select({
        item: reviewQueueTable,
        student: usersTable,
        assignment: assignmentsTable,
        response: responsesTable,
      })
      .from(reviewQueueTable)
      .innerJoin(usersTable, eq(usersTable.id, reviewQueueTable.studentUserId))
      .innerJoin(attemptsTable, eq(attemptsTable.id, reviewQueueTable.attemptId))
      .innerJoin(
        assignmentsTable,
        eq(assignmentsTable.id, attemptsTable.assignmentId),
      )
      .leftJoin(
        responsesTable,
        and(
          eq(responsesTable.attemptId, reviewQueueTable.attemptId),
          eq(responsesTable.questionId, reviewQueueTable.questionId),
        ),
      )
      .where(inArray(assignmentsTable.courseId, courseIds))
      .orderBy(desc(reviewQueueTable.createdAt));
    const visibleRows = (
      await Promise.all(
        rows.map(async (row) =>
          (await canAccessStudent(
            req.appUser!,
            row.assignment.courseId,
            row.item.studentUserId,
            row.assignment.subject,
          ))
            ? row
            : null,
        ),
      )
    ).filter((row): row is (typeof rows)[number] => Boolean(row));
    res.json(
      ListReviewQueueResponse.parse(
        visibleRows.map(({ item, student, response }) => ({
          id: item.id,
          attemptId: item.attemptId,
          questionId: item.questionId,
          studentName: student.displayName,
          skill: item.skill,
          reason: item.reason,
          prediction: response?.prediction ?? null,
          finalAnswer: response?.finalAnswer ?? null,
          status: item.status,
          tutorNote: item.tutorNote,
        })),
      ),
    );
  },
);

router.patch(
  "/review-queue/:itemId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateReviewQueueItemParams.safeParse(req.params);
    const body = UpdateReviewQueueItemBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [visibleItem] = await db
      .select({
        id: reviewQueueTable.id,
        courseId: assignmentsTable.courseId,
        subject: assignmentsTable.subject,
        studentUserId: reviewQueueTable.studentUserId,
      })
      .from(reviewQueueTable)
      .innerJoin(attemptsTable, eq(attemptsTable.id, reviewQueueTable.attemptId))
      .innerJoin(
        assignmentsTable,
        eq(assignmentsTable.id, attemptsTable.assignmentId),
      )
      .where(eq(reviewQueueTable.id, params.data.itemId));
    if (
      !visibleItem ||
      !(await canAccessStudent(
        req.appUser!,
        visibleItem.courseId,
        visibleItem.studentUserId,
        visibleItem.subject,
      ))
    ) {
      res.status(404).json({ error: "Review item not found" });
      return;
    }
    const [updated] = await db
      .update(reviewQueueTable)
      .set(body.data)
      .where(eq(reviewQueueTable.id, params.data.itemId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Review item not found" });
      return;
    }
    const [student] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, updated.studentUserId));
    const [response] = await db
      .select()
      .from(responsesTable)
      .where(
        and(
          eq(responsesTable.attemptId, updated.attemptId),
          eq(responsesTable.questionId, updated.questionId),
        ),
      );
    res.json(
      UpdateReviewQueueItemResponse.parse({
        id: updated.id,
        attemptId: updated.attemptId,
        questionId: updated.questionId,
        studentName: student?.displayName ?? "Student",
        skill: updated.skill,
        reason: updated.reason,
        prediction: response?.prediction ?? null,
        finalAnswer: response?.finalAnswer ?? null,
        status: updated.status,
        tutorNote: updated.tutorNote,
      }),
    );
  },
);

export default router;