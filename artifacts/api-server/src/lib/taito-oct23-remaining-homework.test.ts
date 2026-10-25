import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OCT23_REMAINING_ASSIGNMENT_PREFIX,
  OCT23_REMAINING_MAX_ATTEMPTS,
  OCT23_REMAINING_SOURCE_ATTEMPT_ID,
  OCT23_REMAINING_TIME_LIMIT_MINUTES,
  OCT23_REMAINING_TITLE,
  unansweredQuestionIds,
} from "./taito-oct23-remaining-homework.ts";
import { TAITO_STUDENT_EMAIL } from "./session-schedule.ts";

test("unanswered Oct 23 questions keep source order and ignore blanks", () => {
  const questions = Array.from({ length: 10 }, (_, position) => ({
    questionId: `q${position}`,
    position,
  }));
  const responses = [
    { questionId: "q0", finalAnswer: "a" },
    { questionId: "q1", finalAnswer: "b" },
    { questionId: "q2", finalAnswer: "c" },
    { questionId: "q3", finalAnswer: "  d  " },
    { questionId: "q4", finalAnswer: "   " },
  ];
  assert.deepEqual(unansweredQuestionIds(questions, responses), [
    "q4",
    "q5",
    "q6",
    "q7",
    "q8",
    "q9",
  ]);
  assert.equal(OCT23_REMAINING_TITLE, "Oct 23 In-Session Practice — Remaining Questions");
  assert.equal(OCT23_REMAINING_TIME_LIMIT_MINUTES, 60);
  assert.equal(OCT23_REMAINING_MAX_ATTEMPTS, 2);
  assert.equal(OCT23_REMAINING_SOURCE_ATTEMPT_ID, "e38f62db-f088-435c-aa84-4c5480707f59");
  assert.equal(OCT23_REMAINING_ASSIGNMENT_PREFIX, "84c9dea1");
  assert.equal(TAITO_STUDENT_EMAIL, "taito0525@gmail.com");
  const source = readFileSync(new URL("./taito-oct23-remaining-homework.ts", import.meta.url), "utf8");
  const startup = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(startup, /ensureTaitoOct23RemainingHomework/);
  assert.doesNotMatch(source, /sendEmail|nodemailer|resend|clerkClient|@clerk\//i);
  assert.doesNotMatch(source, /correctAnswer/);
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "assigns only Taito's unanswered Oct 23 questions and leaves the original result",
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
      responsesTable,
      usersTable,
    } = await import("@workspace/db");
    const { ensureTaitoOct23RemainingHomework } = await import(
      "./taito-oct23-remaining-homework.ts"
    );
    const suffix = randomUUID().slice(0, 8);
    const studentEmail = `taito-oct23-${suffix}@example.invalid`;
    const createdUserIds: string[] = [];
    const createdCourseIds: string[] = [];
    const createdQuestionIds: string[] = [];
    const createdAssignmentIds: string[] = [];
    const createdAttemptIds: string[] = [];
    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Oct 23 remaining ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    createdCourseIds.push(course!.id);
    const insertUser = async (email: string, role: "student") => {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `user_${role}_${suffix}_${email.slice(0, 12)}`,
          email,
          displayName: "Oct 23 Fixture",
          role,
        })
        .returning();
      createdUserIds.push(created!.id);
      return created!;
    };
    try {
      const student = await insertUser(studentEmail, "student");
      const other = await insertUser(`other-oct23-${suffix}@example.invalid`, "student");
      const sourceAssignmentId = `${OCT23_REMAINING_ASSIGNMENT_PREFIX}-0000-4000-8000-${suffix}0000`.slice(0, 36);
      const [sourceAssignment] = await db
        .insert(assignmentsTable)
        .values({
          id: sourceAssignmentId,
          courseId: course!.id,
          deliveryPhase: "during_session",
          title: `Oct 23 source ${suffix}`,
          subject: "SAT",
          instructions: "Original in-session set",
          status: "published",
          timeLimitMinutes: 30,
          maxAttempts: 1,
        })
        .returning();
      createdAssignmentIds.push(sourceAssignment!.id);
      const questionIds: string[] = [];
      for (let index = 0; index < 10; index += 1) {
        const [question] = await db
          .insert(questionsTable)
          .values({
            subject: "SAT",
            domain: "SAT",
            skill: "Fixture",
            questionType: "multiple_choice",
            difficulty: "medium",
            prompt: `Oct 23 fixture stem ${suffix} ${index}`,
            choices: [
              { id: "a", label: "A", text: "one" },
              { id: "b", label: "B", text: "two" },
            ],
            correctAnswer: "a",
            explanation: "Fixture explanation",
            reviewStatus: "reviewed",
          })
          .returning();
        questionIds.push(question!.id);
        createdQuestionIds.push(question!.id);
        await db.insert(assignmentQuestionsTable).values({
          assignmentId: sourceAssignment!.id,
          questionId: question!.id,
          position: index,
          predictionFirst: false,
        });
      }
      const sourceResult = { score: 40, history: true };
      const [sourceAttempt] = await db
        .insert(attemptsTable)
        .values({
          assignmentId: sourceAssignment!.id,
          userId: student.id,
          status: "expired",
          result: sourceResult,
          score: 40,
        })
        .returning();
      createdAttemptIds.push(sourceAttempt!.id);
      for (let index = 0; index < 5; index += 1) {
        await db.insert(responsesTable).values({
          attemptId: sourceAttempt!.id,
          questionId: questionIds[index]!,
          finalAnswer: index === 4 ? "   " : "a",
        });
      }
      const [otherAssignment] = await db
        .insert(assignmentsTable)
        .values({
          courseId: course!.id,
          deliveryPhase: "during_session",
          title: `Other source ${suffix}`,
          subject: "SAT",
          instructions: "Other",
          status: "published",
          timeLimitMinutes: 30,
          maxAttempts: 1,
        })
        .returning();
      createdAssignmentIds.push(otherAssignment!.id);
      const [otherAttempt] = await db
        .insert(attemptsTable)
        .values({
          assignmentId: otherAssignment!.id,
          userId: other.id,
          status: "expired",
          result: { score: 1 },
          score: 1,
        })
        .returning();
      createdAttemptIds.push(otherAttempt!.id);

      const missing = await ensureTaitoOct23RemainingHomework({
        attemptId: randomUUID(),
        studentEmail,
      });
      assert.equal(missing.action, "skipped");
      assert.equal(missing.remaining, 0);

      const wrongStudent = await ensureTaitoOct23RemainingHomework({
        attemptId: otherAttempt!.id,
        assignmentIdPrefix: otherAssignment!.id.slice(0, 8),
        studentEmail,
      });
      assert.equal(wrongStudent.action, "skipped");
      assert.equal(wrongStudent.reason, "student_mismatch");

      const created = await ensureTaitoOct23RemainingHomework({
        attemptId: sourceAttempt!.id,
        studentEmail,
      });
      assert.equal(created.action, "created");
      assert.equal(created.remaining, 6);
      assert.equal(created.linked, 6);
      const [homework] = await db
        .select()
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.title, OCT23_REMAINING_TITLE),
            eq(assignmentsTable.assignedStudentUserId, student.id),
          ),
        );
      assert.ok(homework);
      createdAssignmentIds.push(homework!.id);
      assert.equal(homework?.sessionId, null);
      assert.equal(homework?.deliveryPhase, "before_session");
      assert.equal(Number(homework?.timeLimitMinutes), 60);
      assert.equal(Number(homework?.maxAttempts), 2);
      assert.equal(homework?.assignedStudentUserId, student.id);
      const links = await db
        .select({ questionId: assignmentQuestionsTable.questionId })
        .from(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, homework!.id))
        .orderBy(assignmentQuestionsTable.position);
      assert.deepEqual(
        links.map((link) => link.questionId),
        questionIds.slice(4),
      );
      const [sourceAfter] = await db
        .select()
        .from(attemptsTable)
        .where(eq(attemptsTable.id, sourceAttempt!.id));
      assert.equal(sourceAfter?.status, "expired");
      assert.deepEqual(sourceAfter?.result, sourceResult);
      assert.equal(Number(sourceAfter?.score), 40);
      const [sourceAssignmentAfter] = await db
        .select({
          timeLimitMinutes: assignmentsTable.timeLimitMinutes,
          maxAttempts: assignmentsTable.maxAttempts,
        })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, sourceAssignment!.id));
      assert.equal(Number(sourceAssignmentAfter?.timeLimitMinutes), 30);
      assert.equal(Number(sourceAssignmentAfter?.maxAttempts), 1);

      const again = await ensureTaitoOct23RemainingHomework({
        attemptId: sourceAttempt!.id,
        studentEmail,
      });
      assert.equal(again.action, "unchanged");
      assert.equal(again.remaining, 6);
      assert.equal(again.created, false);
      const copies = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.title, OCT23_REMAINING_TITLE),
            eq(assignmentsTable.assignedStudentUserId, student.id),
          ),
        );
      assert.equal(copies.length, 1);
      const [otherHomework] = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.assignedStudentUserId, other.id));
      assert.equal(otherHomework, undefined);
    } finally {
      if (createdAssignmentIds.length > 0) {
        await db.delete(responsesTable).where(
          inArray(
            responsesTable.attemptId,
            createdAttemptIds.length > 0 ? createdAttemptIds : ["00000000-0000-4000-8000-000000000000"],
          ),
        );
        await db.delete(attemptsTable).where(inArray(attemptsTable.assignmentId, createdAssignmentIds));
        await db
          .delete(assignmentQuestionsTable)
          .where(inArray(assignmentQuestionsTable.assignmentId, createdAssignmentIds));
        await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, createdAssignmentIds));
      }
      if (createdQuestionIds.length > 0) {
        await db.delete(questionsTable).where(inArray(questionsTable.id, createdQuestionIds));
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
