import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  courseMembershipsTable,
  coursesTable,
  curriculumBlocksTable,
  curriculumLibraryAssetsTable,
  db,
  questionsTable,
  responsesTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger.ts";
import {
  EUNICE_TUTOR_EMAIL,
  NIKA_TUTOR_EMAIL,
  TAITO_STUDENT_EMAIL,
} from "./session-schedule.ts";
import { RYO_PARENT_EMAIL } from "./parent-mirror.ts";
import { SESSION_QUESTION_COPY_METHOD } from "./session-question-copy.ts";
import {
  SAMA_TEST_CLIENT_CLERK_USER_ID,
  SAMA_TEST_CLIENT_EMAIL,
  FALL_SAT_COURSE_TITLE,
  XAVIER_CANONICAL_CLERK_USER_ID,
  XAVIER_DUPLICATE_CLERK_USER_ID,
  XAVIER_SAT_CAPABILITY_SESSION_TITLE,
  XAVIER_TUTOR_EMAIL,
} from "./xavier-sat-capability-session.ts";
import { pickMostRecentCompletedSession } from "./michelle-geometry-follow-up-select.ts";
import {
  MICHELLE_GEOMETRY_CLERK_USER_ID,
  MICHELLE_GEOMETRY_CLIENT_EMAIL,
} from "./michelle-geometry-follow-up.ts";
import { libraryAssetBlockKind, libraryAssetToBlockConfig } from "./curriculum-library.ts";
import { reopenBrokenEmptyAttemptsForAssignment } from "./heal-empty-attempt.ts";
import {
  attemptHasRecordedWork,
  countRecordedAnswers,
} from "./student-attempt-guards.ts";
import {
  FACTORING_NOTES_DESCRIPTION,
  FACTORING_NOTES_PUBLIC_PATH,
  FACTORING_NOTES_SEED_KEY,
  FACTORING_NOTES_TITLE,
  FACTORING_QUIZ_FOLLOW_UP_TAG,
  FACTORING_QUIZ_INSTRUCTIONS,
  FACTORING_QUIZ_QUESTIONS,
  FACTORING_QUIZ_TIME_LIMIT_MINUTES,
  SAT_MATH_FOLLOW_UP_INSTRUCTIONS,
  SAT_MATH_FOLLOW_UP_QUESTIONS,
  SAT_MATH_FOLLOW_UP_TAG,
  SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES,
  XAVIER_AUTHORED_FOLLOW_UP_TAG,
  assertFollowUpSelection,
  followUpSourceKey,
  type FollowUpQuestionDraft,
} from "./xavier-follow-up-content.ts";
import {
  FACTORING_QUIZ_FOLLOW_UP_TITLE,
  SAT_MATH_FOLLOW_UP_TITLE,
} from "./post-session-follow-up.ts";

export type XavierSessionFollowUpIdentities = {
  michelleEmail?: string;
  michelleClerkUserId?: string;
  samaEmail?: string;
  samaClerkUserId?: string;
  xavierEmail?: string;
  xavierClerkUserId?: string;
  xavierDuplicateClerkUserId?: string;
};

export type XavierSessionFollowUpOptions = {
  now?: Date;
  identities?: XavierSessionFollowUpIdentities;
};

export type XavierFollowUpAssigneeResult = {
  created: boolean;
  assignmentId: string | null;
  sessionId: string | null;
  questionCount: number;
  timeLimitMinutes: number;
  skippedReason?: string;
};

export type XavierNotesResult = {
  attached: boolean;
  sessionId: string | null;
  blockId: string | null;
  resourcePath: string;
  skippedReason?: string;
};

export type XavierSessionFollowUpResult = {
  satMath: { michelle: XavierFollowUpAssigneeResult; sama: XavierFollowUpAssigneeResult };
  factoring: { michelle: XavierFollowUpAssigneeResult; sama: XavierFollowUpAssigneeResult };
  notes: { michelle: XavierNotesResult; sama: XavierNotesResult };
};

type UserRow = typeof usersTable.$inferSelect;
type SessionRow = typeof sessionsTable.$inferSelect;

const FORBIDDEN_CLIENT_EMAILS = new Set(
  [TAITO_STUDENT_EMAIL, RYO_PARENT_EMAIL, EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL].map((email) =>
    email.toLowerCase(),
  ),
);

type QuizSpec = {
  title: string;
  tag: string;
  instructions: string;
  timeLimitMinutes: number;
  drafts: readonly FollowUpQuestionDraft[];
};

const SAT_MATH_SPEC: QuizSpec = {
  title: SAT_MATH_FOLLOW_UP_TITLE,
  tag: SAT_MATH_FOLLOW_UP_TAG,
  instructions: SAT_MATH_FOLLOW_UP_INSTRUCTIONS,
  timeLimitMinutes: SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES,
  drafts: SAT_MATH_FOLLOW_UP_QUESTIONS,
};

const FACTORING_SPEC: QuizSpec = {
  title: FACTORING_QUIZ_FOLLOW_UP_TITLE,
  tag: FACTORING_QUIZ_FOLLOW_UP_TAG,
  instructions: FACTORING_QUIZ_INSTRUCTIONS,
  timeLimitMinutes: FACTORING_QUIZ_TIME_LIMIT_MINUTES,
  drafts: FACTORING_QUIZ_QUESTIONS,
};

/** Notes are a session block. Without an open session of her own, samapostgrad does not borrow Michelle's. */
export const SAMA_PREVIEW_NOTES_SKIP_REASON =
  "Factoring Notes stay on Michelle's Xavier session. samapostgrad has no open Xavier session for a separate copy.";

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function isForbiddenClient(email: string | null | undefined): boolean {
  return FORBIDDEN_CLIENT_EMAILS.has(normalizeEmail(email));
}

function emptyAssignee(timeLimitMinutes: number, skippedReason?: string): XavierFollowUpAssigneeResult {
  return {
    created: false,
    assignmentId: null,
    sessionId: null,
    questionCount: 0,
    timeLimitMinutes,
    skippedReason,
  };
}

function emptyNotes(skippedReason?: string): XavierNotesResult {
  return {
    attached: false,
    sessionId: null,
    blockId: null,
    resourcePath: FACTORING_NOTES_PUBLIC_PATH,
    skippedReason,
  };
}

async function findUsersByIdentity(input: {
  email: string;
  clerkUserIds: string[];
}): Promise<UserRow[]> {
  const clerkIds = input.clerkUserIds.map((id) => id.trim()).filter(Boolean);
  const filters = [sql`lower(${usersTable.email}) = ${input.email}`];
  if (clerkIds.length > 0) filters.push(inArray(usersTable.clerkUserId, clerkIds));
  return db.select().from(usersTable).where(or(...filters));
}

async function resolveStudent(input: {
  email: string;
  clerkUserId: string;
  label: string;
}): Promise<{ user: UserRow | null; skippedReason?: string }> {
  if (isForbiddenClient(input.email)) {
    return { user: null, skippedReason: `Refusing to assign Xavier follow-ups to ${input.label}.` };
  }
  const rows = await findUsersByIdentity({
    email: input.email,
    clerkUserIds: [input.clerkUserId],
  });
  const user =
    rows.find((row) => row.clerkUserId === input.clerkUserId) ??
    rows.find((row) => normalizeEmail(row.email) === input.email) ??
    null;
  if (!user || isForbiddenClient(user.email)) {
    return { user: null, skippedReason: `${input.label} was not found, so no follow-up was assigned.` };
  }
  if (normalizeEmail(user.email) !== input.email && user.clerkUserId !== input.clerkUserId) {
    return { user: null, skippedReason: `Resolved client did not match ${input.label}.` };
  }
  return { user };
}

async function xavierUserIds(identities: XavierSessionFollowUpIdentities): Promise<string[]> {
  const email = normalizeEmail(identities.xavierEmail ?? XAVIER_TUTOR_EMAIL);
  const rows = (
    await findUsersByIdentity({
      email,
      clerkUserIds: [
        identities.xavierClerkUserId ?? XAVIER_CANONICAL_CLERK_USER_ID,
        identities.xavierDuplicateClerkUserId ?? XAVIER_DUPLICATE_CLERK_USER_ID,
      ],
    })
  ).filter((user) => !isForbiddenClient(user.email));
  return [...new Set(rows.map((user) => user.id))];
}

async function existingFollowUp(clientUserId: string, title: string) {
  const [standalone] = await db
    .select({ assignment: assignmentsTable })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.assignedStudentUserId, clientUserId),
        eq(assignmentsTable.title, title),
        ne(assignmentsTable.status, "archived"),
      ),
    )
    .limit(1);
  if (standalone) return { assignment: standalone.assignment, session: null as SessionRow | null };

  const rows = await db
    .select({ assignment: assignmentsTable, session: sessionsTable })
    .from(assignmentsTable)
    .innerJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(
      and(
        eq(sessionsTable.clientUserId, clientUserId),
        eq(assignmentsTable.title, title),
        ne(assignmentsTable.status, "archived"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function questionIdsForAssignment(assignmentId: string): Promise<string[]> {
  const links = await db
    .select({
      questionId: assignmentQuestionsTable.questionId,
      position: assignmentQuestionsTable.position,
    })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentQuestionsTable.position));
  return links.map((link) => link.questionId);
}

async function assignmentHasRecordedWork(assignmentId: string): Promise<boolean> {
  const attempts = await db
    .select({
      id: attemptsTable.id,
      result: attemptsTable.result,
      score: attemptsTable.score,
    })
    .from(attemptsTable)
    .where(eq(attemptsTable.assignmentId, assignmentId));
  for (const attempt of attempts) {
    const responses = await db
      .select({ finalAnswer: responsesTable.finalAnswer })
      .from(responsesTable)
      .where(eq(responsesTable.attemptId, attempt.id));
    if (
      attemptHasRecordedWork({
        hasResult: attempt.result != null,
        score: attempt.score,
        answeredCount: countRecordedAnswers(responses),
      })
    ) {
      return true;
    }
  }
  return false;
}

async function sourceKeysForQuestionIds(questionIds: readonly string[]): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const rows = await db
    .select({ id: questionsTable.id, tags: questionsTable.tags })
    .from(questionsTable)
    .where(inArray(questionsTable.id, [...questionIds]));
  const byId = new Map(rows.map((row) => [row.id, row.tags ?? []]));
  return questionIds.map((id) => followUpSourceKey(byId.get(id)));
}

async function refreshQuestionRows(
  questionIds: readonly string[],
  drafts: readonly FollowUpQuestionDraft[],
): Promise<void> {
  for (const [index, questionId] of questionIds.entries()) {
    const draft = drafts[index];
    if (!draft) continue;
    await db
      .update(questionsTable)
      .set({
        prompt: draft.prompt,
        choices: draft.choices.map((item) => ({ ...item })),
        correctAnswer: draft.correctAnswer,
        skill: draft.skill,
        difficulty: draft.difficulty,
        questionType: draft.questionType,
      })
      .where(
        and(
          eq(questionsTable.id, questionId),
          sql`${questionsTable.tags} @> ${JSON.stringify([XAVIER_AUTHORED_FOLLOW_UP_TAG])}::jsonb`,
        ),
      );
  }
}

async function replaceAssignmentQuestions(
  assignmentId: string,
  questionIds: readonly string[],
): Promise<void> {
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

async function insertQuestions(spec: QuizSpec): Promise<string[]> {
  const ids: string[] = [];
  for (const draft of spec.drafts) {
    const [question] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Math",
        domain: spec.title,
        skill: draft.skill,
        questionType: draft.questionType,
        difficulty: draft.difficulty,
        stimulus: null,
        prompt: draft.prompt,
        choices: draft.choices.map((item) => ({ ...item })),
        correctAnswer: draft.correctAnswer,
        explanation: "",
        sourceType: "original",
        reviewStatus: "approved",
        tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG, spec.tag, draft.sourceKey, "session-copy"],
        generationMethod: SESSION_QUESTION_COPY_METHOD,
      })
      .returning({ id: questionsTable.id });
    ids.push(question!.id);
  }
  return ids;
}

async function ensureTimeLimit(assignmentId: string, minutes: number): Promise<void> {
  const [row] = await db
    .select({ timeLimitMinutes: assignmentsTable.timeLimitMinutes })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);
  if (!row || row.timeLimitMinutes === minutes) return;
  await db
    .update(assignmentsTable)
    .set({ timeLimitMinutes: minutes })
    .where(eq(assignmentsTable.id, assignmentId));
}

function tutorIdForTodo(input: {
  xavierIds: readonly string[];
  assignedTutorUserId?: string | null;
  sessionTutorUserId?: string | null;
}): string | null {
  if (input.assignedTutorUserId && input.xavierIds.includes(input.assignedTutorUserId)) {
    return input.assignedTutorUserId;
  }
  if (input.sessionTutorUserId && input.xavierIds.includes(input.sessionTutorUserId)) {
    return input.sessionTutorUserId;
  }
  return input.xavierIds[0] ?? null;
}

/**
 * Course for a standalone to-do when samapostgrad has no open Xavier session.
 * Prefer a quiz already assigned to her, then any of her Xavier sessions
 * (including a cancelled capability test), then the shared Fall course.
 * Never scans other students' courses.
 */
async function courseIdForPreviewTodo(
  studentUserId: string,
  xavierIds: readonly string[],
): Promise<string | null> {
  const [owned] = await db
    .select({ courseId: assignmentsTable.courseId })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.assignedStudentUserId, studentUserId),
        ne(assignmentsTable.status, "archived"),
      ),
    )
    .limit(1);
  if (owned?.courseId) return owned.courseId;

  if (xavierIds.length > 0) {
    const [session] = await db
      .select({ courseId: sessionsTable.courseId })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.clientUserId, studentUserId),
          inArray(sessionsTable.tutorUserId, [...xavierIds]),
        ),
      )
      .limit(1);
    if (session?.courseId) return session.courseId;
  }

  const [fall] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE))
    .limit(1);
  return fall?.id ?? null;
}

/** DB grant only. Does not invite, email, or change Railway allowlists. */
async function ensureStudentCourseMembership(
  courseId: string,
  studentUserId: string,
): Promise<void> {
  await db
    .insert(courseMembershipsTable)
    .values({
      courseId,
      userId: studentUserId,
      membershipRole: "student",
      subject: "all",
    })
    .onConflictDoUpdate({
      target: [courseMembershipsTable.courseId, courseMembershipsTable.userId],
      set: { membershipRole: "student", subject: "all" },
    });
}

async function michelleSessions(clientUserId: string, xavierIds: string[]): Promise<SessionRow[]> {
  return db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, clientUserId),
        inArray(sessionsTable.tutorUserId, xavierIds),
        isNull(sessionsTable.cancelledAt),
        ne(sessionsTable.status, "archived"),
      ),
    )
    .orderBy(desc(sessionsTable.dateTime));
}

function pickSamaPreviewSession(sessions: readonly SessionRow[]): SessionRow | null {
  const open = sessions.filter((session) => {
    if (session.cancelledAt) return false;
    const booking = session.bookingStatus?.trim().toLowerCase() ?? "";
    if (booking === "cancelled" || booking === "canceled") return false;
    if ((session.status ?? "").trim().toLowerCase() === "archived") return false;
    return true;
  });
  const capability = open.find((session) =>
    session.title.trim().startsWith(XAVIER_SAT_CAPABILITY_SESSION_TITLE),
  );
  if (capability) return capability;
  return [...open].sort((left, right) => right.dateTime.getTime() - left.dateTime.getTime())[0] ?? null;
}

async function insertAssignment(input: {
  spec: QuizSpec;
  courseId: string;
  studentUserId: string;
  tutorUserId: string;
  sessionId: string | null;
  questionIds: string[];
}): Promise<string | null> {
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: input.courseId,
      sessionId: input.sessionId,
      assignedStudentUserId: input.studentUserId,
      assignedTutorUserId: input.tutorUserId,
      deliveryPhase: "before_session",
      title: input.spec.title,
      subject: "SAT Math",
      instructions: input.spec.instructions,
      status: "published",
      deadline: null,
      timeLimitMinutes: input.spec.timeLimitMinutes,
      maxAttempts: 1,
    })
    .returning({ id: assignmentsTable.id });
  if (!assignment) return null;
  await replaceAssignmentQuestions(assignment.id, input.questionIds);
  return assignment.id;
}

async function assignQuiz(input: {
  spec: QuizSpec;
  user: UserRow;
  xavierIds: string[];
  now: Date;
  questionIds: string[];
  sessionMode: "completed" | "preview";
  label: string;
  preserveAttemptedQuestions: boolean;
}): Promise<{ result: XavierFollowUpAssigneeResult; questionIds: string[] }> {
  const minutes = input.spec.timeLimitMinutes;
  const already = await existingFollowUp(input.user.id, input.spec.title);
  const candidateSessions = await michelleSessions(input.user.id, input.xavierIds);
  const targetSession =
    input.sessionMode === "completed"
      ? pickMostRecentCompletedSession(candidateSessions, input.now)
      : pickSamaPreviewSession(candidateSessions);

  if (already) {
    if (
      (already.session && already.session.clientUserId !== input.user.id) ||
      (already.assignment.assignedStudentUserId &&
        already.assignment.assignedStudentUserId !== input.user.id) ||
      isForbiddenClient(input.user.email)
    ) {
      return {
        result: emptyAssignee(minutes, `Refusing to attach ${input.spec.title} for ${input.label}.`),
        questionIds: input.questionIds,
      };
    }
    if (input.sessionMode === "preview") {
      await ensureStudentCourseMembership(already.assignment.courseId, input.user.id);
    }
    await ensureTimeLimit(already.assignment.id, minutes);
    await reopenBrokenEmptyAttemptsForAssignment(already.assignment.id);
    const tutorUserId = tutorIdForTodo({
      xavierIds: input.xavierIds,
      assignedTutorUserId: already.assignment.assignedTutorUserId,
      sessionTutorUserId: already.session?.tutorUserId ?? targetSession?.tutorUserId,
    });
    if (!tutorUserId) {
      return {
        result: emptyAssignee(minutes, `Xavier Morales was not found for ${input.label}.`),
        questionIds: input.questionIds,
      };
    }
    const linked = await questionIdsForAssignment(already.assignment.id);
    const attempted = await assignmentHasRecordedWork(already.assignment.id);
    const draftKeys = input.spec.drafts.map((item) => item.sourceKey);
    const linkedKeys = await sourceKeysForQuestionIds(linked);
    const sameQuiz =
      linkedKeys.length === draftKeys.length && linkedKeys.every((key, index) => key === draftKeys[index]);
    const sessionId =
      input.sessionMode === "preview"
        ? null
        : attempted
          ? (already.assignment.sessionId ?? already.session?.id ?? targetSession?.id ?? null)
          : (targetSession?.id ?? already.assignment.sessionId ?? null);
    if (input.sessionMode === "completed" && !sessionId) {
      return {
        result: emptyAssignee(minutes, `No completed Xavier session was found for ${input.label}.`),
        questionIds: input.questionIds,
      };
    }
    await db
      .update(assignmentsTable)
      .set({
        sessionId,
        assignedStudentUserId: input.user.id,
        assignedTutorUserId: tutorUserId,
        instructions: input.spec.instructions,
        timeLimitMinutes: minutes,
        status: "published",
      })
      .where(eq(assignmentsTable.id, already.assignment.id));

    const finish = (questionIds: string[], skippedReason: string) => ({
      result: {
        created: false,
        assignmentId: already.assignment.id,
        sessionId,
        questionCount: questionIds.length,
        timeLimitMinutes: minutes,
        skippedReason,
      },
      questionIds,
    });
    if (attempted) {
      return finish(
        linked,
        `${input.spec.title} already has an attempt, so its questions were left unchanged.`,
      );
    }
    if (input.preserveAttemptedQuestions && input.questionIds.length > 0) {
      if (!sameQuiz) await replaceAssignmentQuestions(already.assignment.id, input.questionIds);
      return finish(
        input.questionIds,
        `${input.spec.title} now matches the quiz that already has an attempt.`,
      );
    }
    if (sameQuiz) {
      await refreshQuestionRows(linked, input.spec.drafts);
      return finish(linked, `${input.spec.title} is already assigned.`);
    }
    let questionIds = input.questionIds;
    if (questionIds.length === 0) questionIds = await insertQuestions(input.spec);
    await replaceAssignmentQuestions(already.assignment.id, questionIds);
    return finish(questionIds, `${input.spec.title} was refreshed before anyone started it.`);
  }

  if (input.sessionMode === "completed" && !targetSession) {
    return {
      result: emptyAssignee(minutes, `No completed Xavier session was found for ${input.label}.`),
      questionIds: input.questionIds,
    };
  }
  const tutorUserId = tutorIdForTodo({
    xavierIds: input.xavierIds,
    sessionTutorUserId: targetSession?.tutorUserId,
  });
  if (!tutorUserId) {
    return {
      result: emptyAssignee(minutes, `Xavier Morales was not found for ${input.label}.`),
      questionIds: input.questionIds,
    };
  }
  let courseId = targetSession?.courseId ?? null;
  if (!courseId && input.sessionMode === "preview") {
    courseId = await courseIdForPreviewTodo(input.user.id, input.xavierIds);
  }
  if (!courseId) {
    return {
      result: emptyAssignee(minutes, `No Xavier session was found for ${input.label}.`),
      questionIds: input.questionIds,
    };
  }
  if (input.sessionMode === "preview") {
    await ensureStudentCourseMembership(courseId, input.user.id);
  }
  let questionIds = input.questionIds;
  if (questionIds.length === 0) questionIds = await insertQuestions(input.spec);
  const sessionId = input.sessionMode === "preview" || !targetSession ? null : targetSession.id;
  const assignmentId = await insertAssignment({
    spec: input.spec,
    courseId,
    studentUserId: input.user.id,
    tutorUserId,
    sessionId,
    questionIds,
  });
  if (!assignmentId) {
    return {
      result: emptyAssignee(minutes, `${input.spec.title} could not be created.`),
      questionIds,
    };
  }
  return {
    result: {
      created: true,
      assignmentId,
      sessionId,
      questionCount: questionIds.length,
      timeLimitMinutes: minutes,
    },
    questionIds,
  };
}

async function notesConfig(asset: {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  resourceUrl: string | null;
  body: string | null;
}) {
  return {
    ...libraryAssetToBlockConfig(asset),
    seedKey: FACTORING_NOTES_SEED_KEY,
    text: FACTORING_NOTES_DESCRIPTION,
  };
}

async function ensureNotesAsset(createdByUserId: string) {
  const [existing] = await db
    .select()
    .from(curriculumLibraryAssetsTable)
    .where(eq(curriculumLibraryAssetsTable.title, FACTORING_NOTES_TITLE))
    .limit(1);
  if (existing) {
    if (
      existing.resourceUrl !== FACTORING_NOTES_PUBLIC_PATH ||
      existing.kind !== "resource" ||
      existing.description !== FACTORING_NOTES_DESCRIPTION
    ) {
      const [updated] = await db
        .update(curriculumLibraryAssetsTable)
        .set({
          kind: "resource",
          description: FACTORING_NOTES_DESCRIPTION,
          resourceUrl: FACTORING_NOTES_PUBLIC_PATH,
          updatedAt: new Date(),
        })
        .where(eq(curriculumLibraryAssetsTable.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }
  const [created] = await db
    .insert(curriculumLibraryAssetsTable)
    .values({
      title: FACTORING_NOTES_TITLE,
      kind: "resource",
      description: FACTORING_NOTES_DESCRIPTION,
      resourceUrl: FACTORING_NOTES_PUBLIC_PATH,
      body: null,
      createdByUserId,
    })
    .returning();
  return created!;
}

async function ensureNotesOnSession(input: {
  sessionId: string;
  createdByUserId: string;
}): Promise<XavierNotesResult> {
  const asset = await ensureNotesAsset(input.createdByUserId);
  const config = await notesConfig(asset);
  const blocks = await db
    .select()
    .from(curriculumBlocksTable)
    .where(eq(curriculumBlocksTable.sessionId, input.sessionId));
  const existing = blocks.find(
    (block) =>
      block.libraryAssetId === asset.id ||
      (block.config as { seedKey?: string } | null)?.seedKey === FACTORING_NOTES_SEED_KEY,
  );
  if (existing) {
    await db
      .update(curriculumBlocksTable)
      .set({
        libraryAssetId: asset.id,
        kind: libraryAssetBlockKind(asset),
        visibility: "both",
        status: "published",
        config,
        updatedAt: new Date(),
      })
      .where(eq(curriculumBlocksTable.id, existing.id));
    return {
      attached: true,
      sessionId: input.sessionId,
      blockId: existing.id,
      resourcePath: FACTORING_NOTES_PUBLIC_PATH,
    };
  }
  const position =
    blocks.reduce((max, block) => Math.max(max, block.position), -1) + 1;
  const [created] = await db
    .insert(curriculumBlocksTable)
    .values({
      sessionId: input.sessionId,
      libraryAssetId: asset.id,
      kind: libraryAssetBlockKind(asset),
      position,
      visibility: "both",
      status: "published",
      config,
    })
    .returning({ id: curriculumBlocksTable.id });
  return {
    attached: true,
    sessionId: input.sessionId,
    blockId: created?.id ?? null,
    resourcePath: FACTORING_NOTES_PUBLIC_PATH,
  };
}

async function clearNotesFromOtherSessions(input: {
  keepSessionId: string;
  clientUserId: string;
  xavierIds: string[];
}): Promise<void> {
  const sessions = await michelleSessions(input.clientUserId, input.xavierIds);
  const otherIds = sessions.map((session) => session.id).filter((id) => id !== input.keepSessionId);
  if (otherIds.length === 0) return;
  await db.delete(curriculumBlocksTable).where(
    and(
      inArray(curriculumBlocksTable.sessionId, otherIds),
      sql`${curriculumBlocksTable.config}->>'seedKey' = ${FACTORING_NOTES_SEED_KEY}`,
    ),
  );
}

async function ensureQuizPair(input: {
  spec: QuizSpec;
  michelle: UserRow | null;
  sama: UserRow | null;
  michelleSkip?: string;
  samaSkip?: string;
  xavierIds: string[];
  now: Date;
}): Promise<{ michelle: XavierFollowUpAssigneeResult; sama: XavierFollowUpAssigneeResult }> {
  let questionIds: string[] = [];
  let preserveAttemptedQuestions = false;
  for (const user of [input.michelle, input.sama]) {
    if (!user) continue;
    const existing = await existingFollowUp(user.id, input.spec.title);
    if (!existing) continue;
    await ensureTimeLimit(existing.assignment.id, input.spec.timeLimitMinutes);
    await reopenBrokenEmptyAttemptsForAssignment(existing.assignment.id);
    if (!(await assignmentHasRecordedWork(existing.assignment.id))) continue;
    // Only Michelle's recorded quiz is the source of truth. Sama's attempt
    // freezes her own copy inside assignQuiz and must not rewrite Michelle.
    if (user !== input.michelle) continue;
    questionIds = await questionIdsForAssignment(existing.assignment.id);
    preserveAttemptedQuestions = true;
    break;
  }
  const michelle = input.michelle
    ? await assignQuiz({
        spec: input.spec,
        user: input.michelle,
        xavierIds: input.xavierIds,
        now: input.now,
        questionIds,
        sessionMode: "completed",
        label: "Michelle Makarem",
        preserveAttemptedQuestions,
      })
    : {
        result: emptyAssignee(input.spec.timeLimitMinutes, input.michelleSkip),
        questionIds,
      };
  questionIds = michelle.questionIds;
  const sama = input.sama
    ? await assignQuiz({
        spec: input.spec,
        user: input.sama,
        xavierIds: input.xavierIds,
        now: input.now,
        questionIds,
        sessionMode: "preview",
        label: "Sama's test student",
        preserveAttemptedQuestions,
      })
    : {
        result: emptyAssignee(input.spec.timeLimitMinutes, input.samaSkip),
        questionIds,
      };
  return { michelle: michelle.result, sama: sama.result };
}

/**
 * SAT Math Problems and Factoring Quiz on Michelle's latest completed
 * session with Xavier, plus the same quizzes as standalone to-dos for
 * samapostgrad. Her copy does not require an open Xavier session: a quiz
 * she already has, any of her Xavier sessions, or the Fall course supplies
 * the course id, and a student membership makes the to-do listable.
 * Factoring Notes are a session block on Michelle's session and, when
 * samapostgrad has an open Xavier session, on that session too. Geometry
 * follow-ups are left unchanged. A recorded attempt on either copy freezes
 * that copy; Sama's attempt never rewrites Michelle's questions.
 */
export async function ensureMichelleXavierSessionFollowUps(
  options: XavierSessionFollowUpOptions = {},
): Promise<XavierSessionFollowUpResult> {
  assertFollowUpSelection();
  const now = options.now ?? new Date();
  const identities = options.identities ?? {};
  const xavierIds = await xavierUserIds(identities);
  const skippedQuiz = (reason: string) => ({
    satMath: {
      michelle: emptyAssignee(SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES, reason),
      sama: emptyAssignee(SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES, reason),
    },
    factoring: {
      michelle: emptyAssignee(FACTORING_QUIZ_TIME_LIMIT_MINUTES, reason),
      sama: emptyAssignee(FACTORING_QUIZ_TIME_LIMIT_MINUTES, reason),
    },
    notes: { michelle: emptyNotes(reason), sama: emptyNotes(reason) },
  });
  if (xavierIds.length === 0) {
    const skipped = skippedQuiz("Xavier Morales was not found, so no follow-up was assigned.");
    logger.info(skipped, "Michelle Xavier session follow-up skipped");
    return skipped;
  }

  const michelleIdentity = await resolveStudent({
    email: normalizeEmail(identities.michelleEmail ?? MICHELLE_GEOMETRY_CLIENT_EMAIL),
    clerkUserId: identities.michelleClerkUserId?.trim() || MICHELLE_GEOMETRY_CLERK_USER_ID,
    label: "Michelle Makarem",
  });
  const samaIdentity = await resolveStudent({
    email: normalizeEmail(identities.samaEmail ?? SAMA_TEST_CLIENT_EMAIL),
    clerkUserId: identities.samaClerkUserId?.trim() || SAMA_TEST_CLIENT_CLERK_USER_ID,
    label: "Sama's test student",
  });

  const satMath = await ensureQuizPair({
    spec: SAT_MATH_SPEC,
    michelle: michelleIdentity.user,
    sama: samaIdentity.user,
    michelleSkip: michelleIdentity.skippedReason,
    samaSkip: samaIdentity.skippedReason,
    xavierIds,
    now,
  });
  const factoring = await ensureQuizPair({
    spec: FACTORING_SPEC,
    michelle: michelleIdentity.user,
    sama: samaIdentity.user,
    michelleSkip: michelleIdentity.skippedReason,
    samaSkip: samaIdentity.skippedReason,
    xavierIds,
    now,
  });

  const tutorUserId = xavierIds[0]!;
  let michelleNotes = emptyNotes(michelleIdentity.skippedReason ?? "No session for Factoring Notes.");
  if (michelleIdentity.user) {
    const notesSession = pickMostRecentCompletedSession(
      await michelleSessions(michelleIdentity.user.id, xavierIds),
      now,
    );
    if (notesSession) {
      michelleNotes = await ensureNotesOnSession({
        sessionId: notesSession.id,
        createdByUserId: tutorUserId,
      });
      await clearNotesFromOtherSessions({
        keepSessionId: notesSession.id,
        clientUserId: michelleIdentity.user.id,
        xavierIds,
      });
    }
  }
  let samaNotes = emptyNotes(samaIdentity.skippedReason ?? SAMA_PREVIEW_NOTES_SKIP_REASON);
  if (samaIdentity.user) {
    const preview = pickSamaPreviewSession(
      await michelleSessions(samaIdentity.user.id, xavierIds),
    );
    if (preview) {
      samaNotes = await ensureNotesOnSession({
        sessionId: preview.id,
        createdByUserId: tutorUserId,
      });
    }
  }

  const result: XavierSessionFollowUpResult = {
    satMath,
    factoring,
    notes: { michelle: michelleNotes, sama: samaNotes },
  };
  logger.info(result, "Michelle Xavier session follow-up ready");
  return result;
}
