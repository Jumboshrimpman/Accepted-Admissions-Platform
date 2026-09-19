import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "assignEnglishPreworkFromBank seeds original items onto Taito English sessions",
  { skip: !hasDatabase },
  async () => {
    const { eq, inArray } = await import("drizzle-orm");
    const {
      assignmentQuestionsTable,
      assignmentsTable,
      bankQuestionsTable,
      coursesTable,
      db,
      questionsTable,
      sessionPreworkPlansTable,
      sessionsTable,
    } = await import("@workspace/db");
    const { taitoSessionDateTime } = await import("./session-schedule.ts");
    const {
      assignEnglishPreworkFromBank,
      ensureIeltsStyleBankImported,
      isIeltsStyleBankRow,
    } = await import("./ielts-style-bank.ts");

    const suffix = randomUUID();
    const createdAssignmentIds: string[] = [];
    const createdQuestionIds: string[] = [];
    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `IELTS prework fixture ${suffix}`,
        subject: "SAT & IELTS",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    const [englishSession] = await db
      .insert(sessionsTable)
      .values({
        courseId: course!.id,
        dateTime: taitoSessionDateTime("2026-10-23"),
        timezone: "Asia/Tokyo",
        subject: "IELTS",
        title: "Taito’s English Session with Nika",
        status: "published",
        hasHomework: false,
      })
      .returning();
    const [laterEnglish] = await db
      .insert(sessionsTable)
      .values({
        courseId: course!.id,
        dateTime: taitoSessionDateTime("2026-11-13"),
        timezone: "Asia/Tokyo",
        subject: "IELTS",
        title: "Taito’s English Session with Nika",
        status: "published",
        hasHomework: false,
      })
      .returning();
    const [satSession] = await db
      .insert(sessionsTable)
      .values({
        courseId: course!.id,
        dateTime: taitoSessionDateTime("2026-10-02"),
        timezone: "Asia/Tokyo",
        subject: "SAT",
        title: "Taito’s SAT Session with Eunice",
        status: "published",
        hasHomework: true,
      })
      .returning();
    try {
      const seeded = await ensureIeltsStyleBankImported();
      const bankRows = await db
        .select()
        .from(bankQuestionsTable)
        .where(eq(bankQuestionsTable.collectionId, seeded.collectionId));
      assert.ok(bankRows.length >= 50);
      assert.ok(bankRows.every((row) => isIeltsStyleBankRow(row)));
      assert.ok(bankRows.some((row) => row.section === "writing"));

      const diagnostic = await assignEnglishPreworkFromBank({
        sessionId: englishSession!.id,
        homeworkKind: "diagnostic",
      });
      createdAssignmentIds.push(diagnostic.assignmentId);
      assert.equal(diagnostic.questionCount, 24);
      assert.equal(diagnostic.homeworkKind, "diagnostic");
      assert.match(diagnostic.assignmentId, /./);

      const routine = await assignEnglishPreworkFromBank({
        sessionId: laterEnglish!.id,
        homeworkKind: "routine",
        setIndex: 1,
      });
      createdAssignmentIds.push(routine.assignmentId);
      assert.equal(routine.questionCount, 12);

      const linked = await db
        .select({
          assignmentId: assignmentQuestionsTable.assignmentId,
          questionId: assignmentQuestionsTable.questionId,
        })
        .from(assignmentQuestionsTable)
        .where(inArray(assignmentQuestionsTable.assignmentId, createdAssignmentIds));
      createdQuestionIds.push(...linked.map((row) => row.questionId));
      const questions = await db
        .select()
        .from(questionsTable)
        .where(inArray(questionsTable.id, createdQuestionIds));
      assert.ok(questions.every((question) => question.subject === "IELTS Reading"));
      assert.ok(questions.every((question) => question.choices.length === 4));
      assert.ok(questions.every((question) => question.sourceType === "original"));

      await assert.rejects(
        () => assignEnglishPreworkFromBank({ sessionId: satSession!.id, homeworkKind: "routine" }),
        (error: unknown) => {
          assert.equal((error as { status?: number }).status, 409);
          assert.match((error as Error).message, /English or IELTS/);
          return true;
        },
      );
    } finally {
      if (createdAssignmentIds.length > 0) {
        await db
          .delete(sessionPreworkPlansTable)
          .where(inArray(sessionPreworkPlansTable.assignmentId, createdAssignmentIds));
        await db
          .delete(assignmentQuestionsTable)
          .where(inArray(assignmentQuestionsTable.assignmentId, createdAssignmentIds));
        await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, createdAssignmentIds));
      }
      if (createdQuestionIds.length > 0) {
        await db
          .update(bankQuestionsTable)
          .set({ linkedQuestionId: null, updatedAt: new Date() })
          .where(inArray(bankQuestionsTable.linkedQuestionId, createdQuestionIds));
        await db.delete(questionsTable).where(inArray(questionsTable.id, createdQuestionIds));
      }
      await db
        .delete(sessionsTable)
        .where(inArray(sessionsTable.id, [englishSession!.id, laterEnglish!.id, satSession!.id]));
      await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
    }
  },
);
