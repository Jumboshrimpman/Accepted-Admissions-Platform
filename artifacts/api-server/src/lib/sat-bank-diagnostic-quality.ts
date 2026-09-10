import {
  hasCompleteLetterChoiceText,
  hasFullQuestionCrop,
  hasMergedOrLeakedChoices,
  hasReadableStudentStem,
  hasRecoveredDataTable,
  hasRenderableFigures,
  isLetterAnswer,
  looksGarbledExtractText,
  looksSmashedOrTruncatedExtract,
  normalizeLetterAnswer,
  stemCitesVisual,
  stripChartHeaderFragments,
  stripSatBankFigureComments,
  type BankFigureLike,
} from "./sat-bank-figure-primary.ts";

export { normalizeLetterAnswer };
import { LINEAR_SAT_MATH_MAX, LINEAR_SAT_RW_MAX } from "./sat-scoring-guide.ts";

export const DIAGNOSTIC_MODULE_ORDER = ["rw-1", "rw-2", "math-1", "math-2"] as const;
export type DiagnosticModuleSlot = (typeof DIAGNOSTIC_MODULE_ORDER)[number];

/** Linear paper/digital SAT form: 33+33 RW, 27+27 Math. */
export const DIAGNOSTIC_MODULE_TARGETS: Record<DiagnosticModuleSlot, number> = {
  "rw-1": 33,
  "rw-2": 33,
  "math-1": 27,
  "math-2": 27,
};

export const MIN_USABLE_DIAGNOSTIC_QUESTIONS = 80;

export type DiagnosticQualityInput = {
  id?: string | null;
  sourceKey?: string | null;
  collectionId?: string | null;
  collectionSlug?: string | null;
  examFamily?: string | null;
  section?: string | null;
  module?: number | null;
  questionNumber?: number | null;
  position?: number | null;
  prompt?: string | null;
  stimulus?: string | null;
  choices?: Array<{ id?: string; label?: string; text?: string }> | null;
  figures?: BankFigureLike[] | null;
  questionType?: string | null;
  correctAnswer?: string | null;
  extractGaps?: Record<string, unknown> | null;
};

export type DiagnosticComposition = {
  questionCount: number;
  rwCount: number;
  mathCount: number;
  cleanMcqCount: number;
  figurePrimaryCount: number;
  droppedUnusable: number;
  filledFromOtherPacks: number;
  modules: Record<DiagnosticModuleSlot, number>;
  duplicatePrompts: number;
  sprCount: number;
  usable: boolean;
};

export function isTrueSprQuizItem(input: Pick<DiagnosticQualityInput, "correctAnswer" | "questionType">): boolean {
  if (isLetterAnswer(input.correctAnswer)) return false;
  const type = (input.questionType ?? "").trim().toLowerCase();
  return type === "spr" || type === "student_produced_response" || type === "free_response";
}

function readableStudentText(input: Pick<DiagnosticQualityInput, "prompt" | "stimulus">): boolean {
  return hasReadableStudentStem(input);
}

function isGarbledItem(input: Pick<DiagnosticQualityInput, "prompt" | "stimulus">): boolean {
  const prompt = stripChartHeaderFragments(input.prompt);
  const stimulus = stripChartHeaderFragments(input.stimulus);
  return looksGarbledExtractText(prompt) || looksGarbledExtractText(stimulus);
}

function stemReferencesMissingVisual(input: DiagnosticQualityInput): boolean {
  const haystack = `${stripSatBankFigureComments(input.prompt)}\n${stripSatBankFigureComments(input.stimulus)}`;
  if (!stemCitesVisual(haystack)) return false;
  if (hasRecoveredDataTable(haystack) && /table/i.test(haystack)) return false;
  return !hasRenderableFigures(input);
}

/** Clean readable A–D item a student can answer from text (plus a figure if cited). */
export function isCleanTextMcqItem(input: DiagnosticQualityInput): boolean {
  if (!isLetterAnswer(input.correctAnswer)) return false;
  if (!hasCompleteLetterChoiceText(input.choices)) return false;
  if (!readableStudentText(input)) return false;
  if (isGarbledItem(input)) return false;
  if (
    looksSmashedOrTruncatedExtract(stripChartHeaderFragments(input.prompt)) ||
    looksSmashedOrTruncatedExtract(stripChartHeaderFragments(input.stimulus))
  ) {
    return false;
  }
  if (stemReferencesMissingVisual(input)) return false;
  return true;
}

/**
 * Shared student-usable gate for every quiz (diagnostic, routine pre-work,
 * tutor-built bank quizzes, and lesson retries): letter-key MCQ with a
 * readable stem and complete non-garbage A–D text. A cited graph/table must
 * be present as a figure or a recovered data table. Full-question crops no
 * longer unlock letter-only shells.
 */
export function isStudentUsableQuizItem(input: DiagnosticQualityInput): boolean {
  if (!isLetterAnswer(input.correctAnswer)) return false;
  if (isTrueSprQuizItem(input)) return false;
  if (!hasCompleteLetterChoiceText(input.choices)) return false;
  if (hasMergedOrLeakedChoices(input.choices)) return false;
  if (!hasReadableStudentStem(input)) return false;
  if (isCleanTextMcqItem(input)) return true;
  if (isGarbledItem(input)) return false;
  if (
    looksSmashedOrTruncatedExtract(stripChartHeaderFragments(input.prompt)) ||
    looksSmashedOrTruncatedExtract(stripChartHeaderFragments(input.stimulus))
  ) {
    return false;
  }
  if (stemReferencesMissingVisual(input)) return false;
  return hasRenderableFigures(input) || hasRecoveredDataTable(`${input.prompt ?? ""}\n${input.stimulus ?? ""}`);
}

/** @deprecated Use isStudentUsableQuizItem — same shared gate for all quizzes. */
export const isStudentUsableDiagnosticItem = isStudentUsableQuizItem;

export function quizItemFromServedQuestion(question: {
  id?: string | null;
  prompt?: string | null;
  stimulus?: string | null;
  choices?: unknown;
  questionType?: string | null;
  correctAnswer?: string | null;
  extractGaps?: Record<string, unknown> | null;
  subject?: string | null;
  domain?: string | null;
  figures?: BankFigureLike[] | null;
}): DiagnosticQualityInput {
  const choices = Array.isArray(question.choices)
    ? question.choices.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { id?: unknown; label?: unknown; text?: unknown };
        return [
          {
            id: String(row.id ?? row.label ?? String.fromCharCode(97 + index)),
            label: String(row.label ?? row.id ?? String.fromCharCode(65 + index)),
            text: String(row.text ?? ""),
          },
        ];
      })
    : [];
  return {
    id: question.id,
    prompt: question.prompt,
    stimulus: question.stimulus,
    choices,
    figures: question.figures ?? [],
    questionType: question.questionType,
    correctAnswer: question.correctAnswer,
    extractGaps: question.extractGaps,
    section: /math/i.test(`${question.subject ?? ""} ${question.domain ?? ""}`) ? "math" : "rw",
  };
}

export function isStudentUsableServedQuestion(
  question: Parameters<typeof quizItemFromServedQuestion>[0],
): boolean {
  return isStudentUsableQuizItem(quizItemFromServedQuestion(question));
}

/**
 * Serve-time and composition use the same gate: complete readable A–D,
 * never empty/incomplete choice sets, never smashed OCR.
 */
export function isSafeToShowStudentQuizItem(input: DiagnosticQualityInput): boolean {
  return isStudentUsableQuizItem(input);
}

export function diagnosticPromptFingerprint(input: DiagnosticQualityInput): string {
  const text = `${stripSatBankFigureComments(input.prompt)}\n${stripSatBankFigureComments(input.stimulus)}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (text) return text;
  return `source:${input.sourceKey || input.id || "unknown"}`;
}

export function diagnosticModuleSlot(input: DiagnosticQualityInput): DiagnosticModuleSlot {
  const section = input.section === "math" ? "math" : "rw";
  const module = Number(input.module) === 2 ? 2 : 1;
  return `${section}-${module}` as DiagnosticModuleSlot;
}

function itemKey(item: DiagnosticQualityInput, index: number): string {
  return item.id?.trim() || item.sourceKey?.trim() || `idx:${index}`;
}

function collectionMatches(
  item: DiagnosticQualityInput,
  preferredCollectionId?: string | null,
  preferredCollectionSlug?: string | null,
): boolean {
  if (preferredCollectionId && item.collectionId === preferredCollectionId) return true;
  if (preferredCollectionSlug && item.collectionSlug === preferredCollectionSlug) return true;
  return false;
}

function sortDiagnosticItems<T extends DiagnosticQualityInput>(left: T, right: T): number {
  const positionDelta = (left.position ?? 0) - (right.position ?? 0);
  if (positionDelta !== 0) return positionDelta;
  const moduleDelta = (left.module ?? 0) - (right.module ?? 0);
  if (moduleDelta !== 0) return moduleDelta;
  return (left.questionNumber ?? 0) - (right.questionNumber ?? 0);
}

function preferCleanThenPosition<T extends DiagnosticQualityInput>(left: T, right: T): number {
  const cleanDelta = Number(isCleanTextMcqItem(left)) - Number(isCleanTextMcqItem(right));
  if (cleanDelta !== 0) return cleanDelta > 0 ? -1 : 1;
  return sortDiagnosticItems(left, right);
}

/**
 * Build a linear SAT diagnostic: preferred pack in module order, drop garbage,
 * replace missing slots with unused clean SAT MCQs from other packs.
 */
export function selectUsableDiagnosticItems<T extends DiagnosticQualityInput>(
  items: readonly T[],
  options: {
    preferredCollectionId?: string | null;
    preferredCollectionSlug?: string | null;
    allowCrossCollectionFill?: boolean;
  } = {},
): T[] {
  const usable = items.filter((item) => isStudentUsableQuizItem(item));
  const seenFingerprints = new Set<string>();
  const unique: T[] = [];
  for (const item of [...usable].sort(sortDiagnosticItems)) {
    const fingerprint = diagnosticPromptFingerprint(item);
    if (seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);
    unique.push(item);
  }

  const hasPreferred =
    Boolean(options.preferredCollectionId) || Boolean(options.preferredCollectionSlug);
  const preferred = hasPreferred
    ? unique.filter((item) =>
        collectionMatches(item, options.preferredCollectionId, options.preferredCollectionSlug),
      )
    : unique;
  const allowFill = options.allowCrossCollectionFill !== false && hasPreferred;
  const fillPool = allowFill
    ? unique
        .filter(
          (item) =>
            !collectionMatches(item, options.preferredCollectionId, options.preferredCollectionSlug),
        )
        .sort(preferCleanThenPosition)
    : [];

  const used = new Set<string>();
  const selected: T[] = [];
  const take = (item: T, slot?: DiagnosticModuleSlot) => {
    const key = itemKey(item, selected.length);
    if (used.has(key)) return false;
    used.add(key);
    const module = slot?.endsWith("2") ? 2 : slot?.endsWith("1") ? 1 : item.module;
    selected.push(slot ? { ...item, module } : item);
    return true;
  };

  for (const slot of DIAGNOSTIC_MODULE_ORDER) {
    const target = DIAGNOSTIC_MODULE_TARGETS[slot];
    const section = slot.startsWith("math") ? "math" : "rw";
    let count = 0;
    for (const item of preferred) {
      if (count >= target) break;
      if (diagnosticModuleSlot(item) !== slot) continue;
      if (take(item)) count += 1;
    }
    if (!allowFill) continue;
    const sameModule = fillPool.filter((item) => diagnosticModuleSlot(item) === slot);
    const otherModule = fillPool.filter((item) => {
      const itemSection = item.section === "math" ? "math" : "rw";
      return itemSection === section && diagnosticModuleSlot(item) !== slot;
    });
    for (const item of [...sameModule, ...otherModule]) {
      if (count >= target) break;
      if (take(item, slot)) count += 1;
    }
  }

  return selected;
}

export function summarizeDiagnosticComposition(
  selected: readonly DiagnosticQualityInput[],
  options: { droppedUnusable?: number; preferredCollectionId?: string | null; preferredCollectionSlug?: string | null } = {},
): DiagnosticComposition {
  const modules: Record<DiagnosticModuleSlot, number> = {
    "rw-1": 0,
    "rw-2": 0,
    "math-1": 0,
    "math-2": 0,
  };
  const fingerprints = new Set<string>();
  let duplicatePrompts = 0;
  let cleanMcqCount = 0;
  let figurePrimaryCount = 0;
  let sprCount = 0;
  let filledFromOtherPacks = 0;
  let rwCount = 0;
  let mathCount = 0;

  for (const item of selected) {
    modules[diagnosticModuleSlot(item)] += 1;
    const fingerprint = diagnosticPromptFingerprint(item);
    if (fingerprints.has(fingerprint)) duplicatePrompts += 1;
    else fingerprints.add(fingerprint);
    if (isTrueSprQuizItem(item)) sprCount += 1;
    if (isCleanTextMcqItem(item)) cleanMcqCount += 1;
    else if (hasFullQuestionCrop(item)) figurePrimaryCount += 1;
    if (item.section === "math") mathCount += 1;
    else rwCount += 1;
    if (
      (options.preferredCollectionId || options.preferredCollectionSlug) &&
      !collectionMatches(item, options.preferredCollectionId, options.preferredCollectionSlug)
    ) {
      filledFromOtherPacks += 1;
    }
  }

  const usable =
    selected.length >= MIN_USABLE_DIAGNOSTIC_QUESTIONS &&
    rwCount > 0 &&
    mathCount > 0 &&
    sprCount === 0 &&
    duplicatePrompts === 0 &&
    selected.every((item) => isStudentUsableQuizItem(item));

  return {
    questionCount: selected.length,
    rwCount,
    mathCount,
    cleanMcqCount,
    figurePrimaryCount,
    droppedUnusable: options.droppedUnusable ?? 0,
    filledFromOtherPacks,
    modules,
    duplicatePrompts,
    sprCount,
    usable,
  };
}

export function isUsableFullLengthDiagnostic(composition: DiagnosticComposition): boolean {
  return (
    composition.usable &&
    composition.rwCount >= 40 &&
    composition.mathCount >= 30 &&
    composition.rwCount <= LINEAR_SAT_RW_MAX &&
    composition.mathCount <= LINEAR_SAT_MATH_MAX
  );
}
