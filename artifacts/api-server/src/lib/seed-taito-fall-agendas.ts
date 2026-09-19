/**
 * Idempotent seed for Fall 2026 Taito complementary session agendas.
 *
 * Discovers live session IDs from the Fall course + schedule dates.
 * Does not invent IDs. Does not touch quizzes, banks, or Clerk.
 *
 * Writes:
 *   - session_artifacts.kind = tutor_notes (Private tutor guidance)
 *   - published objectives + callout curriculum blocks (student-visible)
 */
import { and, eq, sql } from "drizzle-orm";
import {
  coursesTable,
  curriculumBlocksTable,
  db,
  sessionArtifactsTable,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { TAITO_STUDENT_EMAIL } from "./session-schedule.ts";

const FALL_SAT_COURSE_TITLE = "Fall 2026 SAT & IELTS";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  TAITO_FALL_AGENDA_CALLOUT_SEED_KEY,
  TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY,
  agendaCalloutConfig,
  agendaObjectivesConfig,
  blockHasSeedKey,
  formatTutorNotes,
  isKnownInitialOct2Objectives,
  planTaitoFallAgendaMatches,
  shouldReplaceTutorNotes,
  type TaitoFallSessionAgenda,
} from "./taito-fall-2026-session-agendas.ts";

export type TaitoFallAgendaAction =
  | "created"
  | "updated"
  | "skipped"
  | "missing"
  | "dry_run";

export type TaitoFallAgendaSessionResult = {
  dateKey: string;
  subject: "SAT" | "IELTS";
  title: string;
  sessionId: string | null;
  tutorNotes: TaitoFallAgendaAction;
  objectives: TaitoFallAgendaAction;
  callout: TaitoFallAgendaAction;
  reason?: string;
};

export type SeedTaitoFallAgendasResult = {
  ok: boolean;
  courseId: string | null;
  dryRun: boolean;
  force: boolean;
  sessions: TaitoFallAgendaSessionResult[];
  missingDateKeys: string[];
};

export type SeedTaitoFallAgendasOptions = {
  courseId?: string;
  actorUserId?: string;
  dryRun?: boolean;
  force?: boolean;
  skipStudentBlocks?: boolean;
};

async function resolveCourseId(courseId?: string): Promise<string | null> {
  if (courseId) return courseId;
  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.title, FALL_SAT_COURSE_TITLE))
    .limit(1);
  return course?.id ?? null;
}

async function resolveActorUserId(
  preferred: string | undefined,
  fallbacks: Array<string | null | undefined>,
): Promise<string | null> {
  const candidates = [preferred, ...fallbacks].filter(
    (value): value is string => Boolean(value),
  );
  if (candidates.length === 0) {
    const [admin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "administrator"))
      .limit(1);
    return admin?.id ?? null;
  }
  return candidates[0] ?? null;
}

async function nextBlockPosition(sessionId: string): Promise<number> {
  const [row] = await db
    .select({
      position: sql<number>`coalesce(max(${curriculumBlocksTable.position}), -1)`,
    })
    .from(curriculumBlocksTable)
    .where(eq(curriculumBlocksTable.sessionId, sessionId));
  return Number(row?.position ?? -1) + 1;
}

async function upsertTutorNotes(args: {
  sessionId: string;
  agenda: TaitoFallSessionAgenda;
  actorUserId: string;
  force: boolean;
  dryRun: boolean;
}): Promise<TaitoFallAgendaAction> {
  const content = formatTutorNotes(args.agenda);
  const [existing] = await db
    .select({
      id: sessionArtifactsTable.id,
      content: sessionArtifactsTable.content,
    })
    .from(sessionArtifactsTable)
    .where(
      and(
        eq(sessionArtifactsTable.sessionId, args.sessionId),
        eq(sessionArtifactsTable.kind, "tutor_notes"),
      ),
    )
    .limit(1);
  if (existing?.content === content) return "skipped";
  const replace = shouldReplaceTutorNotes(
    existing?.content,
    args.agenda.dateKey,
    args.force,
  );
  if (!replace) return "skipped";
  if (args.dryRun) return existing ? "updated" : "created";
  await db
    .insert(sessionArtifactsTable)
    .values({
      sessionId: args.sessionId,
      createdBy: args.actorUserId,
      kind: "tutor_notes",
      content,
      visibility: "tutor",
      status: "draft",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [sessionArtifactsTable.sessionId, sessionArtifactsTable.kind],
      set: {
        content,
        visibility: "tutor",
        status: "draft",
        updatedAt: new Date(),
      },
    });
  return existing ? "updated" : "created";
}

async function upsertSeededBlock(args: {
  sessionId: string;
  kind: "objectives" | "callout";
  seedKey: string;
  config: Record<string, unknown>;
  adoptInitialOct2?: boolean;
  dryRun: boolean;
}): Promise<TaitoFallAgendaAction> {
  const existing = await db
    .select()
    .from(curriculumBlocksTable)
    .where(eq(curriculumBlocksTable.sessionId, args.sessionId));
  const seeded = existing.find((block) =>
    blockHasSeedKey(block.config, args.seedKey),
  );
  const adoptable =
    !seeded &&
    args.adoptInitialOct2 &&
    args.kind === "objectives"
      ? existing.find(
          (block) =>
            block.kind === "objectives" &&
            isKnownInitialOct2Objectives(block.config),
        )
      : undefined;
  const target = seeded ?? adoptable;
  if (
    target &&
    target.kind === args.kind &&
    target.visibility === "both" &&
    target.status === "published" &&
    JSON.stringify(target.config) === JSON.stringify(args.config)
  ) {
    return "skipped";
  }
  if (args.dryRun) return target ? "updated" : "created";
  if (target) {
    await db
      .update(curriculumBlocksTable)
      .set({
        kind: args.kind,
        visibility: "both",
        status: "published",
        config: args.config,
        updatedAt: new Date(),
      })
      .where(eq(curriculumBlocksTable.id, target.id));
    return "updated";
  }
  await db.insert(curriculumBlocksTable).values({
    sessionId: args.sessionId,
    kind: args.kind,
    position: await nextBlockPosition(args.sessionId),
    visibility: "both",
    status: "published",
    config: args.config,
  });
  return "created";
}

export async function seedTaitoFallAgendas(
  options: SeedTaitoFallAgendasOptions = {},
): Promise<SeedTaitoFallAgendasResult> {
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const courseId = await resolveCourseId(options.courseId);
  if (!courseId) {
    return {
      ok: false,
      courseId: null,
      dryRun,
      force,
      sessions: [],
      missingDateKeys: [],
    };
  }

  const [courseSessions, taito] = await Promise.all([
    db.select().from(sessionsTable).where(eq(sessionsTable.courseId, courseId)),
    db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, TAITO_STUDENT_EMAIL))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const matches = planTaitoFallAgendaMatches(courseSessions, {
    taitoUserId: taito?.id ?? null,
  });
  const fallbackActor = await resolveActorUserId(options.actorUserId, [
    ...matches.map((match) => match.session?.tutorUserId),
    taito?.id,
  ]);
  const results: TaitoFallAgendaSessionResult[] = [];

  for (const match of matches) {
    if (!match.session) {
      results.push({
        dateKey: match.dateKey,
        subject: match.subject,
        title: match.agenda.title,
        sessionId: null,
        tutorNotes: "missing",
        objectives: options.skipStudentBlocks ? "skipped" : "missing",
        callout: options.skipStudentBlocks ? "skipped" : "missing",
        reason: "No live Taito Fall session matched this schedule date.",
      });
      continue;
    }

    const actorUserId =
      match.session.tutorUserId ?? fallbackActor ?? match.session.clientUserId;
    let tutorNotes: TaitoFallAgendaAction = "skipped";
    let notesReason: string | undefined;
    if (!actorUserId && !dryRun) {
      notesReason = "No actor user for session_artifacts.created_by (tutor/admin).";
    } else {
      tutorNotes = await upsertTutorNotes({
        sessionId: match.session.id,
        agenda: match.agenda,
        actorUserId: actorUserId ?? "00000000-0000-0000-0000-000000000000",
        force,
        dryRun,
      });
    }

    let objectives: TaitoFallAgendaAction = "skipped";
    let callout: TaitoFallAgendaAction = "skipped";
    if (!options.skipStudentBlocks) {
      objectives = await upsertSeededBlock({
        sessionId: match.session.id,
        kind: "objectives",
        seedKey: TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY,
        config: agendaObjectivesConfig(match.agenda),
        adoptInitialOct2: match.dateKey === "2026-10-02",
        dryRun,
      });
      callout = await upsertSeededBlock({
        sessionId: match.session.id,
        kind: "callout",
        seedKey: TAITO_FALL_AGENDA_CALLOUT_SEED_KEY,
        config: agendaCalloutConfig(match.agenda),
        dryRun,
      });
    }

    results.push({
      dateKey: match.dateKey,
      subject: match.subject,
      title: match.agenda.title,
      sessionId: match.session.id,
      tutorNotes,
      objectives,
      callout,
      reason: notesReason,
    });
  }

  const missingDateKeys = results
    .filter((row) => row.sessionId === null)
    .map((row) => row.dateKey);

  return {
    ok: missingDateKeys.length === 0,
    courseId,
    dryRun,
    force,
    sessions: results,
    missingDateKeys,
  };
}
