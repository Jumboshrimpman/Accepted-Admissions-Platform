import {
  hasCompleteLetterChoiceText,
  hasFullQuestionCrop,
  hasMergedOrLeakedChoices,
  hasReadableStudentStem,
  hasRecoveredDataTable,
  hasSolvableCitedVisual,
  hasUsableTableData,
  hasRenderableFigures,
  isLetterAnswer,
  looksBrokenMathOcr,
  looksExplodedOcrTable,
  looksFlattenedFractionChoice,
  looksGarbledExtractText,
  looksGluedInequalityChoice,
  looksHardOcrMathRisk,
  looksIncompleteMathParens,
  looksLeakedNextQuestionChoice,
  looksSmashedAlgebraChoice,
  looksSmashedAlgebraText,
  looksSmashedOrTruncatedExtract,
  looksSmashedPiChoice,
  looksSmashedPiToken,
  looksSmashedTableChoice,
  looksSmashedTrigToken,
  looksSpacedDecimalChoice,
  looksExtractionMarkerBleed,
  normalizeLetterAnswer,
  stemCitesMathDataTable,
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
export const FULL_DIAGNOSTIC_QUESTION_COUNT =
  DIAGNOSTIC_MODULE_TARGETS["rw-1"] +
  DIAGNOSTIC_MODULE_TARGETS["rw-2"] +
  DIAGNOSTIC_MODULE_TARGETS["math-1"] +
  DIAGNOSTIC_MODULE_TARGETS["math-2"];

export const STUDENT_USABLE_FAILURE_REASONS = [
  "true_spr",
  "missing_letter_key",
  "incomplete_choices",
  "leaked_or_merged_choices",
  "extraction_marker_bleed",
  "unreadable_stem",
  "garbled_extract",
  "smashed_extract",
  "smashed_algebra",
  "smashed_trig",
  "smashed_pi",
  "spaced_decimals",
  "flattened_fractions",
  "flattened_xy_table",
  "junk_bleed_choice",
  "table_cite_without_values",
  "cited_visual_without_solvable_figure",
  "exploded_ocr_table",
  "unsure_math_presentation",
] as const;

export type StudentUsableFailureReason = (typeof STUDENT_USABLE_FAILURE_REASONS)[number];

export type DiagnosticShortfall = {
  questionCount: number;
  rwCount: number;
  mathCount: number;
  modules: Record<DiagnosticModuleSlot, number>;
  reasons: Partial<Record<StudentUsableFailureReason, number>>;
};

export type StudentUsableAudit = {
  ok: boolean;
  reasons: StudentUsableFailureReason[];
};

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
  residualJunk: number;
  shortfall: DiagnosticShortfall;
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
  const raw = `${input.prompt ?? ""}\n${input.stimulus ?? ""}`;
  if (looksExtractionMarkerBleed(raw)) return true;
  if (looksGarbledExtractText(raw)) return true;
  const prompt = stripChartHeaderFragments(input.prompt);
  const stimulus = stripChartHeaderFragments(input.stimulus);
  return looksGarbledExtractText(prompt) || looksGarbledExtractText(stimulus);
}

function smashedExtract(input: Pick<DiagnosticQualityInput, "prompt" | "stimulus">): boolean {
  return (
    looksSmashedOrTruncatedExtract(stripChartHeaderFragments(input.prompt)) ||
    looksSmashedOrTruncatedExtract(stripChartHeaderFragments(input.stimulus))
  );
}

function stemHaystack(input: Pick<DiagnosticQualityInput, "prompt" | "stimulus">): string {
  return `${stripSatBankFigureComments(input.prompt)}\n${stripSatBankFigureComments(input.stimulus)}`;
}

function stemReferencesMissingVisual(input: DiagnosticQualityInput): boolean {
  const haystack = stemHaystack(input);
  if (!stemCitesVisual(haystack)) return false;
  if (hasRecoveredDataTable(haystack) && /table/i.test(haystack)) return false;
  return !hasRenderableFigures(input);
}

export function quizSectionFromBankMeta(input: {
  section?: string | null;
  subject?: string | null;
  domain?: string | null;
}): "math" | "rw" | undefined {
  const explicit = input.section?.trim().toLowerCase();
  if (explicit === "math") return "math";
  if (
    explicit === "rw" ||
    explicit === "reading" ||
    explicit === "writing" ||
    explicit === "reading and writing"
  ) {
    return "rw";
  }
  if (input.subject && /math/i.test(input.subject)) return "math";
  if (input.domain && /math/i.test(input.domain)) return "math";
  return undefined;
}

/** Algebra/function markers — not RW “the table” / “the graph” alone. */
const MATH_CONTENT_MARKERS =
  /\b(?:xy[- ]plane|x y-plane|system of equations|quadratic|polynomial|linear function|exponential function|dot plot|scatterplot|vertex form|standard form|which equation)\b|given\s*equation|f\s*\(\s*x\s*\)|\by\s*=\s*[+\-]?\d/i;

export function isMathQuizItem(input: DiagnosticQualityInput): boolean {
  const section = quizSectionFromBankMeta(input);
  if (section === "math") return true;
  if (section === "rw") return false;
  const blob = `${input.prompt ?? ""}\n${input.stimulus ?? ""}\n${(input.choices ?? [])
    .map((choice) => choice.text ?? "")
    .join("\n")}`;
  return MATH_CONTENT_MARKERS.test(blob);
}

function mathDependsOnVisual(input: DiagnosticQualityInput): boolean {
  return stemCitesVisual(stemHaystack(input));
}

function mathHasRequiredVisual(input: DiagnosticQualityInput): boolean {
  const haystack = `${input.prompt ?? ""}\n${input.stimulus ?? ""}`;
  // Cite-without-data is never solvable. Recovered table values or a real
  // full-question / figure-primary crop only — not a page-neighbor PNG.
  if (stemCitesMathDataTable(haystack) && !hasUsableTableData(haystack)) {
    return hasFullQuestionCrop(input);
  }
  if (mathDependsOnVisual(input)) {
    return hasSolvableCitedVisual(input);
  }
  return hasUsableTableData(haystack) && /table/i.test(haystack);
}

function mathFigurePrimarySalvage(input: DiagnosticQualityInput): boolean {
  return (
    isLetterAnswer(input.correctAnswer) &&
    hasCompleteLetterChoiceText(input.choices) &&
    !hasMergedOrLeakedChoices(input.choices) &&
    hasFullQuestionCrop(input)
  );
}

function looksUnsureMathPresentation(input: DiagnosticQualityInput): boolean {
  const stem = stemHaystack(input);
  if (looksBrokenMathOcr(stem) || looksIncompleteMathParens(stem)) return true;
  if (looksExplodedOcrTable(stem)) return true;
  if (looksExtractionMarkerBleed(stem)) return true;
  if (/\bWhatThe\b/i.test(stem)) return true;
  if (/\bfollowing\s*\??\s*$/i.test(stem)) return true;
  if (/\(\s*,\s*[xy]\s+[xy]/i.test(stem)) return true;
  return false;
}

/**
 * Math-only bar: if a student cannot solve the item as shown, drop it.
 * A cited table/graph/figure needs recovered values or a real full-question
 * crop — never a generic page-neighbor PNG. Extraction-marker wrappers,
 * smashed trig/algebra, and unreadable choices never pass as text.
 * Hard OCR may ship only as figure-primary (official image + clean A–D).
 */
export function isStudentUsableMathQuizItem(input: DiagnosticQualityInput): boolean {
  return auditStudentQuizItem({ ...input, section: input.section ?? "math" }).ok;
}

function choiceFailureReasons(
  choices: DiagnosticQualityInput["choices"],
): StudentUsableFailureReason[] {
  const reasons = new Set<StudentUsableFailureReason>();
  for (const choice of choices ?? []) {
    const text = choice.text ?? "";
    if (looksLeakedNextQuestionChoice(text)) reasons.add("junk_bleed_choice");
    if (looksSmashedTrigToken(text)) reasons.add("smashed_trig");
    if (looksSmashedPiChoice(text) || looksSmashedPiToken(text)) reasons.add("smashed_pi");
    if (looksSpacedDecimalChoice(text)) reasons.add("spaced_decimals");
    if (looksFlattenedFractionChoice(text)) reasons.add("flattened_fractions");
    if (looksSmashedTableChoice(text)) reasons.add("flattened_xy_table");
    if (looksSmashedAlgebraChoice(text) || looksSmashedAlgebraText(text)) reasons.add("smashed_algebra");
    if (looksGluedInequalityChoice(text)) reasons.add("smashed_algebra");
  }
  return [...reasons];
}

function classifyMathFailures(input: DiagnosticQualityInput): StudentUsableFailureReason[] {
  const reasons: StudentUsableFailureReason[] = [];
  const haystack = stemHaystack(input);
  if (!isLetterAnswer(input.correctAnswer)) reasons.push("missing_letter_key");
  if (isTrueSprQuizItem(input)) reasons.push("true_spr");
  if (hasMergedOrLeakedChoices(input.choices)) reasons.push("leaked_or_merged_choices");
  if (!hasCompleteLetterChoiceText(input.choices)) {
    reasons.push("incomplete_choices");
    reasons.push(...choiceFailureReasons(input.choices));
  } else {
    reasons.push(...choiceFailureReasons(input.choices));
  }
  if (looksExtractionMarkerBleed(haystack)) reasons.push("extraction_marker_bleed");

  const tableCiteWithoutValues =
    stemCitesMathDataTable(haystack) && !hasUsableTableData(haystack) && !hasFullQuestionCrop(input);
  if (tableCiteWithoutValues) reasons.push("table_cite_without_values");
  if (mathDependsOnVisual(input) && !mathHasRequiredVisual(input)) {
    if (!tableCiteWithoutValues) reasons.push("cited_visual_without_solvable_figure");
  }
  if (mathDependsOnVisual(input) && looksExplodedOcrTable(haystack) && !hasFullQuestionCrop(input)) {
    reasons.push("exploded_ocr_table");
  }

  const hardOcr =
    !readableStudentText(input) ||
    isGarbledItem(input) ||
    smashedExtract(input) ||
    looksUnsureMathPresentation(input) ||
    looksHardOcrMathRisk(haystack);
  if (hardOcr && !mathFigurePrimarySalvage(input)) {
    if (!readableStudentText(input)) reasons.push("unreadable_stem");
    if (isGarbledItem(input)) reasons.push("garbled_extract");
    if (smashedExtract(input)) reasons.push("smashed_extract");
    if (looksSmashedTrigToken(haystack)) reasons.push("smashed_trig");
    if (looksSmashedAlgebraText(haystack) || looksIncompleteMathParens(haystack)) {
      reasons.push("smashed_algebra");
    }
    if (looksUnsureMathPresentation(input)) reasons.push("unsure_math_presentation");
    if (
      !reasons.includes("unreadable_stem") &&
      !reasons.includes("garbled_extract") &&
      !reasons.includes("smashed_extract") &&
      !reasons.includes("smashed_trig") &&
      !reasons.includes("smashed_algebra") &&
      !reasons.includes("unsure_math_presentation")
    ) {
      reasons.push("garbled_extract");
    }
  }
  return [...new Set(reasons)];
}

function classifyRwFailures(input: DiagnosticQualityInput): StudentUsableFailureReason[] {
  const reasons: StudentUsableFailureReason[] = [];
  if (!isLetterAnswer(input.correctAnswer)) reasons.push("missing_letter_key");
  if (isTrueSprQuizItem(input)) reasons.push("true_spr");
  if (hasMergedOrLeakedChoices(input.choices)) reasons.push("leaked_or_merged_choices");
  if (!hasCompleteLetterChoiceText(input.choices)) {
    reasons.push("incomplete_choices");
    reasons.push(...choiceFailureReasons(input.choices));
  }
  if (looksExtractionMarkerBleed(stemHaystack(input))) reasons.push("extraction_marker_bleed");
  if (!hasReadableStudentStem(input)) reasons.push("unreadable_stem");
  if (isCleanTextMcqItem(input)) return [...new Set(reasons)];
  if (isGarbledItem(input) || smashedExtract(input)) {
    reasons.push(isGarbledItem(input) ? "garbled_extract" : "smashed_extract");
  }
  if (stemReferencesMissingVisual(input)) reasons.push("cited_visual_without_solvable_figure");
  if (
    !hasRenderableFigures(input) &&
    !hasRecoveredDataTable(`${input.prompt ?? ""}\n${input.stimulus ?? ""}`)
  ) {
    if (!reasons.includes("cited_visual_without_solvable_figure") && !reasons.includes("unreadable_stem")) {
      reasons.push("unreadable_stem");
    }
  }
  return [...new Set(reasons)];
}

/**
 * Live-audit failure classes used by composition, rematerialize, and the
 * pre-assign gate. Do not trust stored import flags — always re-run this.
 */
export function auditStudentQuizItem(input: DiagnosticQualityInput): StudentUsableAudit {
  const reasons = isMathQuizItem(input) ? classifyMathFailures(input) : classifyRwFailures(input);
  return { ok: reasons.length === 0, reasons };
}

export function auditQuizItems(items: readonly DiagnosticQualityInput[]): {
  residualJunk: number;
  droppedByReason: Partial<Record<StudentUsableFailureReason, number>>;
  failed: Array<{ item: DiagnosticQualityInput; reasons: StudentUsableFailureReason[] }>;
} {
  const droppedByReason: Partial<Record<StudentUsableFailureReason, number>> = {};
  const failed: Array<{ item: DiagnosticQualityInput; reasons: StudentUsableFailureReason[] }> = [];
  for (const item of items) {
    const audit = auditStudentQuizItem(item);
    if (audit.ok) continue;
    failed.push({ item, reasons: audit.reasons });
    for (const reason of audit.reasons) {
      droppedByReason[reason] = (droppedByReason[reason] ?? 0) + 1;
    }
  }
  return { residualJunk: failed.length, droppedByReason, failed };
}

export function emptyDiagnosticShortfall(): DiagnosticShortfall {
  return {
    questionCount: FULL_DIAGNOSTIC_QUESTION_COUNT,
    rwCount: LINEAR_SAT_RW_MAX,
    mathCount: LINEAR_SAT_MATH_MAX,
    modules: {
      "rw-1": DIAGNOSTIC_MODULE_TARGETS["rw-1"],
      "rw-2": DIAGNOSTIC_MODULE_TARGETS["rw-2"],
      "math-1": DIAGNOSTIC_MODULE_TARGETS["math-1"],
      "math-2": DIAGNOSTIC_MODULE_TARGETS["math-2"],
    },
    reasons: {},
  };
}

export function diagnosticShortfallFromSelection(
  selected: readonly DiagnosticQualityInput[],
  droppedReasons: Partial<Record<StudentUsableFailureReason, number>> = {},
): DiagnosticShortfall {
  const modules: Record<DiagnosticModuleSlot, number> = {
    "rw-1": 0,
    "rw-2": 0,
    "math-1": 0,
    "math-2": 0,
  };
  let rwCount = 0;
  let mathCount = 0;
  for (const item of selected) {
    modules[diagnosticModuleSlot(item)] += 1;
    if (item.section === "math") mathCount += 1;
    else rwCount += 1;
  }
  return {
    questionCount: Math.max(0, FULL_DIAGNOSTIC_QUESTION_COUNT - selected.length),
    rwCount: Math.max(0, LINEAR_SAT_RW_MAX - rwCount),
    mathCount: Math.max(0, LINEAR_SAT_MATH_MAX - mathCount),
    modules: {
      "rw-1": Math.max(0, DIAGNOSTIC_MODULE_TARGETS["rw-1"] - modules["rw-1"]),
      "rw-2": Math.max(0, DIAGNOSTIC_MODULE_TARGETS["rw-2"] - modules["rw-2"]),
      "math-1": Math.max(0, DIAGNOSTIC_MODULE_TARGETS["math-1"] - modules["math-1"]),
      "math-2": Math.max(0, DIAGNOSTIC_MODULE_TARGETS["math-2"] - modules["math-2"]),
    },
    reasons: droppedReasons,
  };
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
 * Shared student-usable gate for every quiz (Oct 2 diagnostic, routine SAT
 * pre-work, tutor-built bank quizzes, and lesson retries).
 *
 * Math uses a stricter path than RW: complete readable stem + full A–D, a
 * hosted figure (or recovered table) when the stem depends on a visual, and
 * no OCR-bleed salvage. If a student cannot solve the math as shown, drop
 * or replace at materialize. RW may still keep a clean figure + recovered
 * table after a merely-readable stem.
 */
export function isStudentUsableQuizItem(input: DiagnosticQualityInput): boolean {
  return auditStudentQuizItem(input).ok;
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
  section?: string | null;
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
    section: quizSectionFromBankMeta(question),
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
      if (!auditStudentQuizItem(item).ok) continue;
      if (take(item, slot)) count += 1;
    }
  }

  // Fail-closed: never pad leftover slots with items that fail the live audit.
  return selected.filter((item) => auditStudentQuizItem(item).ok);
}

export function composeDiagnosticItems<T extends DiagnosticQualityInput>(
  items: readonly T[],
  options: {
    preferredCollectionId?: string | null;
    preferredCollectionSlug?: string | null;
    allowCrossCollectionFill?: boolean;
  } = {},
): { selected: T[]; composition: DiagnosticComposition } {
  const unusable = items.filter((item) => !auditStudentQuizItem(item).ok);
  const droppedReasons: Partial<Record<StudentUsableFailureReason, number>> = {};
  for (const item of unusable) {
    for (const reason of auditStudentQuizItem(item).reasons) {
      droppedReasons[reason] = (droppedReasons[reason] ?? 0) + 1;
    }
  }
  const selected = selectUsableDiagnosticItems(items, options);
  return {
    selected,
    composition: summarizeDiagnosticComposition(selected, {
      droppedUnusable: unusable.length,
      droppedReasons,
      preferredCollectionId: options.preferredCollectionId,
      preferredCollectionSlug: options.preferredCollectionSlug,
    }),
  };
}

export function canAssignDiagnostic(
  composition: DiagnosticComposition,
  selected: readonly DiagnosticQualityInput[] = [],
): boolean {
  if (composition.residualJunk > 0) return false;
  if (composition.sprCount > 0) return false;
  if (composition.rwCount === 0 || composition.mathCount === 0) return false;
  if (selected.length > 0 && selected.some((item) => !auditStudentQuizItem(item).ok)) return false;
  return composition.questionCount > 0;
}

export function summarizeDiagnosticComposition(
  selected: readonly DiagnosticQualityInput[],
  options: {
    droppedUnusable?: number;
    droppedReasons?: Partial<Record<StudentUsableFailureReason, number>>;
    preferredCollectionId?: string | null;
    preferredCollectionSlug?: string | null;
  } = {},
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

  const audit = auditQuizItems(selected);
  const shortfall = diagnosticShortfallFromSelection(selected, options.droppedReasons);
  const completeForm =
    selected.length === FULL_DIAGNOSTIC_QUESTION_COUNT &&
    rwCount === LINEAR_SAT_RW_MAX &&
    mathCount === LINEAR_SAT_MATH_MAX &&
    DIAGNOSTIC_MODULE_ORDER.every((slot) => modules[slot] === DIAGNOSTIC_MODULE_TARGETS[slot]);
  const usable =
    completeForm &&
    sprCount === 0 &&
    duplicatePrompts === 0 &&
    audit.residualJunk === 0 &&
    selected.every((item) => auditStudentQuizItem(item).ok);

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
    residualJunk: audit.residualJunk,
    shortfall,
    usable,
  };
}

export function isUsableFullLengthDiagnostic(composition: DiagnosticComposition): boolean {
  return (
    composition.usable &&
    composition.residualJunk === 0 &&
    composition.shortfall.questionCount === 0 &&
    composition.rwCount === LINEAR_SAT_RW_MAX &&
    composition.mathCount === LINEAR_SAT_MATH_MAX
  );
}
