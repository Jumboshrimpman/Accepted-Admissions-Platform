import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { taitoSessionDateTime } from "./session-schedule.ts";

const HIDDEN_MODULE = 1002;
const OCT30_KEY_PREFIX = "original-hard-2026-10-30-rw-";
const FIXTURE_TITLE = "Oct 30 in-session fixture";

test("startup keeps a full hard Oct 30 pre-work and still clears the shortfall on the in-session write", () => {
  const hardSets = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  const boot = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.equal(taitoSessionDateTime("2026-10-30").toISOString(), "2026-10-30T12:00:00.000Z");
  assert.match(boot, /ensureTaitoOct30HardPrework\(\)/);
  assert.doesNotMatch(hardSets, /sendEmail|sendTransactionalEmail|clerkClient|@clerk\//i);
  const prework = hardSets.slice(
    hardSets.indexOf("export async function ensureHardSatPrework"),
    hardSets.indexOf("export async function officialHardInSessionItems"),
  );
  assert.match(
    prework,
    /oct30 &&\s*fullHard &&\s*preworkItems\.length !== HARD_SAT_PREWORK_QUESTIONS/,
  );
  const inSession = hardSets.slice(
    hardSets.indexOf("export async function ensureHardSatInSession"),
    hardSets.indexOf("export async function fillUnattemptedOfficialHardInSession"),
  );
  assert.match(
    inSession,
    /await publishHardInSession\([\s\S]*?\);\s*await suppressShortfallWhenAssigned\(session, target\);/,
  );
  const startup = hardSets.slice(hardSets.indexOf("export async function ensureTaitoOct30HardPrework"));
  assert.match(startup, /taitoOct30PreworkAllowsInSession\(result\.action\) && fullHardPreworkCount === 1/);
  assert.match(startup, /countLiveFullHardBeforeSessionSets/);
  assert.doesNotMatch(startup, /live\.find\(/);
  assert.match(
    startup,
    /result\.action === "unchanged" && fullHardPreworkCount !== 1/,
  );
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "startup writes Taito's 20-question Oct 30 in-session set when the 40-question hard pre-work cannot be replaced",
  { skip: !hasDatabase, timeout: 180_000 },
  async () => {
    if (process.env.DATABASE_URL?.includes("railway.internal")) {
      throw new Error("This test only runs against the local database.");
    }
    const { and, eq, inArray, notInArray, sql } = await import("drizzle-orm");
    const {
      adminNotificationsTable,
      assignmentQuestionsTable,
      assignmentsTable,
      attemptsTable,
      bankAiAnnotationsTable,
      bankQuestionAssetsTable,
      bankQuestionsTable,
      coursesTable,
      curriculumBlocksTable,
      db,
      examSourceAssetsTable,
      examSourceCollectionsTable,
      questionsTable,
      sessionPreworkPlansTable,
      sessionsTable,
      tutorProfilesTable,
      usersTable,
    } = await import("@workspace/db");
    const { materializeHardSatQuestion } = await import("./sat-bank-service.ts");
    const { ensureTaitoOct30HardPrework } = await import("./sat-hard-sets.ts");
    const {
      isOfficialModule2BankItem,
      isOriginalHardSatItem,
      isRenderableHardSatItem,
      satSection,
      toRenderableHardSatInput,
    } = await import("./sat-set-difficulty.ts");
    const { EUNICE_TUTOR_EMAIL, TAITO_STUDENT_EMAIL } = await import("./session-schedule.ts");

    const createdUserIds: string[] = [];
    const seedUser = async (
      email: string,
      role: "student" | "tutor" | "administrator",
      displayName: string,
    ) => {
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      if (existing) return existing.id;
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: `fixture_oct30_${role}_${crypto.randomUUID()}`,
          email,
          displayName,
          role,
        })
        .returning({ id: usersTable.id });
      createdUserIds.push(created!.id);
      return created!.id;
    };
    const studentId = await seedUser(TAITO_STUDENT_EMAIL, "student", "Taito");
    const tutorUserId = await seedUser(EUNICE_TUTOR_EMAIL, "tutor", "Eunice Chon");
    const adminId = await seedUser(
      `oct30-shortfall-admin-${crypto.randomUUID()}@example.invalid`,
      "administrator",
      "Oct 30 fixture admin",
    );
    const [existingTutorProfile] = await db
      .select({ id: tutorProfilesTable.id, userId: tutorProfilesTable.userId })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.email, EUNICE_TUTOR_EMAIL))
      .limit(1);
    let tutorProfileId = existingTutorProfile?.id ?? null;
    let createdTutorProfileId: string | null = null;
    const previousTutorUserId = existingTutorProfile?.userId ?? null;
    const fillerQuestionIds: string[] = [];
    if (!tutorProfileId) {
      const [createdProfile] = await db
        .insert(tutorProfilesTable)
        .values({
          email: EUNICE_TUTOR_EMAIL,
          name: "Eunice Chon",
          userId: tutorUserId,
        })
        .returning({ id: tutorProfilesTable.id });
      tutorProfileId = createdProfile!.id;
      createdTutorProfileId = createdProfile!.id;
    }
    const createdQuestionIds = new Set<string>();
    const hiddenBankIds: string[] = [];
    let courseId: string | null = null;
    let sessionId: string | null = null;
    const beforeOct30 = new Set(
      (
        await db
          .select({ id: bankQuestionsTable.id })
          .from(bankQuestionsTable)
          .where(sql`${bankQuestionsTable.sourceKey} like ${`${OCT30_KEY_PREFIX}%`}`)
      ).map((row) => row.id),
    );
    const [collectionBefore] = await db
      .select({ id: examSourceCollectionsTable.id })
      .from(examSourceCollectionsTable)
      .where(eq(examSourceCollectionsTable.slug, "original-hard-sat"))
      .limit(1);
    const linksBefore = new Map(
      (
        await db
          .select({
            id: bankQuestionsTable.id,
            linkedQuestionId: bankQuestionsTable.linkedQuestionId,
          })
          .from(bankQuestionsTable)
      ).map((row) => [row.id, row.linkedQuestionId]),
    );

    const questionIdsFor = async (assignmentId: string) =>
      (
        await db
          .select({ questionId: assignmentQuestionsTable.questionId })
          .from(assignmentQuestionsTable)
          .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
          .orderBy(assignmentQuestionsTable.position)
      ).map((row) => row.questionId);

    const sourceKeysFor = async (assignmentId: string) =>
      (
        await db
          .select({ sourceKey: bankQuestionsTable.sourceKey })
          .from(assignmentQuestionsTable)
          .innerJoin(
            bankQuestionsTable,
            eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
          )
          .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
      ).map((row) => row.sourceKey);

    try {
      await db
        .update(bankQuestionsTable)
        .set({ module: 2 })
        .where(eq(bankQuestionsTable.module, HIDDEN_MODULE));
      if (!createdTutorProfileId) {
        await db
          .update(tutorProfilesTable)
          .set({ userId: tutorUserId })
          .where(eq(tutorProfilesTable.id, tutorProfileId!));
      }

      const bankRows = await db.select().from(bankQuestionsTable);
      const renderable = bankRows
        .filter((row) => {
          const item = toRenderableHardSatInput(row);
          return (
            isRenderableHardSatItem(item) &&
            !isOriginalHardSatItem(item) &&
            isOfficialModule2BankItem(item) &&
            satSection(row.section) === "rw"
          );
        })
        .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
      const linked = renderable.filter((row) => row.linkedQuestionId);
      const unlinked = renderable.filter((row) => !row.linkedQuestionId);
      assert.ok(
        linked.length + unlinked.length >= 60,
        `need 60 renderable official reading items, found ${linked.length + unlinked.length}`,
      );
      const selected = [...linked, ...unlinked];
      const preworkBank = selected.slice(0, 40);
      const reserveBank = selected.slice(40, 60);
      assert.equal(reserveBank.every((row) => !row.linkedQuestionId), true);
      const preworkQuestionIds: string[] = [];
      for (const row of preworkBank) {
        const questionId = row.linkedQuestionId ?? (await materializeHardSatQuestion(row.id));
        if (!row.linkedQuestionId) createdQuestionIds.add(questionId);
        preworkQuestionIds.push(questionId);
      }
      assert.equal(new Set(preworkQuestionIds).size, 40);

      const keepIds = new Set([...preworkBank, ...reserveBank].map((row) => row.id));
      // Production cannot build the Oct 30 mix: 18 of 19 renderable official
      // math items are already seen. Hide every other module 2 row so this
      // fixture takes that same incomplete-composition path.
      const hidden = await db
        .update(bankQuestionsTable)
        .set({ module: HIDDEN_MODULE })
        .where(and(eq(bankQuestionsTable.module, 2), notInArray(bankQuestionsTable.id, [...keepIds])))
        .returning({ id: bankQuestionsTable.id });
      hiddenBankIds.push(...hidden.map((row) => row.id));

      const fillerRows = await db
        .insert(questionsTable)
        .values(
          [0, 1, 2].map((index) => ({
            subject: "SAT",
            domain: "SAT",
            skill: "Fixture",
            questionType: "multiple_choice",
            difficulty: "medium",
            prompt: `Oct 30 fixture filler ${index}`,
            choices: [
              { id: "a", label: "A", text: "one" },
              { id: "b", label: "B", text: "two" },
            ],
            correctAnswer: "a",
            explanation: "Fixture explanation",
            reviewStatus: "reviewed",
          })),
        )
        .returning({ id: questionsTable.id });
      const filler = fillerRows.map((row) => row.id);
      fillerQuestionIds.push(...filler);

      const [course] = await db
        .insert(coursesTable)
        .values({
          title: `${FIXTURE_TITLE} ${crypto.randomUUID()}`,
          subject: "SAT",
          term: "Fall 2026",
          status: "active",
        })
        .returning();
      courseId = course!.id;
      const [session] = await db
        .insert(sessionsTable)
        .values({
          courseId: course!.id,
          clientUserId: studentId,
          tutorUserId: tutorUserId,
          dateTime: taitoSessionDateTime("2026-10-30"),
          timezone: "Asia/Tokyo",
          subject: "SAT",
          title: `${FIXTURE_TITLE} — Taito's SAT Session with Eunice`,
          status: "published",
          bookingStatus: "confirmed",
        })
        .returning();
      sessionId = session!.id;

      const [started] = await db
        .insert(assignmentsTable)
        .values({
          courseId: course!.id,
          sessionId: session!.id,
          deliveryPhase: "after_session",
          title: "Started set left untouched",
          subject: "SAT",
          instructions: "Fixture started set",
          status: "published",
          timeLimitMinutes: 30,
        })
        .returning();
      await db.insert(assignmentQuestionsTable).values({
        assignmentId: started!.id,
        questionId: filler[0]!,
        position: 0,
      });
      await db.insert(attemptsTable).values({
        assignmentId: started!.id,
        userId: studentId,
        status: "submitted",
      });

      const withoutPrework = await ensureTaitoOct30HardPrework();
      assert.equal(withoutPrework.action, "shortfall");
      assert.equal(withoutPrework.readingLeftInPlace, false);
      const duringAfterShortfall = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.sessionId, session!.id),
            eq(assignmentsTable.deliveryPhase, "during_session"),
          ),
        );
      assert.equal(duringAfterShortfall.length, 0);
      const shortfallNotes = await db
        .select({
          status: adminNotificationsTable.status,
          message: adminNotificationsTable.message,
        })
        .from(adminNotificationsTable)
        .where(eq(adminNotificationsTable.sessionId, session!.id));
      assert.ok(shortfallNotes.length > 0);
      assert.ok(shortfallNotes.every((row) => row.status === "unread"));
      assert.match(shortfallNotes[0]!.message, /0 pre-work and 20 in-session/);
      const [adminNote] = await db
        .select({ id: adminNotificationsTable.id })
        .from(adminNotificationsTable)
        .where(
          and(
            eq(adminNotificationsTable.sessionId, session!.id),
            eq(adminNotificationsTable.recipientUserId, adminId),
          ),
        )
        .limit(1);
      assert.ok(adminNote, "the seeded administrator receives the shortfall alert");

      const shortPreworkIds = preworkQuestionIds.slice(0, 30);
      const [prework] = await db
        .insert(assignmentsTable)
        .values({
          courseId: course!.id,
          sessionId: session!.id,
          deliveryPhase: "before_session",
          title: "SAT pre-work (30–50 questions) — Taito's SAT Session with Eunice",
          subject: "SAT",
          instructions: "Fixture pre-work",
          status: "published",
          timeLimitMinutes: 60,
        })
        .returning();
      await db.insert(assignmentQuestionsTable).values(
        shortPreworkIds.map((questionId, position) => ({
          assignmentId: prework!.id,
          questionId,
          position,
        })),
      );
      const shortPrework = await ensureTaitoOct30HardPrework();
      assert.equal(shortPrework.action, "shortfall");
      assert.equal(shortPrework.readingLeftInPlace, false);
      const duringAfterShortPrework = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.sessionId, session!.id),
            eq(assignmentsTable.deliveryPhase, "during_session"),
          ),
        );
      assert.equal(duringAfterShortPrework.length, 0);
      const [shortPreworkAfter] = await db
        .select({ status: assignmentsTable.status })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, prework!.id))
        .limit(1);
      assert.equal(shortPreworkAfter?.status, "published");
      assert.deepEqual(await questionIdsFor(prework!.id), shortPreworkIds);
      const shortNotes = await db
        .select({ status: adminNotificationsTable.status })
        .from(adminNotificationsTable)
        .where(eq(adminNotificationsTable.sessionId, session!.id));
      assert.ok(shortNotes.length > 0);
      assert.ok(shortNotes.every((row) => row.status === "unread"));
      await db.insert(assignmentQuestionsTable).values(
        preworkQuestionIds.slice(30).map((questionId, index) => ({
          assignmentId: prework!.id,
          questionId,
          position: shortPreworkIds.length + index,
        })),
      );
      const [placeholder] = await db
        .insert(assignmentsTable)
        .values({
          courseId: course!.id,
          sessionId: session!.id,
          deliveryPhase: "during_session",
          title: "In-session homework completion",
          subject: "SAT",
          instructions: "Unattempted non-hard placeholder",
          status: "published",
          timeLimitMinutes: 30,
        })
        .returning();
      await db.insert(assignmentQuestionsTable).values([
        { assignmentId: placeholder!.id, questionId: filler[1]!, position: 0 },
        { assignmentId: placeholder!.id, questionId: filler[2]!, position: 1 },
      ]);

      const written = await ensureTaitoOct30HardPrework();
      assert.equal(written.action, "unchanged");
      assert.equal(written.readingLeftInPlace, false);

      const [preworkAfter] = await db
        .select({ status: assignmentsTable.status })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, prework!.id))
        .limit(1);
      assert.equal(preworkAfter?.status, "published");
      assert.deepEqual(await questionIdsFor(prework!.id), preworkQuestionIds);
      const preworkKeys = await sourceKeysFor(prework!.id);
      assert.equal(preworkKeys.length, 40);
      assert.equal(preworkKeys.some((key) => key.startsWith(OCT30_KEY_PREFIX)), false);
      const [{ count: preworkAttempts }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, prework!.id));
      assert.equal(Number(preworkAttempts), 0);

      const [startedAfter] = await db
        .select({ status: assignmentsTable.status })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, started!.id))
        .limit(1);
      assert.equal(startedAfter?.status, "published");
      assert.deepEqual(await questionIdsFor(started!.id), [filler[0]!]);
      const [{ count: startedAttempts }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(attemptsTable)
        .where(eq(attemptsTable.assignmentId, started!.id));
      assert.equal(Number(startedAttempts), 1);

      const [placeholderAfter] = await db
        .select({ status: assignmentsTable.status })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, placeholder!.id))
        .limit(1);
      assert.equal(placeholderAfter?.status, "archived");

      const liveDuring = await db
        .select({ id: assignmentsTable.id, title: assignmentsTable.title, status: assignmentsTable.status })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.sessionId, session!.id),
            eq(assignmentsTable.deliveryPhase, "during_session"),
            eq(assignmentsTable.status, "published"),
          ),
        );
      assert.equal(liveDuring.length, 1);
      assert.match(liveDuring[0]!.title, /^Hard SAT in-session \(20\)/);
      const inSessionIds = await questionIdsFor(liveDuring[0]!.id);
      assert.equal(inSessionIds.length, 20);
      const inSessionKeys = await sourceKeysFor(liveDuring[0]!.id);
      assert.equal(inSessionKeys.length, 20);
      assert.equal(inSessionKeys.some((key) => preworkKeys.includes(key)), false);
      assert.equal(inSessionKeys.some((key) => key.startsWith(OCT30_KEY_PREFIX)), false);

      const notesAfterWrite = await db
        .select({
          title: adminNotificationsTable.title,
          status: adminNotificationsTable.status,
        })
        .from(adminNotificationsTable)
        .where(eq(adminNotificationsTable.sessionId, session!.id));
      assert.ok(notesAfterWrite.length > 0);
      assert.ok(
        notesAfterWrite.every(
          (row) => row.title === "Hard SAT set needs questions" && row.status === "read",
        ),
      );
      const [block] = await db
        .select({ config: curriculumBlocksTable.config })
        .from(curriculumBlocksTable)
        .where(
          and(
            eq(curriculumBlocksTable.sessionId, session!.id),
            eq(curriculumBlocksTable.kind, "adaptive_prep"),
          ),
        )
        .limit(1);
      assert.equal(
        Boolean(block?.config && typeof block.config === "object" && !Array.isArray(block.config) && block.config.needsQuestions),
        false,
      );

      const again = await ensureTaitoOct30HardPrework();
      assert.equal(again.action, "unchanged");
      const liveDuringAgain = await db
        .select({ id: assignmentsTable.id })
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.sessionId, session!.id),
            eq(assignmentsTable.deliveryPhase, "during_session"),
            eq(assignmentsTable.status, "published"),
          ),
        );
      assert.deepEqual(
        liveDuringAgain.map((row) => row.id),
        [liveDuring[0]!.id],
      );
      assert.deepEqual(await questionIdsFor(liveDuring[0]!.id), inSessionIds);
      assert.deepEqual(await questionIdsFor(prework!.id), preworkQuestionIds);
      assert.equal((await sourceKeysFor(prework!.id)).length, 40);
    } finally {
      const cleanupErrors: unknown[] = [];
      const step = async (fn: () => Promise<void>) => {
        try {
          await fn();
        } catch (err) {
          cleanupErrors.push(err);
        }
      };
      await step(async () => {
        if (createdTutorProfileId || !tutorProfileId) return;
        await db
          .update(tutorProfilesTable)
          .set({ userId: previousTutorUserId })
          .where(eq(tutorProfilesTable.id, tutorProfileId));
      });
      if (sessionId) {
        await step(async () => {
          await db
            .delete(adminNotificationsTable)
            .where(eq(adminNotificationsTable.sessionId, sessionId!));
        });
        await step(async () => {
          await db.delete(curriculumBlocksTable).where(eq(curriculumBlocksTable.sessionId, sessionId!));
        });
        await step(async () => {
          await db
            .delete(sessionPreworkPlansTable)
            .where(eq(sessionPreworkPlansTable.sessionId, sessionId!));
        });
        await step(async () => {
          const assignmentIds = (
            await db
              .select({ id: assignmentsTable.id })
              .from(assignmentsTable)
              .where(eq(assignmentsTable.sessionId, sessionId!))
          ).map((row) => row.id);
          if (assignmentIds.length === 0) return;
          await db.delete(attemptsTable).where(inArray(attemptsTable.assignmentId, assignmentIds));
          await db
            .delete(assignmentQuestionsTable)
            .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds));
          await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, assignmentIds));
        });
        await step(async () => {
          await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId!));
        });
      }
      await step(async () => {
        if (courseId) await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
      });
      await step(async () => {
        const after = await db
          .select({
            id: bankQuestionsTable.id,
            linkedQuestionId: bankQuestionsTable.linkedQuestionId,
          })
          .from(bankQuestionsTable);
        for (const row of after) {
          if (!linksBefore.has(row.id)) continue;
          const previous = linksBefore.get(row.id) ?? null;
          const next = row.linkedQuestionId ?? null;
          if (next === previous) continue;
          if (next && !previous) createdQuestionIds.add(next);
          await db
            .update(bankQuestionsTable)
            .set({ linkedQuestionId: previous })
            .where(eq(bankQuestionsTable.id, row.id));
        }
      });
      await step(async () => {
        const questionIds = [...new Set([...createdQuestionIds, ...fillerQuestionIds])];
        if (questionIds.length === 0) return;
        await db.delete(questionsTable).where(inArray(questionsTable.id, questionIds));
      });
      await step(async () => {
        const inserted = (
          await db
            .select({ id: bankQuestionsTable.id })
            .from(bankQuestionsTable)
            .where(sql`${bankQuestionsTable.sourceKey} like ${`${OCT30_KEY_PREFIX}%`}`)
        )
          .map((row) => row.id)
          .filter((id) => !beforeOct30.has(id));
        if (inserted.length === 0) return;
        await db
          .delete(bankAiAnnotationsTable)
          .where(inArray(bankAiAnnotationsTable.bankQuestionId, inserted));
        await db
          .delete(bankQuestionAssetsTable)
          .where(inArray(bankQuestionAssetsTable.bankQuestionId, inserted));
        await db.delete(bankQuestionsTable).where(inArray(bankQuestionsTable.id, inserted));
      });
      await step(async () => {
        if (collectionBefore) return;
        const [collection] = await db
          .select({ id: examSourceCollectionsTable.id })
          .from(examSourceCollectionsTable)
          .where(eq(examSourceCollectionsTable.slug, "original-hard-sat"))
          .limit(1);
        if (!collection) return;
        const remaining = await db
          .select({ id: bankQuestionsTable.id })
          .from(bankQuestionsTable)
          .where(eq(bankQuestionsTable.collectionId, collection.id))
          .limit(1);
        if (remaining.length > 0) return;
        await db
          .delete(examSourceAssetsTable)
          .where(eq(examSourceAssetsTable.collectionId, collection.id));
        await db
          .delete(examSourceCollectionsTable)
          .where(eq(examSourceCollectionsTable.id, collection.id));
      });
      await step(async () => {
        if (hiddenBankIds.length === 0) return;
        await db
          .update(bankQuestionsTable)
          .set({ module: 2 })
          .where(inArray(bankQuestionsTable.id, hiddenBankIds));
      });
      await step(async () => {
        if (!createdTutorProfileId) return;
        await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.id, createdTutorProfileId));
      });
      await step(async () => {
        if (createdUserIds.length === 0) return;
        await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
      });
      if (cleanupErrors.length > 0) {
        throw new Error(
          `Oct 30 in-session fixture cleanup failed: ${cleanupErrors.map((err) => (err instanceof Error ? err.message : String(err))).join("; ")}`,
        );
      }
    }
  },
);
