import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  adminNotificationsTable,
  assignmentQuestionsTable,
  assignmentsTable,
  bankQuestionsTable,
  coursesTable,
  curriculumBlocksTable,
  db,
  examSourceCollectionsTable,
  questionsTable,
  sessionPreworkPlansTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { canAssignCleanStudentQuizSet } from "./sat-bank-diagnostic-quality.ts";
import { ensureHardChallengeReserve } from "./sat-hard-reserve.ts";
import { ensureHardSatPrework } from "./sat-hard-sets.ts";
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";

const choices = ["A", "B", "C", "D"].map((label) => ({
  id: label.toLowerCase(),
  label,
  text: label === "A" ? "selecting" : label === "B" ? "inspecting" : label === "C" ? "creating" : "deciding",
}));

function readingItem(index: number) {
  return {
    id: `rw-${index}`,
    section: "rw",
    prompt: "Which choice completes the text with the most logical and precise word or phrase?",
    choices,
    questionType: "mcq",
    correctAnswer: "A",
  };
}

test("rw-only pre-work clears the assign bar and does not repeat the reserve", async () => {
  const reading = Array.from({ length: 40 }, (_, index) => readingItem(index + 1));
  assert.equal(canAssignCleanStudentQuizSet(reading), false);
  assert.equal(canAssignCleanStudentQuizSet(reading, { allowSingleSection: true }), true);
  assert.equal(
    canAssignCleanStudentQuizSet(
      [{ ...reading[0]!, id: "junk", prompt: "2 –4x –7x = –36" }],
      { allowSingleSection: true },
    ),
    false,
  );

  const [{ officialCount }] = await db
    .select({ officialCount: sql<number>`count(*)` })
    .from(bankQuestionsTable)
    .where(eq(bankQuestionsTable.sourceKind, "official_extract"));
  assert.equal(Number(officialCount ?? 0), 0);

  const suffix = randomUUID();
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, SOPHIA_SLEIMAN_SAT_USER_ID))
    .limit(1);
  const createdStudent = !existing;
  const student = existing ?? (await db
    .insert(usersTable)
    .values({
      id: SOPHIA_SLEIMAN_SAT_USER_ID,
      clerkUserId: `sophia-rw-${suffix}`,
      email: `sophia-rw-${suffix}@example.invalid`,
      displayName: "Sophia Sleiman",
      role: "student",
    })
    .returning())[0]!;
  const [course] = await db
    .insert(coursesTable)
    .values({ title: `RW prework ${suffix}`, subject: "SAT", term: "Fall 2026", status: "active" })
    .returning();
  const [collection] = await db
    .insert(examSourceCollectionsTable)
    .values({
      examFamily: "sat",
      examVariant: "digital",
      practiceTestNumber: 4,
      title: `RW prework bank ${suffix}`,
      slug: `rw-prework-${suffix}`,
      extractStatus: "complete",
    })
    .returning();
  const row = (form: number, module: number, questionNumber: number) => ({
    sourceKey: `rw-prework-${suffix}-pt${form}-m${module}-q${questionNumber}`,
    collectionId: collection!.id,
    examFamily: "sat",
    examVariant: "digital",
    practiceTestNumber: form,
    section: "rw" as const,
    module,
    questionNumber,
    position: form * 1000 + module * 100 + questionNumber,
    prompt: "Which choice completes the text with the most logical and precise word or phrase?",
    choices,
    correctAnswer: "A",
    officialExplanation: "The cited choice fits the sentence.",
    figures: [],
    questionType: "mcq",
    estimatedSeconds: 90,
    sourceKind: "official_extract",
    extractGaps: {},
  });
  await db.insert(bankQuestionsTable).values([
    ...Array.from({ length: 37 }, (_, index) => row(4, 1, index + 1)),
    ...Array.from({ length: 3 }, (_, index) => row(4, 2, 20 + index)),
    ...Array.from({ length: 48 }, (_, index) => row(5, 1, index + 1)),
    ...Array.from({ length: 2 }, (_, index) => row(5, 2, 20 + index)),
  ]);
  const [session] = await db
    .insert(sessionsTable)
    .values({
      courseId: course!.id,
      clientUserId: student.id,
      dateTime: new Date("2026-11-04T15:00:00.000Z"),
      timezone: "America/New_York",
      subject: "SAT",
      title: "Sophia’s SAT Session with Eunice",
      status: "published",
      bookingStatus: "confirmed",
    })
    .returning();

  try {
    const reserve = await ensureHardChallengeReserve(session!);
    assert.equal(reserve.action, "created");
    assert.equal(reserve.questionCount, 5);
    const prework = await ensureHardSatPrework(session!, student.id);
    assert.equal(prework.action, "assigned");
    if (prework.action !== "assigned") return;
    assert.equal(prework.result.questionCount, 40);
    const links = await db
      .select({
        sourceKey: bankQuestionsTable.sourceKey,
        practiceTestNumber: bankQuestionsTable.practiceTestNumber,
        reserve: assignmentsTable.hardChallengeReserve,
      })
      .from(assignmentQuestionsTable)
      .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignmentQuestionsTable.assignmentId))
      .innerJoin(
        bankQuestionsTable,
        eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
      )
      .where(
        and(eq(assignmentsTable.sessionId, session!.id), ne(assignmentsTable.status, "archived")),
      );
    const reserveKeys = links.filter((row) => row.reserve).map((row) => row.sourceKey);
    const preworkLinks = links.filter((row) => !row.reserve);
    const preworkKeys = new Set(preworkLinks.map((row) => row.sourceKey));
    assert.equal(reserveKeys.length, 5);
    assert.equal(preworkKeys.size, 40);
    assert.equal(reserveKeys.some((key) => preworkKeys.has(key)), false);
    assert.equal(new Set(preworkLinks.map((row) => Number(row.practiceTestNumber))).size, 1);
  } finally {
    const assignmentRows = await db
      .select({ id: assignmentsTable.id })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.sessionId, session!.id));
    const assignmentIds = assignmentRows.map((row) => row.id);
    if (assignmentIds.length > 0) {
      await db.delete(assignmentQuestionsTable).where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds));
    }
    await db.delete(sessionPreworkPlansTable).where(eq(sessionPreworkPlansTable.sessionId, session!.id));
    await db.delete(adminNotificationsTable).where(eq(adminNotificationsTable.sessionId, session!.id));
    await db.delete(curriculumBlocksTable).where(eq(curriculumBlocksTable.sessionId, session!.id));
    if (assignmentIds.length > 0) {
      await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, assignmentIds));
    }
    const linked = await db
      .select({ questionId: bankQuestionsTable.linkedQuestionId })
      .from(bankQuestionsTable)
      .where(eq(bankQuestionsTable.collectionId, collection!.id));
    const questionIds = linked.flatMap((row) => (row.questionId ? [row.questionId] : []));
    await db.update(bankQuestionsTable).set({ linkedQuestionId: null }).where(eq(bankQuestionsTable.collectionId, collection!.id));
    if (questionIds.length > 0) {
      await db.delete(questionsTable).where(inArray(questionsTable.id, questionIds));
    }
    await db.delete(bankQuestionsTable).where(eq(bankQuestionsTable.collectionId, collection!.id));
    await db.delete(examSourceCollectionsTable).where(eq(examSourceCollectionsTable.id, collection!.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session!.id));
    await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
    if (createdStudent) await db.delete(usersTable).where(eq(usersTable.id, student.id));
  }
});
