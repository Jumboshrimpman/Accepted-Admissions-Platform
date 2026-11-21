import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  courseMembershipsTable,
  db,
  questionsTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { CURATED_FULL_LENGTH_TAG } from "./curated-full-length.ts";
import { logger } from "./logger.ts";
import { shouldRepublishSeededHomework } from "./session-homework.ts";
import {
  isT6ForbiddenClient,
  MICHELLE_T6_CLERK_USER_ID,
  MICHELLE_T6_EMAIL,
  normalizeT6Email,
  T6_MATH_MAX_ATTEMPTS,
  T6_MATH_MODULE_PLANS,
  T6_MATH_REFERENCE_SHEET,
  T6_MATH_TAG,
  T6_MATH_TIME_LIMIT_MINUTES,
  t6DueAt,
  pickT6Session,
  sessionMatchesT6Date,
  type T6ModulePlan,
  type T6QuestionDraft,
} from "./t6-math-content.ts";

export {
  MICHELLE_T6_CLERK_USER_ID,
  MICHELLE_T6_EMAIL,
  T6_MATH_MEDIA_DIR,
  T6_MATH_MODULE_PLANS,
  T6_MATH_REFERENCE_SHEET,
  T6_MATH_TAG,
  T6_MATH_TIME_LIMIT_MINUTES,
  t6DueAt,
  t6MathPlan,
  pickT6Session,
  sessionMatchesT6Date,
} from "./t6-math-content.ts";

export type T6MathModuleResult = {
  module: 1 | 2;
  created: boolean;
  dryRun: boolean;
  assignmentId: string | null;
  sessionId: string | null;
  sessionLinked: boolean;
  deadline: string | null;
  questionCount: number;
  skippedReason?: string;
};

export type T6MathSeedResult = {
  dryRun: boolean;
  modules: T6MathModuleResult[];
};

export type T6MathSeedOptions = {
  now?: Date;
  dryRun?: boolean;
  identities?: { michelleEmail?: string; michelleClerkUserId?: string };
};

function moduleTag(module: 1 | 2): string {
  return module === 1 ? "math-m1" : "math-m2";
}

function questionTags(plan: T6ModulePlan, draft: T6QuestionDraft): string[] {
  return [CURATED_FULL_LENGTH_TAG, T6_MATH_TAG, "sat-pt6", "t6", "6VSL02", moduleTag(plan.module), draft.key];
}

function sourceKey(tags: readonly string[] | null | undefined, plan: T6ModulePlan): string {
  const prefix = `t6-math-m${plan.module}-q`;
  return (tags ?? []).find((tag) => tag.startsWith(prefix)) ?? "";
}

async function insertQuestions(plan: T6ModulePlan): Promise<string[]> {
  const ids: string[] = [];
  for (const draft of plan.questions) {
    const [question] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Math",
        domain: "SAT Math",
        skill: "SAT Math",
        questionType: draft.questionType,
        difficulty: "medium",
        stimulus: draft.stimulus,
        prompt: draft.prompt,
        choices: draft.choices.map((choice) => ({ ...choice })),
        correctAnswer: draft.correctAnswer,
        explanation: draft.explanation,
        sourceType: "college_board",
        reviewStatus: "approved",
        tags: questionTags(plan, draft),
        generationMethod: "curated-full-length",
      })
      .returning({ id: questionsTable.id });
    ids.push(question!.id);
  }
  return ids;
}

async function replaceLinks(assignmentId: string, questionIds: readonly string[]): Promise<void> {
  await db.delete(assignmentQuestionsTable).where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  for (const [index, questionId] of questionIds.entries()) {
    await db.insert(assignmentQuestionsTable).values({
      assignmentId,
      questionId,
      position: index,
      predictionFirst: false,
    });
  }
}

function questionMatchesDraft(
  row: {
    prompt: string;
    stimulus: string | null;
    choices: unknown;
    correctAnswer: string;
    explanation: string;
    questionType: string;
  },
  draft: T6QuestionDraft,
): boolean {
  return (
    row.prompt === draft.prompt &&
    (row.stimulus ?? null) === draft.stimulus &&
    row.correctAnswer === draft.correctAnswer &&
    row.explanation === draft.explanation &&
    row.questionType === draft.questionType &&
    JSON.stringify(row.choices ?? []) === JSON.stringify(draft.choices)
  );
}

async function refreshUntouchedQuestions(assignmentId: string, plan: T6ModulePlan): Promise<void> {
  const links = await db
    .select({
      id: questionsTable.id,
      tags: questionsTable.tags,
      prompt: questionsTable.prompt,
      stimulus: questionsTable.stimulus,
      choices: questionsTable.choices,
      correctAnswer: questionsTable.correctAnswer,
      explanation: questionsTable.explanation,
      questionType: questionsTable.questionType,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
    .orderBy(sql`${assignmentQuestionsTable.position} asc`);
  const sameShape =
    links.length === plan.questions.length &&
    links.every(
      (link, index) =>
        (link.tags ?? []).includes(T6_MATH_TAG) &&
        sourceKey(link.tags, plan) === plan.questions[index]?.key,
    );
  if (!sameShape) {
    const ownedIds = links.filter((link) => (link.tags ?? []).includes(T6_MATH_TAG)).map((link) => link.id);
    await replaceLinks(assignmentId, await insertQuestions(plan));
    if (ownedIds.length > 0) {
      const stillLinked = await db
        .select({ questionId: assignmentQuestionsTable.questionId })
        .from(assignmentQuestionsTable)
        .where(inArray(assignmentQuestionsTable.questionId, ownedIds));
      const keep = new Set(stillLinked.map((row) => row.questionId));
      const removable = ownedIds.filter((id) => !keep.has(id));
      if (removable.length > 0) {
        await db.delete(questionsTable).where(
          and(
            inArray(questionsTable.id, removable),
            sql`${questionsTable.tags} @> ${JSON.stringify([T6_MATH_TAG])}::jsonb`,
          ),
        );
      }
    }
    return;
  }
  for (const [index, link] of links.entries()) {
    const draft = plan.questions[index]!;
    if (questionMatchesDraft(link, draft)) continue;
    await db
      .update(questionsTable)
      .set({
        prompt: draft.prompt,
        stimulus: draft.stimulus,
        choices: draft.choices.map((choice) => ({ ...choice })),
        correctAnswer: draft.correctAnswer,
        explanation: draft.explanation,
        questionType: draft.questionType,
      })
      .where(
        and(
          eq(questionsTable.id, link.id),
          sql`${questionsTable.tags} @> ${JSON.stringify([T6_MATH_TAG])}::jsonb`,
        ),
      );
  }
}

async function findMichelle(email: string, clerkUserId: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(or(sql`lower(${usersTable.email}) = ${email}`, eq(usersTable.clerkUserId, clerkUserId)));
  return (
    rows.find((user) => user.clerkUserId === clerkUserId) ??
    rows.find((user) => normalizeT6Email(user.email) === email) ??
    null
  );
}

async function courseIdForStudent(studentId: string): Promise<string | null> {
  const [membership] = await db
    .select({ courseId: courseMembershipsTable.courseId })
    .from(courseMembershipsTable)
    .where(eq(courseMembershipsTable.userId, studentId))
    .limit(1);
  if (membership) return membership.courseId;
  const [session] = await db
    .select({ courseId: sessionsTable.courseId })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.clientUserId, studentId), isNull(sessionsTable.cancelledAt)))
    .orderBy(desc(sessionsTable.dateTime))
    .limit(1);
  return session?.courseId ?? null;
}

function skipped(
  plan: T6ModulePlan,
  dryRun: boolean,
  skippedReason: string,
  extra: Partial<T6MathModuleResult> = {},
): T6MathModuleResult {
  return {
    module: plan.module,
    created: false,
    dryRun,
    assignmentId: extra.assignmentId ?? null,
    sessionId: extra.sessionId ?? null,
    sessionLinked: extra.sessionLinked ?? false,
    deadline: extra.deadline ?? null,
    questionCount: plan.questions.length,
    skippedReason,
  };
}

async function ensureModule(
  plan: T6ModulePlan,
  michelle: { id: string; email: string },
  dryRun: boolean,
): Promise<T6MathModuleResult> {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, michelle.id),
        isNull(sessionsTable.cancelledAt),
        ne(sessionsTable.status, "archived"),
      ),
    );
  const matches = sessions.filter((session) => sessionMatchesT6Date(session, plan.dateKey));
  const session = pickT6Session(matches);
  const deadline = t6DueAt(plan.dateKey, session);

  const existing = await db
    .select({
      assignment: assignmentsTable,
      sessionClientUserId: sessionsTable.clientUserId,
    })
    .from(assignmentsTable)
    .leftJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(
      and(
        eq(assignmentsTable.title, plan.title),
        ne(assignmentsTable.status, "archived"),
        or(
          eq(assignmentsTable.assignedStudentUserId, michelle.id),
          eq(sessionsTable.clientUserId, michelle.id),
        ),
      ),
    );
  if (existing.length > 1) {
    return skipped(plan, dryRun, "More than one matching quiz was found and left unchanged.");
  }

  const assignmentValues = {
    assignedStudentUserId: michelle.id,
    assignedTutorUserId: session?.tutorUserId ?? null,
    sessionId: session?.id ?? null,
    deliveryPhase: "before_session" as const,
    title: plan.title,
    subject: "SAT Math",
    instructions: plan.instructions,
    instructionsFootnote: plan.footnote,
    referenceSheet: T6_MATH_REFERENCE_SHEET,
    markForReview: true,
    eliminateChoices: true,
    status: "published" as const,
    deadline,
    timeLimitMinutes: T6_MATH_TIME_LIMIT_MINUTES,
    softTimeLimit: false,
    maxAttempts: T6_MATH_MAX_ATTEMPTS,
  };

  const already = existing[0];
  if (already) {
    if (
      already.assignment.assignedStudentUserId &&
      already.assignment.assignedStudentUserId !== michelle.id
    ) {
      return skipped(plan, dryRun, "Refusing to change a quiz assigned to someone else.");
    }
    if (already.sessionClientUserId && already.sessionClientUserId !== michelle.id) {
      return skipped(plan, dryRun, "Refusing to change a quiz on another student's session.");
    }
    if (!shouldRepublishSeededHomework(already.assignment.status)) {
      return skipped(plan, dryRun, "The quiz is archived and was left unchanged.", {
        assignmentId: already.assignment.id,
      });
    }
    const [attempt] = await db
      .select({ id: attemptsTable.id })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, already.assignment.id))
      .limit(1);
    if (attempt) {
      return skipped(plan, dryRun, "The quiz already has an attempt and was left unchanged.", {
        assignmentId: already.assignment.id,
        sessionId: already.assignment.sessionId,
        sessionLinked: Boolean(already.assignment.sessionId),
        deadline: already.assignment.deadline?.toISOString() ?? null,
      });
    }
    if (dryRun) {
      return skipped(plan, dryRun, "Dry run left the existing quiz unchanged.", {
        assignmentId: already.assignment.id,
        sessionId: session?.id ?? already.assignment.sessionId,
        sessionLinked: Boolean(session ?? already.assignment.sessionId),
        deadline: deadline.toISOString(),
      });
    }
    const courseId = session?.courseId ?? already.assignment.courseId;
    await db
      .update(assignmentsTable)
      .set({ ...assignmentValues, courseId })
      .where(eq(assignmentsTable.id, already.assignment.id));
    await refreshUntouchedQuestions(already.assignment.id, plan);
    return {
      module: plan.module,
      created: false,
      dryRun: false,
      assignmentId: already.assignment.id,
      sessionId: session?.id ?? null,
      sessionLinked: Boolean(session),
      deadline: deadline.toISOString(),
      questionCount: plan.questions.length,
      skippedReason: session
        ? "The quiz is already assigned and linked to the session."
        : "The quiz is already assigned. No session on that date was found, so the due date stands in for the session.",
    };
  }

  const courseId = session?.courseId ?? (await courseIdForStudent(michelle.id));
  if (!courseId) {
    return skipped(
      plan,
      dryRun,
      "Michelle has no course, so the quiz was not assigned.",
    );
  }
  if (dryRun) {
    return {
      module: plan.module,
      created: false,
      dryRun: true,
      assignmentId: null,
      sessionId: session?.id ?? null,
      sessionLinked: Boolean(session),
      deadline: deadline.toISOString(),
      questionCount: plan.questions.length,
      skippedReason: session
        ? undefined
        : "Dry run would assign the quiz with a due date. No session on that date was found.",
    };
  }
  const questionIds = await insertQuestions(plan);
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({ ...assignmentValues, courseId })
    .returning({ id: assignmentsTable.id });
  if (!assignment) return skipped(plan, false, "The quiz could not be created.");
  await replaceLinks(assignment.id, questionIds);
  return {
    module: plan.module,
    created: true,
    dryRun: false,
    assignmentId: assignment.id,
    sessionId: session?.id ?? null,
    sessionLinked: Boolean(session),
    deadline: deadline.toISOString(),
    questionCount: questionIds.length,
    ...(session
      ? {}
      : {
          skippedReason:
            "No session on that date was found, so the quiz is assigned with a due date instead.",
        }),
  };
}

export async function ensureMichelleT6MathModules(
  options: T6MathSeedOptions = {},
): Promise<T6MathSeedResult> {
  const dryRun = options.dryRun === true;
  const michelleEmail = normalizeT6Email(options.identities?.michelleEmail ?? MICHELLE_T6_EMAIL);
  const michelleClerkUserId =
    options.identities?.michelleClerkUserId?.trim() || MICHELLE_T6_CLERK_USER_ID;

  const finish = (modules: T6MathModuleResult[]): T6MathSeedResult => {
    const result = { dryRun, modules };
    logger.info(
      {
        dryRun,
        modules: modules.map((item) => ({
          module: item.module,
          created: item.created,
          assignmentId: item.assignmentId,
          sessionLinked: item.sessionLinked,
          questionCount: item.questionCount,
          skippedReason: item.skippedReason ?? null,
        })),
      },
      "Michelle T6 math modules",
    );
    return result;
  };

  if (isT6ForbiddenClient(michelleEmail)) {
    return finish(
      T6_MATH_MODULE_PLANS.map((plan) =>
        skipped(plan, dryRun, "Refusing to assign the T6 math quizzes to a different client."),
      ),
    );
  }

  const michelle = await findMichelle(michelleEmail, michelleClerkUserId);
  if (!michelle || isT6ForbiddenClient(michelle.email)) {
    return finish(
      T6_MATH_MODULE_PLANS.map((plan) =>
        skipped(plan, dryRun, "Michelle was not found, so no quiz was assigned."),
      ),
    );
  }
  if (normalizeT6Email(michelle.email) !== michelleEmail && michelle.clerkUserId !== michelleClerkUserId) {
    return finish(
      T6_MATH_MODULE_PLANS.map((plan) =>
        skipped(plan, dryRun, "Resolved client did not match Michelle."),
      ),
    );
  }

  const modules: T6MathModuleResult[] = [];
  for (const plan of T6_MATH_MODULE_PLANS) {
    modules.push(await ensureModule(plan, michelle, dryRun));
  }
  return finish(modules);
}
