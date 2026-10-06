import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "attaches SAT Math, Factoring, and notes to Michelle's latest Xavier session and previews them for Sama",
  { skip: !hasDatabase },
  async () => {
    const { and, asc, eq, inArray, sql } = await import("drizzle-orm");
    const {
      assignmentQuestionsTable,
      assignmentsTable,
      attemptsTable,
      coursesTable,
      curriculumBlocksTable,
      curriculumLibraryAssetsTable,
      db,
      questionsTable,
      sessionsTable,
      timerEventsTable,
      usersTable,
    } = await import("@workspace/db");
    const { ensureMichelleXavierSessionFollowUps } = await import(
      "./michelle-xavier-session-follow-up.ts"
    );
    const {
      FACTORING_NOTES_PUBLIC_PATH,
      FACTORING_NOTES_SEED_KEY,
      FACTORING_QUIZ_TIME_LIMIT_MINUTES,
      SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES,
    } = await import("./xavier-follow-up-content.ts");
    const {
      FACTORING_QUIZ_FOLLOW_UP_TITLE,
      GEOMETRY_SAT_FOLLOW_UP_TITLE,
      SAT_MATH_FOLLOW_UP_TITLE,
    } = await import("./post-session-follow-up.ts");

    const suffix = randomUUID().slice(0, 8);
    const michelleEmail = `michelle-follow-${suffix}@example.com`;
    const samaEmail = `sama-follow-${suffix}@example.com`;
    const xavierEmail = `xavier-follow-${suffix}@example.com`;
    const michelleClerk = `user_michelle_follow_${suffix}`;
    const samaClerk = `user_sama_follow_${suffix}`;
    const xavierClerk = `user_xavier_follow_${suffix}`;
    const now = new Date("2026-10-06T12:00:00.000Z");
    const identities = {
      michelleEmail,
      michelleClerkUserId: michelleClerk,
      samaEmail,
      samaClerkUserId: samaClerk,
      xavierEmail,
      xavierClerkUserId: xavierClerk,
      xavierDuplicateClerkUserId: `user_xavier_dup_${suffix}`,
    };
    const createdUserIds: string[] = [];
    const createdSessionIds: string[] = [];
    const createdCourseIds: string[] = [];
    const [existingNotes] = await db
      .select({ id: curriculumLibraryAssetsTable.id })
      .from(curriculumLibraryAssetsTable)
      .where(eq(curriculumLibraryAssetsTable.title, "Factoring Notes"))
      .limit(1);

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Xavier follow-up ${suffix}`,
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
    const michelle = await insertUser(michelleEmail, "Michelle Fixture", "student", michelleClerk);
    const sama = await insertUser(samaEmail, "Sama Fixture", "student", samaClerk);
    const xavier = await insertUser(xavierEmail, "Xavier Fixture", "tutor", xavierClerk);

    const insertSession = async (input: {
      clientUserId: string;
      dateTime: Date;
      title: string;
    }) => {
      const [created] = await db
        .insert(sessionsTable)
        .values({
          courseId: course!.id,
          clientUserId: input.clientUserId,
          tutorUserId: xavier.id,
          dateTime: input.dateTime,
          timezone: "Asia/Dubai",
          subject: "SAT",
          title: input.title,
          status: "published",
          bookingStatus: "confirmed",
          durationMinutes: 60,
        })
        .returning();
      createdSessionIds.push(created!.id);
      return created!;
    };

    await insertSession({
      clientUserId: michelle.id,
      dateTime: new Date("2026-09-01T12:00:00.000Z"),
      title: "Older Michelle session",
    });
    const latest = await insertSession({
      clientUserId: michelle.id,
      dateTime: new Date("2026-09-20T12:00:00.000Z"),
      title: "Latest Michelle session",
    });
    await insertSession({
      clientUserId: michelle.id,
      dateTime: new Date("2026-10-20T12:00:00.000Z"),
      title: "Future Michelle session",
    });
    const samaSession = await insertSession({
      clientUserId: sama.id,
      dateTime: new Date("2026-10-02T20:00:00.000Z"),
      title: `SAT capability test — Xavier ${suffix}`,
    });

    const [geometryQuestion] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Math",
        domain: "Geometry",
        skill: "area",
        questionType: "multiple_choice",
        difficulty: "medium",
        prompt: "What is the area of the rectangle that stays untouched?",
        choices: [
          { id: "a", label: "A", text: "12" },
          { id: "b", label: "B", text: "18" },
          { id: "c", label: "C", text: "24" },
          { id: "d", label: "D", text: "36" },
        ],
        correctAnswer: "c",
        explanation: "Geometry follow-up stays as history.",
        sourceType: "original",
        reviewStatus: "approved",
        tags: ["geometry-sat-follow-up"],
        generationMethod: "session-copy",
      })
      .returning();
    const [geometryAssignment] = await db
      .insert(assignmentsTable)
      .values({
        courseId: course!.id,
        sessionId: latest.id,
        deliveryPhase: "before_session",
        title: GEOMETRY_SAT_FOLLOW_UP_TITLE,
        subject: "SAT Math",
        instructions: "Existing geometry follow-up.",
        status: "published",
        timeLimitMinutes: 30,
        maxAttempts: 1,
      })
      .returning();
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: geometryAssignment!.id,
      questionId: geometryQuestion!.id,
      position: 0,
      predictionFirst: false,
    });

    try {
      const first = await ensureMichelleXavierSessionFollowUps({ now, identities });
      assert.equal(first.satMath.michelle.sessionId, latest.id);
      assert.equal(first.satMath.michelle.questionCount, 22);
      assert.equal(first.satMath.michelle.timeLimitMinutes, SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES);
      assert.equal(first.factoring.michelle.sessionId, latest.id);
      assert.equal(first.factoring.michelle.questionCount, 26);
      assert.equal(first.factoring.michelle.timeLimitMinutes, FACTORING_QUIZ_TIME_LIMIT_MINUTES);
      assert.equal(first.satMath.sama.sessionId, null);
      assert.equal(first.satMath.sama.questionCount, 22);
      assert.equal(first.factoring.sama.sessionId, null);
      assert.equal(first.factoring.sama.questionCount, 26);
      assert.equal(first.notes.michelle.sessionId, latest.id);
      assert.equal(first.notes.michelle.resourcePath, FACTORING_NOTES_PUBLIC_PATH);
      assert.equal(first.notes.sama.sessionId, samaSession.id);

      const loadAssignment = async (id: string | null) => {
        const [row] = await db
          .select()
          .from(assignmentsTable)
          .where(eq(assignmentsTable.id, id!))
          .limit(1);
        const links = await db
          .select({
            position: assignmentQuestionsTable.position,
            tags: questionsTable.tags,
            questionType: questionsTable.questionType,
          })
          .from(assignmentQuestionsTable)
          .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
          .where(eq(assignmentQuestionsTable.assignmentId, id!))
          .orderBy(asc(assignmentQuestionsTable.position));
        return { row, links };
      };

      const michelleSat = await loadAssignment(first.satMath.michelle.assignmentId);
      assert.equal(michelleSat.row?.timeLimitMinutes, 33);
      assert.equal(michelleSat.row?.assignedStudentUserId, michelle.id);
      assert.equal(michelleSat.row?.assignedTutorUserId, xavier.id);
      assert.equal(michelleSat.row?.sessionId, latest.id);
      assert.equal(michelleSat.links.length, 22);
      assert.equal(michelleSat.links[0]?.tags?.includes("sat-5a"), true);
      assert.equal(michelleSat.links.some((link) => link.tags?.includes("sat-5")), false);
      assert.equal(michelleSat.links.at(-1)?.tags?.includes("sat-12b"), true);

      const michelleFactoring = await loadAssignment(first.factoring.michelle.assignmentId);
      assert.equal(michelleFactoring.row?.timeLimitMinutes, 39);
      assert.equal(michelleFactoring.links.length, 26);
      assert.equal(michelleFactoring.links[0]?.tags?.includes("fac-1a"), true);
      assert.equal(michelleFactoring.links.at(-1)?.tags?.includes("fac-13b"), true);
      assert.equal(
        michelleFactoring.links.some((link) => link.tags?.some((tag) => tag.endsWith("-ex"))),
        false,
      );

      const samaSat = await loadAssignment(first.satMath.sama.assignmentId);
      assert.equal(samaSat.row?.sessionId, null);
      assert.equal(samaSat.row?.assignedStudentUserId, sama.id);
      assert.equal(samaSat.row?.assignedTutorUserId, xavier.id);
      assert.equal(samaSat.row?.timeLimitMinutes, 33);
      assert.deepEqual(
        samaSat.links.map((link) => link.tags),
        michelleSat.links.map((link) => link.tags),
      );

      const notesBlocks = await db
        .select()
        .from(curriculumBlocksTable)
        .where(
          and(
            inArray(curriculumBlocksTable.sessionId, [latest.id, samaSession.id]),
            sql`${curriculumBlocksTable.config}->>'seedKey' = ${FACTORING_NOTES_SEED_KEY}`,
          ),
        );
      assert.equal(notesBlocks.length, 2);
      for (const block of notesBlocks) {
        assert.equal(block.visibility, "both");
        assert.equal(block.status, "published");
        assert.equal(block.kind, "external_link");
        assert.equal((block.config as { url?: string }).url, FACTORING_NOTES_PUBLIC_PATH);
      }

      const newer = await insertSession({
        clientUserId: michelle.id,
        dateTime: new Date("2026-10-01T12:00:00.000Z"),
        title: "Newer completed Michelle session",
      });
      const second = await ensureMichelleXavierSessionFollowUps({ now, identities });
      assert.equal(second.satMath.michelle.created, false);
      assert.equal(second.satMath.michelle.assignmentId, first.satMath.michelle.assignmentId);
      assert.equal(second.satMath.michelle.sessionId, newer.id);
      assert.equal(second.factoring.michelle.sessionId, newer.id);
      assert.equal(second.notes.michelle.sessionId, newer.id);
      const staleNotes = await db
        .select()
        .from(curriculumBlocksTable)
        .where(
          and(
            eq(curriculumBlocksTable.sessionId, latest.id),
            sql`${curriculumBlocksTable.config}->>'seedKey' = ${FACTORING_NOTES_SEED_KEY}`,
          ),
        );
      assert.equal(staleNotes.length, 0);

      await db.insert(attemptsTable).values({
        assignmentId: second.satMath.michelle.assignmentId!,
        userId: michelle.id,
        status: "submitted",
        submittedAt: new Date("2026-10-02T12:00:00.000Z"),
        score: 50,
      });
      const afterAttempt = await insertSession({
        clientUserId: michelle.id,
        dateTime: new Date("2026-10-05T12:00:00.000Z"),
        title: "Session after the attempt",
      });
      const third = await ensureMichelleXavierSessionFollowUps({ now, identities });
      assert.equal(third.satMath.michelle.sessionId, newer.id);
      assert.notEqual(third.satMath.michelle.sessionId, afterAttempt.id);
      assert.equal(third.factoring.michelle.sessionId, afterAttempt.id);
      assert.equal(third.notes.michelle.sessionId, afterAttempt.id);
      const satAfterAttempt = await loadAssignment(third.satMath.michelle.assignmentId);
      assert.equal(satAfterAttempt.links.length, 22);

      const [geometryStill] = await db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, geometryAssignment!.id));
      assert.equal(geometryStill?.title, GEOMETRY_SAT_FOLLOW_UP_TITLE);
      assert.equal(geometryStill?.sessionId, latest.id);
      assert.equal(geometryStill?.timeLimitMinutes, 30);
      const [geometryPrompt] = await db
        .select({ prompt: questionsTable.prompt })
        .from(questionsTable)
        .where(eq(questionsTable.id, geometryQuestion!.id));
      assert.equal(geometryPrompt?.prompt, "What is the area of the rectangle that stays untouched?");
    } finally {
      const assignmentIds = (
        await db
          .select({ id: assignmentsTable.id })
          .from(assignmentsTable)
          .where(eq(assignmentsTable.courseId, course!.id))
      ).map((row) => row.id);
      if (createdSessionIds.length > 0) {
        await db
          .delete(curriculumBlocksTable)
          .where(inArray(curriculumBlocksTable.sessionId, createdSessionIds));
      }
      if (assignmentIds.length > 0) {
        const attemptIds = (
          await db
            .select({ id: attemptsTable.id })
            .from(attemptsTable)
            .where(inArray(attemptsTable.assignmentId, assignmentIds))
        ).map((row) => row.id);
        if (attemptIds.length > 0) {
          await db.delete(timerEventsTable).where(inArray(timerEventsTable.attemptId, attemptIds));
          await db.delete(attemptsTable).where(inArray(attemptsTable.id, attemptIds));
        }
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
      if (!existingNotes && createdUserIds.length > 0) {
        await db
          .delete(curriculumLibraryAssetsTable)
          .where(
            and(
              eq(curriculumLibraryAssetsTable.title, "Factoring Notes"),
              inArray(curriculumLibraryAssetsTable.createdByUserId, createdUserIds),
            ),
          );
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
