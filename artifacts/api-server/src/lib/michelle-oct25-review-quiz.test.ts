import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { answersMatch } from "./sat-bank-retry.ts";
import { studentFacingFigurePrimaryFields } from "./sat-bank-figure-primary.ts";
import { isXavierAuthoredFollowUpQuestion, XAVIER_AUTHORED_FOLLOW_UP_TAG } from "./xavier-follow-up-content.ts";
import { isPostSessionFollowUpTitle } from "./post-session-follow-up.ts";
import {
  OCT25_FIGURE_NOTE,
  OCT25_REVIEW_INSTRUCTIONS,
  OCT25_REVIEW_MAX_ATTEMPTS,
  OCT25_REVIEW_QUESTIONS,
  OCT25_REVIEW_TAG,
  OCT25_REVIEW_TIME_LIMIT_MINUTES,
  OCT25_SESSION_REVIEW_TITLE,
  OCT25_SOFT_TIMER_NOTE,
  matchesOct25SessionDate,
  pickOct25ReviewSession,
} from "./michelle-oct25-review-quiz.ts";
import { isAuthoredGridInQuestion, isStudentAnswerableQuizQuestion } from "../../../accepted-admissions/src/lib/quiz-figure-primary.ts";

const PROMPTS = [
  "A square has an area of 36 square units. What is the area, in square units, of the largest circle that can be inscribed in the square?",
  "A circle with an area of 16π square units is inscribed in a square. What is the area, in square units, of the square?",
  "In the figure, a quarter of a circle is drawn inside a square. The center of the circle is vertex O of the square, and the radius of the circle is equal to the side length of the square. If the square has an area of 16 square units, what is the area, in square units, of the full circle?",
  "The figure shows a circle with center O. The central angle described by arc JKL measures π/3 radians. If the circle has a radius of 6, what is the length of arc JKL?",
  "The figure shows a circle with center O. The central angle described by arc ABD measures 150°. If the circle has a radius of 12, what is the length of arc ABD?",
  "In the figure, overline(GI) is parallel to overline(FJ) and IJ = 15. What is the length of overline(FH)?",
  "In the figure, overline(GI) is parallel to overline(FJ) and IJ = 34. What is the length of overline(GF)?",
  "A distance of 1,320 yards is equivalent to how many chains? (1 chain = 22 yards)",
  "A volume of 15 gallons is equivalent to how many cups? (1 gallon = 4 quarts and 1 quart = 4 cups)",
  "A car is traveling at a constant speed of 66 feet per second. What is the car's speed, in miles per hour? (1 mile = 8 furlongs, 1 furlong = 220 yards, and 1 yard = 3 feet)",
];

const FIGURE_FILES = [
  "q03-quarter-circle-question-block.svg",
  "q04-arc-jkl-question-block.svg",
  "q05-arc-abd-question-block.svg",
  "q06-similar-triangles-question-block.svg",
  "q07-similar-triangles-question-block.svg",
];

test("Oct 25 review keeps all 10 questions, the key, and no source blurb", () => {
  assert.equal(OCT25_SESSION_REVIEW_TITLE, "Oct 25 Session Review Quiz");
  assert.equal(isPostSessionFollowUpTitle(OCT25_SESSION_REVIEW_TITLE), true);
  assert.equal(OCT25_REVIEW_TIME_LIMIT_MINUTES, 30);
  assert.equal(OCT25_REVIEW_MAX_ATTEMPTS, 1);
  assert.equal(
    OCT25_SOFT_TIMER_NOTE,
    "Try your best to finish within 30 minutes. If you go over, you can keep working.",
  );
  assert.match(OCT25_REVIEW_INSTRUCTIONS, /keep working/);
  assert.equal(/packet|sama|pdf|cover|uploaded to the main dashboard/i.test(OCT25_REVIEW_INSTRUCTIONS), false);
  assert.equal(OCT25_REVIEW_QUESTIONS.length, 10);
  assert.deepEqual(
    OCT25_REVIEW_QUESTIONS.map((question) => question.key),
    Array.from({ length: 10 }, (_, index) => `oct25-q${String(index + 1).padStart(2, "0")}`),
  );
  assert.deepEqual(
    OCT25_REVIEW_QUESTIONS.map((question) => question.prompt),
    PROMPTS,
  );
  assert.deepEqual(
    OCT25_REVIEW_QUESTIONS.map((question) => question.questionType),
    ["multiple_choice", "multiple_choice", "multiple_choice", "multiple_choice", "multiple_choice", "spr", "spr", "multiple_choice", "multiple_choice", "spr"],
  );
  assert.deepEqual(
    OCT25_REVIEW_QUESTIONS.map((question) => question.correctAnswer),
    ["c", "d", "c", "a", "b", "20", "30", "a", "c", "45"],
  );
  for (const question of OCT25_REVIEW_QUESTIONS) {
    const blob = `${question.prompt}\n${question.stimulus ?? ""}\n${question.explanation}`;
    assert.equal(/packet|pdf|cover|sama|from the oct 25|problem \d/i.test(blob), false);
    assert.ok(question.explanation.trim().length > 0);
    assert.ok(question.prompt.length >= 40);
  }
  assert.equal(OCT25_REVIEW_QUESTIONS[2]!.stimulus?.includes(OCT25_FIGURE_NOTE), false);
  for (const question of OCT25_REVIEW_QUESTIONS.slice(3, 7)) {
    assert.match(question.stimulus ?? "", new RegExp(OCT25_FIGURE_NOTE.replace(/[.]/g, "\\.")));
  }
  assert.equal(OCT25_REVIEW_QUESTIONS[0]!.stimulus, null);
  assert.equal(OCT25_REVIEW_QUESTIONS[1]!.stimulus, null);
  assert.equal(OCT25_REVIEW_QUESTIONS[9]!.stimulus, null);
  for (const [index, file] of FIGURE_FILES.entries()) {
    const question = OCT25_REVIEW_QUESTIONS[index + 2]!;
    assert.match(
      question.stimulus ?? "",
      new RegExp(`https://app\\.acceptedadmissions\\.org/media/geometry/michelle-oct25/${file}`),
    );
    assert.equal(
      existsSync(
        new URL(
          `../../../accepted-admissions/public/media/geometry/michelle-oct25/${file}`,
          import.meta.url,
        ),
      ),
      true,
    );
  }
  assert.match(OCT25_REVIEW_QUESTIONS[0]!.explanation, /π·3\^2 = 9π/);
  assert.match(OCT25_REVIEW_QUESTIONS[1]!.explanation, /8\^2 = 64/);
  assert.match(OCT25_REVIEW_QUESTIONS[2]!.explanation, /π·4\^2 = 16π/);
  assert.match(OCT25_REVIEW_QUESTIONS[3]!.explanation, /6·π\/3 = 2π/);
  assert.match(OCT25_REVIEW_QUESTIONS[4]!.explanation, /10π/);
  assert.match(OCT25_REVIEW_QUESTIONS[5]!.explanation, /overline\(FH\)/);
  assert.match(OCT25_REVIEW_QUESTIONS[6]!.explanation, /overline\(GF\)/);
  assert.match(OCT25_REVIEW_QUESTIONS[7]!.explanation, /1,320 ÷ 22 = 60/);
  assert.match(OCT25_REVIEW_QUESTIONS[8]!.explanation, /15 × 4 × 4 = 240/);
  assert.match(OCT25_REVIEW_QUESTIONS[9]!.explanation, /237,600 ÷ 5,280 = 45/);
  const source = readFileSync(new URL("./michelle-oct25-review-quiz.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /clerkClient|@clerk\/|sendEmail|nodemailer|resend/i);
  assert.doesNotMatch(source, /\.insert\(attemptsTable\)/);
  assert.match(source, /logger\.info\(safeLog\(result\)/);
  assert.doesNotMatch(source, /These problems are from|uploaded to the main dashboard|Problem 1A/);
});

test("free-response grading accepts equivalent numeric forms for the Oct 25 answers", () => {
  assert.equal(answersMatch("20", "20"), true);
  assert.equal(answersMatch("20.0", "20"), true);
  assert.equal(answersMatch("30", "30"), true);
  assert.equal(answersMatch("30.0", "30"), true);
  assert.equal(answersMatch("45", "45"), true);
  assert.equal(answersMatch("45.0", "45"), true);
  assert.equal(answersMatch("21", "20"), false);
  assert.equal(answersMatch("c", "c"), true);
  assert.equal(answersMatch("C", "c"), true);
  assert.equal(answersMatch("d", "d"), true);
  assert.equal(answersMatch("D", "d"), true);
  assert.equal(answersMatch("a", "b"), false);
});

test("Oct 25 figures stay servable and grid-ins stay free response", () => {
  const hiddenFromXavier: string[] = [];
  const gridIns: string[] = [];
  for (const draft of OCT25_REVIEW_QUESTIONS) {
    const facing = studentFacingFigurePrimaryFields({
      prompt: draft.prompt,
      stimulus: draft.stimulus,
      choices: draft.choices,
      questionType: draft.questionType,
      correctAnswer: draft.correctAnswer,
      tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG, OCT25_REVIEW_TAG, draft.key],
    });
    const served = isXavierAuthoredFollowUpQuestion({
      tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG, OCT25_REVIEW_TAG, draft.key],
      questionType: draft.questionType,
      prompt: draft.prompt,
      correctAnswer: draft.correctAnswer,
      choices: draft.choices,
    });
    if (!served || facing.presentation !== "text") hiddenFromXavier.push(draft.key);
    if (draft.questionType === "spr") {
      const grid = isAuthoredGridInQuestion({
        prompt: facing.prompt,
        stimulus: facing.stimulus,
        choices: facing.choices,
        presentation: facing.presentation,
        questionType: facing.questionType,
      });
      if (grid) gridIns.push(draft.key);
      assert.equal(isStudentAnswerableQuizQuestion({
        prompt: facing.prompt,
        stimulus: facing.stimulus,
        choices: facing.choices,
        presentation: facing.presentation,
        questionType: facing.questionType,
      }), true, draft.key);
    }
  }
  assert.deepEqual(hiddenFromXavier, []);
  assert.deepEqual(gridIns, ["oct25-q06", "oct25-q07", "oct25-q10"]);
  const quarter = OCT25_REVIEW_QUESTIONS[2]!;
  const quarterFacing = studentFacingFigurePrimaryFields({
    prompt: quarter.prompt,
    stimulus: quarter.stimulus,
    choices: quarter.choices,
    questionType: quarter.questionType,
    correctAnswer: quarter.correctAnswer,
    tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG, OCT25_REVIEW_TAG, quarter.key],
  });
  assert.equal(isStudentAnswerableQuizQuestion(quarterFacing), false);
  assert.equal(isXavierAuthoredFollowUpQuestion({
    tags: [XAVIER_AUTHORED_FOLLOW_UP_TAG, OCT25_REVIEW_TAG, quarter.key],
    questionType: quarter.questionType,
    prompt: quarter.prompt,
    correctAnswer: quarter.correctAnswer,
    choices: quarter.choices,
  }), true);
});

function svgPathPoints(svg: string, id: string): Array<[number, number]> {
  const match = svg.match(new RegExp(`id="${id}" d="([^"]+)"`));
  assert.ok(match, id);
  const nums = [...match[1]!.matchAll(/-?\d+(?:\.\d+)?/g)].map((item) => Number(item[0]));
  const points: Array<[number, number]> = [];
  for (let index = 0; index < nums.length; index += 2) {
    points.push([nums[index]!, nums[index + 1]!]);
  }
  return points;
}

test("Q4 and Q5 bold arcs lie on the circumference and Q6/Q7 keep only right-angle marks", () => {
  const q4 = readFileSync(
    new URL("../../../accepted-admissions/public/media/geometry/michelle-oct25/q04-arc-jkl-question-block.svg", import.meta.url),
    "utf8",
  );
  const q5 = readFileSync(
    new URL("../../../accepted-admissions/public/media/geometry/michelle-oct25/q05-arc-abd-question-block.svg", import.meta.url),
    "utf8",
  );
  assert.equal(/\sA\d/.test(q4), false);
  assert.equal(/\sA\d/.test(q5), false);
  const arc4 = svgPathPoints(q4, "arc");
  for (const [x, y] of arc4) {
    assert.ok(Math.abs(Math.hypot(x - 180, y - 168) - 108) < 0.05, `${x},${y}`);
    assert.ok(y <= 74.47 + 0.01);
  }
  assert.ok(arc4.some(([x, y]) => Math.hypot(x - 180, y - 60) < 0.1));
  assert.deepEqual(svgPathPoints(q4, "radii"), [
    [180, 168],
    [126, 74.47],
    [180, 168],
    [234, 74.47],
  ]);

  const arc5 = svgPathPoints(q5, "arc");
  for (const [x, y] of arc5) {
    assert.ok(Math.abs(Math.hypot(x - 200, y - 170) - 100) < 0.05, `${x},${y}`);
    assert.ok(y <= 170.01);
  }
  assert.ok(arc5.some(([x, y]) => Math.hypot(x - 200, y - 70) < 0.1));
  assert.ok(arc5.some(([x, y]) => Math.hypot(x - 174.12, y - 73.41) < 2));
  assert.ok(Math.hypot(arc5[0]![0] - 100, arc5[0]![1] - 170) < 0.1);
  assert.ok(Math.hypot(arc5.at(-1)![0] - 286.6, arc5.at(-1)![1] - 120) < 0.1);

  for (const file of ["q06-similar-triangles-question-block.svg", "q07-similar-triangles-question-block.svg"]) {
    const svg = readFileSync(
      new URL(`../../../accepted-admissions/public/media/geometry/michelle-oct25/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(svg, /id="right-angle-f" d="M80 256 H94 V270"/);
    assert.match(svg, /id="right-angle-g" d="M80 136 H94 V150"/);
    assert.equal(svg.includes("M80 270 H98"), false);
    assert.equal(svg.includes("M80 150 H98"), false);
    assert.equal(/<circle\b/.test(svg), false);
  }
});

test("only the completed Oct 25 session is eligible", () => {
  const completedNow = new Date("2026-10-26T15:00:00.000Z");
  const session = (
    dateTime: string,
    timezone: string | null,
    extras: { cancelledAt?: Date | null; status?: string } = {},
  ) => ({
    id: `${dateTime}:${timezone ?? "none"}:${extras.status ?? "published"}`,
    dateTime: new Date(dateTime),
    timezone,
    status: extras.status ?? "published",
    bookingStatus: "confirmed",
    cancelledAt: extras.cancelledAt ?? null,
  });
  assert.equal(matchesOct25SessionDate(session("2026-10-25T16:00:00.000Z", "America/New_York")), true);
  assert.equal(matchesOct25SessionDate(session("2026-10-16T16:00:00.000Z", "America/New_York")), false);
  assert.equal(matchesOct25SessionDate(session("2026-10-30T16:00:00.000Z", "America/New_York")), false);
  assert.equal(matchesOct25SessionDate(session("2026-10-25T16:00:00.000Z", "Asia/Tokyo")), false);
  assert.equal(matchesOct25SessionDate(session("2026-10-25T03:00:00.000Z", null)), true);
  assert.equal(matchesOct25SessionDate(session("2026-10-26T02:00:00.000Z", null)), true);
  assert.equal(matchesOct25SessionDate(session("2026-10-26T05:00:00.000Z", null)), false);

  const oct25 = session("2026-10-25T16:00:00.000Z", "America/New_York");
  const picked = pickOct25ReviewSession(
    [
      session("2026-10-16T16:00:00.000Z", "America/New_York"),
      oct25,
      session("2026-10-30T16:00:00.000Z", "America/New_York"),
      session("2026-10-25T16:00:00.000Z", "Asia/Tokyo"),
    ],
    completedNow,
  );
  assert.equal(picked.session?.id, oct25.id);
  assert.equal(picked.skippedReason, undefined);

  const duplicate = pickOct25ReviewSession(
    [oct25, session("2026-10-25T18:00:00.000Z", "America/New_York")],
    completedNow,
  );
  assert.equal(duplicate.session, null);
  assert.match(duplicate.skippedReason ?? "", /More than one Oct 25 session/);

  const future = pickOct25ReviewSession(
    [session("2026-10-25T16:00:00.000Z", "America/New_York")],
    new Date("2026-10-25T15:00:00.000Z"),
  );
  assert.equal(future.session, null);
  assert.match(future.skippedReason ?? "", /No Oct 25 session/);

  const cancelled = pickOct25ReviewSession(
    [session("2026-10-25T16:00:00.000Z", "America/New_York", { cancelledAt: completedNow })],
    completedNow,
  );
  assert.equal(cancelled.session, null);
});

test("soft time limit migration is additive and startup wires the seed", () => {
  const sql = readFileSync(
    new URL("../../../../lib/db/drizzle/0082_assignment_soft_time_limit.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "soft_time_limit" boolean DEFAULT false NOT NULL/);
  assert.equal(/DROP\s+TABLE/i.test(sql), false);
  assert.equal(/ALTER\s+TABLE\s+"attempts"/i.test(sql), false);
  assert.equal(/UPDATE\s+/i.test(sql), false);
  assert.equal(/email/i.test(sql), false);
  const journal = readFileSync(
    new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  );
  assert.match(journal, /"tag": "0082_assignment_soft_time_limit"/);
  const startup = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(startup, /ensureMichelleOct25ReviewQuiz\(\)/);
  assert.doesNotMatch(startup, /sendEmail|nodemailer|resend|clerkClient/i);
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "assigns the Oct 25 review only to Michelle on her Oct 25 session",
  { skip: !hasDatabase },
  async () => {
    const { and, eq, inArray, sql } = await import("drizzle-orm");
    const {
      assignmentQuestionsTable,
      assignmentsTable,
      attemptsTable,
      coursesTable,
      db,
      pool,
      questionsTable,
      sessionsTable,
      usersTable,
    } = await import("@workspace/db");
    const { ensureMichelleOct25ReviewQuiz } = await import("./michelle-oct25-review-quiz.ts");
    const { SAT_MATH_FOLLOW_UP_TITLE } = await import("./post-session-follow-up.ts");
    const { TAITO_STUDENT_EMAIL } = await import("./session-schedule.ts");

    const migration = readFileSync(
      new URL("../../../../lib/db/drizzle/0082_assignment_soft_time_limit.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await pool.query(statement);
    }

    const suffix = randomUUID().slice(0, 8);
    const michelleEmail = `michelle-oct25-${suffix}@example.com`;
    const xavierEmail = `xavier-oct25-${suffix}@example.com`;
    const otherEmail = `other-oct25-${suffix}@example.com`;
    const michelleClerk = `user_michelle_${suffix}`;
    const xavierClerk = `user_xavier_${suffix}`;
    const createdUserIds: string[] = [];
    const createdSessionIds: string[] = [];
    const createdCourseIds: string[] = [];
    const now = new Date("2026-10-26T15:00:00.000Z");

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Oct 25 review ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    createdCourseIds.push(course!.id);
    const insertUser = async (
      email: string,
      displayName: string,
      role: "student" | "tutor",
      clerkUserId: string,
    ) => {
      const [created] = await db
        .insert(usersTable)
        .values({ clerkUserId, email, displayName, role })
        .returning();
      createdUserIds.push(created!.id);
      return created!;
    };
    try {
      const refused = await ensureMichelleOct25ReviewQuiz({
        now,
        identities: { michelleEmail: TAITO_STUDENT_EMAIL, michelleClerkUserId: `user_taito_${suffix}` },
      });
      assert.equal(refused.created, false);
      assert.equal(refused.assignmentId, null);
      assert.match(refused.skippedReason ?? "", /different client/);

      const michelle = await insertUser(michelleEmail, "Michelle Fixture", "student", michelleClerk);
      const xavier = await insertUser(xavierEmail, "Xavier Fixture", "tutor", xavierClerk);
      const other = await insertUser(otherEmail, "Other Fixture", "student", `user_other_${suffix}`);
      const insertSession = async (
        clientUserId: string,
        dateTime: Date,
        title: string,
        timezone: string,
      ) => {
        const [created] = await db
          .insert(sessionsTable)
          .values({
            courseId: course!.id,
            clientUserId,
            tutorUserId: xavier.id,
            dateTime,
            timezone,
            subject: "SAT",
            title,
            status: "published",
            bookingStatus: "confirmed",
            durationMinutes: 60,
          })
          .returning();
        createdSessionIds.push(created!.id);
        return created!;
      };
      await insertSession(michelle.id, new Date("2026-09-01T12:00:00.000Z"), "Older session", "America/New_York");
      const oct25 = await insertSession(
        michelle.id,
        new Date("2026-10-25T16:00:00.000Z"),
        "Michelle’s SAT Session with Xavier",
        "America/New_York",
      );
      await insertSession(michelle.id, new Date("2026-10-30T16:00:00.000Z"), "Later session", "America/New_York");
      await insertSession(
        other.id,
        new Date("2026-10-25T16:00:00.000Z"),
        "Other Oct 25 session",
        "America/New_York",
      );
      const [keptQuestion] = await db
        .insert(questionsTable)
        .values({
          subject: "SAT Math",
          domain: "SAT Math",
          skill: "Existing",
          questionType: "multiple_choice",
          difficulty: "medium",
          stimulus: null,
          prompt: "Leave this existing SAT Math stem alone for the fixture student.",
          choices: [
            { id: "a", label: "A", text: "1" },
            { id: "b", label: "B", text: "2" },
            { id: "c", label: "C", text: "3" },
            { id: "d", label: "D", text: "4" },
          ],
          correctAnswer: "a",
          explanation: "Existing explanation.",
          sourceType: "original",
          reviewStatus: "approved",
          tags: ["xavier-authored-follow-up", "sat-5a"],
          generationMethod: "session-copy",
        })
        .returning();
      const [existingQuiz] = await db
        .insert(assignmentsTable)
        .values({
          courseId: course!.id,
          sessionId: oct25.id,
          assignedStudentUserId: michelle.id,
          assignedTutorUserId: xavier.id,
          deliveryPhase: "before_session",
          title: SAT_MATH_FOLLOW_UP_TITLE,
          subject: "SAT Math",
          instructions: "Existing instructions.",
          status: "published",
          timeLimitMinutes: 33,
          maxAttempts: 1,
        })
        .returning();
      await db.insert(assignmentQuestionsTable).values({
        assignmentId: existingQuiz!.id,
        questionId: keptQuestion!.id,
        position: 0,
        predictionFirst: false,
      });

      const identities = {
        michelleEmail,
        michelleClerkUserId: michelleClerk,
        xavierEmail,
        xavierClerkUserId: xavierClerk,
      };
      const planned = await ensureMichelleOct25ReviewQuiz({ now, dryRun: true, identities });
      assert.equal(planned.created, false);
      assert.equal(planned.dryRun, true);
      assert.equal(planned.assignmentId, null);
      assert.equal(planned.questionCount, 10);
      assert.equal(planned.softTimeLimit, true);
      assert.equal(planned.skippedReason, undefined);
      const before = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.title, OCT25_SESSION_REVIEW_TITLE),
            inArray(assignmentsTable.sessionId, createdSessionIds),
          ),
        );
      assert.equal(before.length, 0);

      const first = await ensureMichelleOct25ReviewQuiz({ now, identities });
      assert.equal(first.created, true);
      assert.equal(first.dryRun, false);
      assert.equal(first.questionCount, 10);
      assert.equal(first.timeLimitMinutes, 30);
      assert.equal(first.softTimeLimit, true);
      const [quiz] = await db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, first.assignmentId!));
      assert.equal(quiz?.title, "Oct 25 Session Review Quiz");
      assert.equal(quiz?.assignedStudentUserId, michelle.id);
      assert.equal(quiz?.assignedTutorUserId, xavier.id);
      assert.equal(quiz?.sessionId, oct25.id);
      assert.equal(quiz?.subject, "SAT Math");
      assert.equal(quiz?.deliveryPhase, "before_session");
      assert.equal(quiz?.timeLimitMinutes, 30);
      assert.equal(quiz?.softTimeLimit, true);
      assert.equal(quiz?.maxAttempts, 1);
      assert.equal(quiz?.status, "published");
      assert.match(quiz?.instructions ?? "", /keep working/);
      assert.equal(/packet|sama|pdf/i.test(quiz?.instructions ?? ""), false);
      const attempts = await db
        .select({ id: attemptsTable.id })
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, first.assignmentId!));
      assert.equal(attempts.length, 0);
      const links = await db
        .select({
          id: questionsTable.id,
          position: assignmentQuestionsTable.position,
          prompt: questionsTable.prompt,
          correctAnswer: questionsTable.correctAnswer,
          tags: questionsTable.tags,
        })
        .from(assignmentQuestionsTable)
        .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
        .where(eq(assignmentQuestionsTable.assignmentId, first.assignmentId!))
        .orderBy(assignmentQuestionsTable.position);
      assert.equal(links.length, 10);
      assert.deepEqual(
        links.map((link) => link.prompt),
        PROMPTS,
      );
      assert.deepEqual(
        links.map((link) => link.correctAnswer),
        ["c", "d", "c", "a", "b", "20", "30", "a", "c", "45"],
      );
      assert.ok(links.every((link) => (link.tags ?? []).includes(OCT25_REVIEW_TAG)));
      assert.ok(links.every((link) => (link.tags ?? []).includes(XAVIER_AUTHORED_FOLLOW_UP_TAG)));

      const [untouched] = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, keptQuestion!.id));
      assert.equal(untouched?.prompt, "Leave this existing SAT Math stem alone for the fixture student.");
      const existingLinks = await db
        .select({ id: assignmentQuestionsTable.id })
        .from(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, existingQuiz!.id));
      assert.equal(existingLinks.length, 1);

      const otherQuizzes = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.title, OCT25_SESSION_REVIEW_TITLE),
            eq(assignmentsTable.assignedStudentUserId, other.id),
          ),
        );
      assert.equal(otherQuizzes.length, 0);

      const questionIds = links.map((link) => link.id);
      const second = await ensureMichelleOct25ReviewQuiz({ now, identities });
      assert.equal(second.created, false);
      assert.equal(second.assignmentId, first.assignmentId);
      const secondLinks = await db
        .select({ id: assignmentQuestionsTable.questionId })
        .from(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, first.assignmentId!))
        .orderBy(assignmentQuestionsTable.position);
      assert.deepEqual(
        secondLinks.map((link) => link.id),
        questionIds,
      );

      const editedId = secondLinks[0]!.id;
      await db.update(questionsTable).set({ prompt: "dry-run drift" }).where(eq(questionsTable.id, editedId));
      const dry = await ensureMichelleOct25ReviewQuiz({ now, dryRun: true, identities });
      assert.match(dry.skippedReason ?? "", /Dry run/);
      const [duringDryRun] = await db
        .select({ prompt: questionsTable.prompt })
        .from(questionsTable)
        .where(eq(questionsTable.id, editedId));
      assert.equal(duringDryRun?.prompt, "dry-run drift");

      const repaired = await ensureMichelleOct25ReviewQuiz({ now, identities });
      assert.equal(repaired.created, false);
      assert.equal(repaired.assignmentId, first.assignmentId);
      const [restored] = await db
        .select({ prompt: questionsTable.prompt })
        .from(questionsTable)
        .where(eq(questionsTable.id, editedId));
      assert.equal(restored?.prompt, PROMPTS[0]);

      await db.insert(attemptsTable).values({
        assignmentId: first.assignmentId!,
        userId: michelle.id,
        status: "active",
      });
      await db.update(questionsTable).set({ prompt: "student started" }).where(eq(questionsTable.id, editedId));
      const locked = await ensureMichelleOct25ReviewQuiz({ now, identities });
      assert.equal(locked.created, false);
      assert.match(locked.skippedReason ?? "", /attempt/);
      const [keptAttemptQuestion] = await db
        .select({ prompt: questionsTable.prompt })
        .from(questionsTable)
        .where(eq(questionsTable.id, editedId));
      assert.equal(keptAttemptQuestion?.prompt, "student started");
      const titled = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.title, OCT25_SESSION_REVIEW_TITLE),
            eq(assignmentsTable.assignedStudentUserId, michelle.id),
          ),
        );
      assert.equal(titled.length, 1);
      const attemptCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, first.assignmentId!));
      assert.equal(Number(attemptCount[0]?.count ?? 0), 1);
    } finally {
      const assignmentIds = (
        await db
          .select({ id: assignmentsTable.id })
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.sessionId, createdSessionIds))
      ).map((row) => row.id);
      if (assignmentIds.length > 0) {
        await db.delete(attemptsTable).where(inArray(attemptsTable.assignmentId, assignmentIds));
        const questionIds = (
          await db
            .select({ id: assignmentQuestionsTable.questionId })
            .from(assignmentQuestionsTable)
            .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds))
        ).map((row) => row.id);
        await db
          .delete(assignmentQuestionsTable)
          .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds));
        if (questionIds.length > 0) {
          await db.delete(questionsTable).where(inArray(questionsTable.id, questionIds));
        }
        await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, assignmentIds));
      }
      if (createdSessionIds.length > 0) {
        await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
      }
      if (createdCourseIds.length > 0) {
        await db.delete(coursesTable).where(inArray(coursesTable.id, createdCourseIds));
      }
    }
  },
);
