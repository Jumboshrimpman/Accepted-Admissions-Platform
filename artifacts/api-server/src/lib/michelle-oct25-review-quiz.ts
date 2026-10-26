import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
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
import { isCompletedXavierSession } from "./michelle-geometry-follow-up-select.ts";
import { OCT25_SESSION_REVIEW_TITLE } from "./post-session-follow-up.ts";
import { CANONICAL_APP_ORIGIN } from "./public-origin.ts";
import { enrichStimulusWithFigures } from "./sat-bank-figures.ts";
import {
  EUNICE_TUTOR_EMAIL,
  NIKA_TUTOR_EMAIL,
  sessionLocalDateKey,
  TAITO_STUDENT_EMAIL,
} from "./session-schedule.ts";
import { RYO_PARENT_EMAIL } from "./parent-mirror.ts";
import { SESSION_QUESTION_COPY_METHOD } from "./session-question-copy.ts";
import { shouldRepublishSeededHomework } from "./session-homework.ts";
import {
  XAVIER_CANONICAL_CLERK_USER_ID,
  XAVIER_DUPLICATE_CLERK_USER_ID,
  XAVIER_TUTOR_EMAIL,
} from "./xavier-sat-capability-session.ts";
import { XAVIER_AUTHORED_FOLLOW_UP_TAG } from "./xavier-follow-up-content.ts";

export { OCT25_SESSION_REVIEW_TITLE };

/**
 * Startup seed for Michelle's Oct 25 session review. Assigns one published
 * quiz to her Oct 25 session with Xavier and leaves every other assignment
 * alone. Dry-run reads the same plan and writes nothing. No Clerk calls,
 * no email, and no attempt is started.
 */

export const MICHELLE_OCT25_CLIENT_EMAIL = "makaremmichelle7@gmail.com";
export const MICHELLE_OCT25_CLERK_USER_ID = "user_3JCRGfBj8dgWSjO1r2zeKovFVE7";
export const OCT25_REVIEW_DATE_KEY = "2026-10-25";
export const OCT25_REVIEW_TAG = "michelle-oct25-review";
export const OCT25_REVIEW_TIME_LIMIT_MINUTES = 30;
export const OCT25_REVIEW_MAX_ATTEMPTS = 1;
export const OCT25_FIGURE_DIR = "/media/geometry/michelle-oct25";
export const OCT25_FIGURE_NOTE = "Note: Figure not drawn to scale.";
export const OCT25_SOFT_TIMER_NOTE =
  "Try your best to finish within 30 minutes. If you go over, you can keep working.";
export const OCT25_REVIEW_INSTRUCTIONS = `${OCT25_SOFT_TIMER_NOTE} For a free-response question, type a number.`;

const FORBIDDEN_CLIENT_EMAILS = new Set(
  [TAITO_STUDENT_EMAIL, RYO_PARENT_EMAIL, EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL].map((email) =>
    email.toLowerCase(),
  ),
);

export type Oct25Choice = { id: string; label: string; text: string };

export type Oct25ReviewQuestion = {
  key: string;
  skill: string;
  questionType: "multiple_choice" | "spr";
  stimulus: string | null;
  prompt: string;
  choices: Oct25Choice[];
  correctAnswer: string;
  explanation: string;
};

const choice = (id: string, text: string): Oct25Choice => ({
  id,
  label: id.toUpperCase(),
  text,
});

function bar(name: string): string {
  return `overline(${name})`;
}

function figureStimulus(file: string, alt: string, note: boolean): string {
  const image = enrichStimulusWithFigures(null, [
    { url: `${CANONICAL_APP_ORIGIN}${OCT25_FIGURE_DIR}/${file}`, alt },
  ]);
  if (!image) {
    throw new Error(`Oct 25 figure ${file} did not produce stimulus markdown.`);
  }
  return note ? `${image}\n\n${OCT25_FIGURE_NOTE}` : image;
}

function mc(
  key: string,
  skill: string,
  prompt: string,
  choices: readonly [string, string, string, string],
  correctAnswer: "a" | "b" | "c" | "d",
  explanation: string,
  stimulus: string | null = null,
): Oct25ReviewQuestion {
  return {
    key,
    skill,
    questionType: "multiple_choice",
    stimulus,
    prompt,
    choices: choices.map((text, index) => choice("abcd"[index]!, text)),
    correctAnswer,
    explanation,
  };
}

function spr(
  key: string,
  skill: string,
  prompt: string,
  correctAnswer: string,
  explanation: string,
  stimulus: string | null,
): Oct25ReviewQuestion {
  return {
    key,
    skill,
    questionType: "spr",
    stimulus,
    prompt,
    choices: [],
    correctAnswer,
    explanation,
  };
}

const Q3_FIGURE = figureStimulus(
  "q03-quarter-circle-question-block.svg",
  "Square with vertex O at the bottom left and a quarter circle centered at O",
  false,
);
const Q4_FIGURE = figureStimulus(
  "q04-arc-jkl-question-block.svg",
  "Circle with center O, radii to J and L, and point K on minor arc JKL",
  true,
);
const Q5_FIGURE = figureStimulus(
  "q05-arc-abd-question-block.svg",
  "Circle with center O, radii to A and D, and point B on arc ABD",
  true,
);
const Q6_FIGURE = figureStimulus(
  "q06-similar-triangles-question-block.svg",
  "Right triangle HFJ with GI parallel to FJ, HI labeled 10 and GI labeled 6",
  true,
);
const Q7_FIGURE = figureStimulus(
  "q07-similar-triangles-question-block.svg",
  "Right triangle HFJ with GI parallel to FJ, HI labeled 17 and GI labeled 8",
  true,
);

export const OCT25_REVIEW_QUESTIONS: readonly Oct25ReviewQuestion[] = [
  mc(
    "oct25-q01",
    "Inscribed circle",
    "A square has an area of 36 square units. What is the area, in square units, of the largest circle that can be inscribed in the square?",
    ["3π", "6π", "9π", "36π"],
    "c",
    "The side is 6, so the circle's diameter is 6 and its radius is 3. Area = π·3^2 = 9π.",
  ),
  mc(
    "oct25-q02",
    "Circumscribed square",
    "A circle with an area of 16π square units is inscribed in a square. What is the area, in square units, of the square?",
    ["8", "16", "32", "64"],
    "d",
    "πr^2 = 16π, so r = 4. The diameter, 8, equals the side of the square, so the area is 8^2 = 64.",
  ),
  mc(
    "oct25-q03",
    "Circle area",
    "In the figure, a quarter of a circle is drawn inside a square. The center of the circle is vertex O of the square, and the radius of the circle is equal to the side length of the square. If the square has an area of 16 square units, what is the area, in square units, of the full circle?",
    ["4π", "8π", "16π", "64π"],
    "c",
    "The side is 4, so the radius is 4 and the circle's area is π·4^2 = 16π. Choice A, 4π, is only the quarter circle.",
    Q3_FIGURE,
  ),
  mc(
    "oct25-q04",
    "Arc length",
    "The figure shows a circle with center O. The central angle described by arc JKL measures π/3 radians. If the circle has a radius of 6, what is the length of arc JKL?",
    ["2π", "3π", "6π", "12π"],
    "a",
    "s = rθ = 6·π/3 = 2π.",
    Q4_FIGURE,
  ),
  mc(
    "oct25-q05",
    "Arc length",
    "The figure shows a circle with center O. The central angle described by arc ABD measures 150°. If the circle has a radius of 12, what is the length of arc ABD?",
    ["5π", "10π", "20π", "1,800"],
    "b",
    "Change to radians first: 150·π/180 = 5π/6. Then s = 12·5π/6 = 10π. Choice D is the trap for skipping the conversion.",
    Q5_FIGURE,
  ),
  spr(
    "oct25-q06",
    "Similar triangles",
    `In the figure, ${bar("GI")} is parallel to ${bar("FJ")} and IJ = 15. What is the length of ${bar("FH")}?`,
    "20",
    `${bar("HG")} = 8 (6-8-10 triangle). ${bar("HJ")} = 10 + 15 = 25, so the scale factor is 25/10 = 2.5 and ${bar("FH")} = 8·2.5 = 20.`,
    Q6_FIGURE,
  ),
  spr(
    "oct25-q07",
    "Similar triangles",
    `In the figure, ${bar("GI")} is parallel to ${bar("FJ")} and IJ = 34. What is the length of ${bar("GF")}?`,
    "30",
    `${bar("HG")} = 15 (8-15-17 triangle). ${bar("HJ")} = 17 + 34 = 51, so the scale factor is 51/17 = 3, ${bar("FH")} = 45, and ${bar("GF")} = 45 − 15 = 30.`,
    Q7_FIGURE,
  ),
  mc(
    "oct25-q08",
    "Unit conversion",
    "A distance of 1,320 yards is equivalent to how many chains? (1 chain = 22 yards)",
    ["60", "440", "1,298", "29,040"],
    "a",
    "1,320 ÷ 22 = 60.",
  ),
  mc(
    "oct25-q09",
    "Unit conversion",
    "A volume of 15 gallons is equivalent to how many cups? (1 gallon = 4 quarts and 1 quart = 4 cups)",
    ["23", "60", "240", "960"],
    "c",
    "15 × 4 × 4 = 240.",
  ),
  spr(
    "oct25-q10",
    "Unit conversion",
    "A car is traveling at a constant speed of 66 feet per second. What is the car's speed, in miles per hour? (1 mile = 8 furlongs, 1 furlong = 220 yards, and 1 yard = 3 feet)",
    "45",
    "1 mile = 8 × 220 × 3 = 5,280 feet. In one hour the car travels 66 × 3,600 = 237,600 feet, and 237,600 ÷ 5,280 = 45.",
    null,
  ),
];

export type MichelleOct25Identities = {
  michelleEmail?: string;
  michelleClerkUserId?: string;
  xavierEmail?: string;
  xavierClerkUserId?: string;
  xavierDuplicateClerkUserId?: string;
};

export type MichelleOct25Options = {
  now?: Date;
  dryRun?: boolean;
  identities?: MichelleOct25Identities;
};

export type MichelleOct25Result = {
  created: boolean;
  dryRun: boolean;
  assignmentId: string | null;
  questionCount: number;
  timeLimitMinutes: number;
  softTimeLimit: boolean;
  skippedReason?: string;
};

export function matchesOct25SessionDate(session: {
  dateTime: Date;
  timezone?: string | null;
}): boolean {
  const zone = session.timezone?.trim();
  if (zone) return sessionLocalDateKey(session.dateTime, zone) === OCT25_REVIEW_DATE_KEY;
  return (
    sessionLocalDateKey(session.dateTime, "America/New_York") === OCT25_REVIEW_DATE_KEY ||
    session.dateTime.toISOString().slice(0, 10) === OCT25_REVIEW_DATE_KEY
  );
}

export function pickOct25ReviewSession<T extends { dateTime: Date; timezone?: string | null }>(
  sessions: readonly T[],
  now: Date,
): { session: T | null; skippedReason?: string } {
  const matches = sessions.filter(
    (session) =>
      matchesOct25SessionDate(session) &&
      isCompletedXavierSession(session, now),
  );
  if (matches.length > 1) {
    return { session: null, skippedReason: "More than one Oct 25 session was found and left unchanged." };
  }
  if (matches.length === 0) {
    return { session: null, skippedReason: "No Oct 25 session with Xavier was found." };
  }
  return { session: matches[0]! };
}

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function isForbiddenClient(email: string | null | undefined): boolean {
  return FORBIDDEN_CLIENT_EMAILS.has(normalizeEmail(email));
}

function empty(skippedReason?: string, dryRun = false): MichelleOct25Result {
  return {
    created: false,
    dryRun,
    assignmentId: null,
    questionCount: 0,
    timeLimitMinutes: OCT25_REVIEW_TIME_LIMIT_MINUTES,
    softTimeLimit: true,
    ...(skippedReason ? { skippedReason } : {}),
  };
}

function safeLog(result: MichelleOct25Result) {
  return {
    created: result.created,
    dryRun: result.dryRun,
    assignmentId: result.assignmentId,
    questionCount: result.questionCount,
    timeLimitMinutes: result.timeLimitMinutes,
    softTimeLimit: result.softTimeLimit,
    skippedReason: result.skippedReason ?? null,
  };
}

function sourceKey(tags: readonly string[] | null | undefined): string {
  return (tags ?? []).find((tag) => tag.startsWith("oct25-q")) ?? "";
}

async function findUsers(input: { email: string; clerkUserIds: string[] }) {
  const clerkIds = input.clerkUserIds.map((id) => id.trim()).filter(Boolean);
  const filters = [sql`lower(${usersTable.email}) = ${input.email}`];
  if (clerkIds.length > 0) filters.push(inArray(usersTable.clerkUserId, clerkIds));
  return db.select().from(usersTable).where(or(...filters));
}

async function insertQuestions(): Promise<string[]> {
  const ids: string[] = [];
  for (const draft of OCT25_REVIEW_QUESTIONS) {
    const [question] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Math",
        domain: "SAT Math",
        skill: draft.skill,
        questionType: draft.questionType,
        difficulty: "medium",
        stimulus: draft.stimulus,
        prompt: draft.prompt,
        choices: draft.choices.map((item) => ({ ...item })),
        correctAnswer: draft.correctAnswer,
        explanation: draft.explanation,
        sourceType: "original",
        reviewStatus: "approved",
        tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG, OCT25_REVIEW_TAG, draft.key, "session-copy"],
        generationMethod: SESSION_QUESTION_COPY_METHOD,
      })
      .returning({ id: questionsTable.id });
    ids.push(question!.id);
  }
  return ids;
}

async function replaceLinks(assignmentId: string, questionIds: readonly string[]): Promise<void> {
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

function questionMatchesDraft(
  row: {
    prompt: string;
    stimulus: string | null;
    choices: unknown;
    correctAnswer: string;
    explanation: string;
    skill: string;
    questionType: string;
  },
  draft: Oct25ReviewQuestion,
): boolean {
  return (
    row.prompt === draft.prompt &&
    (row.stimulus ?? null) === draft.stimulus &&
    row.correctAnswer === draft.correctAnswer &&
    row.explanation === draft.explanation &&
    row.skill === draft.skill &&
    row.questionType === draft.questionType &&
    JSON.stringify(row.choices ?? []) === JSON.stringify(draft.choices)
  );
}

async function refreshUntouchedQuestions(assignmentId: string): Promise<void> {
  const links = await db
    .select({
      id: questionsTable.id,
      tags: questionsTable.tags,
      prompt: questionsTable.prompt,
      stimulus: questionsTable.stimulus,
      choices: questionsTable.choices,
      correctAnswer: questionsTable.correctAnswer,
      explanation: questionsTable.explanation,
      skill: questionsTable.skill,
      questionType: questionsTable.questionType,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentQuestionsTable.position));
  const sameShape =
    links.length === OCT25_REVIEW_QUESTIONS.length &&
    links.every(
      (link, index) =>
        (link.tags ?? []).includes(OCT25_REVIEW_TAG) &&
        sourceKey(link.tags) === OCT25_REVIEW_QUESTIONS[index]?.key,
    );
  if (!sameShape) {
    const ownedIds = links
      .filter((link) => (link.tags ?? []).includes(OCT25_REVIEW_TAG))
      .map((link) => link.id);
    await replaceLinks(assignmentId, await insertQuestions());
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
            sql`${questionsTable.tags} @> ${JSON.stringify([OCT25_REVIEW_TAG])}::jsonb`,
          ),
        );
      }
    }
    return;
  }
  for (const [index, link] of links.entries()) {
    const draft = OCT25_REVIEW_QUESTIONS[index]!;
    if (questionMatchesDraft(link, draft)) continue;
    await db
      .update(questionsTable)
      .set({
        prompt: draft.prompt,
        stimulus: draft.stimulus,
        choices: draft.choices.map((item) => ({ ...item })),
        correctAnswer: draft.correctAnswer,
        explanation: draft.explanation,
        skill: draft.skill,
        questionType: draft.questionType,
      })
      .where(
        and(
          eq(questionsTable.id, link.id),
          sql`${questionsTable.tags} @> ${JSON.stringify([OCT25_REVIEW_TAG])}::jsonb`,
        ),
      );
  }
}

export async function ensureMichelleOct25ReviewQuiz(
  options: MichelleOct25Options = {},
): Promise<MichelleOct25Result> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;
  const michelleEmail = normalizeEmail(
    options.identities?.michelleEmail ?? MICHELLE_OCT25_CLIENT_EMAIL,
  );
  const michelleClerkUserId =
    options.identities?.michelleClerkUserId?.trim() || MICHELLE_OCT25_CLERK_USER_ID;
  const xavierEmail = normalizeEmail(options.identities?.xavierEmail ?? XAVIER_TUTOR_EMAIL);

  const finish = (result: MichelleOct25Result): MichelleOct25Result => {
    logger.info(safeLog(result), "Michelle Oct 25 review quiz");
    return result;
  };

  if (isForbiddenClient(michelleEmail)) {
    return finish(empty("Refusing to assign the Oct 25 review quiz to a different client.", dryRun));
  }

  const michelleRows = await findUsers({
    email: michelleEmail,
    clerkUserIds: [michelleClerkUserId],
  });
  const michelle =
    michelleRows.find((user) => user.clerkUserId === michelleClerkUserId) ??
    michelleRows.find((user) => normalizeEmail(user.email) === michelleEmail) ??
    null;
  if (!michelle || isForbiddenClient(michelle.email)) {
    return finish(empty("The Oct 25 review student was not found, so no quiz was assigned.", dryRun));
  }
  if (
    normalizeEmail(michelle.email) !== michelleEmail &&
    michelle.clerkUserId !== michelleClerkUserId
  ) {
    return finish(empty("Resolved client did not match the Oct 25 review student.", dryRun));
  }

  const xavierClerkIds = [
    options.identities?.xavierClerkUserId ?? XAVIER_CANONICAL_CLERK_USER_ID,
    options.identities?.xavierDuplicateClerkUserId ?? XAVIER_DUPLICATE_CLERK_USER_ID,
  ];
  const xavierRows = (await findUsers({ email: xavierEmail, clerkUserIds: xavierClerkIds })).filter(
    (user) => !isForbiddenClient(user.email),
  );
  const xavierIds = [...new Set(xavierRows.map((user) => user.id))];

  const existing = await db
    .select({
      assignment: assignmentsTable,
      sessionClientUserId: sessionsTable.clientUserId,
    })
    .from(assignmentsTable)
    .leftJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(
      and(
        eq(assignmentsTable.title, OCT25_SESSION_REVIEW_TITLE),
        ne(assignmentsTable.status, "archived"),
        or(
          eq(assignmentsTable.assignedStudentUserId, michelle.id),
          eq(sessionsTable.clientUserId, michelle.id),
        ),
      ),
    );
  if (existing.length > 1) {
    return finish(empty("More than one Oct 25 review quiz was found and left unchanged.", dryRun));
  }

  const candidateSessions =
    xavierIds.length === 0
      ? []
      : await db
          .select()
          .from(sessionsTable)
          .where(
            and(
              eq(sessionsTable.clientUserId, michelle.id),
              inArray(sessionsTable.tutorUserId, xavierIds),
              isNull(sessionsTable.cancelledAt),
              ne(sessionsTable.status, "archived"),
            ),
          );
  const picked = pickOct25ReviewSession(candidateSessions, now);
  const session = picked.session;

  const already = existing[0];
  if (already) {
    if (
      already.assignment.assignedStudentUserId &&
      already.assignment.assignedStudentUserId !== michelle.id
    ) {
      return finish(empty("Refusing to change an Oct 25 review quiz assigned to someone else.", dryRun));
    }
    if (already.sessionClientUserId && already.sessionClientUserId !== michelle.id) {
      return finish(empty("Refusing to change an Oct 25 review quiz on another student's session.", dryRun));
    }
    if (!shouldRepublishSeededHomework(already.assignment.status)) {
      return finish(empty("The Oct 25 review quiz is archived and was left unchanged.", dryRun));
    }
    const [attempt] = await db
      .select({ id: attemptsTable.id })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, already.assignment.id))
      .limit(1);
    if (attempt) {
      return finish({
        created: false,
        dryRun,
        assignmentId: already.assignment.id,
        questionCount: OCT25_REVIEW_QUESTIONS.length,
        timeLimitMinutes: already.assignment.timeLimitMinutes,
        softTimeLimit: already.assignment.softTimeLimit === true,
        skippedReason: "The Oct 25 review quiz already has an attempt and was left unchanged.",
      });
    }
    if (dryRun) {
      return finish({
        created: false,
        dryRun: true,
        assignmentId: already.assignment.id,
        questionCount: OCT25_REVIEW_QUESTIONS.length,
        timeLimitMinutes: OCT25_REVIEW_TIME_LIMIT_MINUTES,
        softTimeLimit: true,
        skippedReason: "Dry run left the existing Oct 25 review quiz unchanged.",
      });
    }
    const tutorUserId =
      (already.assignment.assignedTutorUserId &&
      xavierIds.includes(already.assignment.assignedTutorUserId)
        ? already.assignment.assignedTutorUserId
        : null) ??
      session?.tutorUserId ??
      xavierIds[0] ??
      null;
    if (!tutorUserId) {
      return finish(empty("Xavier Morales was not found, so the existing quiz was left unchanged."));
    }
    const sessionId = session?.id ?? already.assignment.sessionId ?? null;
    const assignmentDrift =
      already.assignment.assignedStudentUserId !== michelle.id ||
      already.assignment.assignedTutorUserId !== tutorUserId ||
      already.assignment.sessionId !== sessionId ||
      already.assignment.instructions !== OCT25_REVIEW_INSTRUCTIONS ||
      Number(already.assignment.timeLimitMinutes) !== OCT25_REVIEW_TIME_LIMIT_MINUTES ||
      already.assignment.softTimeLimit !== true ||
      already.assignment.maxAttempts !== OCT25_REVIEW_MAX_ATTEMPTS ||
      already.assignment.status !== "published";
    if (assignmentDrift) {
      await db
        .update(assignmentsTable)
        .set({
          assignedStudentUserId: michelle.id,
          assignedTutorUserId: tutorUserId,
          sessionId,
          instructions: OCT25_REVIEW_INSTRUCTIONS,
          timeLimitMinutes: OCT25_REVIEW_TIME_LIMIT_MINUTES,
          softTimeLimit: true,
          maxAttempts: OCT25_REVIEW_MAX_ATTEMPTS,
          status: "published",
        })
        .where(eq(assignmentsTable.id, already.assignment.id));
    }
    await refreshUntouchedQuestions(already.assignment.id);
    return finish({
      created: false,
      dryRun: false,
      assignmentId: already.assignment.id,
      questionCount: OCT25_REVIEW_QUESTIONS.length,
      timeLimitMinutes: OCT25_REVIEW_TIME_LIMIT_MINUTES,
      softTimeLimit: true,
      skippedReason: "The Oct 25 review quiz is already assigned.",
    });
  }

  if (!session || session.clientUserId !== michelle.id) {
    return finish(empty(picked.skippedReason ?? "No Oct 25 session with Xavier was found.", dryRun));
  }
  if (dryRun) {
    return finish({
      created: false,
      dryRun: true,
      assignmentId: null,
      questionCount: OCT25_REVIEW_QUESTIONS.length,
      timeLimitMinutes: OCT25_REVIEW_TIME_LIMIT_MINUTES,
      softTimeLimit: true,
    });
  }
  const questionIds = await insertQuestions();
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: session.courseId,
      sessionId: session.id,
      assignedStudentUserId: michelle.id,
      assignedTutorUserId: session.tutorUserId,
      deliveryPhase: "before_session",
      title: OCT25_SESSION_REVIEW_TITLE,
      subject: "SAT Math",
      instructions: OCT25_REVIEW_INSTRUCTIONS,
      status: "published",
      deadline: null,
      timeLimitMinutes: OCT25_REVIEW_TIME_LIMIT_MINUTES,
      softTimeLimit: true,
      maxAttempts: OCT25_REVIEW_MAX_ATTEMPTS,
    })
    .returning({ id: assignmentsTable.id });
  if (!assignment) {
    return finish(empty("The Oct 25 review quiz could not be created."));
  }
  await replaceLinks(assignment.id, questionIds);
  return finish({
    created: true,
    dryRun: false,
    assignmentId: assignment.id,
    questionCount: questionIds.length,
    timeLimitMinutes: OCT25_REVIEW_TIME_LIMIT_MINUTES,
    softTimeLimit: true,
  });
}
