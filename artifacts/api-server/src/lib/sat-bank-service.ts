import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  bankAiAnnotationsTable,
  bankQuestionAssetsTable,
  bankQuestionsTable,
  db,
  examSourceAssetsTable,
  examSourceCollectionsTable,
  homeworkWeaknessGroupsTable,
  questionsTable,
  remediationRetriesTable,
  sessionPreworkPlansTable,
  sessionsTable,
} from "@workspace/db";
import {
  DEFAULT_COLLEGE_BOARD_ROOT,
  STAGED_COLLECTION_STUBS,
  collectionStubsFromManifest,
  isAssignableBankItem,
  parseCollegeBoardManifest,
  parseCollegeBoardPayload,
  type CollectionStub,
  type ParsedBankRecord,
} from "./sat-bank-import.ts";
import { generateQuestionsWithProvider } from "./question-generation.ts";
import {
  decideRetrySource,
  retryOutcomeFromAnswer,
  studentRetryShape,
} from "./sat-bank-retry.ts";
import {
  DEFAULT_PREWORK_TARGET_MINUTES,
  selectQuestionsForTimeBudget,
} from "./sat-bank-timing.ts";
import { groupMissesByWeakness } from "./sat-bank-weakness.ts";

export const SAT_BANK_IMPORT_ROOT = DEFAULT_COLLEGE_BOARD_ROOT;

function quizSubject(section: string): string {
  return section === "math" ? "SAT Math" : "SAT Reading & Writing";
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function asFiniteNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = asFiniteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asChoices(value: unknown): Array<{ id: string; label: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; label?: unknown; text?: unknown };
    if (typeof row.id !== "string" || typeof row.label !== "string" || typeof row.text !== "string") {
      return [];
    }
    return [{ id: row.id, label: row.label, text: row.text }];
  });
}

async function walkExtractFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(dir: string) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        await visit(full);
        continue;
      }
      if (
        /\.(json|jsonl)$/i.test(entry) &&
        !/schema\.json$/i.test(entry) &&
        !/manifest\.json$/i.test(entry) &&
        !/extraction-report\.json$/i.test(entry) &&
        !/(^|\/)fixtures(\/|$)/i.test(full)
      ) {
        files.push(full);
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function collectionStubs(rootDir = SAT_BANK_IMPORT_ROOT): Promise<CollectionStub[]> {
  try {
    const text = await readFile(path.join(rootDir, "manifest.json"), "utf8");
    const packs = parseCollegeBoardManifest(text);
    if (packs.length > 0) return collectionStubsFromManifest(packs);
  } catch {
    // Fall back to the built-in SAT 4–11 + PSAT pack list.
  }
  return STAGED_COLLECTION_STUBS;
}

export async function ensureStagedCollections(): Promise<number> {
  let upserted = 0;
  for (const stub of await collectionStubs()) {
    const [existing] = await db
      .select()
      .from(examSourceCollectionsTable)
      .where(eq(examSourceCollectionsTable.slug, stub.slug))
      .limit(1);
    const collectionId = existing
      ? existing.id
      : (
          await db
            .insert(examSourceCollectionsTable)
            .values({
              examFamily: stub.examFamily,
              examVariant: stub.examVariant,
              practiceTestNumber: stub.practiceTestNumber,
              formCode: stub.formCode,
              title: stub.title,
              slug: stub.slug,
              notes:
                "Official College Board extract. skill/topic/difficulty are null in these PDFs. Figures may be incomplete. PSAT packs use the same 120-item linear layout as these SAT PDFs.",
              extractStatus: "pending",
            })
            .returning({ id: examSourceCollectionsTable.id })
        )[0]!.id;
    if (!existing) upserted += 1;
    const existingAssets = await db
      .select()
      .from(examSourceAssetsTable)
      .where(eq(examSourceAssetsTable.collectionId, collectionId));
    for (const asset of stub.assets) {
      const already = existingAssets.some(
        (row) => row.kind === asset.kind && row.resourceUrl === asset.resourceUrl,
      );
      if (already) continue;
      await db.insert(examSourceAssetsTable).values({
        collectionId,
        kind: asset.kind,
        title: asset.title,
        resourceUrl: asset.resourceUrl,
        originalFilename: asset.resourceUrl.split("/").pop() ?? null,
      });
    }
  }
  return upserted;
}

async function upsertCollectionForRecord(record: ParsedBankRecord) {
  const [existing] = await db
    .select()
    .from(examSourceCollectionsTable)
    .where(eq(examSourceCollectionsTable.slug, record.collectionSlug))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(examSourceCollectionsTable)
    .values({
      examFamily: record.examFamily,
      examVariant: record.examVariant,
      practiceTestNumber: record.practiceTestNumber,
      formCode: record.formCode,
      title: record.collectionTitle,
      slug: record.collectionSlug,
      extractStatus: record.sourceKind === "seed" ? "partial" : "partial",
    })
    .returning();
  return created!;
}

async function upsertAssets(
  collectionId: string,
  assets: ParsedBankRecord["assets"],
) {
  if (assets.length === 0) return;
  const existing = await db
    .select()
    .from(examSourceAssetsTable)
    .where(eq(examSourceAssetsTable.collectionId, collectionId));
  for (const asset of assets) {
    if (existing.some((row) => row.kind === asset.kind && row.resourceUrl === asset.resourceUrl)) {
      continue;
    }
    await db.insert(examSourceAssetsTable).values({
      collectionId,
      kind: asset.kind,
      title: asset.title,
      resourceUrl: asset.resourceUrl,
      originalFilename: asset.resourceUrl.split("/").pop() ?? null,
    });
  }
}

export async function upsertBankRecords(records: ParsedBankRecord[]): Promise<{
  inserted: number;
  updated: number;
}> {
  let inserted = 0;
  let updated = 0;
  for (const record of records) {
    const collection = await upsertCollectionForRecord(record);
    await upsertAssets(collection.id, record.assets);
    const values = {
      collectionId: collection.id,
      examFamily: record.examFamily,
      examVariant: record.examVariant,
      practiceTestNumber: record.practiceTestNumber,
      formCode: record.formCode,
      section: record.section,
      module: record.module,
      questionNumber: record.questionNumber,
      position: record.position,
      prompt: record.prompt,
      stimulus: record.stimulus,
      choices: record.choices,
      correctAnswer: record.correctAnswer,
      officialExplanation: record.officialExplanation,
      figures: record.figures,
      scoring: record.scoring,
      skill: record.skill,
      domain: record.domain,
      difficulty: record.difficulty,
      questionType: record.questionType,
      estimatedSeconds: record.estimatedSeconds,
      sourceKind: record.sourceKind,
      extractGaps: record.extractGaps,
      sourceFiles: record.sourceFiles,
      updatedAt: new Date(),
    };
    const [existing] = await db
      .select({ id: bankQuestionsTable.id })
      .from(bankQuestionsTable)
      .where(eq(bankQuestionsTable.sourceKey, record.sourceKey))
      .limit(1);
    if (existing) {
      await db
        .update(bankQuestionsTable)
        .set(values)
        .where(eq(bankQuestionsTable.id, existing.id));
      updated += 1;
    } else {
      const [created] = await db
        .insert(bankQuestionsTable)
        .values({ ...values, sourceKey: record.sourceKey })
        .returning({ id: bankQuestionsTable.id });
      for (const asset of record.assets) {
        await db.insert(bankQuestionAssetsTable).values({
          bankQuestionId: created!.id,
          kind: asset.kind,
          resourceUrl: asset.resourceUrl,
        });
      }
      inserted += 1;
    }
    await refreshCollectionExtractStatus(collection.id);
  }
  return { inserted, updated };
}

async function refreshCollectionExtractStatus(collectionId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bankQuestionsTable)
    .where(eq(bankQuestionsTable.collectionId, collectionId));
  const questionCount = Number(count ?? 0);
  await db
    .update(examSourceCollectionsTable)
    .set({
      extractStatus: questionCount === 0 ? "pending" : "partial",
      updatedAt: new Date(),
    })
    .where(eq(examSourceCollectionsTable.id, collectionId));
}

export async function importCollegeBoardExtracts(input: {
  rootDir?: string;
  payloadText?: string;
  payloadSource?: string;
}): Promise<{
  rootDir: string;
  filesScanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicatesInFile: number;
  collectionsEnsured: number;
}> {
  const collectionsEnsured = await ensureStagedCollections();
  const parsed = input.payloadText
    ? parseCollegeBoardPayload(input.payloadText, input.payloadSource ?? "body")
    : { records: [] as ParsedBankRecord[], skipped: [], duplicatesInFile: [] };
  let filesScanned = 0;
  const rootDir = input.rootDir ?? SAT_BANK_IMPORT_ROOT;
  if (!input.payloadText) {
    const files = await walkExtractFiles(rootDir);
    filesScanned = files.length;
    for (const file of files) {
      const text = await readFile(file, "utf8");
      const fileParsed = parseCollegeBoardPayload(text, file);
      parsed.records.push(...fileParsed.records);
      parsed.skipped.push(...fileParsed.skipped);
      parsed.duplicatesInFile.push(...fileParsed.duplicatesInFile);
    }
  }
  const unique = new Map<string, ParsedBankRecord>();
  const seenDedup = new Set<string>();
  for (const record of parsed.records) {
    if (seenDedup.has(record.dedupKey)) continue;
    seenDedup.add(record.dedupKey);
    unique.set(record.sourceKey, record);
  }
  const { inserted, updated } = await upsertBankRecords([...unique.values()]);
  return {
    rootDir,
    filesScanned,
    inserted,
    updated,
    skipped: parsed.skipped.length,
    duplicatesInFile: parsed.duplicatesInFile.length + (parsed.records.length - unique.size),
    collectionsEnsured,
  };
}

export async function materializeBankQuestion(bankQuestionId: string): Promise<string> {
  const [bank] = await db
    .select()
    .from(bankQuestionsTable)
    .where(eq(bankQuestionsTable.id, bankQuestionId))
    .limit(1);
  if (!bank) throw new Error("Bank question not found");
  if (bank.linkedQuestionId) {
    const [linked] = await db
      .select({ id: questionsTable.id })
      .from(questionsTable)
      .where(eq(questionsTable.id, bank.linkedQuestionId))
      .limit(1);
    if (linked) return linked.id;
  }
  const [created] = await db
    .insert(questionsTable)
    .values({
      subject: quizSubject(bank.section),
      domain: bank.domain || (bank.section === "math" ? "SAT Math" : "Reading and Writing"),
      skill: bank.skill || "Skill not in extract",
      questionType: bank.questionType,
      difficulty: bank.difficulty || "unspecified",
      stimulus: bank.stimulus,
      prompt: bank.prompt || "Figure or table was not recovered from this PDF page. Open the linked source PDF.",
      choices: bank.choices,
      correctAnswer: bank.correctAnswer,
      explanation: bank.officialExplanation,
      sourceType: bank.sourceKind === "seed" ? "seed" : "college_board",
      reviewStatus: "approved",
      tags: [bank.sourceKey, bank.examFamily, `module-${bank.module}`],
      generationMethod:
        bank.sourceKind === "seed" ? "seed-fixture" : "college-board-extract",
    })
    .returning({ id: questionsTable.id });
  await db
    .update(bankQuestionsTable)
    .set({ linkedQuestionId: created!.id, updatedAt: new Date() })
    .where(eq(bankQuestionsTable.id, bank.id));
  return created!.id;
}

async function archiveSessionPrework(sessionId: string) {
  const existing = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, sessionId),
        eq(assignmentsTable.deliveryPhase, "before_session"),
      ),
    );
  for (const row of existing) {
    if (row.status === "archived") continue;
    await db
      .update(assignmentsTable)
      .set({ status: "archived" })
      .where(eq(assignmentsTable.id, row.id));
  }
}

export async function assignPreworkFromBank(input: {
  sessionId: string;
  actorUserId?: string | null;
  collectionId?: string | null;
  bankQuestionIds?: string[];
  homeworkKind?: "diagnostic" | "routine";
  targetMinutes?: number;
}): Promise<{
  planId: string;
  assignmentId: string;
  homeworkKind: "diagnostic" | "routine";
  targetMinutes: number;
  estimatedSeconds: number;
  questionCount: number;
  withinTolerance: boolean;
  extractIncomplete: boolean;
}> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, input.sessionId))
    .limit(1);
  if (!session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
  const targetMinutes = input.targetMinutes ?? DEFAULT_PREWORK_TARGET_MINUTES;
  const homeworkKind = input.homeworkKind ?? "routine";
  let pool = await db
    .select()
    .from(bankQuestionsTable)
    .orderBy(asc(bankQuestionsTable.position), asc(bankQuestionsTable.questionNumber));
  if (input.collectionId) {
    pool = pool.filter((row) => row.collectionId === input.collectionId);
  }
  if (input.bankQuestionIds && input.bankQuestionIds.length > 0) {
    const allowed = new Set(input.bankQuestionIds);
    pool = pool.filter((row) => allowed.has(row.id));
  }
  pool = pool.filter((row) =>
    isAssignableBankItem({
      prompt: row.prompt,
      questionType: row.questionType,
      choices: Array.isArray(row.choices) ? row.choices : [],
      correctAnswer: row.correctAnswer,
      extractGaps: (row.extractGaps ?? {}) as {
        missingPrompt?: boolean;
        missingChoices?: boolean;
      },
    }),
  );
  if (pool.length === 0) {
    throw Object.assign(
      new Error(
        "The SAT/PSAT bank has no matching questions yet. Import a College Board extract or the seed fixture first.",
      ),
      { status: 409 },
    );
  }
  const timed = pool.map((row) => ({
    id: row.id,
    section: row.section as "rw" | "math",
    skill: row.skill,
    estimatedSeconds: row.estimatedSeconds,
    position: row.position,
  }));
  const selection = selectQuestionsForTimeBudget(timed, {
    targetMinutes,
    preferOriginalOrder: Boolean(input.collectionId || input.bankQuestionIds?.length),
  });
  const selected = selection.selected
    .map((item) => pool.find((row) => row.id === item.id)!)
    .filter(Boolean);
  await archiveSessionPrework(session.id);
  const title =
    homeworkKind === "diagnostic"
      ? `SAT diagnostic pre-work — ${session.title}`
      : `60-minute SAT pre-work — ${session.title}`;
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: session.courseId,
      sessionId: session.id,
      deliveryPhase: "before_session",
      title,
      subject: session.subject || "SAT",
      instructions:
        homeworkKind === "diagnostic"
          ? "Timed diagnostic from the SAT/PSAT bank. This is not an official College Board score."
          : "About 60 minutes of selected bank questions for this session. Accuracy is recorded; this is not an official SAT score.",
      status: "published",
      timeLimitMinutes: targetMinutes,
      maxAttempts: 1,
    })
    .returning();
  for (const [index, bank] of selected.entries()) {
    const questionId = await materializeBankQuestion(bank.id);
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: assignment!.id,
      questionId,
      position: index,
    });
  }
  const [existingPlan] = await db
    .select()
    .from(sessionPreworkPlansTable)
    .where(eq(sessionPreworkPlansTable.sessionId, session.id))
    .limit(1);
  const planValues = {
    assignmentId: assignment!.id,
    homeworkKind,
    targetMinutes,
    estimatedSeconds: selection.estimatedSeconds,
    status: "assigned",
    createdByUserId: input.actorUserId ?? null,
    updatedAt: new Date(),
  };
  const plan = existingPlan
    ? (
        await db
          .update(sessionPreworkPlansTable)
          .set(planValues)
          .where(eq(sessionPreworkPlansTable.id, existingPlan.id))
          .returning()
      )[0]!
    : (
        await db
          .insert(sessionPreworkPlansTable)
          .values({ sessionId: session.id, ...planValues })
          .returning()
      )[0]!;
  await db
    .update(sessionsTable)
    .set({ hasHomework: true, updatedAt: new Date() })
    .where(eq(sessionsTable.id, session.id));
  return {
    planId: plan.id,
    assignmentId: assignment!.id,
    homeworkKind,
    targetMinutes,
    estimatedSeconds: selection.estimatedSeconds,
    questionCount: selected.length,
    withinTolerance: selection.withinTolerance,
    extractIncomplete: selected.some((row) => !row.officialExplanation.trim()),
  };
}

export async function persistWeaknessGroups(input: {
  sessionId: string;
  attemptId: string;
  items: Array<{
    questionId: string;
    skill: string;
    domain?: string | null;
    correct: boolean;
  }>;
}): Promise<number> {
  const questionIds = input.items.map((item) => item.questionId);
  const bankRows =
    questionIds.length === 0
      ? []
      : await db
          .select({
            id: bankQuestionsTable.id,
            linkedQuestionId: bankQuestionsTable.linkedQuestionId,
          })
          .from(bankQuestionsTable)
          .where(inArray(bankQuestionsTable.linkedQuestionId, questionIds));
  const bankByQuestion = new Map(
    bankRows
      .filter((row) => row.linkedQuestionId)
      .map((row) => [row.linkedQuestionId!, row.id]),
  );
  const groups = groupMissesByWeakness(
    input.items.map((item) => ({
      ...item,
      bankQuestionId: bankByQuestion.get(item.questionId) ?? null,
    })),
  );
  await db
    .delete(homeworkWeaknessGroupsTable)
    .where(eq(homeworkWeaknessGroupsTable.attemptId, input.attemptId));
  for (const group of groups) {
    await db.insert(homeworkWeaknessGroupsTable).values({
      sessionId: input.sessionId,
      attemptId: input.attemptId,
      skill: group.skill,
      domain: group.domain,
      missCount: group.missCount,
      priority: group.priority,
      bankQuestionIds: group.bankQuestionIds,
      questionIds: group.questionIds,
    });
  }
  return groups.length;
}

export async function listBankCollections() {
  await ensureStagedCollections();
  const collections = await db
    .select()
    .from(examSourceCollectionsTable)
    .orderBy(asc(examSourceCollectionsTable.examFamily), asc(examSourceCollectionsTable.title));
  const questions = await db.select().from(bankQuestionsTable);
  const assets = await db.select().from(examSourceAssetsTable);
  return collections.map((collection) => {
    const collectionQuestions = questions.filter((row) => row.collectionId === collection.id);
    return {
      id: collection.id,
      examFamily: collection.examFamily,
      examVariant: collection.examVariant,
      practiceTestNumber: asFiniteNumberOrNull(collection.practiceTestNumber),
      formCode: collection.formCode,
      title: collection.title,
      slug: collection.slug,
      notes: collection.notes,
      extractStatus: collection.extractStatus,
      questionCount: collectionQuestions.length,
      officialExplanationCount: collectionQuestions.filter((row) =>
        row.officialExplanation.trim(),
      ).length,
      assets: assets
        .filter((asset) => asset.collectionId === collection.id)
        .map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          title: asset.title,
          resourceUrl: asset.resourceUrl ?? null,
        })),
    };
  });
}

export async function getBankCollection(collectionId: string) {
  const collections = await listBankCollections();
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection) return null;
  const questions = await db
    .select()
    .from(bankQuestionsTable)
    .where(eq(bankQuestionsTable.collectionId, collectionId))
    .orderBy(asc(bankQuestionsTable.position), asc(bankQuestionsTable.questionNumber));
  return {
    ...collection,
    questions: questions.map((row) => bankQuestionShape(row)),
  };
}

export function bankQuestionShape(row: typeof bankQuestionsTable.$inferSelect) {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    collectionId: row.collectionId,
    examFamily: row.examFamily,
    examVariant: row.examVariant,
    practiceTestNumber: asFiniteNumberOrNull(row.practiceTestNumber),
    formCode: row.formCode,
    section: row.section === "math" ? ("math" as const) : ("rw" as const),
    module: asFiniteNumber(row.module),
    questionNumber: asFiniteNumber(row.questionNumber),
    position: asFiniteNumber(row.position),
    prompt: row.prompt,
    stimulus: row.stimulus,
    choices: asChoices(row.choices),
    skill: row.skill,
    domain: row.domain,
    difficulty: row.difficulty,
    questionType: row.questionType,
    estimatedSeconds: asFiniteNumber(row.estimatedSeconds),
    sourceKind: row.sourceKind,
    extractGaps: row.extractGaps ?? {},
    assignable: isAssignableBankItem({
      prompt: row.prompt,
      questionType: row.questionType,
      choices: asChoices(row.choices),
      correctAnswer: row.correctAnswer,
      extractGaps: (row.extractGaps ?? {}) as {
        missingPrompt?: boolean;
        missingChoices?: boolean;
      },
    }),
    hasOfficialExplanation: Boolean(row.officialExplanation.trim()),
    linkedQuestionId: row.linkedQuestionId,
  };
}

export async function listBankQuestions(filters: {
  examFamily?: string;
  collectionId?: string;
  section?: string;
  skill?: string;
}) {
  let rows = await db
    .select()
    .from(bankQuestionsTable)
    .orderBy(
      asc(bankQuestionsTable.examFamily),
      asc(bankQuestionsTable.practiceTestNumber),
      asc(bankQuestionsTable.position),
    );
  if (filters.examFamily) {
    rows = rows.filter((row) => row.examFamily === filters.examFamily);
  }
  if (filters.collectionId) {
    rows = rows.filter((row) => row.collectionId === filters.collectionId);
  }
  if (filters.section) {
    rows = rows.filter((row) => row.section === filters.section);
  }
  if (filters.skill) {
    const skill = filters.skill.toLowerCase();
    rows = rows.filter((row) => row.skill.toLowerCase().includes(skill));
  }
  return rows.map((row) => bankQuestionShape(row));
}

async function bankForLinkedQuestion(questionId: string) {
  const [row] = await db
    .select()
    .from(bankQuestionsTable)
    .where(eq(bankQuestionsTable.linkedQuestionId, questionId))
    .limit(1);
  return row ?? null;
}

export async function getSessionLesson(sessionId: string) {
  const [plan] = await db
    .select()
    .from(sessionPreworkPlansTable)
    .where(eq(sessionPreworkPlansTable.sessionId, sessionId))
    .limit(1);
  const [assignment] = plan
    ? await db
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, plan.assignmentId))
        .limit(1)
    : [];
  const [attempt] = assignment
    ? await db
        .select()
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.assignmentId, assignment.id),
            inArray(attemptsTable.status, ["submitted", "expired"]),
          ),
        )
        .orderBy(sql`${attemptsTable.submittedAt} desc nulls last`)
        .limit(1)
    : [];
  let groups = attempt
    ? await db
        .select()
        .from(homeworkWeaknessGroupsTable)
        .where(eq(homeworkWeaknessGroupsTable.attemptId, attempt.id))
        .orderBy(asc(homeworkWeaknessGroupsTable.priority))
    : [];
  const result = (attempt?.result ?? null) as {
    items?: Array<{
      questionId: string;
      skill: string;
      domain?: string;
      correct: boolean;
      prompt?: string;
      finalAnswer?: string | null;
      correctAnswer?: string;
      explanation?: string;
    }>;
  } | null;
  if (attempt && groups.length === 0 && result?.items) {
    await persistWeaknessGroups({
      sessionId,
      attemptId: attempt.id,
      items: result.items,
    });
    groups = await db
      .select()
      .from(homeworkWeaknessGroupsTable)
      .where(eq(homeworkWeaknessGroupsTable.attemptId, attempt.id))
      .orderBy(asc(homeworkWeaknessGroupsTable.priority));
  }
  const misses = [];
  for (const item of result?.items ?? []) {
    if (item.correct) continue;
    const bank = await bankForLinkedQuestion(item.questionId);
    const [annotation] = bank
      ? await db
          .select()
          .from(bankAiAnnotationsTable)
          .where(eq(bankAiAnnotationsTable.bankQuestionId, bank.id))
          .orderBy(sql`${bankAiAnnotationsTable.createdAt} desc`)
          .limit(1)
      : [];
    misses.push({
      questionId: item.questionId,
      bankQuestionId: bank?.id ?? null,
      skill: item.skill,
      domain: item.domain ?? bank?.domain ?? "",
      prompt: item.prompt ?? bank?.prompt ?? "",
      stimulus: bank?.stimulus ?? null,
      choices: asChoices(bank?.choices),
      studentAnswer: item.finalAnswer ?? null,
      officialExplanation: bank?.officialExplanation || item.explanation || "",
      aiStudentFeedback: annotation?.studentFeedback ?? null,
      aiTutorGuidance: annotation?.tutorGuidance ?? null,
      aiSkillAnalysis: annotation?.skillWeaknessAnalysis ?? null,
      sourceKey: bank?.sourceKey ?? null,
      sourceKind: bank?.sourceKind ?? null,
    });
  }
  const retries = await db
    .select()
    .from(remediationRetriesTable)
    .where(eq(remediationRetriesTable.sessionId, sessionId))
    .orderBy(asc(remediationRetriesTable.createdAt));
  const retryQuestionIds = retries
    .map((row) => row.retryQuestionId)
    .filter((id): id is string => Boolean(id));
  const retryQuestions =
    retryQuestionIds.length === 0
      ? []
      : await db.select().from(questionsTable).where(inArray(questionsTable.id, retryQuestionIds));
  const retryQuestionById = new Map(retryQuestions.map((row) => [row.id, row]));
  const scoreReporting =
    plan?.homeworkKind === "diagnostic" ? "estimated_diagnostic" : "none";
  return {
    sessionId,
    homeworkKind: plan?.homeworkKind ?? null,
    scoreReporting,
    scoreHonesty:
      scoreReporting === "none"
        ? "This 60-minute pre-work reports accuracy only. It is not an official SAT score."
        : "Any projected SAT band is estimated from a labeled diagnostic. It is not an official College Board score.",
    plan: plan
      ? {
          id: plan.id,
          assignmentId: plan.assignmentId,
          homeworkKind: plan.homeworkKind,
          targetMinutes: asFiniteNumber(plan.targetMinutes, 60),
          estimatedSeconds: asFiniteNumber(plan.estimatedSeconds),
          status: plan.status,
        }
      : null,
    assignmentTitle: assignment?.title ?? null,
    attemptId: attempt?.id ?? null,
    attemptStatus: attempt?.status ?? null,
    accuracyPercent: asFiniteNumberOrNull(attempt?.score),
    weaknessGroups: groups.map((group) => ({
      id: group.id,
      skill: group.skill,
      domain: group.domain,
      missCount: asFiniteNumber(group.missCount),
      priority: asFiniteNumber(group.priority),
      questionIds: asStringArray(group.questionIds),
      bankQuestionIds: asStringArray(group.bankQuestionIds),
    })),
    misses,
    retries: retries.map((row) => {
      const question = row.retryQuestionId
        ? retryQuestionById.get(row.retryQuestionId)
        : undefined;
      const safe = question
        ? studentRetryShape({
            id: question.id,
            prompt: question.prompt,
            stimulus: question.stimulus,
            choices: asChoices(question.choices),
            skill: question.skill,
            domain: question.domain,
            difficulty: question.difficulty,
            correctAnswer: question.correctAnswer,
            officialExplanation: question.explanation,
          })
        : null;
      return {
        id: row.id,
        sourceQuestionId: row.sourceQuestionId,
        sourceBankQuestionId: row.sourceBankQuestionId,
        retryQuestionId: row.retryQuestionId,
        source: row.source as "bank" | "ai" | "blocked",
        blockedReason: row.blockedReason,
        outcome: row.outcome as "pending" | "mastered" | "still_struggling",
        correct: row.correct,
        prompt: safe?.prompt ?? null,
        stimulus: safe?.stimulus ?? null,
        skill: safe?.skill ?? null,
        choices: safe?.choices ?? [],
      };
    }),
  };
}

async function usedSourceKeysForStudent(studentUserId: string): Promise<Set<string>> {
  const usedRows = await db
    .select({ sourceKey: bankQuestionsTable.sourceKey })
    .from(assignmentQuestionsTable)
    .innerJoin(attemptsTable, eq(attemptsTable.assignmentId, assignmentQuestionsTable.assignmentId))
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.linkedQuestionId, assignmentQuestionsTable.questionId),
    )
    .where(eq(attemptsTable.userId, studentUserId));
  const retryRows = await db
    .select({ sourceKey: bankQuestionsTable.sourceKey })
    .from(remediationRetriesTable)
    .innerJoin(
      bankQuestionsTable,
      eq(bankQuestionsTable.id, remediationRetriesTable.retryBankQuestionId),
    )
    .innerJoin(sessionsTable, eq(sessionsTable.id, remediationRetriesTable.sessionId))
    .where(eq(sessionsTable.clientUserId, studentUserId));
  return new Set(
    [...usedRows, ...retryRows]
      .map((row) => row.sourceKey)
      .filter((key): key is string => Boolean(key)),
  );
}

export async function requestSimilarRetry(input: {
  sessionId: string;
  sourceQuestionId: string;
  env?: NodeJS.ProcessEnv;
}) {
  const lesson = await getSessionLesson(input.sessionId);
  if (!lesson.attemptId) {
    throw Object.assign(new Error("No submitted pre-work is available for retry."), {
      status: 409,
    });
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, input.sessionId))
    .limit(1);
  const sourceBank = await bankForLinkedQuestion(input.sourceQuestionId);
  const sourceQuestion = (
    await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.id, input.sourceQuestionId))
      .limit(1)
  )[0];
  if (!sourceQuestion) {
    throw Object.assign(new Error("Missed question not found"), { status: 404 });
  }
  const unusedBank = sourceBank
    ? await db
        .select()
        .from(bankQuestionsTable)
        .where(ne(bankQuestionsTable.id, sourceBank.id))
    : await db.select().from(bankQuestionsTable);
  const used = session?.clientUserId
    ? await usedSourceKeysForStudent(session.clientUserId)
    : new Set<string>();
  const decision = decideRetrySource({
    source: {
      id: sourceBank?.id ?? sourceQuestion.id,
      sourceKey: sourceBank?.sourceKey ?? sourceQuestion.id,
      skill: sourceBank?.skill ?? sourceQuestion.skill,
      section: (sourceBank?.section as "rw" | "math") ?? "rw",
    },
    unusedBank: unusedBank.map((row) => ({
      id: row.id,
      sourceKey: row.sourceKey,
      skill: row.skill,
      section: row.section as "rw" | "math",
      module: row.module,
      questionNumber: row.questionNumber,
    })),
    usedSourceKeys: used,
    env: input.env,
  });

  if (decision.kind === "blocked") {
    const [retry] = await db
      .insert(remediationRetriesTable)
      .values({
        sessionId: input.sessionId,
        sourceAttemptId: lesson.attemptId,
        sourceBankQuestionId: sourceBank?.id ?? null,
        sourceQuestionId: input.sourceQuestionId,
        source: "blocked",
        blockedReason: decision.reason,
        outcome: "pending",
      })
      .returning();
    return {
      retryId: retry!.id,
      source: "blocked" as const,
      blockedReason: decision.reason,
      requiredEnv: decision.status.requiredEnv,
      question: null,
    };
  }

  if (decision.kind === "bank") {
    const retryQuestionId = await materializeBankQuestion(decision.candidate.id);
    const [question] = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.id, retryQuestionId))
      .limit(1);
    const [retry] = await db
      .insert(remediationRetriesTable)
      .values({
        sessionId: input.sessionId,
        sourceAttemptId: lesson.attemptId,
        sourceBankQuestionId: sourceBank?.id ?? null,
        sourceQuestionId: input.sourceQuestionId,
        retryBankQuestionId: decision.candidate.id,
        retryQuestionId,
        source: "bank",
        outcome: "pending",
      })
      .returning();
    return {
      retryId: retry!.id,
      source: "bank" as const,
      blockedReason: null,
      requiredEnv: [],
      reason: decision.reason,
      question: studentRetryShape({
        id: question!.id,
        prompt: question!.prompt,
        stimulus: question!.stimulus,
        choices: question!.choices,
        skill: question!.skill,
        domain: question!.domain,
        difficulty: question!.difficulty,
        correctAnswer: question!.correctAnswer,
        officialExplanation: question!.explanation,
      }),
    };
  }

  const generated = await generateQuestionsWithProvider({
    subject: sourceQuestion.subject,
    count: 1,
    skill: sourceQuestion.skill,
    difficulty:
      sourceQuestion.difficulty === "hard" || sourceQuestion.difficulty === "easy"
        ? sourceQuestion.difficulty
        : "medium",
    sourceText: `${sourceQuestion.skill}. Write an original analogous item. Do not copy official SAT wording.`,
    env: input.env,
  });
  const draft = generated[0]!;
  const [aiQuestion] = await db
    .insert(questionsTable)
    .values({
      subject: sourceQuestion.subject,
      domain: draft.domain,
      skill: draft.skill,
      questionType: "mcq",
      difficulty: draft.difficulty,
      prompt: draft.prompt,
      choices: draft.choices,
      correctAnswer: draft.correctAnswer,
      explanation: draft.explanation,
      sourceType: "original",
      reviewStatus: "approved",
      tags: ["analogous-retry", sourceQuestion.skill],
      generationMethod: "openai",
    })
    .returning();
  if (sourceBank) {
    await db.insert(bankAiAnnotationsTable).values({
      bankQuestionId: sourceBank.id,
      studentFeedback: `Retry drafted for a ${sourceQuestion.skill} miss. Official explanation stays on the original item.`,
      tutorGuidance: "Use the analogous item only after the official miss is taught.",
      skillWeaknessAnalysis: sourceQuestion.skill,
      analogousProblemPrompt: draft.prompt,
      generatedBy: "openai",
    });
  }
  const [retry] = await db
    .insert(remediationRetriesTable)
    .values({
      sessionId: input.sessionId,
      sourceAttemptId: lesson.attemptId,
      sourceBankQuestionId: sourceBank?.id ?? null,
      sourceQuestionId: input.sourceQuestionId,
      retryQuestionId: aiQuestion!.id,
      source: "ai",
      outcome: "pending",
    })
    .returning();
  return {
    retryId: retry!.id,
    source: "ai" as const,
    blockedReason: null,
    requiredEnv: [],
    reason: decision.reason,
    question: studentRetryShape({
      id: aiQuestion!.id,
      prompt: aiQuestion!.prompt,
      stimulus: aiQuestion!.stimulus,
      choices: aiQuestion!.choices,
      skill: aiQuestion!.skill,
      domain: aiQuestion!.domain,
      difficulty: aiQuestion!.difficulty,
      correctAnswer: aiQuestion!.correctAnswer,
      officialExplanation: aiQuestion!.explanation,
    }),
  };
}

export async function recordRetryOutcome(input: {
  retryId: string;
  studentAnswer: string;
}) {
  const [retry] = await db
    .select()
    .from(remediationRetriesTable)
    .where(eq(remediationRetriesTable.id, input.retryId))
    .limit(1);
  if (!retry) {
    throw Object.assign(new Error("Retry not found"), { status: 404 });
  }
  if (!retry.retryQuestionId) {
    throw Object.assign(new Error("This retry was blocked and has no question to grade."), {
      status: 409,
    });
  }
  const [question] = await db
    .select()
    .from(questionsTable)
    .where(eq(questionsTable.id, retry.retryQuestionId))
    .limit(1);
  if (!question) {
    throw Object.assign(new Error("Retry question not found"), { status: 404 });
  }
  const graded = retryOutcomeFromAnswer({
    studentAnswer: input.studentAnswer,
    correctAnswer: question.correctAnswer,
  });
  const [updated] = await db
    .update(remediationRetriesTable)
    .set({
      studentAnswer: input.studentAnswer,
      correct: graded.correct,
      outcome: graded.outcome,
      completedAt: new Date(),
    })
    .where(eq(remediationRetriesTable.id, retry.id))
    .returning();
  return {
    retryId: updated!.id,
    correct: graded.correct,
    outcome: graded.outcome,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
  };
}

export async function homeworkKindForAssignment(
  assignmentId: string,
): Promise<"diagnostic" | "routine" | null> {
  const [plan] = await db
    .select({ homeworkKind: sessionPreworkPlansTable.homeworkKind })
    .from(sessionPreworkPlansTable)
    .where(eq(sessionPreworkPlansTable.assignmentId, assignmentId))
    .limit(1);
  if (plan?.homeworkKind === "diagnostic" || plan?.homeworkKind === "routine") {
    return plan.homeworkKind;
  }
  return null;
}
