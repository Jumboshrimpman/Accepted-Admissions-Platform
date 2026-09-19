import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  bankQuestionsTable,
  coursesTable,
  db,
  questionsTable,
  sessionPreworkPlansTable,
  sessionsTable,
} from "@workspace/db";
import { isStudentUsableQuizItem } from "./sat-bank-diagnostic-quality.ts";
import { taitoSessionDateTime } from "./session-schedule.ts";
import {
  IELTS_STYLE_COPYRIGHT_NOTICE,
  IELTS_STYLE_PASSAGES,
  IELTS_STYLE_WRITING_TASKS,
  ieltsStyleReadingItems,
} from "./ielts-style-bank-content.ts";
import {
  IELTS_STYLE_DIAGNOSTIC_COUNT,
  IELTS_STYLE_ROUTINE_COUNT,
  assignEnglishPreworkFromBank,
  canAssignCleanEnglishQuizSet,
  ensureIeltsStyleBankImported,
  isIeltsStyleBankRow,
  selectIeltsStylePreworkItems,
} from "./ielts-style-bank.ts";

const FORBIDDEN = /cambridge|british council|\bidp\b|official ielts test/i;

test("seeded IELTS-style reading items are original, complete MCQs", () => {
  const items = ieltsStyleReadingItems();
  assert.equal(items.length, 48);
  assert.equal(IELTS_STYLE_PASSAGES.length, 8);
  assert.equal(IELTS_STYLE_WRITING_TASKS.length, 2);
  assert.match(IELTS_STYLE_COPYRIGHT_NOTICE, /Not official IELTS/);
  assert.match(IELTS_STYLE_COPYRIGHT_NOTICE, /Cambridge/);

  const diagnostic = items.filter((item) => item.set === "diagnostic");
  const routine1 = items.filter((item) => item.set === "routine-1");
  const routine2 = items.filter((item) => item.set === "routine-2");
  assert.equal(diagnostic.length, IELTS_STYLE_DIAGNOSTIC_COUNT);
  assert.equal(routine1.length, IELTS_STYLE_ROUTINE_COUNT);
  assert.equal(routine2.length, IELTS_STYLE_ROUTINE_COUNT);

  for (const item of items) {
    assert.doesNotMatch(item.stimulus, FORBIDDEN);
    assert.doesNotMatch(item.prompt, FORBIDDEN);
    assert.ok(item.stimulus.length > 400, item.passageId);
    assert.ok(item.prompt.length > 20, item.prompt);
    assert.equal(item.choices.length, 4);
    assert.deepEqual(
      item.choices.map((choice) => choice.id),
      ["a", "b", "c", "d"],
    );
    for (const choice of item.choices) {
      assert.ok(choice.text.trim().length > 8, choice.text);
    }
    assert.ok(item.choices.some((choice) => choice.id === item.correctAnswer));
    assert.ok(item.explanation.trim().length > 12);
    assert.equal(
      isStudentUsableQuizItem({
        prompt: item.prompt,
        stimulus: item.stimulus,
        choices: item.choices,
        questionType: "mcq",
        correctAnswer: item.correctAnswer,
        section: "reading",
        subject: "IELTS Reading",
        domain: item.domain,
        figures: [],
      }),
      true,
      item.prompt,
    );
  }
  assert.equal(
    canAssignCleanEnglishQuizSet(
      diagnostic.map((item) => ({
        id: item.passageId,
        prompt: item.prompt,
        stimulus: item.stimulus,
        choices: item.choices,
        questionType: "mcq",
        correctAnswer: item.correctAnswer,
        section: "reading",
        subject: "IELTS Reading",
        domain: item.domain,
        figures: [],
        extractGaps: {},
      })),
    ),
    true,
  );
});

test("English assign selects diagnostic module 1 and later routine modules without overlap", () => {
  const pool = ieltsStyleReadingItems().map((item, index) => ({
    id: `${item.passageId}-${index}`,
    module: item.module,
    questionType: "mcq",
    formCode: item.set,
  }));
  const diagnostic = selectIeltsStylePreworkItems(pool, { homeworkKind: "diagnostic" });
  const routine1 = selectIeltsStylePreworkItems(pool, { homeworkKind: "routine", setIndex: 1 });
  const routine2 = selectIeltsStylePreworkItems(pool, { homeworkKind: "routine", setIndex: 2 });
  assert.equal(diagnostic.length, 24);
  assert.equal(routine1.length, 12);
  assert.equal(routine2.length, 12);
  assert.ok(diagnostic.every((row) => row.module === 1));
  assert.ok(routine1.every((row) => row.module === 2));
  assert.ok(routine2.every((row) => row.module === 3));
  const ids = [...diagnostic, ...routine1, ...routine2].map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("assignEnglishPreworkFromBank seeds original items onto Taito English sessions", async () => {
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
});
