import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { answersMatch } from "./sat-bank-retry.ts";
import { studentFacingFigurePrimaryFields } from "./sat-bank-figure-primary.ts";
import { isXavierAuthoredFollowUpQuestion } from "./xavier-follow-up-content.ts";
import { isPostSessionFollowUpTitle } from "./post-session-follow-up.ts";
import {
  OCT18_REVIEW_INSTRUCTIONS,
  OCT18_REVIEW_QUESTIONS,
  OCT18_REVIEW_TAG,
  OCT18_REVIEW_TIME_LIMIT_MINUTES,
  OCT18_SESSION_REVIEW_TITLE,
} from "./michelle-oct18-review-quiz.ts";
import { isStudentAnswerableQuizQuestion } from "../../../accepted-admissions/src/lib/quiz-figure-primary.ts";
import { splitQuizRichText } from "../../../accepted-admissions/src/lib/quiz-rich-text.ts";
import { repairMichelleQuizMathText } from "../../../accepted-admissions/src/lib/stacked-math-notation.ts";

const PROMPTS = [
  "The coordinates of two points on a line in the xy-plane are given in the table. If the x-intercept of the line is (a, p + 5), where a and p are integers, what is the value of a?",
  "The coordinates of two points on a line in the xy-plane are given in the table. If the x-intercept of the line is (a, p − 3), where a and p are integers, what is the value of a?",
  "The table gives the coordinates of three points on a line in the xy-plane, where k is a constant. The line crosses the x-axis at the point (a, 0). What is the value of a?",
  "A certain pond contains 64,000 algae cells. A treatment is added to the pond, causing the number of algae cells to decrease by one-half every 5 days. How many algae cells remained in the pond 30 days after the treatment was added?",
  "A certain lab population contains 120,000 fruit flies. A disease spreads through the population, causing the number of fruit flies to decrease by one-half every 2 days. How many fruit flies remained 8 days after the disease began to spread?",
  "The mass of a radioactive sample decreases by one-half every 6 hours. Exactly 2 days after a scientist began measuring it, the sample had a mass of 375 grams. What was the mass, in grams, of the sample when the scientist began measuring it?",
  "Based on the table, what is the median number of pets for these 60 students?",
  "Based on the table, what is the median number of books read for these 40 students?",
  "If the median number of goals scored per game is 3, what is the least possible value of n?",
  "A distance of 2,640 feet is equivalent to how many chains? (1 chain = 22 yards and 1 yard = 3 feet)",
  "A volume of 15 gallons is equivalent to how many cups? (1 gallon = 4 quarts and 1 quart = 4 cups)",
  "A car is traveling at a constant speed of 66 feet per second. What is the car's speed, in miles per hour? (1 mile = 8 furlongs, 1 furlong = 220 yards, and 1 yard = 3 feet)",
];

test("Oct 18 review keeps all 12 questions, the key, and no source blurb", () => {
  assert.equal(OCT18_SESSION_REVIEW_TITLE, "Oct 18 Session Review Quiz");
  assert.equal(OCT18_REVIEW_TIME_LIMIT_MINUTES, 25);
  assert.equal(isPostSessionFollowUpTitle(OCT18_SESSION_REVIEW_TITLE), true);
  assert.equal(/packet|sama|pdf|cover page/i.test(OCT18_REVIEW_INSTRUCTIONS), false);
  assert.equal(OCT18_REVIEW_QUESTIONS.length, 12);
  assert.deepEqual(
    OCT18_REVIEW_QUESTIONS.map((question) => question.key),
    Array.from({ length: 12 }, (_, index) => `oct18-q${String(index + 1).padStart(2, "0")}`),
  );
  assert.deepEqual(
    OCT18_REVIEW_QUESTIONS.map((question) => question.prompt),
    PROMPTS,
  );
  assert.deepEqual(
    OCT18_REVIEW_QUESTIONS.map((question) => question.questionType),
    ["spr", "spr", "spr", "multiple_choice", "multiple_choice", "multiple_choice", "multiple_choice", "multiple_choice", "spr", "multiple_choice", "multiple_choice", "spr"],
  );
  assert.deepEqual(
    OCT18_REVIEW_QUESTIONS.map((question) => question.correctAnswer),
    ["40", "17", "-8", "b", "a", "d", "b", "b", "8", "a", "c", "45"],
  );
  for (const question of OCT18_REVIEW_QUESTIONS) {
    const blob = `${question.prompt}\n${question.stimulus ?? ""}\n${question.explanation}`;
    assert.equal(/packet|from the oct 18|sama|cover page/i.test(blob), false);
    assert.ok(question.explanation.trim().length > 0);
    assert.ok(question.prompt.length >= 40);
  }
  assert.match(OCT18_REVIEW_QUESTIONS[0]!.explanation, /slope 1\/2/);
  assert.match(OCT18_REVIEW_QUESTIONS[2]!.explanation, /a = −8/);
  assert.match(OCT18_REVIEW_QUESTIONS[6]!.explanation, /30th and 31st/);
  assert.match(OCT18_REVIEW_QUESTIONS[8]!.explanation, /the 15th is 3/);
  assert.match(OCT18_REVIEW_QUESTIONS[11]!.explanation, /237,600 ÷ 5,280 = 45/);
  const source = readFileSync(new URL("./michelle-oct18-review-quiz.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /clerkClient|@clerk\/|sendEmail|nodemailer|resend/i);
});

test("free-response grading accepts equivalent numeric forms", () => {
  assert.equal(answersMatch("40", "40"), true);
  assert.equal(answersMatch("40.0", "40"), true);
  assert.equal(answersMatch("−8", "-8"), true);
  assert.equal(answersMatch("-8", "-8"), true);
  assert.equal(answersMatch("-8.0", "-8"), true);
  assert.equal(answersMatch("17", "17"), true);
  assert.equal(answersMatch("8.0", "8"), true);
  assert.equal(answersMatch("45", "45"), true);
  assert.equal(answersMatch("41", "40"), false);
  assert.equal(answersMatch("−7", "-8"), false);
  assert.equal(answersMatch("b", "b"), true);
  assert.equal(answersMatch("B", "b"), true);
  assert.equal(answersMatch("a", "b"), false);
});

test("every Oct 18 item stays answerable and its table renders", () => {
  const hidden: string[] = [];
  for (const draft of OCT18_REVIEW_QUESTIONS) {
    const repairedStimulus = draft.stimulus
      ? repairMichelleQuizMathText(draft.stimulus, "all", "stem")
      : null;
    const facing = studentFacingFigurePrimaryFields({
      prompt: draft.prompt,
      stimulus: repairedStimulus,
      choices: draft.choices,
      questionType: draft.questionType,
      correctAnswer: draft.correctAnswer,
      tags: ["xavier-authored-follow-up", OCT18_REVIEW_TAG, draft.key],
    });
    const answerable = isStudentAnswerableQuizQuestion({
      prompt: facing.prompt,
      stimulus: facing.stimulus,
      choices: facing.choices,
      presentation: facing.presentation,
      questionType: facing.questionType,
    });
    const served = isXavierAuthoredFollowUpQuestion({
      tags: ["xavier-authored-follow-up", OCT18_REVIEW_TAG, draft.key],
      questionType: draft.questionType,
      prompt: draft.prompt,
      correctAnswer: draft.correctAnswer,
      choices: draft.choices,
    });
    if (!answerable || !served || facing.presentation !== "text") hidden.push(draft.key);
    if (draft.stimulus) {
      const parts = splitQuizRichText(repairedStimulus);
      const table = parts.find((part) => part.type === "table");
      assert.ok(table && table.type === "table", `${draft.key} table`);
      if (table?.type === "table") {
        assert.equal(table.headers.length, 2);
        assert.ok(table.rows.length >= 2);
      }
    }
  }
  assert.deepEqual(hidden, []);
  const pets = OCT18_REVIEW_QUESTIONS[6]!;
  const parts = splitQuizRichText(pets.stimulus);
  assert.equal(parts[0]?.type, "text");
  assert.match(parts[0] && parts[0].type === "text" ? parts[0].value : "", /frequency table below/);
  assert.equal(parts[1]?.type, "table");
  const goals = OCT18_REVIEW_QUESTIONS[8]!;
  const goalTable = splitQuizRichText(goals.stimulus).find((part) => part.type === "table");
  assert.ok(goalTable && goalTable.type === "table");
  if (goalTable?.type === "table") {
    assert.deepEqual(goalTable.rows[2], ["3", "n"]);
  }
  const slope = OCT18_REVIEW_QUESTIONS[2]!;
  const slopeTable = splitQuizRichText(slope.stimulus).find((part) => part.type === "table");
  assert.ok(slopeTable && slopeTable.type === "table");
  if (slopeTable?.type === "table") {
    assert.deepEqual(slopeTable.rows, [
      ["4", "k"],
      ["10", "k + 9"],
      ["16", "2k"],
    ]);
  }
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "assigns the Oct 18 review only to Michelle and leaves her other quizzes alone",
  { skip: !hasDatabase },
  async () => {
    const { and, eq, inArray } = await import("drizzle-orm");
    const {
      assignmentQuestionsTable,
      assignmentsTable,
      attemptsTable,
      coursesTable,
      db,
      questionsTable,
      sessionsTable,
      usersTable,
    } = await import("@workspace/db");
    const { ensureMichelleOct18ReviewQuiz } = await import("./michelle-oct18-review-quiz.ts");
    const { SAT_MATH_FOLLOW_UP_TITLE } = await import("./post-session-follow-up.ts");
    const { TAITO_STUDENT_EMAIL } = await import("./session-schedule.ts");

    const suffix = randomUUID().slice(0, 8);
    const michelleEmail = `michelle-oct18-${suffix}@example.com`;
    const xavierEmail = `xavier-oct18-${suffix}@example.com`;
    const otherEmail = `other-oct18-${suffix}@example.com`;
    const michelleClerk = `user_michelle_${suffix}`;
    const xavierClerk = `user_xavier_${suffix}`;
    const createdUserIds: string[] = [];
    const createdSessionIds: string[] = [];
    const createdCourseIds: string[] = [];
    const now = new Date("2026-10-24T16:00:00.000Z");

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Oct 18 review ${suffix}`,
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
      const refused = await ensureMichelleOct18ReviewQuiz({
        now,
        identities: { michelleEmail: TAITO_STUDENT_EMAIL, michelleClerkUserId: `user_taito_${suffix}` },
      });
      assert.equal(refused.created, false);
      assert.equal(refused.assignmentId, null);

      const michelle = await insertUser(michelleEmail, "Michelle Fixture", "student", michelleClerk);
      const xavier = await insertUser(xavierEmail, "Xavier Fixture", "tutor", xavierClerk);
      const other = await insertUser(otherEmail, "Other Fixture", "student", `user_other_${suffix}`);
      const insertSession = async (clientUserId: string, dateTime: Date, title: string) => {
        const [created] = await db
          .insert(sessionsTable)
          .values({
            courseId: course!.id,
            clientUserId,
            tutorUserId: xavier.id,
            dateTime,
            timezone: "Asia/Dubai",
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
      await insertSession(michelle.id, new Date("2026-09-01T12:00:00.000Z"), "Older session");
      const latest = await insertSession(
        michelle.id,
        new Date("2026-10-18T12:00:00.000Z"),
        "Michelle’s SAT Session with Xavier",
      );
      await insertSession(other.id, new Date("2026-10-18T12:00:00.000Z"), "Other session");
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
          sessionId: latest.id,
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
      const first = await ensureMichelleOct18ReviewQuiz({ now, identities });
      assert.equal(first.created, true);
      assert.equal(first.questionCount, 12);
      assert.equal(first.timeLimitMinutes, 25);
      const [quiz] = await db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, first.assignmentId!));
      assert.equal(quiz?.title, "Oct 18 Session Review Quiz");
      assert.equal(quiz?.assignedStudentUserId, michelle.id);
      assert.equal(quiz?.assignedTutorUserId, xavier.id);
      assert.equal(quiz?.sessionId, latest.id);
      assert.equal(quiz?.timeLimitMinutes, 25);
      assert.equal(/packet|sama|pdf/i.test(quiz?.instructions ?? ""), false);
      const links = await db
        .select({
          id: questionsTable.id,
          position: assignmentQuestionsTable.position,
          prompt: questionsTable.prompt,
          questionType: questionsTable.questionType,
          correctAnswer: questionsTable.correctAnswer,
          tags: questionsTable.tags,
        })
        .from(assignmentQuestionsTable)
        .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
        .where(eq(assignmentQuestionsTable.assignmentId, first.assignmentId!))
        .orderBy(assignmentQuestionsTable.position);
      assert.equal(links.length, 12);
      assert.deepEqual(
        links.map((link) => link.prompt),
        PROMPTS,
      );
      assert.equal(links[0]?.questionType, "spr");
      assert.equal(links[0]?.correctAnswer, "40");
      assert.equal(links[3]?.correctAnswer, "b");
      assert.ok(links.every((link) => (link.tags ?? []).includes(OCT18_REVIEW_TAG)));

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
            eq(assignmentsTable.title, OCT18_SESSION_REVIEW_TITLE),
            eq(assignmentsTable.assignedStudentUserId, other.id),
          ),
        );
      assert.equal(otherQuizzes.length, 0);

      const questionIds = links.map((link) => link.id);
      const second = await ensureMichelleOct18ReviewQuiz({ now, identities });
      assert.equal(second.created, false);
      assert.equal(second.assignmentId, first.assignmentId);
      const secondLinks = await db
        .select({ id: assignmentQuestionsTable.questionId, position: assignmentQuestionsTable.position })
        .from(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, first.assignmentId!))
        .orderBy(assignmentQuestionsTable.position);
      assert.deepEqual(
        secondLinks.map((link) => link.id),
        questionIds,
      );
      assert.equal(secondLinks.length, 12);

      await db.insert(attemptsTable).values({
        assignmentId: first.assignmentId!,
        userId: michelle.id,
        status: "active",
      });
      const [firstQuestionId] = secondLinks;
      await db
        .update(questionsTable)
        .set({ prompt: "student started" })
        .where(eq(questionsTable.id, firstQuestionId!.id));
      const third = await ensureMichelleOct18ReviewQuiz({ now, identities });
      assert.equal(third.created, false);
      assert.match(third.skippedReason ?? "", /attempt/);
      const [keptAttemptQuestion] = await db
        .select({ prompt: questionsTable.prompt })
        .from(questionsTable)
        .where(eq(questionsTable.id, firstQuestionId!.id));
      assert.equal(keptAttemptQuestion?.prompt, "student started");
      const titled = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.title, OCT18_SESSION_REVIEW_TITLE),
            eq(assignmentsTable.assignedStudentUserId, michelle.id),
          ),
        );
      assert.equal(titled.length, 1);
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
