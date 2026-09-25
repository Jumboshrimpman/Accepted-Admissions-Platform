import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
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
  XAVIER_CANONICAL_CLERK_USER_ID,
  XAVIER_DUPLICATE_CLERK_USER_ID,
  XAVIER_TUTOR_EMAIL,
} from "./xavier-sat-capability-session.ts";
import {
  isCompletedXavierSession,
  pickMostRecentCompletedSession,
} from "./michelle-geometry-follow-up-select.ts";
import {
  GEOMETRY_SAT_FOLLOW_UP_INSTRUCTIONS,
  GEOMETRY_SAT_FOLLOW_UP_TAG,
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  GEOMETRY_SAT_QUESTIONS,
} from "./michelle-geometry-sat-questions.ts";

export { isCompletedXavierSession, pickMostRecentCompletedSession };

export const MICHELLE_GEOMETRY_CLIENT_EMAIL = "makaremmichelle7@gmail.com";
export const MICHELLE_GEOMETRY_CLERK_USER_ID =
  "user_3JCRGfBj8dgWSjO1r2zeKovFVE7";

const FORBIDDEN_CLIENT_EMAILS = new Set(
  [
    TAITO_STUDENT_EMAIL,
    RYO_PARENT_EMAIL,
    EUNICE_TUTOR_EMAIL,
    NIKA_TUTOR_EMAIL,
  ].map((email) => email.toLowerCase()),
);

export type MichelleGeometryFollowUpIdentities = {
  michelleEmail?: string;
  michelleClerkUserId?: string;
  xavierEmail?: string;
  xavierClerkUserId?: string;
  xavierDuplicateClerkUserId?: string;
};

export type MichelleGeometryFollowUpOptions = {
  now?: Date;
  identities?: MichelleGeometryFollowUpIdentities;
};

export type MichelleGeometryFollowUpResult = {
  created: boolean;
  assignmentId: string | null;
  sessionId: string | null;
  sessionDateTime: string | null;
  sessionTitle: string | null;
  questionCount: number;
  skippedReason?: string;
};

type SessionRow = typeof sessionsTable.$inferSelect;

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function isForbiddenClient(email: string | null | undefined): boolean {
  return FORBIDDEN_CLIENT_EMAILS.has(normalizeEmail(email));
}

async function findUsersByIdentity(input: {
  email: string;
  clerkUserIds: string[];
}): Promise<Array<typeof usersTable.$inferSelect>> {
  const clerkIds = input.clerkUserIds.map((id) => id.trim()).filter(Boolean);
  const filters = [sql`lower(${usersTable.email}) = ${input.email}`];
  if (clerkIds.length > 0) filters.push(inArray(usersTable.clerkUserId, clerkIds));
  return db
    .select()
    .from(usersTable)
    .where(or(...filters));
}

export async function ensureMichelleGeometryFollowUp(
  options: MichelleGeometryFollowUpOptions = {},
): Promise<MichelleGeometryFollowUpResult> {
  const now = options.now ?? new Date();
  const michelleEmail = normalizeEmail(
    options.identities?.michelleEmail ?? MICHELLE_GEOMETRY_CLIENT_EMAIL,
  );
  const michelleClerkUserId =
    options.identities?.michelleClerkUserId?.trim() ||
    MICHELLE_GEOMETRY_CLERK_USER_ID;
  const xavierEmail = normalizeEmail(
    options.identities?.xavierEmail ?? XAVIER_TUTOR_EMAIL,
  );
  const empty: MichelleGeometryFollowUpResult = {
    created: false,
    assignmentId: null,
    sessionId: null,
    sessionDateTime: null,
    sessionTitle: null,
    questionCount: 0,
  };

  if (isForbiddenClient(michelleEmail)) {
    const skipped = {
      ...empty,
      skippedReason: "Refusing to assign Geometry SAT Questions to a non-Michelle client.",
    };
    logger.info(skipped, "Michelle geometry follow-up skipped");
    return skipped;
  }

  const michelleRows = await findUsersByIdentity({
    email: michelleEmail,
    clerkUserIds: [michelleClerkUserId],
  });
  const michelle =
    michelleRows.find((user) => user.clerkUserId === michelleClerkUserId) ??
    michelleRows.find((user) => normalizeEmail(user.email) === michelleEmail) ??
    null;
  if (!michelle || isForbiddenClient(michelle.email)) {
    const skipped = {
      ...empty,
      skippedReason: "Michelle Makarem was not found, so no quiz was assigned.",
    };
    logger.info(skipped, "Michelle geometry follow-up skipped");
    return skipped;
  }
  if (
    normalizeEmail(michelle.email) !== michelleEmail &&
    michelle.clerkUserId !== michelleClerkUserId
  ) {
    const skipped = {
      ...empty,
      skippedReason: "Resolved client did not match Michelle's email or Clerk user.",
    };
    logger.info(skipped, "Michelle geometry follow-up skipped");
    return skipped;
  }

  const xavierClerkIds = [
    options.identities?.xavierClerkUserId ?? XAVIER_CANONICAL_CLERK_USER_ID,
    options.identities?.xavierDuplicateClerkUserId ?? XAVIER_DUPLICATE_CLERK_USER_ID,
  ];
  const xavierRows = (
    await findUsersByIdentity({ email: xavierEmail, clerkUserIds: xavierClerkIds })
  ).filter((user) => !isForbiddenClient(user.email));
  const xavierIds = [...new Set(xavierRows.map((user) => user.id))];
  if (xavierIds.length === 0) {
    const skipped = {
      ...empty,
      skippedReason: "Xavier Morales was not found, so no quiz was assigned.",
    };
    logger.info(skipped, "Michelle geometry follow-up skipped");
    return skipped;
  }

  const existingForMichelle = await db
    .select({
      assignment: assignmentsTable,
      session: sessionsTable,
    })
    .from(assignmentsTable)
    .innerJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(
      and(
        eq(sessionsTable.clientUserId, michelle.id),
        eq(assignmentsTable.title, GEOMETRY_SAT_FOLLOW_UP_TITLE),
        ne(assignmentsTable.status, "archived"),
      ),
    )
    .limit(1);
  const already = existingForMichelle[0];
  if (already) {
    const [counted] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, already.assignment.id));
    const ready = {
      created: false,
      assignmentId: already.assignment.id,
      sessionId: already.session.id,
      sessionDateTime: already.session.dateTime.toISOString(),
      sessionTitle: already.session.title,
      questionCount: Number(counted?.count ?? 0),
      skippedReason: "Geometry SAT Questions is already assigned to Michelle.",
    };
    logger.info(ready, "Michelle geometry follow-up already assigned");
    return ready;
  }

  const candidateSessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, michelle.id),
        inArray(sessionsTable.tutorUserId, xavierIds),
        isNull(sessionsTable.cancelledAt),
        ne(sessionsTable.status, "archived"),
        lte(sessionsTable.dateTime, now),
      ),
    )
    .orderBy(desc(sessionsTable.dateTime));
  const session = pickMostRecentCompletedSession(candidateSessions, now);
  if (!session || session.clientUserId !== michelle.id) {
    const skipped = {
      ...empty,
      skippedReason: "No completed Michelle session with Xavier was found.",
    };
    logger.info(skipped, "Michelle geometry follow-up skipped");
    return skipped;
  }

  const created = await insertFollowUpAssignment(session);
  logger.info(created, "Michelle geometry follow-up assigned");
  return created;
}

async function insertFollowUpAssignment(
  session: SessionRow,
): Promise<MichelleGeometryFollowUpResult> {
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: session.courseId,
      sessionId: session.id,
      deliveryPhase: "before_session",
      title: GEOMETRY_SAT_FOLLOW_UP_TITLE,
      subject: "SAT Math",
      instructions: GEOMETRY_SAT_FOLLOW_UP_INSTRUCTIONS,
      status: "published",
      deadline: null,
      timeLimitMinutes: 30,
      maxAttempts: 1,
    })
    .returning();
  if (!assignment) {
    return {
      created: false,
      assignmentId: null,
      sessionId: session.id,
      sessionDateTime: session.dateTime.toISOString(),
      sessionTitle: session.title,
      questionCount: 0,
      skippedReason: "The follow-up assignment could not be created.",
    };
  }

  for (const [index, draft] of GEOMETRY_SAT_QUESTIONS.entries()) {
    const [question] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Math",
        domain: "Geometry",
        skill: draft.skill,
        questionType: "multiple_choice",
        difficulty: "hard",
        stimulus: null,
        prompt: draft.prompt,
        choices: draft.choices,
        correctAnswer: draft.correctAnswer,
        explanation: "",
        sourceType: "original",
        reviewStatus: "approved",
        tags: [GEOMETRY_SAT_FOLLOW_UP_TAG, draft.key, "session-copy"],
        generationMethod: SESSION_QUESTION_COPY_METHOD,
      })
      .returning();
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: assignment.id,
      questionId: question!.id,
      position: index,
      predictionFirst: false,
    });
  }

  return {
    created: true,
    assignmentId: assignment.id,
    sessionId: session.id,
    sessionDateTime: session.dateTime.toISOString(),
    sessionTitle: session.title,
    questionCount: GEOMETRY_SAT_QUESTIONS.length,
  };
}
