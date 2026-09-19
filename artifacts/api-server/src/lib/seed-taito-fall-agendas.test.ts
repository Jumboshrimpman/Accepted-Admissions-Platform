import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "seedTaitoFallAgendas upserts tutor_notes and student blocks without duplicating",
  { skip: !hasDatabase },
  async () => {
    const { and, eq } = await import("drizzle-orm");
    const {
      coursesTable,
      curriculumBlocksTable,
      db,
      sessionArtifactsTable,
      sessionsTable,
      usersTable,
    } = await import("@workspace/db");
    const { TAITO_FALL_2026_SESSIONS, taitoSessionDateTime } = await import(
      "./session-schedule.ts"
    );
    const { seedTaitoFallAgendas } = await import("./seed-taito-fall-agendas.ts");
    const {
      TAITO_FALL_AGENDA_CALLOUT_SEED_KEY,
      TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY,
      agendaSeedMarker,
      formatTutorNotes,
      isSeededTutorNotes,
    } = await import("./taito-fall-2026-session-agendas.ts");

    const suffix = randomUUID();
    const createdUserIds: string[] = [];
    const [actor] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `agenda-seed-actor:${suffix}`,
        email: `agenda-seed-actor-${suffix}@example.com`,
        displayName: "Agenda Seed Actor",
        role: "tutor",
      })
      .returning();
    createdUserIds.push(actor!.id);

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Fall 2026 agenda fixture ${suffix}`,
        subject: "SAT & IELTS",
        term: "Fall 2026",
        status: "active",
      })
      .returning();

    const inserted = await db
      .insert(sessionsTable)
      .values(
        TAITO_FALL_2026_SESSIONS.map((scheduled) => ({
          courseId: course!.id,
          dateTime: taitoSessionDateTime(scheduled.dateKey),
          timezone: "Asia/Tokyo",
          subject: scheduled.subject,
          title:
            scheduled.subject === "SAT"
              ? "Taito’s SAT Session with Eunice"
              : "Taito’s English Session with Nika",
          status: "published" as const,
          tutorUserId: actor!.id,
        })),
      )
      .returning();

    const [oct2] = inserted.filter(
      (session) => session.dateTime.getTime() === taitoSessionDateTime("2026-10-02").getTime(),
    );
    await db.insert(curriculumBlocksTable).values({
      sessionId: oct2!.id,
      kind: "objectives",
      position: 0,
      visibility: "both",
      status: "published",
      config: {
        title: "Session goals",
        items: [
          "Review summer progress",
          "Complete a baseline timed mini-section",
          "Set measurable Fall goals",
        ],
      },
    });

    const laterSat = inserted.find(
      (session) => session.dateTime.getTime() === taitoSessionDateTime("2026-10-09").getTime(),
    );
    await db.insert(sessionArtifactsTable).values({
      sessionId: laterSat!.id,
      createdBy: actor!.id,
      kind: "tutor_notes",
      content: "Handwritten plan from Eunice — do not clobber.",
      visibility: "tutor",
      status: "draft",
    });

    try {
      const dry = await seedTaitoFallAgendas({
        courseId: course!.id,
        actorUserId: actor!.id,
        dryRun: true,
      });
      assert.equal(dry.ok, true);
      assert.equal(dry.sessions.length, 12);
      assert.equal(dry.missingDateKeys.length, 0);
      const notesBeforeDry = await db
        .select()
        .from(sessionArtifactsTable)
        .where(eq(sessionArtifactsTable.kind, "tutor_notes"));
      assert.equal(
        notesBeforeDry.filter((row) => inserted.some((session) => session.id === row.sessionId))
          .length,
        1,
        "dry-run must not write extra tutor_notes",
      );

      const first = await seedTaitoFallAgendas({
        courseId: course!.id,
        actorUserId: actor!.id,
      });
      assert.equal(first.ok, true);
      assert.equal(first.sessions.filter((row) => row.sessionId).length, 12);
      const oct2Result = first.sessions.find((row) => row.dateKey === "2026-10-02");
      const oct9Result = first.sessions.find((row) => row.dateKey === "2026-10-09");
      assert.equal(oct2Result?.tutorNotes, "created");
      assert.equal(oct2Result?.objectives, "updated");
      assert.equal(oct9Result?.tutorNotes, "skipped");

      const second = await seedTaitoFallAgendas({
        courseId: course!.id,
        actorUserId: actor!.id,
      });
      assert.equal(second.ok, true);
      for (const row of second.sessions) {
        assert.equal(row.tutorNotes, "skipped");
        assert.equal(row.objectives, "skipped");
        assert.equal(row.callout, "skipped");
      }

      const notes = await db
        .select()
        .from(sessionArtifactsTable)
        .where(eq(sessionArtifactsTable.kind, "tutor_notes"));
      const seededNotes = notes.filter((row) =>
        inserted.some((session) => session.id === row.sessionId),
      );
      assert.equal(seededNotes.length, 12);
      const oct9Notes = seededNotes.find((row) => row.sessionId === laterSat!.id);
      assert.equal(oct9Notes?.content, "Handwritten plan from Eunice — do not clobber.");
      const oct2Notes = seededNotes.find((row) => row.sessionId === oct2!.id);
      assert.ok(isSeededTutorNotes(oct2Notes?.content, "2026-10-02"));
      assert.ok(oct2Notes?.content.includes(agendaSeedMarker("2026-10-02")));

      const forced = await seedTaitoFallAgendas({
        courseId: course!.id,
        actorUserId: actor!.id,
        force: true,
      });
      assert.equal(
        forced.sessions.find((row) => row.dateKey === "2026-10-09")?.tutorNotes,
        "updated",
      );
      const [forcedOct9] = await db
        .select()
        .from(sessionArtifactsTable)
        .where(
          and(
            eq(sessionArtifactsTable.sessionId, laterSat!.id),
            eq(sessionArtifactsTable.kind, "tutor_notes"),
          ),
        );
      assert.ok(forcedOct9?.content.includes(formatTutorNotes(
        (await import("./taito-fall-2026-session-agendas.ts")).agendaForDateKey("2026-10-09")!,
      ).slice(0, 40)));

      const blocks = await db
        .select()
        .from(curriculumBlocksTable)
        .where(
          eq(curriculumBlocksTable.sessionId, oct2!.id),
        );
      const objectiveBlocks = blocks.filter(
        (block) =>
          block.kind === "objectives" &&
          block.config.seedKey === TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY,
      );
      const calloutBlocks = blocks.filter(
        (block) =>
          block.kind === "callout" &&
          block.config.seedKey === TAITO_FALL_AGENDA_CALLOUT_SEED_KEY,
      );
      assert.equal(objectiveBlocks.length, 1);
      assert.equal(calloutBlocks.length, 1);
      assert.equal(objectiveBlocks[0]?.status, "published");
      assert.equal(calloutBlocks[0]?.visibility, "both");
    } finally {
      const sessionIds = inserted.map((session) => session.id);
      if (sessionIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        await db
          .delete(sessionArtifactsTable)
          .where(inArray(sessionArtifactsTable.sessionId, sessionIds));
        await db
          .delete(curriculumBlocksTable)
          .where(inArray(curriculumBlocksTable.sessionId, sessionIds));
        await db.delete(sessionsTable).where(inArray(sessionsTable.id, sessionIds));
      }
      await db.delete(coursesTable).where(eq(coursesTable.id, course!.id));
      if (createdUserIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
      }
    }
  },
);
