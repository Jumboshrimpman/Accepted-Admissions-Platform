import type { ParsedBankRecord } from "./sat-bank-import.ts";
import { HARD_SAT_MATH_MIN_QUESTION, HARD_SAT_MODULE } from "./sat-set-difficulty.ts";

/**
 * Idempotent College Board reimport planning.
 * Writes happen only from the admin apply path, and only for an exact source-key list.
 * This module does not touch the database.
 */

export type BankReimportContent = {
  sourceKey: string;
  examFamily: string;
  section: string;
  module: number;
  questionNumber: number;
  position: number;
  prompt: string;
  stimulus: string | null;
  choices: unknown;
  correctAnswer: string;
  officialExplanation: string;
  figures: unknown;
  skill: string | null;
  domain: string | null;
  difficulty: string | null;
  questionType: string;
  sourceKind: string;
  extractGaps: unknown;
};

export type ExistingBankReimportRow = BankReimportContent & {
  linkedQuestionId?: string | null;
};

export type BankReimportPlan = {
  fileSourceKeys: string[];
  inserts: string[];
  updates: string[];
  unchanged: string[];
  duplicatesSkipped: string[];
  duplicateBankSourceKeys: string[];
  skippedSeeds: string[];
  /** Math module 2 tail rows whose stored text differs from the JSONL. */
  hardMathTailUpdates: string[];
};

function text(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stable(item));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = stable(record[key]);
    return out;
  }
  return value ?? null;
}

function choiceSnapshot(value: unknown): unknown {
  if (!Array.isArray(value)) return [];
  return value.map((choice) => {
    const row = choice && typeof choice === "object" ? (choice as Record<string, unknown>) : {};
    return {
      id: text(typeof row.id === "string" ? row.id : ""),
      label: text(typeof row.label === "string" ? row.label : ""),
      text: text(typeof row.text === "string" ? row.text : ""),
    };
  });
}

export function reimportFingerprint(content: BankReimportContent): string {
  return JSON.stringify({
    examFamily: text(content.examFamily),
    section: text(content.section),
    module: Number(content.module),
    questionNumber: Number(content.questionNumber),
    position: Number(content.position),
    prompt: text(content.prompt),
    stimulus: text(content.stimulus),
    choices: choiceSnapshot(content.choices),
    correctAnswer: text(content.correctAnswer),
    officialExplanation: text(content.officialExplanation),
    figures: stable(content.figures),
    skill: text(content.skill),
    domain: text(content.domain),
    difficulty: text(content.difficulty),
    questionType: text(content.questionType),
    sourceKind: text(content.sourceKind),
    extractGaps: stable(content.extractGaps),
  });
}

export function reimportContentFromRecord(record: ParsedBankRecord): BankReimportContent {
  return {
    sourceKey: record.sourceKey,
    examFamily: record.examFamily,
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
    skill: record.skill,
    domain: record.domain,
    difficulty: record.difficulty,
    questionType: record.questionType,
    sourceKind: record.sourceKind,
    extractGaps: record.extractGaps,
  };
}

export function isHardMathTailSource(content: {
  section?: string | null;
  module?: number | null;
  questionNumber?: number | null;
}): boolean {
  return (
    text(content.section) === "math" &&
    Number(content.module) === HARD_SAT_MODULE &&
    Number(content.questionNumber) >= HARD_SAT_MATH_MIN_QUESTION
  );
}

export function planBankReimportDiff(input: {
  records: readonly ParsedBankRecord[];
  duplicatesInFile?: readonly string[];
  existing: readonly ExistingBankReimportRow[];
}): BankReimportPlan {
  const unique = new Map<string, ParsedBankRecord>();
  const duplicatesSkipped = [...(input.duplicatesInFile ?? [])];
  const skippedSeeds: string[] = [];
  const seenDedup = new Set<string>();
  for (const record of input.records) {
    if (record.sourceKind === "seed") {
      skippedSeeds.push(record.sourceKey);
      continue;
    }
    if (unique.has(record.sourceKey) || seenDedup.has(record.dedupKey)) {
      duplicatesSkipped.push(record.sourceKey);
      continue;
    }
    seenDedup.add(record.dedupKey);
    unique.set(record.sourceKey, record);
  }

  const bySourceKey = new Map<string, ExistingBankReimportRow[]>();
  for (const row of input.existing) {
    const key = row.sourceKey?.trim();
    if (!key) continue;
    const list = bySourceKey.get(key) ?? [];
    list.push(row);
    bySourceKey.set(key, list);
  }

  const inserts: string[] = [];
  const updates: string[] = [];
  const unchanged: string[] = [];
  const duplicateBankSourceKeys: string[] = [];
  const hardMathTailUpdates: string[] = [];
  for (const [sourceKey, record] of unique) {
    const rows = bySourceKey.get(sourceKey) ?? [];
    if (rows.length > 1) {
      duplicateBankSourceKeys.push(sourceKey);
      continue;
    }
    const content = reimportContentFromRecord(record);
    if (rows.length === 0) {
      inserts.push(sourceKey);
      continue;
    }
    if (reimportFingerprint(content) === reimportFingerprint(rows[0]!)) {
      unchanged.push(sourceKey);
      continue;
    }
    updates.push(sourceKey);
    if (isHardMathTailSource(content)) hardMathTailUpdates.push(sourceKey);
  }

  return {
    fileSourceKeys: [...unique.keys()],
    inserts,
    updates,
    unchanged,
    duplicatesSkipped,
    duplicateBankSourceKeys,
    skippedSeeds,
    hardMathTailUpdates,
  };
}

/**
 * Apply accepts only source keys that exist once in the JSONL.
 * Unknown keys and duplicate bank rows reject the whole request.
 * Keys that already match are kept so a second apply is a no-op.
 */
export function reimportApplySourceKeys(
  requested: readonly string[],
  plan: Pick<BankReimportPlan, "fileSourceKeys" | "duplicateBankSourceKeys">,
): { ok: true; sourceKeys: string[] } | { ok: false; rejectedIds: string[] } {
  if (requested.length === 0) return { ok: false, rejectedIds: [] };
  const fileKeys = new Set(plan.fileSourceKeys);
  const duplicateBank = new Set(plan.duplicateBankSourceKeys);
  const rejectedIds: string[] = [];
  const sourceKeys: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    if (typeof raw !== "string" || raw.trim() === "") {
      rejectedIds.push(typeof raw === "string" ? raw : "");
      continue;
    }
    const key = raw.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fileKeys.has(key) || duplicateBank.has(key)) rejectedIds.push(key);
    else sourceKeys.push(key);
  }
  if (rejectedIds.length > 0 || sourceKeys.length === 0) {
    return { ok: false, rejectedIds };
  }
  return { ok: true, sourceKeys };
}
