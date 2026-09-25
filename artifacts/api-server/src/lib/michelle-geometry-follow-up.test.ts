import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  isCompletedXavierSession,
  pickMostRecentCompletedSession,
} from "./michelle-geometry-follow-up-select.ts";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test("completed follow-up sessions skip cancelled, archived, and future meetings", () => {
  const now = new Date("2026-09-25T04:00:00.000Z");
  const older = {
    id: "older",
    dateTime: new Date("2026-09-10T16:00:00.000Z"),
    status: "completed",
    bookingStatus: "confirmed",
    cancelledAt: null,
  };
  const latest = {
    id: "latest",
    dateTime: new Date("2026-09-20T16:00:00.000Z"),
    status: "published",
    bookingStatus: "confirmed",
    cancelledAt: null,
  };
  const cancelled = {
    id: "cancelled",
    dateTime: new Date("2026-09-22T16:00:00.000Z"),
    status: "published",
    bookingStatus: "cancelled",
    cancelledAt: new Date("2026-09-21T16:00:00.000Z"),
  };
  const future = {
    id: "future",
    dateTime: new Date("2026-10-02T16:00:00.000Z"),
    status: "published",
    bookingStatus: "confirmed",
    cancelledAt: null,
  };
  assert.equal(isCompletedXavierSession(cancelled, now), false);
  assert.equal(isCompletedXavierSession(future, now), false);
  assert.equal(isCompletedXavierSession(latest, now), true);
  assert.equal(
    isCompletedXavierSession(
      { ...latest, bookingStatus: "rescheduled", status: "published" },
      now,
    ),
    true,
  );
  assert.equal(
    pickMostRecentCompletedSession([future, cancelled, older, latest], now)?.id,
    "latest",
  );
});

test(
  "assigns Geometry SAT Questions only to Michelle's latest completed Xavier session",
  { skip: !hasDatabase },
  async () => {
    const { and, eq, inArray } = await import("drizzle-orm");
    const {
      assignmentQuestionsTable,
      assignmentsTable,
      coursesTable,
      db,
      questionsTable,
      sessionsTable,
      usersTable,
    } = await import("@workspace/db");
    const { ensureMichelleGeometryFollowUp } = await import(
      "./michelle-geometry-follow-up.ts"
    );
    const { GEOMETRY_SAT_FOLLOW_UP_TITLE, GEOMETRY_SAT_QUESTIONS } = await import(
      "./michelle-geometry-sat-questions.ts"
    );

    const suffix = randomUUID().slice(0, 8);
    const michelleEmail = `michelle-geometry-${suffix}@example.com`;
    const xavierEmail = `xavier-geometry-${suffix}@example.com`;
    const taitoEmail = `taito-geometry-${suffix}@example.com`;
    const michelleClerk = `user_michelle_${suffix}`;
    const xavierClerk = `user_xavier_${suffix}`;
    const createdUserIds: string[] = [];
    const createdSessionIds: string[] = [];
    const createdCourseIds: string[] = [];

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Geometry follow-up ${suffix}`,
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

    const michelle = await insertUser(
      michelleEmail,
      "Michelle Fixture",
      "student",
      michelleClerk,
    );
    const xavier = await insertUser(xavierEmail, "Xavier Fixture", "tutor", xavierClerk);
    const taito = await insertUser(taitoEmail, "Taito Fixture", "student", `user_taito_${suffix}`);

    const insertSession = async (input: {
      clientUserId: string;
      tutorUserId: string;
      dateTime: Date;
      title: string;
      bookingStatus?: string;
      cancelledAt?: Date | null;
    }) => {
      const [created] = await db
        .insert(sessionsTable)
        .values({
          courseId: course!.id,
          clientUserId: input.clientUserId,
          tutorUserId: input.tutorUserId,
          dateTime: input.dateTime,
          timezone: "Asia/Dubai",
          subject: "SAT",
          title: input.title,
          status: "published",
          bookingStatus: input.bookingStatus ?? "confirmed",
          cancelledAt: input.cancelledAt ?? null,
          durationMinutes: 60,
        })
        .returning();
      createdSessionIds.push(created!.id);
      return created!;
    };

    await insertSession({
      clientUserId: michelle.id,
      tutorUserId: xavier.id,
      dateTime: new Date("2026-09-01T12:00:00.000Z"),
      title: "Michelle’s older SAT Session with Xavier",
    });
    const latest = await insertSession({
      clientUserId: michelle.id,
      tutorUserId: xavier.id,
      dateTime: new Date("2026-09-20T12:00:00.000Z"),
      title: "Michelle’s SAT Session with Xavier",
    });
    await insertSession({
      clientUserId: michelle.id,
      tutorUserId: xavier.id,
      dateTime: new Date("2026-09-22T12:00:00.000Z"),
      title: "Michelle’s cancelled SAT Session with Xavier",
      bookingStatus: "cancelled",
      cancelledAt: new Date("2026-09-21T12:00:00.000Z"),
    });
    await insertSession({
      clientUserId: michelle.id,
      tutorUserId: xavier.id,
      dateTime: new Date("2026-10-20T12:00:00.000Z"),
      title: "Michelle’s future SAT Session with Xavier",
    });
    await insertSession({
      clientUserId: taito.id,
      tutorUserId: xavier.id,
      dateTime: new Date("2026-09-24T12:00:00.000Z"),
      title: "Taito’s SAT Session with Xavier",
    });

    const identities = {
      michelleEmail,
      michelleClerkUserId: michelleClerk,
      xavierEmail,
      xavierClerkUserId: xavierClerk,
      xavierDuplicateClerkUserId: `user_xavier_dup_${suffix}`,
    };
    const now = new Date("2026-09-25T04:00:00.000Z");

    try {
      const refused = await ensureMichelleGeometryFollowUp({
        now,
        identities: { ...identities, michelleEmail: "taito0525@gmail.com" },
      });
      assert.equal(refused.created, false);
      assert.equal(refused.assignmentId, null);

      const first = await ensureMichelleGeometryFollowUp({ now, identities });
      assert.equal(first.created, true);
      assert.equal(first.sessionId, latest.id);
      assert.equal(first.sessionDateTime, latest.dateTime.toISOString());
      assert.equal(first.questionCount, 12);
      assert.equal(first.sessionTitle, "Michelle’s SAT Session with Xavier");

      const second = await ensureMichelleGeometryFollowUp({ now, identities });
      assert.equal(second.created, false);
      assert.equal(second.refreshed, false);
      assert.equal(second.assignmentId, first.assignmentId);
      assert.equal(second.questionCount, 12);

      const quizzes = await db
        .select()
        .from(assignmentsTable)
        .where(
          and(
            inArray(assignmentsTable.sessionId, createdSessionIds),
            eq(assignmentsTable.title, GEOMETRY_SAT_FOLLOW_UP_TITLE),
          ),
        );
      assert.equal(quizzes.length, 1);
      assert.equal(quizzes[0]?.sessionId, latest.id);
      assert.equal(quizzes[0]?.status, "published");
      assert.equal(quizzes[0]?.deadline, null);
      assert.equal(quizzes[0]?.deliveryPhase, "before_session");

      const links = await db
        .select({ question: questionsTable })
        .from(assignmentQuestionsTable)
        .innerJoin(
          questionsTable,
          eq(questionsTable.id, assignmentQuestionsTable.questionId),
        )
        .where(eq(assignmentQuestionsTable.assignmentId, quizzes[0]!.id));
      assert.equal(links.length, 12);
      for (const link of links) {
        assert.equal(link.question.explanation, "");
        assert.equal(link.question.difficulty, "hard");
        assert.equal(link.question.sourceType, "original");
        assert.equal(link.question.questionType, "multiple_choice");
        assert.match(link.question.stimulus ?? "", /\/media\/geometry\/michelle-sat\//);
      }

      const stale = links[0]!.question;
      const draft = GEOMETRY_SAT_QUESTIONS.find((item) =>
        (stale.tags ?? []).includes(item.key),
      );
      assert.ok(draft);
      await db
        .update(questionsTable)
        .set({ prompt: "stale geometry stem", correctAnswer: "c" })
        .where(eq(questionsTable.id, stale.id));
      const refreshed = await ensureMichelleGeometryFollowUp({ now, identities });
      assert.equal(refreshed.created, false);
      assert.equal(refreshed.refreshed, true);
      assert.equal(refreshed.updatedQuestionCount, 1);
      const [restored] = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, stale.id));
      assert.equal(restored?.prompt, draft.prompt);
      assert.equal(restored?.correctAnswer, draft.correctAnswer);
      assert.equal(restored?.explanation, "");
    } finally {
      const assignmentIds = (
        await db
          .select({ id: assignmentsTable.id })
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.sessionId, createdSessionIds))
      ).map((row) => row.id);
      if (assignmentIds.length > 0) {
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
