import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  db,
  questionsTable,
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
import { GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE } from "./post-session-follow-up.ts";
import {
  GEOMETRY_AREA_VOLUME_FOLLOW_UP_TAG,
  GEOMETRY_AREA_VOLUME_INSTRUCTIONS,
  loadHardGeometryAreaVolumeQuestions,
  type GeometryAreaVolumeDraft,
} from "./geometry-area-volume-bank.ts";

export type GeometryAreaVolumeFollowUpIdentities = {
  michelleEmail?: string;
  michelleClerkUserId?: string;
  samaEmail?: string;
  samaClerkUserId?: string;
  xavierEmail?: string;
  xavierClerkUserId?: string;
  xavierDuplicateClerkUserId?: string;
};

export type GeometryAreaVolumeFollowUpOptions = {
  now?: Date;
  identities?: GeometryAreaVolumeFollowUpIdentities;
  questions?: readonly GeometryAreaVolumeDraft[];
};

export type GeometryAreaVolumeAssigneeResult = {
  created: boolean;
  assignmentId: string | null;
  sessionId: string | null;
  questionCount: number;
  skippedReason?: string;
};

export type GeometryAreaVolumeFollowUpResult = {
  questionCount: number;
  sourceKeys: string[];
  michelle: GeometryAreaVolumeAssigneeResult;
  sama: GeometryAreaVolumeAssigneeResult;
};

type UserRow = typeof usersTable.$inferSelect;
type SessionRow = typeof sessionsTable.$inferSelect;

const FORBIDDEN_CLIENT_EMAILS = new Set(
  [TAITO_STUDENT_EMAIL, RYO_PARENT_EMAIL, EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL].map(
    (email) => email.toLowerCase(),
  ),
);

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function isForbiddenClient(email: string | null | undefined): boolean {
  return FORBIDDEN_CLIENT_EMAILS.has(normalizeEmail(email));
}

function emptyAssignee(skippedReason?: string): GeometryAreaVolumeAssigneeResult {
  return {
    created: false,
    assignmentId: null,
    sessionId: null,
    questionCount: 0,
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
  return db
    .select()
    .from(usersTable)
    .where(or(...filters));
}

async function resolveStudent(input: {
  email: string;
  clerkUserId: string;
  label: string;
}): Promise<{ user: UserRow | null; skippedReason?: string }> {
  if (isForbiddenClient(input.email)) {
    return {
      user: null,
      skippedReason: `Refusing to assign Geometry Area and Volume to ${input.label}.`,
    };
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
    return {
      user: null,
      skippedReason: `${input.label} was not found, so no geometry quiz was assigned.`,
    };
  }
  if (normalizeEmail(user.email) !== input.email && user.clerkUserId !== input.clerkUserId) {
    return {
      user: null,
      skippedReason: `Resolved client did not match ${input.label}.`,
    };
  }
  return { user };
}

async function xavierUserIds(identities: GeometryAreaVolumeFollowUpIdentities): Promise<string[]> {
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

async function existingFollowUp(clientUserId: string) {
  const [standalone] = await db
    .select({ assignment: assignmentsTable })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.assignedStudentUserId, clientUserId),
        eq(assignmentsTable.title, GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE),
        ne(assignmentsTable.status, "archived"),
      ),
    )
    .limit(1);
  if (standalone) return { assignment: standalone.assignment, session: null as SessionRow | null };

  const rows = await db
    .select({
      assignment: assignmentsTable,
      session: sessionsTable,
    })
    .from(assignmentsTable)
    .innerJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(
      and(
        eq(sessionsTable.clientUserId, clientUserId),
        eq(assignmentsTable.title, GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE),
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

async function assignmentHasAttempt(assignmentId: string): Promise<boolean> {
  const [attempt] = await db
    .select({ id: attemptsTable.id })
    .from(attemptsTable)
    .where(eq(attemptsTable.assignmentId, assignmentId))
    .limit(1);
  return Boolean(attempt);
}

async function sourceKeysForQuestionIds(questionIds: readonly string[]): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const rows = await db
    .select({ id: questionsTable.id, tags: questionsTable.tags })
    .from(questionsTable)
    .where(inArray(questionsTable.id, [...questionIds]));
  const byId = new Map(rows.map((row) => [row.id, row.tags ?? []]));
  return questionIds.map(
    (id) => (byId.get(id) ?? []).find((tag) => tag.startsWith("sat-pt")) ?? "",
  );
}

async function replaceAssignmentQuestions(
  assignmentId: string,
  questionIds: readonly string[],
): Promise<void> {
  await db
    .delete(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  for (const [index, questionId] of questionIds.entries()) {
    await db.insert(assignmentQuestionsTable).values({
      assignmentId,
      questionId,
      position: index,
      predictionFirst: false,
    });
  }
}

async function insertQuestions(
  drafts: readonly GeometryAreaVolumeDraft[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const draft of drafts) {
    const [question] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Math",
        domain: "Geometry and Trigonometry",
        skill: "Area and volume",
        questionType: "multiple_choice",
        difficulty: "hard",
        stimulus: draft.stimulus,
        prompt: draft.prompt,
        choices: draft.choices.map((choice) => ({ ...choice })),
        correctAnswer: draft.correctAnswer,
        explanation: "",
        sourceType: "college_board",
        reviewStatus: "approved",
        tags: [
          GEOMETRY_AREA_VOLUME_FOLLOW_UP_TAG,
          draft.sourceKey,
          "session-copy",
          "college-board",
          "math",
        ],
        generationMethod: SESSION_QUESTION_COPY_METHOD,
      })
      .returning({ id: questionsTable.id });
    ids.push(question!.id);
  }
  return ids;
}

async function markStandaloneTodo(input: {
  assignmentId: string;
  studentUserId: string;
  tutorUserId: string;
}): Promise<void> {
  await db
    .update(assignmentsTable)
    .set({
      sessionId: null,
      assignedStudentUserId: input.studentUserId,
      assignedTutorUserId: input.tutorUserId,
      instructions: GEOMETRY_AREA_VOLUME_INSTRUCTIONS,
    })
    .where(eq(assignmentsTable.id, input.assignmentId));
}

async function insertAssignment(input: {
  courseId: string;
  studentUserId: string;
  tutorUserId: string;
  questionIds: string[];
}): Promise<string | null> {
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: input.courseId,
      sessionId: null,
      assignedStudentUserId: input.studentUserId,
      assignedTutorUserId: input.tutorUserId,
      deliveryPhase: "before_session",
      title: GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
      subject: "SAT Math",
      instructions: GEOMETRY_AREA_VOLUME_INSTRUCTIONS,
      status: "published",
      deadline: null,
      timeLimitMinutes: 30,
      maxAttempts: 1,
    })
    .returning({ id: assignmentsTable.id });
  if (!assignment) return null;
  for (const [index, questionId] of input.questionIds.entries()) {
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: assignment.id,
      questionId,
      position: index,
      predictionFirst: false,
    });
  }
  return assignment.id;
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

function idsInDraftOrder(
  linkedIds: readonly string[],
  linkedKeys: readonly string[],
  drafts: readonly GeometryAreaVolumeDraft[],
): string[] | null {
  if (linkedIds.length !== drafts.length || linkedKeys.length !== linkedIds.length) return null;
  const byKey = new Map<string, string>();
  linkedIds.forEach((id, index) => {
    const key = linkedKeys[index];
    if (key) byKey.set(key, id);
  });
  if (byKey.size !== drafts.length) return null;
  if (!drafts.every((draft) => byKey.has(draft.sourceKey))) return null;
  return drafts.map((draft) => byKey.get(draft.sourceKey)!);
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

async function assignToClient(input: {
  user: UserRow;
  xavierIds: string[];
  now: Date;
  questionIds: string[];
  drafts: readonly GeometryAreaVolumeDraft[];
  sessionMode: "completed" | "preview";
  label: string;
  preserveAttemptedQuestions: boolean;
}): Promise<{ result: GeometryAreaVolumeAssigneeResult; questionIds: string[] }> {
  const already = await existingFollowUp(input.user.id);
  if (already) {
    if (
      (already.session && already.session.clientUserId !== input.user.id) ||
      (already.assignment.assignedStudentUserId &&
        already.assignment.assignedStudentUserId !== input.user.id) ||
      isForbiddenClient(input.user.email)
    ) {
      return {
        result: emptyAssignee(`Refusing to attach Geometry Area and Volume for ${input.label}.`),
        questionIds: input.questionIds,
      };
    }
    const tutorUserId = tutorIdForTodo({
      xavierIds: input.xavierIds,
      assignedTutorUserId: already.assignment.assignedTutorUserId,
      sessionTutorUserId: already.session?.tutorUserId,
    });
    if (!tutorUserId) {
      return {
        result: emptyAssignee(`Xavier Morales was not found for ${input.label}.`),
        questionIds: input.questionIds,
      };
    }
    const linked = await questionIdsForAssignment(already.assignment.id);
    const attempted = await assignmentHasAttempt(already.assignment.id);
    const draftKeys = input.drafts.map((item) => item.sourceKey);
    const linkedKeys = await sourceKeysForQuestionIds(linked);
    const sameQuiz =
      input.questionIds.length > 0
        ? linked.length === input.questionIds.length &&
          linked.every((id, index) => id === input.questionIds[index])
        : linkedKeys.length === draftKeys.length &&
          linkedKeys.every((key, index) => key === draftKeys[index]);
    const finish = async (questionIds: string[], skippedReason: string) => {
      await markStandaloneTodo({
        assignmentId: already.assignment.id,
        studentUserId: input.user.id,
        tutorUserId,
      });
      return {
        result: {
          created: false,
          assignmentId: already.assignment.id,
          sessionId: null,
          questionCount: questionIds.length,
          skippedReason,
        },
        questionIds,
      };
    };
    if (attempted) {
      return finish(
        input.questionIds.length > 0 ? input.questionIds : linked,
        "Geometry Area and Volume already has an attempt, so its questions were left unchanged.",
      );
    }
    if (input.preserveAttemptedQuestions && input.questionIds.length > 0 && !sameQuiz) {
      await replaceAssignmentQuestions(already.assignment.id, input.questionIds);
      return finish(
        input.questionIds,
        "Geometry Area and Volume now matches the quiz that already has an attempt.",
      );
    }
    if (input.preserveAttemptedQuestions || sameQuiz) {
      return finish(
        input.questionIds.length > 0 ? input.questionIds : linked,
        "Geometry Area and Volume is already assigned.",
      );
    }
    let questionIds = input.questionIds;
    if (questionIds.length === 0) {
      questionIds = idsInDraftOrder(linked, linkedKeys, input.drafts) ?? [];
    }
    if (questionIds.length === 0) {
      questionIds = await insertQuestions(input.drafts);
    }
    await replaceAssignmentQuestions(already.assignment.id, questionIds);
    return finish(questionIds, "Geometry Area and Volume was expanded before anyone started it.");
  }

  const candidateSessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, input.user.id),
        inArray(sessionsTable.tutorUserId, input.xavierIds),
        isNull(sessionsTable.cancelledAt),
        ne(sessionsTable.status, "archived"),
      ),
    )
    .orderBy(desc(sessionsTable.dateTime));
  const session =
    input.sessionMode === "completed"
      ? pickMostRecentCompletedSession(candidateSessions, input.now)
      : pickSamaPreviewSession(candidateSessions);
  if (!session || session.clientUserId !== input.user.id) {
    return {
      result: emptyAssignee(`No Xavier session was found for ${input.label}.`),
      questionIds: input.questionIds,
    };
  }

  let questionIds = input.questionIds;
  if (questionIds.length === 0) {
    if (input.drafts.length === 0) {
      return {
        result: emptyAssignee("No official SAT area and volume items were available."),
        questionIds,
      };
    }
    questionIds = await insertQuestions(input.drafts);
  }
  const tutorUserId = tutorIdForTodo({
    xavierIds: input.xavierIds,
    sessionTutorUserId: session.tutorUserId,
  });
  if (!tutorUserId) {
    return {
      result: emptyAssignee(`Xavier Morales was not found for ${input.label}.`),
      questionIds,
    };
  }
  const assignmentId = await insertAssignment({
    courseId: session.courseId,
    studentUserId: input.user.id,
    tutorUserId,
    questionIds,
  });
  if (!assignmentId) {
    return {
      result: emptyAssignee("The geometry follow-up assignment could not be created."),
      questionIds,
    };
  }
  return {
    result: {
      created: true,
      assignmentId,
      sessionId: null,
      questionCount: questionIds.length,
    },
    questionIds,
  };
}

/**
 * Official SAT area and volume quiz, assigned as a standalone student to-do.
 * Session-local copies are not bank-linked, so this does not rematerialize
 * College Board rows or rewrite a quiz someone has already opened.
 * Geometry SAT Questions is a different assignment and is never updated here.
 */
export async function ensureGeometryAreaVolumeFollowUp(
  options: GeometryAreaVolumeFollowUpOptions = {},
): Promise<GeometryAreaVolumeFollowUpResult> {
  const now = options.now ?? new Date();
  const identities = options.identities ?? {};
  const drafts = options.questions ?? (await loadHardGeometryAreaVolumeQuestions());
  const xavierIds = await xavierUserIds(identities);
  const emptyBoth = (reason: string): GeometryAreaVolumeFollowUpResult => ({
    questionCount: drafts.length,
    sourceKeys: drafts.map((item) => item.sourceKey),
    michelle: emptyAssignee(reason),
    sama: emptyAssignee(reason),
  });
  if (xavierIds.length === 0) {
    const skipped = emptyBoth("Xavier Morales was not found, so no geometry quiz was assigned.");
    logger.info(skipped, "Geometry area and volume follow-up skipped");
    return skipped;
  }
  if (drafts.length === 0) {
    const skipped = emptyBoth("No official SAT area and volume items passed the content filter.");
    logger.info(skipped, "Geometry area and volume follow-up skipped");
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

  let questionIds: string[] = [];
  let preserveAttemptedQuestions = false;
  for (const user of [michelleIdentity.user, samaIdentity.user]) {
    if (!user) continue;
    const existing = await existingFollowUp(user.id);
    if (!existing) continue;
    if (!(await assignmentHasAttempt(existing.assignment.id))) continue;
    questionIds = await questionIdsForAssignment(existing.assignment.id);
    preserveAttemptedQuestions = true;
    break;
  }
  const michelle = michelleIdentity.user
    ? await assignToClient({
        user: michelleIdentity.user,
        xavierIds,
        now,
        questionIds,
        drafts,
        sessionMode: "completed",
        label: "Michelle Makarem",
        preserveAttemptedQuestions,
      })
    : {
        result: emptyAssignee(michelleIdentity.skippedReason),
        questionIds,
      };
  questionIds = michelle.questionIds;

  const sama = samaIdentity.user
    ? await assignToClient({
        user: samaIdentity.user,
        xavierIds,
        now,
        questionIds,
        drafts,
        sessionMode: "preview",
        label: "Sama's test student",
        preserveAttemptedQuestions,
      })
    : {
        result: emptyAssignee(samaIdentity.skippedReason),
        questionIds,
      };

  const result: GeometryAreaVolumeFollowUpResult = {
    questionCount: drafts.length,
    sourceKeys: drafts.map((item) => item.sourceKey),
    michelle: michelle.result,
    sama: sama.result,
  };
  logger.info(result, "Geometry area and volume follow-up ready");
  return result;
}
