import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  adaptiveRecommendationsTable,
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
  questionReportsTable,
  questionsTable,
  remediationRetriesTable,
  responsesTable,
  reviewQueueTable,
  sessionPreworkPlansTable,
  sessionsTable,
  timerEventsTable,
} from "@workspace/db";
import {
  STAGED_COLLECTION_STUBS,
  collectionStubsFromManifest,
  isAssignableBankItem,
  isMultipleChoiceQuizItem,
  isTutorQuizMcq,
  listOfficialExtractFiles,
  parseCollegeBoardManifest,
  parseCollegeBoardPayload,
  resolveCollegeBoardRoot,
  type CollectionStub,
  type ParsedBankRecord,
} from "./sat-bank-import.ts";
import {
  auditStudentQuizItem,
  canAssignDiagnostic,
  diagnosticAssignmentCopy,
  composeDiagnosticItems,
  isStudentUsableQuizItem,
  quizItemFromServedQuestion,
  summarizeDiagnosticComposition,
  type DiagnosticComposition,
} from "./sat-bank-diagnostic-quality.ts";
import { shouldUseFigurePrimary } from "./sat-bank-figure-primary.ts";
import { isSessionLocalQuestionFork } from "./session-question-copy.ts";
import { generateQuestionsWithProvider } from "./question-generation.ts";
import {
  decideRetrySource,
  firstPresentText,
  lessonRetryReveal,
  retryOutcomeFromAnswer,
  retryOutcomePayload,
  studentRetryShape,
} from "./sat-bank-retry.ts";
import {
  diagnosticTimeLimitMinutes,
  preferSatDiagnosticCollection,
  routinePreworkTimeLimitMinutes,
  selectQuestionsForCountBudget,
  shouldReplaceFirstSessionPrework,
} from "./sat-bank-timing.ts";

export { shouldReplaceFirstSessionPrework };
import { groupMissesByWeakness, weaknessGroupsNeedRebuild } from "./sat-bank-weakness.ts";
import { isTaitoFirstSatSession } from "./session-schedule.ts";
import { isBrokenEmptyAttempt } from "./student-attempt-guards.ts";
import {
  assignmentChoices,
  isFullLengthDiagnosticAssignment,
  pickDiagnosticKeeper,
} from "./assignment-visibility.ts";
import { isDuplicateSessionPrework } from "./session-homework.ts";
import { skillLabelForBank } from "./sat-bank-skill.ts";
import {
  asBankFigures,
  classifyLinkedRefresh,
  emptyLinkedRefreshCounts,
  materializedQuestionContent,
  recordLinkedRefresh,
  resolveBankFigureUrl,
  type LinkedRefreshCounts,
} from "./sat-bank-figures.ts";

export type { LinkedRefreshCounts };

export const SAT_BANK_IMPORT_ROOT = resolveCollegeBoardRoot();

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

function bankRowForDiagnostic(row: {
  id: string;
  sourceKey: string;
  collectionId: string;
  examFamily: string;
  section: string;
  module: number;
  questionNumber: number;
  position: number;
  prompt: string;
  stimulus: string | null;
  choices: unknown;
  figures: unknown;
  questionType: string;
  correctAnswer: string;
  extractGaps: unknown;
  domain?: string | null;
  skill?: string | null;
  difficulty?: string | null;
  officialExplanation?: string | null;
  subject?: string | null;
  tags?: string[] | null;
}) {
  const facing = materializedQuestionContent(row);
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    collectionId: row.collectionId,
    examFamily: row.examFamily,
    section: row.section,
    module: asFiniteNumber(row.module),
    questionNumber: asFiniteNumber(row.questionNumber),
    position: asFiniteNumber(row.position),
    prompt: facing.prompt,
    stimulus: facing.stimulus,
    choices: facing.choices ?? asChoices(row.choices),
    figures: asBankFigures(row.figures),
    questionType: facing.questionType || row.questionType,
    correctAnswer: row.correctAnswer,
    extractGaps: (row.extractGaps ?? {}) as Record<string, unknown>,
  };
}

function assignmentItemForLiveAudit(
  question: {
    id?: string | null;
    prompt?: string | null;
    stimulus?: string | null;
    choices?: unknown;
    questionType?: string | null;
    correctAnswer?: string | null;
    extractGaps?: Record<string, unknown> | null;
    subject?: string | null;
    domain?: string | null;
  },
  bank?: {
    section?: string | null;
    figures?: unknown;
    module?: number | null;
    questionNumber?: number | null;
    position?: number | null;
    collectionId?: string | null;
    examFamily?: string | null;
    extractGaps?: unknown;
  } | null,
) {
  return quizItemFromServedQuestion({
    id: question.id,
    prompt: question.prompt,
    stimulus: question.stimulus,
    choices: question.choices,
    questionType: question.questionType,
    correctAnswer: question.correctAnswer,
    extractGaps: question.extractGaps ?? ((bank?.extractGaps ?? {}) as Record<string, unknown>),
    section: bank?.section,
    subject: question.subject,
    domain: question.domain,
    figures: asBankFigures(bank?.figures),
  });
}

function formatDiagnosticAssignBlock(composition: DiagnosticComposition): string {
  const reasons = Object.entries(composition.shortfall.reasons)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([reason, count]) => `${reason}:${count}`)
    .join(", ");
  return [
    `Diagnostic assign blocked (fail-closed).`,
    `Selected ${composition.questionCount}/120 (${composition.rwCount} RW / ${composition.mathCount} Math).`,
    `Shortfall ${composition.shortfall.questionCount} (RW ${composition.shortfall.rwCount}, Math ${composition.shortfall.mathCount}).`,
    `Residual junk ${composition.residualJunk}.`,
    reasons ? `Drop reasons: ${reasons}.` : "",
    `Fewer clean items were kept rather than padding with OCR junk. Re-score usable flags, add full-question crops, then retry.`,
  ]
    .filter(Boolean)
    .join(" ");
}

async function walkExtractFiles(root: string): Promise<string[]> {
  return listOfficialExtractFiles(root);
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
  /** Rematerialize already-linked quiz rows from current bank content. Default true. */
  refreshLinked?: boolean;
}): Promise<{
  rootDir: string;
  filesScanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicatesInFile: number;
  collectionsEnsured: number;
  linkedRefresh: LinkedRefreshCounts | null;
}> {
  const collectionsEnsured = await ensureStagedCollections();
  const parsed = input.payloadText
    ? parseCollegeBoardPayload(input.payloadText, input.payloadSource ?? "body")
    : { records: [] as ParsedBankRecord[], skipped: [], duplicatesInFile: [] };
  let filesScanned = 0;
  const rootDir = resolveCollegeBoardRoot(input.rootDir ?? SAT_BANK_IMPORT_ROOT);
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
  const productionRecords: ParsedBankRecord[] = [];
  for (const record of parsed.records) {
    if (record.sourceKind === "seed") {
      parsed.skipped.push({
        reason: `${record.sourceKey}: seed fixture is not a production extract`,
        source: record.sourceKey,
      });
      continue;
    }
    productionRecords.push(record);
  }
  parsed.records = productionRecords;
  const unique = new Map<string, ParsedBankRecord>();
  const seenDedup = new Set<string>();
  for (const record of parsed.records) {
    if (seenDedup.has(record.dedupKey)) continue;
    seenDedup.add(record.dedupKey);
    unique.set(record.sourceKey, record);
  }
  const { inserted, updated } = await upsertBankRecords([...unique.values()]);
  const linkedRefresh =
    input.refreshLinked === false ? null : await refreshLinkedQuestionsFromBank();
  return {
    rootDir,
    filesScanned,
    inserted,
    updated,
    skipped: parsed.skipped.length,
    duplicatesInFile: parsed.duplicatesInFile.length + (parsed.records.length - unique.size),
    collectionsEnsured,
    linkedRefresh,
  };
}

let officialImportPromise: Promise<{ imported: boolean; officialCount: number }> | null = null;

export async function ensureOfficialExtractsImported(): Promise<{
  imported: boolean;
  officialCount: number;
}> {
  if (officialImportPromise) return officialImportPromise;
  officialImportPromise = (async () => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bankQuestionsTable)
      .where(eq(bankQuestionsTable.sourceKind, "official_extract"));
    const officialCount = Number(count ?? 0);
    if (officialCount > 0) {
      return { imported: false, officialCount };
    }
    const result = await importCollegeBoardExtracts({});
    return { imported: true, officialCount: result.inserted + result.updated };
  })();
  try {
    return await officialImportPromise;
  } catch (error) {
    officialImportPromise = null;
    throw error;
  }
}

async function materializeBankQuestionInternal(bankQuestionId: string): Promise<{
  questionId: string;
  action: "update" | "insert";
}> {
  const [bank] = await db
    .select()
    .from(bankQuestionsTable)
    .where(eq(bankQuestionsTable.id, bankQuestionId))
    .limit(1);
  if (!bank) throw new Error("Bank question not found");
  const content = materializedQuestionContent({
    section: bank.section,
    domain: bank.domain,
    skill: bank.skill,
    questionType: bank.questionType,
    difficulty: bank.difficulty,
    stimulus: bank.stimulus,
    figures: bank.figures,
    prompt: bank.prompt,
    choices: bank.choices,
    correctAnswer: bank.correctAnswer,
    officialExplanation: bank.officialExplanation,
    extractGaps: (bank.extractGaps ?? {}) as Record<string, unknown>,
  });
  const figurePrimary = shouldUseFigurePrimary({
    prompt: bank.prompt,
    stimulus: bank.stimulus,
    choices: asChoices(bank.choices),
    figures: asBankFigures(bank.figures),
    questionType: bank.questionType,
    correctAnswer: bank.correctAnswer,
    extractGaps: (bank.extractGaps ?? {}) as Record<string, unknown>,
  });
  const bankTags = [
    bank.sourceKey,
    bank.examFamily,
    `module-${bank.module}`,
    ...(figurePrimary ? ["figure_primary"] : []),
  ];
  if (bank.linkedQuestionId) {
    const [linked] = await db
      .select({
        id: questionsTable.id,
        generationMethod: questionsTable.generationMethod,
        tags: questionsTable.tags,
      })
      .from(questionsTable)
      .where(eq(questionsTable.id, bank.linkedQuestionId))
      .limit(1);
    if (linked) {
      if (isSessionLocalQuestionFork(linked)) {
        return { questionId: linked.id, action: "update" };
      }
      await db
        .update(questionsTable)
        .set({ ...content, tags: bankTags })
        .where(eq(questionsTable.id, linked.id));
      return { questionId: linked.id, action: "update" };
    }
  }
  const [created] = await db
    .insert(questionsTable)
    .values({
      ...content,
      sourceType: bank.sourceKind === "seed" ? "seed" : "college_board",
      tags: bankTags,
      generationMethod:
        bank.sourceKind === "seed" ? "seed-fixture" : "college-board-extract",
    })
    .returning({ id: questionsTable.id });
  await db
    .update(bankQuestionsTable)
    .set({ linkedQuestionId: created!.id, updatedAt: new Date() })
    .where(eq(bankQuestionsTable.id, bank.id));
  return { questionId: created!.id, action: "insert" };
}

export async function materializeBankQuestion(bankQuestionId: string): Promise<string> {
  return (await materializeBankQuestionInternal(bankQuestionId)).questionId;
}

/** Rematerialize every bank row that already points at a live `questions` row. */
export type AssignmentLinkedRefreshCounts = LinkedRefreshCounts & {
  skippedForks: number;
  skippedUnlinked: number;
  droppedUnusable: number;
};

export async function rematerializeAssignmentLinkedQuestions(
  assignmentId: string,
): Promise<AssignmentLinkedRefreshCounts> {
  const links = await db
    .select({ questionId: assignmentQuestionsTable.questionId })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  const questionIds = [...new Set(links.map((link) => link.questionId))];
  if (questionIds.length === 0) {
    return { ...emptyLinkedRefreshCounts(), skippedForks: 0, skippedUnlinked: 0, droppedUnusable: 0 };
  }
  const questions = await db
    .select({
      id: questionsTable.id,
      generationMethod: questionsTable.generationMethod,
      tags: questionsTable.tags,
    })
    .from(questionsTable)
    .where(inArray(questionsTable.id, questionIds));
  const banks = await db
    .select({
      id: bankQuestionsTable.id,
      linkedQuestionId: bankQuestionsTable.linkedQuestionId,
    })
    .from(bankQuestionsTable)
    .where(inArray(bankQuestionsTable.linkedQuestionId, questionIds));
  const bankByQuestionId = new Map(
    banks
      .filter((row) => row.linkedQuestionId)
      .map((row) => [row.linkedQuestionId!, row]),
  );
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let skippedForks = 0;
  let skippedUnlinked = 0;
  for (const question of questions) {
    if (isSessionLocalQuestionFork(question)) {
      skippedForks += 1;
      skipped += 1;
      continue;
    }
    const bank = bankByQuestionId.get(question.id);
    if (!bank) {
      skippedUnlinked += 1;
      skipped += 1;
      continue;
    }
    try {
      await materializeBankQuestionInternal(bank.id);
      updated += 1;
    } catch {
      errors += 1;
    }
  }
  const droppedUnusable = await dropUnusableAssignmentQuestions(assignmentId);
  return { updated, skipped, errors, skippedForks, skippedUnlinked, droppedUnusable };
}

async function dropUnusableAssignmentQuestions(assignmentId: string): Promise<number> {
  const links = await db
    .select({
      questionId: assignmentQuestionsTable.questionId,
      position: assignmentQuestionsTable.position,
      question: questionsTable,
    })
    .from(assignmentQuestionsTable)
    .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentQuestionsTable.position));
  if (links.length === 0) return 0;
  const banks = await db
    .select()
    .from(bankQuestionsTable)
    .where(
      inArray(
        bankQuestionsTable.linkedQuestionId,
        links.map((link) => link.questionId),
      ),
    );
  const bankByQuestion = new Map(banks.map((row) => [row.linkedQuestionId, row]));
  const keep: Array<{ questionId: string }> = [];
  let dropped = 0;
  for (const link of links) {
    const bank = bankByQuestion.get(link.questionId);
    const usable = isStudentUsableQuizItem(assignmentItemForLiveAudit(link.question, bank));
    if (usable) keep.push({ questionId: link.questionId });
    else dropped += 1;
  }
  if (dropped === 0) return 0;
  const dropIds = links
    .filter((link) => !keep.some((row) => row.questionId === link.questionId))
    .map((link) => link.questionId);
  await db
    .delete(assignmentQuestionsTable)
    .where(
      and(
        eq(assignmentQuestionsTable.assignmentId, assignmentId),
        inArray(assignmentQuestionsTable.questionId, dropIds),
      ),
    );
  for (const [index, row] of keep.entries()) {
    await db
      .update(assignmentQuestionsTable)
      .set({ position: index })
      .where(
        and(
          eq(assignmentQuestionsTable.assignmentId, assignmentId),
          eq(assignmentQuestionsTable.questionId, row.questionId),
        ),
      );
  }
  return dropped;
}

export async function diagnosticCompositionForAssignment(
  assignmentId: string,
): Promise<DiagnosticComposition> {
  const links = await db
    .select({
      questionId: assignmentQuestionsTable.questionId,
      position: assignmentQuestionsTable.position,
    })
    .from(assignmentQuestionsTable)
    .where(eq(assignmentQuestionsTable.assignmentId, assignmentId));
  const questionIds = links.map((link) => link.questionId);
  const questions =
    questionIds.length === 0
      ? []
      : await db.select().from(questionsTable).where(inArray(questionsTable.id, questionIds));
  const banks =
    questionIds.length === 0
      ? []
      : await db
          .select()
          .from(bankQuestionsTable)
          .where(inArray(bankQuestionsTable.linkedQuestionId, questionIds));
  const bankByQuestion = new Map(banks.map((row) => [row.linkedQuestionId, row]));
  const selected = questions.map((question) => {
    const bank = bankByQuestion.get(question.id);
    return {
      ...assignmentItemForLiveAudit(question, bank),
      id: question.id,
      module: bank?.module,
      questionNumber: bank?.questionNumber,
      position: links.find((link) => link.questionId === question.id)?.position,
      collectionId: bank?.collectionId,
      examFamily: bank?.examFamily,
    };
  });
  return summarizeDiagnosticComposition(selected);
}

export async function refreshLinkedQuestionsFromBank(): Promise<LinkedRefreshCounts> {
  const rows = await db
    .select({
      id: bankQuestionsTable.id,
      linkedQuestionId: bankQuestionsTable.linkedQuestionId,
    })
    .from(bankQuestionsTable)
    .where(isNotNull(bankQuestionsTable.linkedQuestionId));
  let counts = emptyLinkedRefreshCounts();
  for (const row of rows) {
    const [linked] = row.linkedQuestionId
      ? await db
          .select({ id: questionsTable.id })
          .from(questionsTable)
          .where(eq(questionsTable.id, row.linkedQuestionId))
          .limit(1)
      : [];
    const planned = classifyLinkedRefresh({
      hasLinkedId: Boolean(row.linkedQuestionId),
      linkedExists: Boolean(linked),
    });
    if (planned === "skip") {
      counts = recordLinkedRefresh(counts, "skip");
      continue;
    }
    try {
      const result = await materializeBankQuestionInternal(row.id);
      counts = recordLinkedRefresh(counts, result.action);
    } catch {
      counts = recordLinkedRefresh(counts, "error");
    }
  }
  return counts;
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
  skipArchiveExisting?: boolean;
  mcqOnly?: boolean;
}): Promise<{
  planId: string;
  assignmentId: string;
  homeworkKind: "diagnostic" | "routine";
  targetMinutes: number;
  estimatedSeconds: number;
  questionCount: number;
  withinTolerance: boolean;
  extractIncomplete: boolean;
  composition: DiagnosticComposition | null;
  assignBlocked: boolean;
}> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, input.sessionId))
    .limit(1);
  if (!session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
  await ensureOfficialExtractsImported().catch(() => undefined);
  const homeworkKind = input.homeworkKind ?? "routine";
  const explicitCollection = Boolean(input.collectionId);
  const explicitIds = Boolean(input.bankQuestionIds?.length);
  const collections = await listBankCollections();
  let collectionId = input.collectionId ?? null;
  if (homeworkKind === "diagnostic" && !collectionId && !explicitIds) {
    collectionId = preferSatDiagnosticCollection(collections)?.id ?? null;
  }
  let pool = await db
    .select()
    .from(bankQuestionsTable)
    .orderBy(asc(bankQuestionsTable.position), asc(bankQuestionsTable.questionNumber));
  if (explicitIds) {
    const allowed = new Set(input.bankQuestionIds);
    pool = pool.filter((row) => allowed.has(row.id));
  } else if (homeworkKind === "diagnostic" && !explicitCollection) {
    pool = pool.filter(
      (row) => row.examFamily === "sat" && row.sourceKind === "official_extract",
    );
  } else if (collectionId) {
    pool = pool.filter((row) => row.collectionId === collectionId);
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
        figurePrimary?: boolean;
      },
    }),
  );
  if (input.mcqOnly) {
    pool = pool.filter((row) => isTutorQuizMcq(row.questionType));
  }
  // Owner policy: student quizzes are multiple-choice only. True SPR
  // (numeric / free-response keys) stay in the bank but are not composed
  // into new diagnostics or routine pre-work. Letter keys A–D are kept and
  // recovered as A–D choices at assignment time.
  pool = pool.filter((row) =>
    isMultipleChoiceQuizItem({
      questionType: row.questionType,
      choices: Array.isArray(row.choices) ? row.choices : [],
      correctAnswer: row.correctAnswer,
    }),
  );
  pool = pool.filter((row) => isStudentUsableQuizItem(bankRowForDiagnostic(row)));
  if (pool.length === 0) {
    throw Object.assign(
      new Error(
        "The SAT/PSAT bank has no matching official extract questions yet. Import the 15 College Board JSONL packs from content/college-board/.",
      ),
      { status: 409 },
    );
  }
  const diagnosticItems = pool.map((row) => ({ ...row, ...bankRowForDiagnostic(row) }));
  const composed =
    homeworkKind === "diagnostic"
      ? composeDiagnosticItems(diagnosticItems, {
          preferredCollectionId: collectionId,
          allowCrossCollectionFill: !explicitCollection && !explicitIds,
        })
      : null;
  if (homeworkKind === "diagnostic" && composed && !canAssignDiagnostic(composed.composition, composed.selected)) {
    throw Object.assign(new Error(formatDiagnosticAssignBlock(composed.composition)), {
      status: 409,
      composition: composed.composition,
      assignBlocked: true,
    });
  }
  const selected =
    homeworkKind === "diagnostic"
      ? (composed?.selected ?? []).map((item) => pool.find((row) => row.id === item.id)!).filter(Boolean)
      : selectQuestionsForCountBudget(
          pool.map((row) => ({
            id: row.id,
            section: row.section as "rw" | "math",
            skill: row.skill,
            estimatedSeconds: row.estimatedSeconds,
            position: row.position,
          })),
          {
            preferOriginalOrder: Boolean(collectionId || input.bankQuestionIds?.length),
          },
        ).selected.map((item) => pool.find((row) => row.id === item.id)!).filter(Boolean);
  const estimatedSeconds = selected.reduce(
    (sum, row) => sum + Math.max(0, row.estimatedSeconds),
    0,
  );
  const resolvedMinutes =
    homeworkKind === "diagnostic"
      ? diagnosticTimeLimitMinutes(estimatedSeconds, {
          completeForm: Boolean(composed?.composition.usable),
        })
      : routinePreworkTimeLimitMinutes(selected.length);
  if (!input.skipArchiveExisting) {
    await archiveSessionPrework(session.id);
  }
  const diagnosticCopy =
    homeworkKind === "diagnostic" && composed
      ? diagnosticAssignmentCopy(composed.composition, session.title)
      : null;
  const title =
    diagnosticCopy?.title ??
    (homeworkKind === "diagnostic"
      ? `SAT diagnostic — ${session.title}`
      : `SAT pre-work (30–50 questions) — ${session.title}`);
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: session.courseId,
      sessionId: session.id,
      deliveryPhase: "before_session",
      title,
      subject: session.subject || "SAT",
      instructions:
        diagnosticCopy?.instructions ??
        (homeworkKind === "diagnostic"
          ? "Complete this SAT diagnostic from official College Board practice items. Your result is an estimated SAT score range based on the College Board scoring-guide method. It is not an official College Board adaptive digital score."
          : "30–50 official-bank questions for this session (not a full-length SAT). Accuracy is recorded; this is not an official SAT score."),
      status: "published",
      timeLimitMinutes: resolvedMinutes,
      maxAttempts: 1,
    })
    .returning();
  for (const [index, bank] of selected.entries()) {
    const questionId = await materializeBankQuestion(bank.id);
    await db.insert(assignmentQuestionsTable).values({
      assignmentId: assignment!.id,
      questionId,
      position: index,
      predictionFirst: false,
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
    targetMinutes: resolvedMinutes,
    estimatedSeconds,
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
    targetMinutes: resolvedMinutes,
    estimatedSeconds,
    questionCount: selected.length,
    withinTolerance:
      homeworkKind === "diagnostic"
        ? Boolean(composed?.composition.usable)
        : selected.length <= 50 && (selected.length >= 30 || selected.length === pool.length),
    extractIncomplete: selected.some((row) => !row.officialExplanation.trim()),
    composition: composed?.composition ?? null,
    assignBlocked: false,
  };
}

export async function previewDiagnosticComposition(options: {
  collectionId?: string | null;
} = {}): Promise<{
  selectedCount: number;
  composition: DiagnosticComposition;
  assignable: boolean;
}> {
  await ensureOfficialExtractsImported().catch(() => undefined);
  const collections = await listBankCollections();
  const collectionId = options.collectionId ?? preferSatDiagnosticCollection(collections)?.id ?? null;
  const pool = (
    await db
      .select()
      .from(bankQuestionsTable)
      .orderBy(asc(bankQuestionsTable.position), asc(bankQuestionsTable.questionNumber))
  ).filter(
    (row) =>
      row.examFamily === "sat" &&
      row.sourceKind === "official_extract" &&
      isMultipleChoiceQuizItem({
        questionType: row.questionType,
        choices: Array.isArray(row.choices) ? row.choices : [],
        correctAnswer: row.correctAnswer,
      }) &&
      isStudentUsableQuizItem(bankRowForDiagnostic(row)),
  );
  const composed = composeDiagnosticItems(
    pool.map((row) => ({ ...row, ...bankRowForDiagnostic(row) })),
    {
      preferredCollectionId: collectionId,
      allowCrossCollectionFill: true,
    },
  );
  return {
    selectedCount: composed.selected.length,
    composition: composed.composition,
    assignable: canAssignDiagnostic(composed.composition, composed.selected),
  };
}

export async function rescoreBankUsableFlags(): Promise<{
  scored: number;
  usable: number;
  unusable: number;
  reasons: Partial<Record<string, number>>;
}> {
  const rows = await db.select().from(bankQuestionsTable);
  let usable = 0;
  let unusable = 0;
  const reasons: Partial<Record<string, number>> = {};
  for (const row of rows) {
    const item = bankRowForDiagnostic(row);
    const audit = auditStudentQuizItem(item);
    const gaps = {
      ...((row.extractGaps ?? {}) as Record<string, unknown>),
      studentUsable: audit.ok,
      studentUsableReasons: audit.reasons,
    };
    await db
      .update(bankQuestionsTable)
      .set({ extractGaps: gaps, updatedAt: new Date() })
      .where(eq(bankQuestionsTable.id, row.id));
    if (audit.ok) {
      usable += 1;
    } else {
      unusable += 1;
      for (const reason of audit.reasons) {
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }
  }
  return { scored: rows.length, usable, unusable, reasons };
}

export async function persistWeaknessGroups(input: {
  sessionId: string;
  attemptId: string;
    items: Array<{
      questionId: string;
      skill: string;
      domain?: string | null;
      subject?: string | null;
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
            section: bankQuestionsTable.section,
            domain: bankQuestionsTable.domain,
          })
          .from(bankQuestionsTable)
          .where(inArray(bankQuestionsTable.linkedQuestionId, questionIds));
  const bankByQuestion = new Map(
    bankRows
      .filter((row) => row.linkedQuestionId)
      .map((row) => [row.linkedQuestionId!, row]),
  );
  const groups = groupMissesByWeakness(
    input.items.map((item) => {
      const bank = bankByQuestion.get(item.questionId);
      return {
        ...item,
        bankQuestionId: bank?.id ?? null,
        section: bank?.section,
        domain: item.domain || bank?.domain,
      };
    }),
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
  // Follow-up: still_struggling retries are not yet written into future session priorities.
  return groups.length;
}

export async function listBankCollections() {
  await ensureOfficialExtractsImported().catch(() => undefined);
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

export function bankQuestionShape(
  row: typeof bankQuestionsTable.$inferSelect,
  options: { includeKeys?: boolean } = {},
) {
  const base = {
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
    assignable:
      isAssignableBankItem({
        prompt: row.prompt,
        questionType: row.questionType,
        choices: asChoices(row.choices),
        correctAnswer: row.correctAnswer,
        extractGaps: (row.extractGaps ?? {}) as {
          missingPrompt?: boolean;
          missingChoices?: boolean;
          figurePrimary?: boolean;
        },
      }) && isStudentUsableQuizItem(bankRowForDiagnostic(row)),
    hasOfficialExplanation: Boolean(row.officialExplanation.trim()),
    linkedQuestionId: row.linkedQuestionId,
  };
  if (!options.includeKeys) return base;
  return {
    ...base,
    correctAnswer: row.correctAnswer,
    officialExplanation: row.officialExplanation,
    figures: asBankFigures(row.figures).map((figure) => ({
      url: resolveBankFigureUrl(figure),
      path: figure.path ?? null,
      alt: figure.alt ?? null,
    })),
  };
}

export async function listBankQuestions(filters: {
  examFamily?: string;
  collectionId?: string;
  section?: string;
  skill?: string;
  questionType?: string;
  includeKeys?: boolean;
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
  if (filters.questionType === "mcq") {
    rows = rows.filter((row) => isTutorQuizMcq(row.questionType));
  } else if (filters.questionType === "spr") {
    rows = rows.filter((row) => !isTutorQuizMcq(row.questionType));
  }
  return rows.map((row) => bankQuestionShape(row, { includeKeys: filters.includeKeys }));
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
      subject?: string;
      correct: boolean;
      prompt?: string;
      finalAnswer?: string | null;
      correctAnswer?: string;
      explanation?: string;
    }>;
  } | null;
  if (
    attempt &&
    result?.items &&
    (groups.length === 0 || weaknessGroupsNeedRebuild(groups))
  ) {
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
      skill: skillLabelForBank({
        skill: item.skill,
        section: bank?.section,
        domain: item.domain ?? bank?.domain,
        subject: item.subject,
      }),
      domain: item.domain ?? bank?.domain ?? "",
      prompt: item.prompt ?? bank?.prompt ?? "",
      stimulus: bank?.stimulus ?? null,
      choices: asChoices(bank?.choices),
      studentAnswer: item.finalAnswer ?? null,
      correctAnswer: bank?.correctAnswer || item.correctAnswer || "",
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
  const retryBankIds = [
    ...new Set(
      retries
        .map((row) => row.retryBankQuestionId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const retryBanks =
    retryBankIds.length === 0
      ? []
      : await db.select().from(bankQuestionsTable).where(inArray(bankQuestionsTable.id, retryBankIds));
  const retryBankById = new Map(retryBanks.map((row) => [row.id, row]));
  const scoreReporting =
    plan?.homeworkKind === "diagnostic" ? "estimated_diagnostic" : "none";
  return {
    sessionId,
    homeworkKind: plan?.homeworkKind ?? null,
    scoreReporting,
    scoreHonesty:
      scoreReporting === "none"
        ? "This 30–50 question pre-work reports accuracy only. It is not an official SAT score."
        : "Estimated SAT score range based on College Board scoring-guide methodology for linear paper/digital practice. Not an official College Board adaptive digital score.",
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
    weaknessGroups: groups.map((group) => {
      const questionIds = asStringArray(group.questionIds);
      const context = (result?.items ?? []).find((item) =>
        questionIds.includes(item.questionId),
      );
      return {
        id: group.id,
        skill: skillLabelForBank({
          skill: group.skill,
          domain: group.domain || context?.domain,
          subject: context?.subject,
        }),
        domain: group.domain,
        missCount: asFiniteNumber(group.missCount),
        priority: asFiniteNumber(group.priority),
        questionIds,
        bankQuestionIds: asStringArray(group.bankQuestionIds),
      };
    }),
    misses,
    retries: retries.map((row) => {
      const question = row.retryQuestionId
        ? retryQuestionById.get(row.retryQuestionId)
        : undefined;
      const bank = row.retryBankQuestionId
        ? retryBankById.get(row.retryBankQuestionId)
        : undefined;
      const choices =
        assignmentChoices(question?.choices) ?? assignmentChoices(bank?.choices) ?? [];
      const safe = question
        ? studentRetryShape({
            id: question.id,
            prompt: question.prompt,
            stimulus: question.stimulus,
            choices,
            skill: skillLabelForBank({
              skill: question.skill,
              domain: question.domain,
              subject: question.subject,
            }),
            domain: question.domain,
            difficulty: question.difficulty,
            correctAnswer: question.correctAnswer,
            officialExplanation: question.explanation,
          })
        : bank
          ? studentRetryShape({
              id: bank.id,
              prompt: bank.prompt,
              stimulus: bank.stimulus,
              choices,
              skill: skillLabelForBank({
                skill: bank.skill,
                domain: bank.domain,
                section: bank.section,
              }),
              domain: bank.domain,
              difficulty: bank.difficulty,
              correctAnswer: bank.correctAnswer,
              officialExplanation: bank.officialExplanation,
            })
          : null;
      const reveal = lessonRetryReveal({
        outcome: row.outcome,
        studentAnswer: row.studentAnswer,
        correctAnswer: firstPresentText(question?.correctAnswer, bank?.correctAnswer),
        explanation: firstPresentText(question?.explanation, bank?.officialExplanation),
      });
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
        studentAnswer: reveal.studentAnswer,
        correctAnswer: reveal.correctAnswer,
        explanation: reveal.explanation,
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
  const unusedBank = (
    sourceBank
      ? await db
          .select()
          .from(bankQuestionsTable)
          .where(ne(bankQuestionsTable.id, sourceBank.id))
      : await db.select().from(bankQuestionsTable)
  ).filter((row) => isStudentUsableQuizItem(bankRowForDiagnostic(row)));
  const used = session?.clientUserId
    ? await usedSourceKeysForStudent(session.clientUserId)
    : new Set<string>();
  const decision = decideRetrySource({
    source: {
      id: sourceBank?.id ?? sourceQuestion.id,
      sourceKey: sourceBank?.sourceKey ?? sourceQuestion.id,
      skill: sourceBank?.skill ?? sourceQuestion.skill,
      section: (sourceBank?.section as "rw" | "math") ?? "rw",
      difficulty: sourceBank?.difficulty ?? sourceQuestion.difficulty,
    },
    unusedBank: unusedBank.map((row) => ({
      id: row.id,
      sourceKey: row.sourceKey,
      skill: row.skill,
      section: row.section as "rw" | "math",
      module: row.module,
      questionNumber: row.questionNumber,
      difficulty: row.difficulty,
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
        skill: skillLabelForBank({
          skill: question!.skill,
          domain: question!.domain,
          subject: question!.subject,
          section: decision.candidate.section,
        }),
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
  const [bank] = retry.retryBankQuestionId
    ? await db
        .select()
        .from(bankQuestionsTable)
        .where(eq(bankQuestionsTable.id, retry.retryBankQuestionId))
        .limit(1)
    : [];
  const correctAnswer =
    firstPresentText(question.correctAnswer, bank?.correctAnswer) ?? question.correctAnswer;
  const graded = retryOutcomeFromAnswer({
    studentAnswer: input.studentAnswer,
    correctAnswer,
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
  return retryOutcomePayload({
    retryId: updated!.id,
    correct: graded.correct,
    outcome: graded.outcome,
    question,
    bank,
  });
}

async function deleteAttemptsByIds(attemptIds: string[]): Promise<number> {
  if (attemptIds.length === 0) return 0;
  await db.delete(questionReportsTable).where(inArray(questionReportsTable.attemptId, attemptIds));
  await db.delete(reviewQueueTable).where(inArray(reviewQueueTable.attemptId, attemptIds));
  await db.delete(timerEventsTable).where(inArray(timerEventsTable.attemptId, attemptIds));
  await db.delete(responsesTable).where(inArray(responsesTable.attemptId, attemptIds));
  await db
    .delete(adaptiveRecommendationsTable)
    .where(inArray(adaptiveRecommendationsTable.sourceAttemptId, attemptIds));
  await db
    .delete(homeworkWeaknessGroupsTable)
    .where(inArray(homeworkWeaknessGroupsTable.attemptId, attemptIds));
  await db
    .delete(remediationRetriesTable)
    .where(inArray(remediationRetriesTable.sourceAttemptId, attemptIds));
  await db.delete(attemptsTable).where(inArray(attemptsTable.id, attemptIds));
  return attemptIds.length;
}

async function beforeSessionAssignments(sessionId: string) {
  return db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, sessionId),
        eq(assignmentsTable.deliveryPhase, "before_session"),
      ),
    );
}

/**
 * Delete before_session attempt state (including empty/glitched submits) so the
 * student can start again. Keeps the same assignment, questions, and pre-work
 * plan. Does not archive homework or wipe the College Board bank.
 */
export async function clearSessionHomeworkAttempts(sessionId: string): Promise<{
  sessionId: string;
  assignmentIds: string[];
  deletedAttempts: number;
  keptAssignments: number;
}> {
  const assignments = (await beforeSessionAssignments(sessionId)).filter(
    (row) => row.status !== "archived",
  );
  const assignmentIds = assignments.map((row) => row.id);
  const attempts =
    assignmentIds.length === 0
      ? []
      : await db
          .select({ id: attemptsTable.id })
          .from(attemptsTable)
          .where(inArray(attemptsTable.assignmentId, assignmentIds));
  const deletedAttempts = await deleteAttemptsByIds(attempts.map((row) => row.id));
  if (assignments.length > 0) {
    await db
      .update(sessionsTable)
      .set({ hasHomework: true, updatedAt: new Date() })
      .where(eq(sessionsTable.id, sessionId));
  }
  return {
    sessionId,
    assignmentIds,
    deletedAttempts,
    keptAssignments: assignments.length,
  };
}

export async function resetSessionPreworkState(sessionId: string): Promise<{
  sessionId: string;
  archivedAssignments: number;
  deletedAttempts: number;
}> {
  const assignments = await beforeSessionAssignments(sessionId);
  const assignmentIds = assignments.map((row) => row.id);
  const attempts =
    assignmentIds.length === 0
      ? []
      : await db
          .select({ id: attemptsTable.id })
          .from(attemptsTable)
          .where(inArray(attemptsTable.assignmentId, assignmentIds));
  const deletedAttempts = await deleteAttemptsByIds(attempts.map((row) => row.id));
  await db.delete(sessionPreworkPlansTable).where(eq(sessionPreworkPlansTable.sessionId, sessionId));
  let archivedAssignments = 0;
  for (const row of assignments) {
    if (row.status === "archived") continue;
    await db
      .update(assignmentsTable)
      .set({ status: "archived" })
      .where(eq(assignmentsTable.id, row.id));
    archivedAssignments += 1;
  }
  await db
    .update(sessionsTable)
    .set({ hasHomework: false, updatedAt: new Date() })
    .where(eq(sessionsTable.id, sessionId));
  return {
    sessionId,
    archivedAssignments,
    deletedAttempts,
  };
}

export async function clearBrokenEmptyPreworkAttempts(sessionId: string): Promise<number> {
  const assignments = await beforeSessionAssignments(sessionId);
  const assignmentIds = assignments.map((row) => row.id);
  if (assignmentIds.length === 0) return 0;
  const attempts = await db
    .select({ id: attemptsTable.id, status: attemptsTable.status })
    .from(attemptsTable)
    .where(inArray(attemptsTable.assignmentId, assignmentIds));
  const brokenIds: string[] = [];
  for (const attempt of attempts) {
    const responses = await db
      .select({ finalAnswer: responsesTable.finalAnswer })
      .from(responsesTable)
      .where(eq(responsesTable.attemptId, attempt.id));
    const answeredCount = responses.filter((row) => row.finalAnswer?.trim()).length;
    if (isBrokenEmptyAttempt({ status: attempt.status, answeredCount })) {
      brokenIds.push(attempt.id);
    }
  }
  return deleteAttemptsByIds(brokenIds);
}

export async function findTaitoFirstSatSession(): Promise<typeof sessionsTable.$inferSelect | null> {
  const sessions = await db.select().from(sessionsTable);
  return sessions.find((session) => isTaitoFirstSatSession(session)) ?? null;
}

export async function resetTaitoFirstSatPrework(input: {
  actorUserId?: string;
  reassignDiagnostic?: boolean;
  refreshLinkedOnly?: boolean;
}): Promise<{
  sessionId: string;
  archivedAssignments: number;
  deletedAttempts: number;
  rematerialized: AssignmentLinkedRefreshCounts | null;
  reassigned: Awaited<ReturnType<typeof assignPreworkFromBank>> | null;
  composition: DiagnosticComposition | null;
  assignBlocked: boolean;
}> {
  const session = await findTaitoFirstSatSession();
  if (!session) {
    throw Object.assign(new Error("October 2 Taito SAT session was not found."), { status: 404 });
  }
  const existingAssignments = (await beforeSessionAssignments(session.id)).filter(
    (row) => row.status !== "archived",
  );
  const existingAssignmentId = existingAssignments[0]?.id ?? null;
  const rematerialized = existingAssignmentId
    ? await rematerializeAssignmentLinkedQuestions(existingAssignmentId)
    : null;
  if (input.refreshLinkedOnly) {
    return {
      sessionId: session.id,
      archivedAssignments: 0,
      deletedAttempts: 0,
      rematerialized,
      reassigned: null,
      composition: existingAssignmentId
        ? await diagnosticCompositionForAssignment(existingAssignmentId)
        : null,
      assignBlocked: false,
    };
  }
  const preview =
    input.reassignDiagnostic === false ? null : await previewDiagnosticComposition();
  if (preview && !preview.assignable) {
    return {
      sessionId: session.id,
      archivedAssignments: 0,
      deletedAttempts: 0,
      rematerialized,
      reassigned: null,
      composition: preview.composition,
      assignBlocked: true,
    };
  }
  const reset = await resetSessionPreworkState(session.id);
  const reassigned =
    input.reassignDiagnostic === false
      ? null
      : await assignPreworkFromBank({
          sessionId: session.id,
          actorUserId: input.actorUserId,
          homeworkKind: "diagnostic",
        });
  const deduped = await dedupeFullLengthDiagnostics(session.courseId);
  return {
    ...reset,
    archivedAssignments: reset.archivedAssignments + deduped.archivedAssignments,
    rematerialized,
    reassigned,
    composition: reassigned
      ? await diagnosticCompositionForAssignment(reassigned.assignmentId)
      : preview?.composition ?? null,
    assignBlocked: false,
  };
}

export async function dedupeFullLengthDiagnostics(courseId?: string): Promise<{
  archivedAssignments: number;
  sessionsTouched: number;
}> {
  const assignmentRows =
    courseId == null
      ? await db.select().from(assignmentsTable)
      : await db
          .select()
          .from(assignmentsTable)
          .where(eq(assignmentsTable.courseId, courseId));
  const beforeSession = assignmentRows.filter(
    (row) => row.deliveryPhase === "before_session" && row.sessionId,
  );
  const questionCounts = new Map<string, number>();
  const attemptCounts = new Map<string, number>();
  const plans =
    beforeSession.length === 0
      ? []
      : await db
          .select({
            assignmentId: sessionPreworkPlansTable.assignmentId,
            homeworkKind: sessionPreworkPlansTable.homeworkKind,
            sessionId: sessionPreworkPlansTable.sessionId,
          })
          .from(sessionPreworkPlansTable)
          .where(
            inArray(
              sessionPreworkPlansTable.sessionId,
              [...new Set(beforeSession.map((row) => row.sessionId!))],
            ),
          );
  const kindByAssignment = new Map(
    plans.map((plan) => [plan.assignmentId, plan.homeworkKind]),
  );
  for (const row of beforeSession) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, row.id));
    questionCounts.set(row.id, Number(count));
    const [{ count: attempts }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, row.id));
    attemptCounts.set(row.id, Number(attempts));
  }
  const diagnostics = beforeSession.filter((row) =>
    isFullLengthDiagnosticAssignment({
      title: row.title,
      homeworkKind: kindByAssignment.get(row.id) ?? null,
      questionCount: questionCounts.get(row.id) ?? 0,
    }),
  );
  const bySession = new Map<string, typeof diagnostics>();
  for (const row of diagnostics) {
    const list = bySession.get(row.sessionId!) ?? [];
    list.push(row);
    bySession.set(row.sessionId!, list);
  }
  let archivedAssignments = 0;
  let sessionsTouched = 0;
  for (const [sessionId, rows] of bySession) {
    if (rows.length < 2) continue;
    const ranked = rows.map((row) => ({
      ...row,
      questionCount: questionCounts.get(row.id) ?? 0,
      attemptCount: attemptCounts.get(row.id) ?? 0,
    }));
    const keeper = pickDiagnosticKeeper(ranked);
    if (!keeper) continue;
    const extras = ranked.filter((row) => row.id !== keeper.id && row.status !== "archived");
    if (extras.length === 0) continue;
    sessionsTouched += 1;
    for (const extra of extras) {
      await db
        .update(assignmentsTable)
        .set({ status: "archived" })
        .where(eq(assignmentsTable.id, extra.id));
      archivedAssignments += 1;
    }
    const [plan] = await db
      .select({ id: sessionPreworkPlansTable.id })
      .from(sessionPreworkPlansTable)
      .where(eq(sessionPreworkPlansTable.sessionId, sessionId))
      .limit(1);
    if (plan) {
      await db
        .update(sessionPreworkPlansTable)
        .set({ assignmentId: keeper.id, updatedAt: new Date() })
        .where(eq(sessionPreworkPlansTable.id, plan.id));
    }
  }
  return { archivedAssignments, sessionsTouched };
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

/** Admin publish/archive of session pre-work: retarget the plan and hide duplicate copies. */
export async function syncSessionPreworkAfterAssignmentUpdate(assignment: {
  id: string;
  sessionId: string | null;
  deliveryPhase: string | null;
  title: string;
  status: string;
  timeLimitMinutes?: number | null;
}): Promise<void> {
  if (!assignment.sessionId || assignment.deliveryPhase !== "before_session") return;
  const sessionId = assignment.sessionId;
  if (assignment.status === "published") {
    const siblings = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.sessionId, sessionId));
    const homeworkKind = isFullLengthDiagnosticAssignment({ title: assignment.title })
      ? "diagnostic"
      : ((await homeworkKindForAssignment(assignment.id)) ?? "routine");
    for (const sibling of siblings) {
      if (
        !isDuplicateSessionPrework(
          { id: assignment.id, title: assignment.title, homeworkKind, status: assignment.status },
          {
            id: sibling.id,
            title: sibling.title,
            status: sibling.status,
            deliveryPhase: sibling.deliveryPhase,
          },
        )
      ) {
        continue;
      }
      await db
        .update(assignmentsTable)
        .set({ status: "archived" })
        .where(eq(assignmentsTable.id, sibling.id));
    }
    const [existingPlan] = await db
      .select()
      .from(sessionPreworkPlansTable)
      .where(eq(sessionPreworkPlansTable.sessionId, sessionId))
      .limit(1);
    const targetMinutes =
      assignment.timeLimitMinutes ??
      existingPlan?.targetMinutes ??
      (homeworkKind === "diagnostic" ? 164 : 60);
    const planValues = {
      assignmentId: assignment.id,
      homeworkKind: existingPlan?.homeworkKind ?? homeworkKind,
      targetMinutes,
      estimatedSeconds: existingPlan?.estimatedSeconds ?? targetMinutes * 60,
      status: "assigned",
      updatedAt: new Date(),
    };
    if (existingPlan) {
      await db
        .update(sessionPreworkPlansTable)
        .set(planValues)
        .where(eq(sessionPreworkPlansTable.id, existingPlan.id));
    } else {
      await db.insert(sessionPreworkPlansTable).values({ sessionId, ...planValues });
    }
    await db
      .update(sessionsTable)
      .set({ hasHomework: true, updatedAt: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    return;
  }
  if (assignment.status !== "archived") return;
  const [plan] = await db
    .select()
    .from(sessionPreworkPlansTable)
    .where(eq(sessionPreworkPlansTable.sessionId, sessionId))
    .limit(1);
  if (!plan || plan.assignmentId !== assignment.id) return;
  const [next] = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, sessionId),
        eq(assignmentsTable.deliveryPhase, "before_session"),
        ne(assignmentsTable.id, assignment.id),
        ne(assignmentsTable.status, "archived"),
      ),
    )
    .limit(1);
  if (next) {
    await db
      .update(sessionPreworkPlansTable)
      .set({ assignmentId: next.id, updatedAt: new Date() })
      .where(eq(sessionPreworkPlansTable.id, plan.id));
  }
}
