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
import {
  pickMostRecentCompletedSession,
} from "./michelle-geometry-follow-up-select.ts";
import { OCT18_SESSION_REVIEW_TITLE } from "./post-session-follow-up.ts";
import {
  EUNICE_TUTOR_EMAIL,
  NIKA_TUTOR_EMAIL,
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

export { OCT18_SESSION_REVIEW_TITLE };

/**
 * Startup seed for one student's review quiz. Same path as her Geometry,
 * SAT Math, and Factoring follow-ups: look up Michelle, attach the quiz to
 * her latest completed Xavier session, and leave every other assignment alone.
 * No Clerk calls, no email, and no writes when she is missing or already
 * started. Runs after migrations, including 0080.
 */

export const MICHELLE_OCT18_CLIENT_EMAIL = "makaremmichelle7@gmail.com";
export const MICHELLE_OCT18_CLERK_USER_ID = "user_3JCRGfBj8dgWSjO1r2zeKovFVE7";
export const OCT18_REVIEW_TAG = "michelle-oct18-review";
export const OCT18_REVIEW_TIME_LIMIT_MINUTES = 25;
export const OCT18_REVIEW_INSTRUCTIONS =
  "For a free-response question, type a number. You have 25 minutes.";

const FORBIDDEN_CLIENT_EMAILS = new Set(
  [TAITO_STUDENT_EMAIL, RYO_PARENT_EMAIL, EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL].map((email) =>
    email.toLowerCase(),
  ),
);

export type Oct18Choice = { id: string; label: string; text: string };

export type Oct18ReviewQuestion = {
  key: string;
  skill: string;
  questionType: "multiple_choice" | "spr";
  stimulus: string | null;
  prompt: string;
  choices: Oct18Choice[];
  correctAnswer: string;
  explanation: string;
};

const choice = (id: string, text: string): Oct18Choice => ({
  id,
  label: id.toUpperCase(),
  text,
});

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
}

function leadTable(lead: string, body: string): string {
  return `${lead}\n\n${body}`;
}

function mc(
  key: string,
  skill: string,
  prompt: string,
  choices: readonly [string, string, string, string],
  correctAnswer: "a" | "b" | "c" | "d",
  explanation: string,
  stimulus: string | null = null,
): Oct18ReviewQuestion {
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
): Oct18ReviewQuestion {
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

const XY_Q1 = table(
  ["x", "y"],
  [
    ["30", "p"],
    ["18", "p − 6"],
  ],
);
const XY_Q2 = table(
  ["x", "y"],
  [
    ["14", "p"],
    ["6", "p + 8"],
  ],
);
const XY_Q3 = table(
  ["x", "y"],
  [
    ["4", "k"],
    ["10", "k + 9"],
    ["16", "2k"],
  ],
);
const PETS = table(
  ["Number of pets", "Number of students"],
  [
    ["0", "8"],
    ["1", "14"],
    ["2", "10"],
    ["3", "6"],
    ["4", "12"],
    ["5", "7"],
    ["6", "3"],
  ],
);
const BOOKS = table(
  ["Books read", "Number of students"],
  [
    ["0", "2"],
    ["1", "6"],
    ["2", "12"],
    ["3", "9"],
    ["4", "5"],
    ["5", "3"],
    ["6", "3"],
  ],
);
const GOALS = table(
  ["Goals scored", "Number of games"],
  [
    ["1", "5"],
    ["2", "9"],
    ["3", "n"],
    ["4", "4"],
    ["5", "3"],
  ],
);

export const OCT18_REVIEW_QUESTIONS: readonly Oct18ReviewQuestion[] = [
  spr(
    "oct18-q01",
    "Linear intercepts",
    "The coordinates of two points on a line in the xy-plane are given in the table. If the x-intercept of the line is (a, p + 5), where a and p are integers, what is the value of a?",
    "40",
    "p + 5 = 0, so p = −5. Points (30, −5) and (18, −11) give slope 1/2. From (30, −5), rising 5 takes a run of 10, so a = 40.",
    XY_Q1,
  ),
  spr(
    "oct18-q02",
    "Linear intercepts",
    "The coordinates of two points on a line in the xy-plane are given in the table. If the x-intercept of the line is (a, p − 3), where a and p are integers, what is the value of a?",
    "17",
    "p − 3 = 0, so p = 3. Points (14, 3) and (6, 11) give slope −1. From (14, 3), dropping 3 takes a run of 3, so a = 17.",
    XY_Q2,
  ),
  spr(
    "oct18-q03",
    "Linear intercepts",
    "The table gives the coordinates of three points on a line in the xy-plane, where k is a constant. The line crosses the x-axis at the point (a, 0). What is the value of a?",
    "-8",
    "Slope from the first two points is 9/6 = 3/2. Going from x = 4 to x = 16 adds 12 · 3/2 = 18, so k + 18 = 2k and k = 18. From (4, 18), dropping 18 needs a run of −12, so a = −8.",
    XY_Q3,
  ),
  mc(
    "oct18-q04",
    "Exponential change",
    "A certain pond contains 64,000 algae cells. A treatment is added to the pond, causing the number of algae cells to decrease by one-half every 5 days. How many algae cells remained in the pond 30 days after the treatment was added?",
    ["500", "1,000", "2,000", "16,000"],
    "b",
    "30 ÷ 5 = 6 halvings, and 64,000 ÷ 64 = 1,000.",
  ),
  mc(
    "oct18-q05",
    "Exponential change",
    "A certain lab population contains 120,000 fruit flies. A disease spreads through the population, causing the number of fruit flies to decrease by one-half every 2 days. How many fruit flies remained 8 days after the disease began to spread?",
    ["7,500", "15,000", "30,000", "60,000"],
    "a",
    "8 ÷ 2 = 4 halvings, and 120,000 ÷ 16 = 7,500.",
  ),
  mc(
    "oct18-q06",
    "Exponential change",
    "The mass of a radioactive sample decreases by one-half every 6 hours. Exactly 2 days after a scientist began measuring it, the sample had a mass of 375 grams. What was the mass, in grams, of the sample when the scientist began measuring it?",
    ["3,000", "6,000", "48,000", "96,000"],
    "d",
    "2 days = 48 hours = 8 halvings. Work backward by doubling 8 times: 375 · 256 = 96,000.",
  ),
  mc(
    "oct18-q07",
    "Median",
    "Based on the table, what is the median number of pets for these 60 students?",
    ["1", "2", "2.55", "3"],
    "b",
    "The median is the average of the 30th and 31st values. Running totals: 8, 22, 32, so both are 2.",
    leadTable(
      "A teacher asked each of 60 students how many pets they have. The frequency table below shows the results.",
      PETS,
    ),
  ),
  mc(
    "oct18-q08",
    "Median",
    "Based on the table, what is the median number of books read for these 40 students?",
    ["2", "2.5", "2.75", "3"],
    "b",
    "The median is the average of the 20th and 21st values. Running totals: 2, 8, 20, 29, so they are 2 and 3, and the median is 2.5.",
    leadTable(
      "A librarian recorded how many books each of 40 students read over the summer. The frequency table below shows the results.",
      BOOKS,
    ),
  ),
  spr(
    "oct18-q09",
    "Median",
    "If the median number of goals scored per game is 3, what is the least possible value of n?",
    "8",
    "There are 14 games below 3 and 7 games above 3, so there are 21 + n games in all. With n = 7 there are 28 games, and the 14th and 15th are 2 and 3, so the median is 2.5. With n = 8 there are 29 games, and the 15th is 3.",
    leadTable(
      "The frequency table below shows the number of goals a soccer team scored in each game it played this season, where n is a positive integer.",
      GOALS,
    ),
  ),
  mc(
    "oct18-q10",
    "Unit conversion",
    "A distance of 2,640 feet is equivalent to how many chains? (1 chain = 22 yards and 1 yard = 3 feet)",
    ["40", "120", "880", "174,240"],
    "a",
    "1 chain = 66 feet, so 2,640 ÷ 66 = 40.",
  ),
  mc(
    "oct18-q11",
    "Unit conversion",
    "A volume of 15 gallons is equivalent to how many cups? (1 gallon = 4 quarts and 1 quart = 4 cups)",
    ["23", "60", "240", "960"],
    "c",
    "15 × 4 × 4 = 240.",
  ),
  spr(
    "oct18-q12",
    "Unit conversion",
    "A car is traveling at a constant speed of 66 feet per second. What is the car's speed, in miles per hour? (1 mile = 8 furlongs, 1 furlong = 220 yards, and 1 yard = 3 feet)",
    "45",
    "1 mile = 8 × 220 × 3 = 5,280 feet. In one hour the car goes 66 × 3,600 = 237,600 feet, and 237,600 ÷ 5,280 = 45.",
    null,
  ),
];

export type MichelleOct18Identities = {
  michelleEmail?: string;
  michelleClerkUserId?: string;
  xavierEmail?: string;
  xavierClerkUserId?: string;
  xavierDuplicateClerkUserId?: string;
};

export type MichelleOct18Options = {
  now?: Date;
  identities?: MichelleOct18Identities;
};

export type MichelleOct18Result = {
  created: boolean;
  assignmentId: string | null;
  questionCount: number;
  timeLimitMinutes: number;
  skippedReason?: string;
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function isForbiddenClient(email: string | null | undefined): boolean {
  return FORBIDDEN_CLIENT_EMAILS.has(normalizeEmail(email));
}

function empty(skippedReason?: string): MichelleOct18Result {
  return {
    created: false,
    assignmentId: null,
    questionCount: 0,
    timeLimitMinutes: OCT18_REVIEW_TIME_LIMIT_MINUTES,
    ...(skippedReason ? { skippedReason } : {}),
  };
}

function sourceKey(tags: readonly string[] | null | undefined): string {
  return (tags ?? []).find((tag) => tag.startsWith("oct18-q")) ?? "";
}

async function findUsers(input: { email: string; clerkUserIds: string[] }) {
  const clerkIds = input.clerkUserIds.map((id) => id.trim()).filter(Boolean);
  const filters = [sql`lower(${usersTable.email}) = ${input.email}`];
  if (clerkIds.length > 0) filters.push(inArray(usersTable.clerkUserId, clerkIds));
  return db.select().from(usersTable).where(or(...filters));
}

async function insertQuestions(): Promise<string[]> {
  const ids: string[] = [];
  for (const draft of OCT18_REVIEW_QUESTIONS) {
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
        tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG, OCT18_REVIEW_TAG, draft.key, "session-copy"],
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
  draft: Oct18ReviewQuestion,
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
    links.length === OCT18_REVIEW_QUESTIONS.length &&
    links.every(
      (link, index) =>
        (link.tags ?? []).includes(OCT18_REVIEW_TAG) &&
        sourceKey(link.tags) === OCT18_REVIEW_QUESTIONS[index]?.key,
    );
  if (!sameShape) {
    const ownedIds = links
      .filter((link) => (link.tags ?? []).includes(OCT18_REVIEW_TAG))
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
            sql`${questionsTable.tags} @> ${JSON.stringify([OCT18_REVIEW_TAG])}::jsonb`,
          ),
        );
      }
    }
    return;
  }
  for (const [index, link] of links.entries()) {
    const draft = OCT18_REVIEW_QUESTIONS[index]!;
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
          sql`${questionsTable.tags} @> ${JSON.stringify([OCT18_REVIEW_TAG])}::jsonb`,
        ),
      );
  }
}

export async function ensureMichelleOct18ReviewQuiz(
  options: MichelleOct18Options = {},
): Promise<MichelleOct18Result> {
  const now = options.now ?? new Date();
  const michelleEmail = normalizeEmail(
    options.identities?.michelleEmail ?? MICHELLE_OCT18_CLIENT_EMAIL,
  );
  const michelleClerkUserId =
    options.identities?.michelleClerkUserId?.trim() || MICHELLE_OCT18_CLERK_USER_ID;
  const xavierEmail = normalizeEmail(options.identities?.xavierEmail ?? XAVIER_TUTOR_EMAIL);

  if (isForbiddenClient(michelleEmail)) {
    const skipped = empty("Refusing to assign the Oct 18 review quiz to a non-Michelle client.");
    logger.info(skipped, "Michelle Oct 18 review quiz skipped");
    return skipped;
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
    const skipped = empty("Michelle Makarem was not found, so no quiz was assigned.");
    logger.info(skipped, "Michelle Oct 18 review quiz skipped");
    return skipped;
  }
  if (
    normalizeEmail(michelle.email) !== michelleEmail &&
    michelle.clerkUserId !== michelleClerkUserId
  ) {
    const skipped = empty("Resolved client did not match Michelle's email or Clerk user.");
    logger.info(skipped, "Michelle Oct 18 review quiz skipped");
    return skipped;
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
        eq(assignmentsTable.title, OCT18_SESSION_REVIEW_TITLE),
        ne(assignmentsTable.status, "archived"),
        or(
          eq(assignmentsTable.assignedStudentUserId, michelle.id),
          eq(sessionsTable.clientUserId, michelle.id),
        ),
      ),
    );
  if (existing.length > 1) {
    const skipped = empty("More than one Oct 18 review quiz was found and left unchanged.");
    logger.info(skipped, "Michelle Oct 18 review quiz skipped");
    return skipped;
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
  const session = pickMostRecentCompletedSession(candidateSessions, now);

  const already = existing[0];
  if (already) {
    if (
      already.assignment.assignedStudentUserId &&
      already.assignment.assignedStudentUserId !== michelle.id
    ) {
      const skipped = empty("Refusing to change an Oct 18 review quiz assigned to someone else.");
      logger.info(skipped, "Michelle Oct 18 review quiz skipped");
      return skipped;
    }
    if (
      already.sessionClientUserId &&
      already.sessionClientUserId !== michelle.id
    ) {
      const skipped = empty("Refusing to change an Oct 18 review quiz on another student's session.");
      logger.info(skipped, "Michelle Oct 18 review quiz skipped");
      return skipped;
    }
    if (!shouldRepublishSeededHomework(already.assignment.status)) {
      return empty("The Oct 18 review quiz is archived and was left unchanged.");
    }
    const [attempt] = await db
      .select({ id: attemptsTable.id })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, already.assignment.id))
      .limit(1);
    if (attempt) {
      const left = {
        created: false,
        assignmentId: already.assignment.id,
        questionCount: OCT18_REVIEW_QUESTIONS.length,
        timeLimitMinutes: already.assignment.timeLimitMinutes,
        skippedReason: "The Oct 18 review quiz already has an attempt and was left unchanged.",
      };
      logger.info(left, "Michelle Oct 18 review quiz left in place");
      return left;
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
      return empty("Xavier Morales was not found, so the existing quiz was left unchanged.");
    }
    const sessionId = already.assignment.sessionId ?? session?.id ?? null;
    const assignmentDrift =
      already.assignment.assignedStudentUserId !== michelle.id ||
      already.assignment.assignedTutorUserId !== tutorUserId ||
      already.assignment.sessionId !== sessionId ||
      already.assignment.instructions !== OCT18_REVIEW_INSTRUCTIONS ||
      Number(already.assignment.timeLimitMinutes) !== OCT18_REVIEW_TIME_LIMIT_MINUTES ||
      already.assignment.status !== "published";
    if (assignmentDrift) {
      await db
        .update(assignmentsTable)
        .set({
          assignedStudentUserId: michelle.id,
          assignedTutorUserId: tutorUserId,
          sessionId,
          instructions: OCT18_REVIEW_INSTRUCTIONS,
          timeLimitMinutes: OCT18_REVIEW_TIME_LIMIT_MINUTES,
          status: "published",
        })
        .where(eq(assignmentsTable.id, already.assignment.id));
    }
    await refreshUntouchedQuestions(already.assignment.id);
    const ready = {
      created: false,
      assignmentId: already.assignment.id,
      questionCount: OCT18_REVIEW_QUESTIONS.length,
      timeLimitMinutes: OCT18_REVIEW_TIME_LIMIT_MINUTES,
      skippedReason: "The Oct 18 review quiz is already assigned to Michelle.",
    };
    logger.info(ready, "Michelle Oct 18 review quiz already assigned");
    return ready;
  }

  if (!session || session.clientUserId !== michelle.id) {
    const skipped = empty("No completed Michelle session with Xavier was found.");
    logger.info(skipped, "Michelle Oct 18 review quiz skipped");
    return skipped;
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
      title: OCT18_SESSION_REVIEW_TITLE,
      subject: "SAT Math",
      instructions: OCT18_REVIEW_INSTRUCTIONS,
      status: "published",
      deadline: null,
      timeLimitMinutes: OCT18_REVIEW_TIME_LIMIT_MINUTES,
      maxAttempts: 1,
    })
    .returning({ id: assignmentsTable.id });
  if (!assignment) {
    return empty("The Oct 18 review quiz could not be created.");
  }
  await replaceLinks(assignment.id, questionIds);
  const created = {
    created: true,
    assignmentId: assignment.id,
    questionCount: questionIds.length,
    timeLimitMinutes: OCT18_REVIEW_TIME_LIMIT_MINUTES,
  };
  logger.info(created, "Michelle Oct 18 review quiz assigned");
  return created;
}
