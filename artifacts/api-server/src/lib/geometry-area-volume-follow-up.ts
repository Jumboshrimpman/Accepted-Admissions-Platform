import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
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

async function insertAssignment(input: {
  session: SessionRow;
  questionIds: string[];
}): Promise<string | null> {
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: input.session.courseId,
      sessionId: input.session.id,
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

async function assignToClient(input: {
  user: UserRow;
  xavierIds: string[];
  now: Date;
  questionIds: string[];
  drafts: readonly GeometryAreaVolumeDraft[];
  sessionMode: "completed" | "preview";
  label: string;
}): Promise<{ result: GeometryAreaVolumeAssigneeResult; questionIds: string[] }> {
  const already = await existingFollowUp(input.user.id);
  if (already) {
    if (already.session.clientUserId !== input.user.id || isForbiddenClient(input.user.email)) {
      return {
        result: emptyAssignee(`Refusing to attach Geometry Area and Volume for ${input.label}.`),
        questionIds: input.questionIds,
      };
    }
    const linked = await questionIdsForAssignment(already.assignment.id);
    return {
      result: {
        created: false,
        assignmentId: already.assignment.id,
        sessionId: already.session.id,
        questionCount: linked.length,
        skippedReason: "Geometry Area and Volume is already assigned.",
      },
      questionIds: input.questionIds.length > 0 ? input.questionIds : linked,
    };
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
  const assignmentId = await insertAssignment({ session, questionIds });
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
      sessionId: session.id,
      questionCount: questionIds.length,
    },
    questionIds,
  };
}

/**
 * New post-session quiz drawn from official SAT extracts already in the repo.
 * Session-local copies are not bank-linked, so this does not rematerialize
 * College Board rows or rewrite a quiz someone has already opened.
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
  const michelle = michelleIdentity.user
    ? await assignToClient({
        user: michelleIdentity.user,
        xavierIds,
        now,
        questionIds,
        drafts,
        sessionMode: "completed",
        label: "Michelle Makarem",
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
