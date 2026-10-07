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
      courseMembershipsTable,
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
      assert.equal(third.satMath.sama.created, false);
      assert.equal(third.satMath.sama.assignmentId, first.satMath.sama.assignmentId);
      assert.equal(third.factoring.sama.created, false);
      assert.equal(third.factoring.sama.assignmentId, first.factoring.sama.assignmentId);
      assert.equal(third.satMath.sama.sessionId, null);
      const [michelleSatAttempt] = await db
        .select()
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, first.satMath.michelle.assignmentId!));
      assert.equal(michelleSatAttempt?.userId, michelle.id);
      assert.equal(michelleSatAttempt?.status, "submitted");
      assert.equal(michelleSatAttempt?.score, 50);
      const samaAttemptCount = await db
        .select({ id: attemptsTable.id })
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, first.satMath.sama.assignmentId!));
      assert.equal(samaAttemptCount.length, 0);

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
      if (createdCourseIds.length > 0) {
        await db
          .delete(courseMembershipsTable)
          .where(inArray(courseMembershipsTable.courseId, createdCourseIds));
      }
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

test(
  "gives samapostgrad standalone copies without a Xavier session and does not rewrite Michelle",
  { skip: !hasDatabase },
  async () => {
    const { and, asc, eq, inArray, sql } = await import("drizzle-orm");
    const {
      assignmentQuestionsTable,
      assignmentsTable,
      attemptsTable,
      courseMembershipsTable,
      coursesTable,
      curriculumBlocksTable,
      curriculumLibraryAssetsTable,
      db,
      questionsTable,
      sessionsTable,
      usersTable,
    } = await import("@workspace/db");
    const {
      SAMA_PREVIEW_NOTES_SKIP_REASON,
      ensureMichelleXavierSessionFollowUps,
    } = await import("./michelle-xavier-session-follow-up.ts");
    const { FACTORING_NOTES_SEED_KEY } = await import("./xavier-follow-up-content.ts");
    const {
      FACTORING_QUIZ_FOLLOW_UP_TITLE,
      GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
      SAT_MATH_FOLLOW_UP_TITLE,
    } = await import("./post-session-follow-up.ts");

    const suffix = randomUUID().slice(0, 8);
    const michelleEmail = `michelle-solo-${suffix}@example.com`;
    const samaEmail = `sama-solo-${suffix}@example.com`;
    const xavierEmail = `xavier-solo-${suffix}@example.com`;
    const michelleClerk = `user_michelle_solo_${suffix}`;
    const samaClerk = `user_sama_solo_${suffix}`;
    const xavierClerk = `user_xavier_solo_${suffix}`;
    const now = new Date("2026-10-06T12:00:00.000Z");
    const identities = {
      michelleEmail,
      michelleClerkUserId: michelleClerk,
      samaEmail,
      samaClerkUserId: samaClerk,
      xavierEmail,
      xavierClerkUserId: xavierClerk,
      xavierDuplicateClerkUserId: `user_xavier_solo_dup_${suffix}`,
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
        title: `Xavier solo follow-up ${suffix}`,
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
    const [session] = await db
      .insert(sessionsTable)
      .values({
        courseId: course!.id,
        clientUserId: michelle.id,
        tutorUserId: xavier.id,
        dateTime: new Date("2026-10-04T12:00:00.000Z"),
        timezone: "Asia/Dubai",
        subject: "SAT",
        title: "Michelle Oct 4 session",
        status: "published",
        bookingStatus: "confirmed",
        durationMinutes: 60,
      })
      .returning();
    createdSessionIds.push(session!.id);
    await db.insert(assignmentsTable).values({
      courseId: course!.id,
      sessionId: null,
      assignedStudentUserId: sama.id,
      assignedTutorUserId: xavier.id,
      deliveryPhase: "before_session",
      title: GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
      subject: "SAT Math",
      instructions: "Existing geometry to-do supplies the course.",
      status: "published",
      timeLimitMinutes: 60,
      maxAttempts: 1,
    });

    const questionIdsFor = async (assignmentId: string) =>
      (
        await db
          .select({ questionId: assignmentQuestionsTable.questionId })
          .from(assignmentQuestionsTable)
          .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
          .orderBy(asc(assignmentQuestionsTable.position))
      ).map((row) => row.questionId);

    try {
      const first = await ensureMichelleXavierSessionFollowUps({ now, identities });
      assert.equal(first.satMath.michelle.sessionId, session!.id);
      assert.equal(first.satMath.michelle.questionCount, 22);
      assert.equal(first.factoring.michelle.questionCount, 26);
      assert.equal(first.satMath.sama.sessionId, null);
      assert.equal(first.satMath.sama.created, true);
      assert.equal(first.satMath.sama.questionCount, 22);
      assert.equal(first.satMath.sama.timeLimitMinutes, 33);
      assert.equal(first.factoring.sama.sessionId, null);
      assert.equal(first.factoring.sama.created, true);
      assert.equal(first.factoring.sama.questionCount, 26);
      assert.equal(first.factoring.sama.timeLimitMinutes, 39);
      assert.equal(first.notes.michelle.sessionId, session!.id);
      assert.equal(first.notes.sama.sessionId, null);
      assert.equal(first.notes.sama.attached, false);
      assert.equal(first.notes.sama.skippedReason, SAMA_PREVIEW_NOTES_SKIP_REASON);

      const [samaSat] = await db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, first.satMath.sama.assignmentId!));
      assert.equal(samaSat?.sessionId, null);
      assert.equal(samaSat?.assignedStudentUserId, sama.id);
      assert.equal(samaSat?.assignedTutorUserId, xavier.id);
      assert.equal(samaSat?.courseId, course!.id);
      assert.equal(samaSat?.timeLimitMinutes, 33);
      assert.equal(samaSat?.status, "published");
      const [membership] = await db
        .select()
        .from(courseMembershipsTable)
        .where(
          and(
            eq(courseMembershipsTable.courseId, course!.id),
            eq(courseMembershipsTable.userId, sama.id),
          ),
        );
      assert.equal(membership?.membershipRole, "student");

      const michelleSatQuestions = await questionIdsFor(first.satMath.michelle.assignmentId!);
      const michelleFactoringQuestions = await questionIdsFor(first.factoring.michelle.assignmentId!);
      assert.deepEqual(await questionIdsFor(first.satMath.sama.assignmentId!), michelleSatQuestions);
      assert.deepEqual(
        await questionIdsFor(first.factoring.sama.assignmentId!),
        michelleFactoringQuestions,
      );

      const [decoy] = await db
        .insert(questionsTable)
        .values({
          subject: "SAT Math",
          domain: "Decoy",
          skill: "decoy",
          questionType: "multiple_choice",
          difficulty: "medium",
          prompt: "This decoy must not replace Michelle's SAT Math Problems.",
          choices: [
            { id: "a", label: "A", text: "1" },
            { id: "b", label: "B", text: "2" },
            { id: "c", label: "C", text: "3" },
            { id: "d", label: "D", text: "4" },
          ],
          correctAnswer: "a",
          explanation: "",
          sourceType: "original",
          reviewStatus: "approved",
          tags: ["xavier-authored-follow-up", "decoy"],
          generationMethod: "session-copy",
        })
        .returning();
      await db
        .delete(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, first.satMath.sama.assignmentId!));
      await db.insert(assignmentQuestionsTable).values({
        assignmentId: first.satMath.sama.assignmentId!,
        questionId: decoy!.id,
        position: 0,
        predictionFirst: false,
      });
      await db.insert(attemptsTable).values({
        assignmentId: first.satMath.sama.assignmentId!,
        userId: sama.id,
        status: "submitted",
        submittedAt: new Date("2026-10-05T12:00:00.000Z"),
        score: 10,
      });

      const second = await ensureMichelleXavierSessionFollowUps({ now, identities });
      assert.equal(second.satMath.michelle.assignmentId, first.satMath.michelle.assignmentId);
      assert.equal(second.satMath.michelle.sessionId, session!.id);
      assert.equal(second.factoring.michelle.assignmentId, first.factoring.michelle.assignmentId);
      assert.equal(second.factoring.michelle.sessionId, session!.id);
      assert.deepEqual(
        await questionIdsFor(first.satMath.michelle.assignmentId!),
        michelleSatQuestions,
      );
      assert.deepEqual(
        await questionIdsFor(first.factoring.michelle.assignmentId!),
        michelleFactoringQuestions,
      );
      assert.deepEqual(await questionIdsFor(first.satMath.sama.assignmentId!), [decoy!.id]);
      assert.equal(second.satMath.sama.assignmentId, first.satMath.sama.assignmentId);
      assert.equal(second.satMath.sama.created, false);
      assert.equal(second.factoring.sama.assignmentId, first.factoring.sama.assignmentId);
      assert.equal(second.factoring.sama.created, false);

      const titled = await db
        .select({ id: assignmentsTable.id, title: assignmentsTable.title })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.assignedStudentUserId, sama.id),
            inArray(assignmentsTable.title, [
              SAT_MATH_FOLLOW_UP_TITLE,
              FACTORING_QUIZ_FOLLOW_UP_TITLE,
            ]),
          ),
        );
      assert.equal(titled.filter((row) => row.title === SAT_MATH_FOLLOW_UP_TITLE).length, 1);
      assert.equal(titled.filter((row) => row.title === FACTORING_QUIZ_FOLLOW_UP_TITLE).length, 1);

      const noteBlocks = await db
        .select({ sessionId: curriculumBlocksTable.sessionId })
        .from(curriculumBlocksTable)
        .where(
          and(
            inArray(curriculumBlocksTable.sessionId, createdSessionIds),
            sql`${curriculumBlocksTable.config}->>'seedKey' = ${FACTORING_NOTES_SEED_KEY}`,
          ),
        );
      assert.deepEqual(
        noteBlocks.map((block) => block.sessionId),
        [session!.id],
      );
      const [michelleAttemptCount, samaAttempt] = await Promise.all([
        db
          .select({ id: attemptsTable.id })
          .from(attemptsTable)
          .where(eq(attemptsTable.assignmentId, first.satMath.michelle.assignmentId!)),
        db
          .select()
          .from(attemptsTable)
          .where(eq(attemptsTable.assignmentId, first.satMath.sama.assignmentId!)),
      ]);
      assert.equal(michelleAttemptCount.length, 0);
      assert.equal(samaAttempt.length, 1);
      assert.equal(samaAttempt[0]?.score, 10);
      assert.equal(samaAttempt[0]?.userId, sama.id);
    } finally {
      if (createdCourseIds.length > 0) {
        await db
          .delete(courseMembershipsTable)
          .where(inArray(courseMembershipsTable.courseId, createdCourseIds));
      }
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
