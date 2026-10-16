import {
  isAssignableBankItem,
  isMultipleChoiceQuizItem,
  isTutorQuizMcq,
} from "./sat-bank-import.ts";
import { isOfficialSatExtract, isStudentUsableQuizItem } from "./sat-bank-diagnostic-quality.ts";
import { materializedQuestionContent } from "./sat-bank-figures.ts";
import {
  hasWrongFigureForStem,
  looksGarbledExtractText,
} from "./sat-bank-figure-primary.ts";
import {
  DEFAULT_ROUTINE_PREWORK_QUESTIONS,
  ROUTINE_PREWORK_MAX_QUESTIONS,
  routinePreworkTimeLimitMinutes,
} from "./sat-bank-timing.ts";
import { MAX_IN_SESSION_HOMEWORK_QUESTIONS } from "./session-homework.ts";
import {
  TAITO_FALL_2026_SESSIONS,
  TAITO_STUDENT_DISPLAY_NAME,
  TAITO_STUDENT_EMAIL,
  matchesTaitoScheduledDate,
  normalizedSessionSubject,
  sessionLocalDateKey,
} from "./session-schedule.ts";

/**
 * Reusable SAT difficulty. Add a row to apply the hard bank to another student.
 * `effectiveAfterDateKey` is exclusive: that local session date stays on the
 * previous difficulty, and later sessions use `difficulty`.
 */
export type SatDifficulty = "standard" | "hard";

export type SatDifficultySetting = {
  email?: string;
  /** Used only when the session has no student email yet. */
  nameIncludes?: string;
  difficulty: SatDifficulty;
  effectiveAfterDateKey: string;
  /**
   * Hard in-session length for this student. Omit to keep the shared
   * homework-copy cap. This does not raise that cap for other students.
   */
  inSessionQuestionTarget?: number;
};

export const HARD_SAT_EFFECTIVE_AFTER_DATE_KEY = "2026-10-16";

export const SAT_DIFFICULTY_SETTINGS: readonly SatDifficultySetting[] = [
  {
    email: TAITO_STUDENT_EMAIL,
    nameIncludes: TAITO_STUDENT_DISPLAY_NAME,
    difficulty: "hard",
    effectiveAfterDateKey: HARD_SAT_EFFECTIVE_AFTER_DATE_KEY,
    inSessionQuestionTarget: 20,
  },
];

/** Module 2 tail: the hardest items on a linear digital practice test. */
export const HARD_SAT_MODULE = 2;
export const HARD_SAT_RW_MIN_QUESTION = 15;
export const HARD_SAT_MATH_MIN_QUESTION = 18;
/** Default hard in-session length. A student setting can raise only that student's target. */
export const HARD_SAT_IN_SESSION_MAX_QUESTIONS = MAX_IN_SESSION_HOMEWORK_QUESTIONS;
export const HARD_SAT_PREWORK_QUESTIONS = DEFAULT_ROUTINE_PREWORK_QUESTIONS;
export const HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES = 30;

export type HardSatCandidate = {
  id: string;
  sourceKey: string;
  section: string;
  module: number;
  questionNumber: number;
  practiceTestNumber: number | null;
  sourceKind?: string | null;
};

export type RenderableHardSatInput = HardSatCandidate & {
  examFamily?: string | null;
  sourceKind?: string | null;
  prompt?: string | null;
  stimulus?: string | null;
  choices?: Array<{ id?: string; label?: string; text?: string }> | null;
  figures?: unknown;
  questionType?: string | null;
  correctAnswer?: string | null;
  officialExplanation?: string | null;
  extractGaps?: Record<string, unknown> | null;
  domain?: string | null;
  skill?: string | null;
  difficulty?: string | null;
  subject?: string | null;
  tags?: string[] | null;
  sourceType?: string | null;
  generationMethod?: string | null;
};

const DEVELOPER_SEEDED_SAT_TEXT =
  /returns desk|evening hours|drip lines|dedicated lane|shaded plot retained more water|slope of the line through \(0,\s*2\) and \(4,\s*10\)|x\s*(?:\^2|²)\s*[−-]\s*9\s*=\s*0/i;

/** Developer-written originals and homework seeds. Never a College Board module 2 item. */
export function isDeveloperSeededSatItem(item: {
  sourceKind?: string | null;
  sourceType?: string | null;
  generationMethod?: string | null;
  prompt?: string | null;
  stimulus?: string | null;
}): boolean {
  const kind = item.sourceKind?.trim().toLowerCase() ?? "";
  if (kind === "seed" || kind === "original") return true;
  const sourceType = item.sourceType?.trim().toLowerCase() ?? "";
  if (sourceType === "original") return true;
  const method = item.generationMethod?.trim().toLowerCase() ?? "";
  if (
    method === "tutor-authored" ||
    method === "adaptive-deterministic" ||
    method === "openai" ||
    method === "original-ielts-style"
  ) {
    return true;
  }
  return DEVELOPER_SEEDED_SAT_TEXT.test(`${item.prompt ?? ""}\n${item.stimulus ?? ""}`);
}

export function satSection(section: string | null | undefined): "rw" | "math" | null {
  const normalized = section?.trim().toLowerCase() ?? "";
  if (normalized === "math") return "math";
  if (
    normalized === "rw" ||
    normalized === "reading" ||
    normalized === "writing" ||
    normalized === "reading and writing"
  ) {
    return "rw";
  }
  return null;
}

export function isHardSatBankItem(item: {
  section?: string | null;
  module?: number | null;
  questionNumber?: number | null;
}): boolean {
  if (Number(item.module) !== HARD_SAT_MODULE) return false;
  const questionNumber = Number(item.questionNumber);
  if (!Number.isFinite(questionNumber)) return false;
  const section = satSection(item.section);
  if (section === "rw") return questionNumber >= HARD_SAT_RW_MIN_QUESTION;
  if (section === "math") return questionNumber >= HARD_SAT_MATH_MIN_QUESTION;
  return false;
}

/**
 * Restore exponents and split minus signs that PDF extraction glued on
 * (`x2` → `x²`, `−14x` → `− 14x`). This does not invent missing stems.
 */
export function repairHardSatNotation(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/(\d)([xyz])2\b/gi, "$1$2²")
    .replace(/\b([xyz])2\b/gi, "$1²")
    .replace(/([A-Za-z0-9)])\s*([−–-])(\d+[A-Za-z])/g, "$1 $2 $3")
    .replace(/([A-Za-z0-9)])([−–-])(\d+)/g, "$1 $2 $3");
}

/**
 * Stem and choice text the student would read. A full-question crop does not
 * waive this: garbled extracted answers stay out until the text itself is repaired.
 * A blank stem counts as unusable, so an image-only item is not assigned.
 */
export function hardSatFacingTextIsGarbled(text: string | null | undefined): boolean {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return true;
  if (looksGarbledExtractText(value)) return true;
  if (/[✓]|-{4,}|\.{6,}/.test(value)) return true;
  if (/\d{2,} \d{3,},/.test(value)) return true;
  if (/\bkg\s+days\b/i.test(value)) return true;
  if (/\(90\s*[−–-]\s*\(\s*t\s*[−–-]\s*\)\)/.test(value)) return true;
  if (/^\s*-?\s*\d{1,2}\s*-{2,}/.test(value)) return true;
  return false;
}

export type HardSatFacing = {
  prompt: string;
  stimulus: string | null;
  choices: Array<{ id: string; label: string; text: string }>;
  questionType: string;
  correctAnswer: string;
  /** True when notation repair is what made the item render. */
  repaired: boolean;
};

function facingPasses(item: RenderableHardSatInput, facing: {
  prompt?: string | null;
  stimulus?: string | null;
  choices?: Array<{ id?: string; label?: string; text?: string }> | null;
  questionType?: string | null;
  correctAnswer?: string | null;
  subject?: string | null;
  domain?: string | null;
}): boolean {
  if (!isTutorQuizMcq(facing.questionType || item.questionType)) return false;
  if (
    !isMultipleChoiceQuizItem({
      questionType: facing.questionType,
      choices: facing.choices,
      correctAnswer: facing.correctAnswer,
    })
  ) {
    return false;
  }
  return isStudentUsableQuizItem({
    id: item.id,
    sourceKey: item.sourceKey,
    examFamily: item.examFamily,
    subject: facing.subject,
    domain: facing.domain ?? item.domain,
    section: item.section,
    module: item.module,
    questionNumber: item.questionNumber,
    prompt: facing.prompt,
    stimulus: facing.stimulus,
    choices: facing.choices,
    figures: Array.isArray(item.figures) ? item.figures : [],
    questionType: facing.questionType,
    correctAnswer: facing.correctAnswer,
    extractGaps: item.extractGaps,
  });
}

/**
 * Official module 2, any question number. The hard tail
 * (`isHardSatBankItem`) is the top of this pool; lower module 2 numbers are
 * the next-hardest band. Module 1 stays out.
 */
export function isOfficialModule2BankItem(item: {
  section?: string | null;
  module?: number | null;
}): boolean {
  if (Number(item.module) !== HARD_SAT_MODULE) return false;
  return satSection(item.section) != null;
}

/** Digital SAT section mix: 54 reading-and-writing and 44 math out of 98. */
export const SAT_RW_ITEM_SHARE = 54;
export const SAT_MATH_ITEM_SHARE = 44;
export const SAT_SECTION_ITEM_TOTAL = SAT_RW_ITEM_SHARE + SAT_MATH_ITEM_SHARE;

/** Sessions that use original hard items instead of the official module 2 pool. */
export const ORIGINAL_HARD_SAT_DATES = ["2026-11-27", "2026-12-11", "2026-12-18"] as const;

export type HardSatBalance = "sat" | "even";

export function originalHardSatDateFromKey(sourceKey: string | null | undefined): string | null {
  const match = /^original-hard-(\d{4}-\d{2}-\d{2})-/.exec(sourceKey ?? "");
  const dateKey = match?.[1];
  if (!dateKey || !(ORIGINAL_HARD_SAT_DATES as readonly string[]).includes(dateKey)) return null;
  return dateKey;
}

export function isOriginalHardSatItem(item: {
  sourceKind?: string | null;
  sourceKey?: string | null;
}): boolean {
  if ((item.sourceKind ?? "").trim().toLowerCase() === "original_hard") return true;
  return originalHardSatDateFromKey(item.sourceKey) != null;
}

/** Nov 27, Dec 11, and Dec 18 only. Earlier hard sessions stay on official items. */
export function originalHardSatDateKeyForSession(
  session: { dateTime: Date; timezone?: string | null } | null | undefined,
): string | null {
  if (!session) return null;
  for (const dateKey of ORIGINAL_HARD_SAT_DATES) {
    if (matchesTaitoScheduledDate(session, dateKey)) return dateKey;
  }
  return null;
}

/**
 * Balanced slot counts for a set of `count` questions.
 * `sat` follows the 54/44 digital mix. `even` is half math and half reading-and-writing.
 */
export function hardSatSectionQuotas(
  count: number,
  balance: HardSatBalance = "sat",
): { rw: number; math: number } {
  if (!Number.isFinite(count) || count <= 0) return { rw: 0, math: 0 };
  if (balance === "even") {
    const math = Math.floor(count / 2);
    return { rw: count - math, math };
  }
  const rw = Math.round((count * SAT_RW_ITEM_SHARE) / SAT_SECTION_ITEM_TOTAL);
  return { rw, math: count - rw };
}

/**
 * Student-facing text for an official module 2 item. Returns null when the
 * stem, choices, or math still do not render after notation repair.
 */
export function hardSatStudentFacing(item: RenderableHardSatInput): HardSatFacing | null {
  const originalHard = isOriginalHardSatItem(item);
  if (!isOfficialModule2BankItem(item)) return null;
  if (isDeveloperSeededSatItem(item)) return null;
  if (
    !originalHard &&
    !isOfficialSatExtract({
      examFamily: item.examFamily ?? "sat",
      sourceKind: item.sourceKind ?? "official_extract",
    })
  ) {
    return null;
  }
  const choices = Array.isArray(item.choices) ? item.choices : [];
  const extractGaps = (item.extractGaps ?? {}) as {
    missingPrompt?: boolean;
    missingChoices?: boolean;
    figurePrimary?: boolean;
  };
  if (
    !isAssignableBankItem({
      prompt: item.prompt ?? "",
      questionType: item.questionType ?? "mcq",
      choices: choices.flatMap((choice) => {
        if (!choice?.id || !choice.label || !choice.text) return [];
        return [{ id: choice.id, label: choice.label, text: choice.text }];
      }),
      correctAnswer: item.correctAnswer ?? "",
      extractGaps,
    })
  ) {
    return null;
  }
  const materialized = materializedQuestionContent({
    section: item.section,
    examFamily: item.examFamily ?? "sat",
    domain: item.domain,
    skill: item.skill,
    questionType: item.questionType ?? "mcq",
    difficulty: item.difficulty,
    stimulus: item.stimulus,
    figures: item.figures,
    prompt: item.prompt,
    choices,
    correctAnswer: item.correctAnswer ?? "",
    officialExplanation: item.officialExplanation,
    subject: item.subject,
    extractGaps: item.extractGaps,
    tags: item.tags,
  });
  const asFacing = (
    prompt: string,
    stimulus: string | null,
    nextChoices: Array<{ id?: string; label?: string; text?: string }>,
    repaired: boolean,
  ): HardSatFacing | null => {
    const normalized = nextChoices.flatMap((choice) => {
      if (!choice?.id || !choice.label || !choice.text) return [];
      return [{ id: choice.id, label: choice.label, text: choice.text }];
    });
    const candidate = {
      ...materialized,
      prompt,
      stimulus,
      choices: normalized,
    };
    if (!facingPasses(item, candidate)) return null;
    return {
      prompt,
      stimulus,
      choices: normalized,
      questionType: candidate.questionType,
      correctAnswer: candidate.correctAnswer,
      repaired,
    };
  };
  const accept = (facing: HardSatFacing | null): HardSatFacing | null => {
    if (!facing) return null;
    let prompt = facing.prompt;
    if (hardSatFacingTextIsGarbled(prompt)) {
      const raw = repairHardSatNotation(item.prompt ?? "").trim();
      if (!hardSatFacingTextIsGarbled(raw)) prompt = raw;
      else return null;
    }
    if (facing.choices.some((choice) => hardSatFacingTextIsGarbled(choice.text))) return null;
    if (
      hasWrongFigureForStem({
        prompt: prompt || item.prompt,
        stimulus: facing.stimulus ?? item.stimulus,
        figures: item.figures,
      })
    ) {
      return null;
    }
    return { ...facing, prompt };
  };
  const original = accept(
    asFacing(materialized.prompt, materialized.stimulus, materialized.choices ?? [], false),
  );
  if (original) return original;
  return accept(
    asFacing(
      repairHardSatNotation(materialized.prompt),
      materialized.stimulus ? repairHardSatNotation(materialized.stimulus) : null,
      (materialized.choices ?? []).map((choice) => ({
        ...choice,
        text: repairHardSatNotation(choice.text),
      })),
      true,
    ),
  );
}

/**
 * Official SAT module 2 MCQs that still render: complete choices and the
 * shared student-usable gate. The hard tail is preferred at selection time;
 * lower module 2 numbers stay eligible. Developer seeds, module 1, garbled
 * extracts, and wrong figures stay out. Notation-only repairs can qualify
 * an item; missing text cannot.
 */
export function isRenderableHardSatItem(item: RenderableHardSatInput): boolean {
  return hardSatStudentFacing(item) !== null;
}

export function sameSourceKeySet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((key, index) => key === sortedRight[index]);
}

/**
 * A live hard set stays put. Attempts block a refresh, and so does any
 * assigned question list — a later plan must not swap the set.
 * An empty assignment can still be filled.
 */
export function shouldRefreshUnattemptedHardPrework(input: {
  difficulty: SatDifficulty;
  attemptCount: number;
  assignedSourceKeys: readonly string[];
  desiredSourceKeys: readonly string[];
}): boolean {
  if (input.difficulty !== "hard") return false;
  if (input.attemptCount > 0) return false;
  if (input.assignedSourceKeys.length > 0) return false;
  return input.desiredSourceKeys.length > 0;
}

/** Archived assignments with no attempts are not questions the student has seen. */
export function satBankUsageCountsAsSeen(
  status: string | null | undefined,
  attemptCount: number,
): boolean {
  if ((status ?? "").trim().toLowerCase() === "archived" && attemptCount <= 0) return false;
  return true;
}

export function hardSatSetIsComplete(input: {
  preworkCount: number;
  inSessionCount: number;
  inSessionTarget: number;
  preworkTarget?: number;
}): boolean {
  const preworkTarget = input.preworkTarget ?? HARD_SAT_PREWORK_QUESTIONS;
  return input.preworkCount === preworkTarget && input.inSessionCount === input.inSessionTarget;
}

export function toRenderableHardSatInput(row: {
  id: string;
  sourceKey: string;
  examFamily?: string | null;
  sourceKind?: string | null;
  section?: string | null;
  module?: number | string | null;
  questionNumber?: number | string | null;
  practiceTestNumber?: unknown;
  prompt?: string | null;
  stimulus?: string | null;
  choices?: RenderableHardSatInput["choices"];
  figures?: unknown;
  questionType?: string | null;
  correctAnswer?: string | null;
  officialExplanation?: string | null;
  extractGaps?: Record<string, unknown> | null;
  domain?: string | null;
  skill?: string | null;
  difficulty?: string | null;
  subject?: string | null;
  tags?: string[] | null;
  sourceType?: string | null;
  generationMethod?: string | null;
}): RenderableHardSatInput {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    examFamily: row.examFamily,
    sourceKind: row.sourceKind,
    section: row.section ?? "",
    module: Number(row.module),
    questionNumber: Number(row.questionNumber),
    practiceTestNumber: coercePracticeTestNumber(row.practiceTestNumber),
    prompt: row.prompt,
    stimulus: row.stimulus,
    choices: Array.isArray(row.choices) ? row.choices : [],
    figures: row.figures,
    questionType: row.questionType,
    correctAnswer: row.correctAnswer,
    officialExplanation: row.officialExplanation,
    extractGaps: (row.extractGaps ?? {}) as Record<string, unknown>,
    domain: row.domain,
    skill: row.skill,
    difficulty: row.difficulty,
    subject: row.subject,
    tags: row.tags,
    sourceType: row.sourceType,
    generationMethod: row.generationMethod,
  };
}

function settingMatchesStudent(
  setting: SatDifficultySetting,
  input: { email?: string | null; displayName?: string | null; sessionTitle?: string | null },
): boolean {
  const email = input.email?.trim().toLowerCase() ?? "";
  const settingEmail = setting.email?.trim().toLowerCase() ?? "";
  if (settingEmail && email === settingEmail) return true;
  if (email) return false;
  const needle = setting.nameIncludes?.trim().toLowerCase() ?? "";
  if (!needle) return false;
  const display = input.displayName?.toLowerCase() ?? "";
  const title = input.sessionTitle?.toLowerCase() ?? "";
  return display.includes(needle) || title.includes(needle);
}

function dateKeyForSetting(
  session: { dateTime: Date; timezone?: string | null } | null | undefined,
  explicitDateKey: string | null | undefined,
  setting: SatDifficultySetting,
): string | null {
  if (explicitDateKey?.trim()) return explicitDateKey.trim();
  if (!session) return null;
  const settingEmail = setting.email?.trim().toLowerCase() ?? "";
  if (settingEmail === TAITO_STUDENT_EMAIL) {
    for (const scheduled of TAITO_FALL_2026_SESSIONS) {
      if (matchesTaitoScheduledDate(session, scheduled.dateKey)) return scheduled.dateKey;
    }
  }
  return sessionLocalDateKey(session.dateTime, session.timezone || "UTC");
}

export function satDifficultyForStudent(input: {
  email?: string | null;
  displayName?: string | null;
  sessionTitle?: string | null;
  subject?: string | null;
  sessionDateKey?: string | null;
  session?: { dateTime: Date; timezone?: string | null } | null;
  settings?: readonly SatDifficultySetting[];
}): SatDifficulty {
  if (input.subject && normalizedSessionSubject(input.subject) !== "SAT") return "standard";
  const settings = input.settings ?? SAT_DIFFICULTY_SETTINGS;
  for (const setting of settings) {
    if (!settingMatchesStudent(setting, input)) continue;
    const dateKey = dateKeyForSetting(input.session, input.sessionDateKey, setting);
    if (!dateKey || dateKey <= setting.effectiveAfterDateKey) return "standard";
    return setting.difficulty;
  }
  return "standard";
}

/** Per-student hard in-session length. Other students stay on the shared cap. */
export function inSessionQuestionTargetForStudent(input: {
  email?: string | null;
  displayName?: string | null;
  sessionTitle?: string | null;
  subject?: string | null;
  sessionDateKey?: string | null;
  session?: { dateTime: Date; timezone?: string | null } | null;
  settings?: readonly SatDifficultySetting[];
}): number {
  if (input.subject && normalizedSessionSubject(input.subject) !== "SAT") {
    return HARD_SAT_IN_SESSION_MAX_QUESTIONS;
  }
  const settings = input.settings ?? SAT_DIFFICULTY_SETTINGS;
  for (const setting of settings) {
    if (!settingMatchesStudent(setting, input)) continue;
    const dateKey = dateKeyForSetting(input.session, input.sessionDateKey, setting);
    if (!dateKey || dateKey <= setting.effectiveAfterDateKey) return HARD_SAT_IN_SESSION_MAX_QUESTIONS;
    const target = setting.inSessionQuestionTarget ?? HARD_SAT_IN_SESSION_MAX_QUESTIONS;
    return Number.isFinite(target) && target > 0 ? target : HARD_SAT_IN_SESSION_MAX_QUESTIONS;
  }
  return HARD_SAT_IN_SESSION_MAX_QUESTIONS;
}

export function coercePracticeTestNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Highest question number first. Same number breaks by practice test, then source key. */
function byHardestFirst<T extends HardSatCandidate>(left: T, right: T): number {
  const questionDelta = right.questionNumber - left.questionNumber;
  if (questionDelta !== 0) return questionDelta;
  const leftTest = coercePracticeTestNumber(left.practiceTestNumber) ?? 999;
  const rightTest = coercePracticeTestNumber(right.practiceTestNumber) ?? 999;
  if (leftTest !== rightTest) return leftTest - rightTest;
  return left.sourceKey.localeCompare(right.sourceKey);
}

/**
 * Fill a balanced RW/math quota from the hardest remaining items.
 * A short section is topped up from the other section's next-hardest items.
 */
function takeBalancedHardestFirst<T extends HardSatCandidate>(
  items: readonly T[],
  limit: number,
  balance: HardSatBalance = "sat",
): T[] {
  if (limit <= 0) return [];
  const rw = items.filter((item) => satSection(item.section) === "rw").sort(byHardestFirst);
  const math = items.filter((item) => satSection(item.section) === "math").sort(byHardestFirst);
  const quota = hardSatSectionQuotas(limit, balance);
  const selectedRw = rw.slice(0, quota.rw);
  const selectedMath = math.slice(0, quota.math);
  const rwShort = quota.rw - selectedRw.length;
  const mathShort = quota.math - selectedMath.length;
  if (mathShort > 0) {
    selectedRw.push(...rw.slice(selectedRw.length, selectedRw.length + mathShort));
  }
  if (rwShort > 0) {
    selectedMath.push(...math.slice(selectedMath.length, selectedMath.length + rwShort));
  }
  return [...selectedRw, ...selectedMath].slice(0, limit);
}

/**
 * Official module 2 items, hardest question number first, balanced toward
 * the SAT's 54/44 reading-and-writing and math mix. The module 2 tail
 * (RW ≥ 15, math ≥ 18) is consumed before lower numbers because those
 * numbers sort first. `seenPracticeTests` does not change the order:
 * repeats are excluded by source key.
 */
function hardSatPoolEligible(item: HardSatCandidate, originalDateKey: string | null | undefined): boolean {
  const original = isOriginalHardSatItem(item);
  if (originalDateKey) {
    return (
      original &&
      originalHardSatDateFromKey(item.sourceKey) === originalDateKey &&
      isOfficialModule2BankItem(item)
    );
  }
  if (original) return false;
  return isOfficialModule2BankItem(item);
}

export function selectHardSatQuestions<T extends HardSatCandidate>(
  items: readonly T[],
  options: {
    targetCount?: number;
    minCount?: number;
    maxCount?: number;
    excludeSourceKeys?: ReadonlySet<string>;
    seenPracticeTests?: ReadonlySet<number>;
    originalDateKey?: string | null;
    balance?: HardSatBalance;
  } = {},
): T[] {
  const maxCount = options.maxCount ?? options.targetCount ?? DEFAULT_ROUTINE_PREWORK_QUESTIONS;
  const targetCount = Math.min(maxCount, options.targetCount ?? maxCount);
  const exclude = options.excludeSourceKeys ?? new Set<string>();
  void options.seenPracticeTests;
  void options.minCount;
  const unique: T[] = [];
  const seenKeys = new Set<string>();
  for (const item of items) {
    if (!item.sourceKey || exclude.has(item.sourceKey) || seenKeys.has(item.sourceKey)) continue;
    if (!hardSatPoolEligible(item, options.originalDateKey)) continue;
    seenKeys.add(item.sourceKey);
    unique.push(item);
  }
  return takeBalancedHardestFirst(unique, targetCount, options.balance ?? "sat").slice(0, maxCount);
}

function shareScarceSection<T>(
  items: readonly T[],
  preIdeal: number,
  inIdeal: number,
  preCap: number,
  inCap: number,
): { pre: T[]; inSession: T[]; rest: T[] } {
  const ideal = preIdeal + inIdeal;
  if (ideal <= 0 || items.length === 0 || (preCap <= 0 && inCap <= 0)) {
    return { pre: [], inSession: [], rest: [...items] };
  }
  let preN = 0;
  let inN = 0;
  if (items.length >= ideal) {
    preN = Math.min(preIdeal, preCap);
    inN = Math.min(inIdeal, inCap);
  } else {
    preN = Math.min(preCap, Math.round((items.length * preIdeal) / ideal));
    inN = Math.min(inCap, items.length - preN);
  }
  return {
    pre: items.slice(0, preN),
    inSession: items.slice(preN, preN + inN),
    rest: items.slice(preN + inN),
  };
}

function fillFromRest<T extends HardSatCandidate>(bucket: T[], need: number, rests: T[][]): void {
  while (bucket.length < need) {
    let bestIndex = -1;
    for (let index = 0; index < rests.length; index += 1) {
      const next = rests[index]?.[0];
      if (!next) continue;
      if (bestIndex < 0 || byHardestFirst(next, rests[bestIndex]![0]!) < 0) bestIndex = index;
    }
    if (bestIndex < 0) break;
    bucket.push(rests[bestIndex]!.shift()!);
  }
}

/**
 * Plan pre-work and in-session together so a scarce section is shared
 * instead of being spent entirely on the first set. Leftover slots are
 * filled from the other section. A short return means the official module 2
 * pool cannot fill both sets.
 */
function allocateHardSatSets<T extends HardSatCandidate>(
  rw: readonly T[],
  math: readonly T[],
  preCount: number,
  inCount: number,
  balance: HardSatBalance = "sat",
): { prework: T[]; inSession: T[] } {
  const preQuota = hardSatSectionQuotas(preCount, balance);
  const inQuota = hardSatSectionQuotas(inCount, balance);
  const rwShare = shareScarceSection(rw, preQuota.rw, inQuota.rw, preCount, inCount);
  const mathShare = shareScarceSection(math, preQuota.math, inQuota.math, preCount, inCount);
  const prework = [...rwShare.pre, ...mathShare.pre];
  const inSession = [...rwShare.inSession, ...mathShare.inSession];
  const rests = [rwShare.rest, mathShare.rest];
  fillFromRest(prework, preCount, rests);
  fillFromRest(inSession, inCount, rests);
  return { prework: prework.slice(0, preCount), inSession: inSession.slice(0, inCount) };
}

export function planHardSatSessionSets<T extends HardSatCandidate>(
  items: readonly T[],
  options: {
    excludeSourceKeys?: ReadonlySet<string>;
    seenPracticeTests?: ReadonlySet<number>;
    preworkTarget?: number;
    preworkMin?: number;
    preworkMax?: number;
    inSessionMax?: number;
    /** When set, draw only original_hard items for this session date. */
    originalDateKey?: string | null;
    balance?: HardSatBalance;
  } = {},
): {
  prework: T[];
  inSession: T[];
  preworkTimeLimitMinutes: number;
  inSessionTimeLimitMinutes: number;
} {
  const exclude = options.excludeSourceKeys ?? new Set<string>();
  void options.seenPracticeTests;
  void options.preworkMin;
  const preworkMax = options.preworkMax ?? options.preworkTarget ?? DEFAULT_ROUTINE_PREWORK_QUESTIONS;
  const preCount = Math.min(preworkMax, options.preworkTarget ?? preworkMax);
  const inCount = options.inSessionMax ?? HARD_SAT_IN_SESSION_MAX_QUESTIONS;
  const unique: T[] = [];
  const seenKeys = new Set<string>();
  for (const item of items) {
    if (!item.sourceKey || exclude.has(item.sourceKey) || seenKeys.has(item.sourceKey)) continue;
    if (!hardSatPoolEligible(item, options.originalDateKey)) continue;
    seenKeys.add(item.sourceKey);
    unique.push(item);
  }
  const rw = unique.filter((item) => satSection(item.section) === "rw").sort(byHardestFirst);
  const math = unique.filter((item) => satSection(item.section) === "math").sort(byHardestFirst);
  const allocated = allocateHardSatSets(rw, math, preCount, inCount, options.balance ?? "sat");
  return {
    prework: allocated.prework,
    inSession: allocated.inSession,
    preworkTimeLimitMinutes: routinePreworkTimeLimitMinutes(allocated.prework.length),
    inSessionTimeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  };
}
