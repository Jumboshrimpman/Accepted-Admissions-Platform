import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "assigns the same official area and volume quiz to Michelle and samapostgrad without rewriting a completed quiz",
  { skip: !hasDatabase },
  async () => {
    const { and, asc, eq, inArray } = await import("drizzle-orm");
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
    const { ensureGeometryAreaVolumeFollowUp } = await import(
      "./geometry-area-volume-follow-up.ts"
    );
    const { GEOMETRY_AREA_VOLUME_FOLLOW_UP_TAG } = await import(
      "./geometry-area-volume-bank.ts"
    );
    const { GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE } = await import(
      "./post-session-follow-up.ts"
    );

    const suffix = randomUUID().slice(0, 8);
    const michelleEmail = `michelle-area-${suffix}@example.com`;
    const samaEmail = `sama-area-${suffix}@example.com`;
    const xavierEmail = `xavier-area-${suffix}@example.com`;
    const michelleClerk = `user_michelle_area_${suffix}`;
    const samaClerk = `user_sama_area_${suffix}`;
    const xavierClerk = `user_xavier_area_${suffix}`;
    const createdUserIds: string[] = [];
    const createdSessionIds: string[] = [];
    const createdCourseIds: string[] = [];

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Area volume follow-up ${suffix}`,
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

    const latest = await insertSession({
      clientUserId: michelle.id,
      dateTime: new Date("2026-09-20T12:00:00.000Z"),
      title: "Michelle’s SAT Session with Xavier",
    });
    await insertSession({
      clientUserId: michelle.id,
      dateTime: new Date("2026-10-20T12:00:00.000Z"),
      title: "Michelle’s future SAT Session with Xavier",
    });
    const samaSession = await insertSession({
      clientUserId: sama.id,
      dateTime: new Date("2026-10-02T20:00:00.000Z"),
      title: `SAT capability test — Xavier ${suffix}`,
    });

    const [mixedQuestion] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Reading and Writing",
        domain: "Information and Ideas",
        skill: "Words in Context",
        questionType: "multiple_choice",
        difficulty: "easy",
        prompt: "Which choice completes the text with the most logical word?",
        choices: [
          { id: "a", label: "A", text: "selecting a narrower claim today" },
          { id: "b", label: "B", text: "inspecting every available source" },
          { id: "c", label: "C", text: "creating a much longer passage" },
          { id: "d", label: "D", text: "deciding without any evidence" },
        ],
        correctAnswer: "a",
        explanation: "The completed English item stays as history.",
        sourceType: "original",
        reviewStatus: "approved",
        tags: ["completed-mixed-quiz"],
        generationMethod: "tutor-authored",
      })
      .returning();
    const [mixedAssignment] = await db
      .insert(assignmentsTable)
      .values({
        courseId: course!.id,
        sessionId: latest.id,
        deliveryPhase: "before_session",
        title: "Mixed SAT check",
        subject: "SAT",
        instructions: "Already submitted.",
        status: "published",
        timeLimitMinutes: 20,
        maxAttempts: 1,
      })
      .returning();
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: mixedAssignment!.id,
      questionId: mixedQuestion!.id,
      position: 0,
      predictionFirst: false,
    });
    await db.insert(attemptsTable).values({
      assignmentId: mixedAssignment!.id,
      userId: michelle.id,
      status: "submitted",
      submittedAt: new Date("2026-09-21T12:00:00.000Z"),
      score: 40,
    });

    const [duringQuestion] = await db
      .insert(questionsTable)
      .values({
        subject: "SAT Math",
        domain: "Algebra",
        skill: "Linear equations",
        questionType: "multiple_choice",
        difficulty: "medium",
        prompt: "If 3x − 7 = 14, what is the value of x?",
        choices: [
          { id: "a", label: "A", text: "5" },
          { id: "b", label: "B", text: "7" },
          { id: "c", label: "C", text: "21" },
          { id: "d", label: "D", text: "3" },
        ],
        correctAnswer: "b",
        explanation: "In-session algebra stays linked.",
        sourceType: "original",
        reviewStatus: "approved",
        tags: ["in-session-practice"],
        generationMethod: "tutor-authored",
      })
      .returning();
    const [duringAssignment] = await db
      .insert(assignmentsTable)
      .values({
        courseId: course!.id,
        sessionId: latest.id,
        deliveryPhase: "during_session",
        title: "In-session practice",
        subject: "SAT Math",
        instructions: "Work these with your tutor.",
        status: "published",
        timeLimitMinutes: 15,
        maxAttempts: 1,
      })
      .returning();
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: duringAssignment!.id,
      questionId: duringQuestion!.id,
      position: 0,
      predictionFirst: false,
    });

    const identities = {
      michelleEmail,
      michelleClerkUserId: michelleClerk,
      samaEmail,
      samaClerkUserId: samaClerk,
      xavierEmail,
      xavierClerkUserId: xavierClerk,
      xavierDuplicateClerkUserId: `user_xavier_dup_${suffix}`,
    };
    const now = new Date("2026-09-27T16:00:00.000Z");
    const [geometryHistory] = await db
      .insert(assignmentsTable)
      .values({
        courseId: course!.id,
        sessionId: latest.id,
        deliveryPhase: "before_session",
        title: "Geometry SAT Questions",
        subject: "SAT Math",
        instructions: "Completed geometry history.",
        status: "published",
        timeLimitMinutes: 30,
        maxAttempts: 1,
      })
      .returning();
    await db.insert(attemptsTable).values({
      assignmentId: geometryHistory!.id,
      userId: michelle.id,
      status: "submitted",
      submittedAt: new Date("2026-09-22T12:00:00.000Z"),
      score: 70,
    });
    const [legacyArea] = await db
      .insert(assignmentsTable)
      .values({
        courseId: course!.id,
        sessionId: latest.id,
        deliveryPhase: "before_session",
        title: GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
        subject: "SAT Math",
        instructions: "Still attached to the session.",
        status: "published",
        timeLimitMinutes: 30,
        maxAttempts: 1,
      })
      .returning();

    try {
      const refused = await ensureGeometryAreaVolumeFollowUp({
        now,
        identities: { ...identities, michelleEmail: "taito0525@gmail.com", samaEmail: "taito0525@gmail.com" },
      });
      assert.equal(refused.michelle.assignmentId, null);
      assert.equal(refused.sama.assignmentId, null);

      const first = await ensureGeometryAreaVolumeFollowUp({ now, identities });
      assert.equal(first.michelle.created, false);
      assert.equal(first.michelle.assignmentId, legacyArea!.id);
      assert.equal(first.michelle.sessionId, null);
      assert.equal(first.sama.created, true);
      assert.equal(first.sama.sessionId, null);
      assert.equal(first.michelle.questionCount, first.questionCount);
      assert.equal(first.sama.questionCount, first.questionCount);
      assert.ok(first.questionCount >= 4);
      assert.ok(first.sourceKeys.every((key) => key.startsWith("sat-pt") && key.includes("-math-")));

      const second = await ensureGeometryAreaVolumeFollowUp({ now, identities });
      assert.equal(second.michelle.created, false);
      assert.equal(second.sama.created, false);
      assert.equal(second.michelle.assignmentId, first.michelle.assignmentId);
      assert.equal(second.sama.assignmentId, first.sama.assignmentId);

      const quizzes = await db
        .select()
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.courseId, course!.id),
            eq(assignmentsTable.title, GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE),
          ),
        );
      assert.equal(quizzes.length, 2);
      for (const quiz of quizzes) {
        assert.equal(quiz.status, "published");
        assert.equal(quiz.sessionId, null);
        assert.equal(quiz.deadline, null);
        assert.equal(quiz.deliveryPhase, "before_session");
        assert.equal(quiz.subject, "SAT Math");
        assert.equal(quiz.assignedTutorUserId, xavier.id);
      }
      assert.equal(
        quizzes.find((quiz) => quiz.id === first.michelle.assignmentId)?.assignedStudentUserId,
        michelle.id,
      );
      assert.equal(
        quizzes.find((quiz) => quiz.id === first.sama.assignmentId)?.assignedStudentUserId,
        sama.id,
      );
      const [historyStill] = await db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, geometryHistory!.id));
      assert.equal(historyStill?.title, "Geometry SAT Questions");
      assert.equal(historyStill?.sessionId, latest.id);
      const [historyAttempt] = await db
        .select()
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, geometryHistory!.id));
      assert.equal(historyAttempt?.score, 70);
      assert.equal(historyAttempt?.status, "submitted");

      const linksFor = async (assignmentId: string) =>
        db
          .select({
            position: assignmentQuestionsTable.position,
            question: questionsTable,
          })
          .from(assignmentQuestionsTable)
          .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
          .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
          .orderBy(asc(assignmentQuestionsTable.position));

      const michelleLinks = await linksFor(first.michelle.assignmentId!);
      const samaLinks = await linksFor(first.sama.assignmentId!);
      assert.deepEqual(
        michelleLinks.map((link) => link.question.id),
        samaLinks.map((link) => link.question.id),
      );
      assert.deepEqual(
        michelleLinks.map((link) => link.question.tags?.find((tag) => tag.startsWith("sat-pt"))),
        first.sourceKeys,
      );
      for (const link of michelleLinks) {
        assert.equal(link.question.subject, "SAT Math");
        assert.equal(link.question.domain, "Geometry and Trigonometry");
        assert.equal(link.question.skill, "Area and volume");
        assert.equal(link.question.difficulty, "hard");
        assert.equal(link.question.explanation, "");
        assert.equal(link.question.sourceType, "college_board");
        assert.equal(link.question.questionType, "multiple_choice");
        assert.equal(link.question.tags?.includes(GEOMETRY_AREA_VOLUME_FOLLOW_UP_TAG), true);
        assert.equal(link.question.tags?.includes("session-copy"), true);
        assert.match(link.question.prompt, /\b(area|volume)\b/i);
        assert.doesNotMatch(link.question.prompt, /which choice completes the text/i);
      }

      const [unchangedMixed] = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, mixedQuestion!.id));
      assert.equal(
        unchangedMixed?.prompt,
        "Which choice completes the text with the most logical word?",
      );
      assert.equal(unchangedMixed?.explanation, "The completed English item stays as history.");
      const [duringStill] = await db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, duringAssignment!.id));
      assert.equal(duringStill?.deliveryPhase, "during_session");
      assert.equal(duringStill?.title, "In-session practice");
    } finally {
      const assignmentIds = (
        await db
          .select({ id: assignmentsTable.id })
          .from(assignmentsTable)
          .where(eq(assignmentsTable.courseId, course!.id))
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
