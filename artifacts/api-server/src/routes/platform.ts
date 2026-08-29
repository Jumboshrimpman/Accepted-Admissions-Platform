import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateCurriculumBlockBody,
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
  ListReviewQueueResponse,
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
} from "@workspace/api-zod";
import {
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
  sessionsTable,
  timerEventsTable,
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
  if (!appUser) {
    const email =
      claimString(auth.sessionClaims, "email") ??
      `${clerkUserId.replace(/[^a-zA-Z0-9_-]/g, "")}@users.accepted.local`;
    const displayName =
      claimString(auth.sessionClaims, "name") ??
      claimString(auth.sessionClaims, "firstName") ??
      "Accepted Admissions Student";
    const adminIds = envIdSet("ACCEPTED_ADMIN_CLERK_USER_IDS");
    const tutorIds = envIdSet("ACCEPTED_TUTOR_CLERK_USER_IDS");
    const studentIds = envIdSet("ACCEPTED_STUDENT_CLERK_USER_IDS");
    const role: AppUser["role"] = adminIds.has(clerkUserId)
      ? "administrator"
      : tutorIds.has(clerkUserId)
        ? "tutor"
        : "student";
    [appUser] = await db
      .insert(usersTable)
      .values({ clerkUserId, email, displayName, role })
      .returning();
    const courseId = await ensureSeedData();
    // Development auto-enrolls preview users. Production membership is explicit:
    // only identities listed in the role-specific environment allowlists enroll.
    if (
      process.env.NODE_ENV === "development" ||
      tutorIds.has(clerkUserId) ||
      studentIds.has(clerkUserId)
    ) {
      await db
        .insert(courseMembershipsTable)
        .values({ courseId, userId: appUser.id, membershipRole: role })
        .onConflictDoNothing();
    }
  }
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
      .where(eq(courseMembershipsTable.userId, user.id))
  ).map((row) => row.id);
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

async function courseShape(courseId: string) {
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
  const tutorMemberships = await db
    .select({ user: usersTable })
    .from(courseMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, courseMembershipsTable.userId))
    .where(
      and(
        eq(courseMembershipsTable.courseId, course.id),
        eq(courseMembershipsTable.membershipRole, "tutor"),
      ),
    );
  return {
    id: course.id,
    title: course.title,
    subject: course.subject,
    term: course.term,
    status: course.status,
    sessionCount: courseSessions.length,
    completedSessionCount: courseSessions.filter((s) => s.status === "completed")
      .length,
    tutors: tutorMemberships.map(({ user }) => tutorShape(user)!),
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
  return (await visibleCourseIds(user)).includes(record.courseId) ? record : null;
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
  const courses = await Promise.all(ids.map(courseShape));
  res.json(ListCoursesResponse.parse(courses.filter(Boolean)));
});

router.get("/courses/:courseId", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ids = await visibleCourseIds(req.appUser!);
  if (!ids.includes(params.data.courseId)) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const base = await courseShape(params.data.courseId);
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, params.data.courseId));
  const courseSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, params.data.courseId))
    .orderBy(asc(sessionsTable.dateTime));
  res.json(
    GetCourseResponse.parse({
      ...base,
      meetUrl: course?.meetUrl ?? null,
      driveUrl: course?.driveUrl ?? null,
      goalSummary: course?.goalSummary ?? null,
      sessions: courseSessions.map((session) => ({
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
  const courses = (await Promise.all(ids.map(courseShape))).filter(Boolean);
  const upcomingSessions =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(sessionsTable)
          .where(inArray(sessionsTable.courseId, ids))
          .orderBy(asc(sessionsTable.dateTime))
          .limit(4);
  const assignments =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.courseId, ids))
          .orderBy(asc(assignmentsTable.deadline));
  const assignmentIds = assignments.map((item) => item.id);
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
  const assignmentSummaries = assignments.map((assignment) => ({
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
      upcomingSessions: upcomingSessions.map((session) => ({
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
  if (!session || !(await visibleCourseIds(req.appUser!)).includes(session.courseId)) {
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
  if (courseId && !ids.includes(courseId)) return [];
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
  return Promise.all(
    rows.map(async (assignment) => {
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
      !(await visibleCourseIds(req.appUser!)).includes(assignment.courseId)
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
      !(await visibleCourseIds(req.appUser!)).includes(assignment.courseId)
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
      !(await visibleCourseIds(req.appUser!)).includes(session.courseId)
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
      .select({ id: curriculumBlocksTable.id, courseId: sessionsTable.courseId })
      .from(curriculumBlocksTable)
      .innerJoin(
        sessionsTable,
        eq(sessionsTable.id, curriculumBlocksTable.sessionId),
      )
      .where(eq(curriculumBlocksTable.id, params.data.blockId));
    if (
      !visibleBlock ||
      !(await visibleCourseIds(req.appUser!)).includes(visibleBlock.courseId)
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
    res.json(
      ListReviewQueueResponse.parse(
        rows.map(({ item, student, response }) => ({
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
      .select({ id: reviewQueueTable.id, courseId: assignmentsTable.courseId })
      .from(reviewQueueTable)
      .innerJoin(attemptsTable, eq(attemptsTable.id, reviewQueueTable.attemptId))
      .innerJoin(
        assignmentsTable,
        eq(assignmentsTable.id, attemptsTable.assignmentId),
      )
      .where(eq(reviewQueueTable.id, params.data.itemId));
    if (
      !visibleItem ||
      !(await visibleCourseIds(req.appUser!)).includes(visibleItem.courseId)
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