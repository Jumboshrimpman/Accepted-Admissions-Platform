import {
  isAssignableBankItem,
  isMultipleChoiceQuizItem,
  isTutorQuizMcq,
} from "./sat-bank-import.ts";
import { isOfficialSatExtract, isStudentUsableQuizItem } from "./sat-bank-diagnostic-quality.ts";
import { materializedQuestionContent } from "./sat-bank-figures.ts";
import {
  hasFullQuestionCrop,
  hasWrongFigureForStem,
  looksGarbledExtractText,
} from "./sat-bank-figure-primary.ts";
import {
  DEFAULT_ROUTINE_PREWORK_QUESTIONS,
  ROUTINE_PREWORK_MAX_QUESTIONS,
  ROUTINE_PREWORK_MIN_QUESTIONS,
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

/** Answer-key sentence from the College Board explanation, e.g. "Choice B is correct." */
export function explanationAgreesWithAnswerKey(
  explanation: string | null | undefined,
  correctAnswer: string | null | undefined,
): boolean {
  const key = (correctAnswer ?? "").trim().toUpperCase();
  if (!/^[A-D]$/.test(key)) return false;
  const match = (explanation ?? "").match(/Choice\s+([A-D])\s+is\s+(?:the\s+best\s+answer|correct)\b/i);
  if (!match?.[1]) return false;
  return match[1].toUpperCase() === key;
}

/**
 * A garbled extract may still be assigned when the student sees the official
 * full-question crop, every choice is readable, and the explanation names the
 * same letter as the answer key. An unverified crop does not qualify.
 */
export function hardSatFullQuestionCropSalvage(
  item: RenderableHardSatInput,
  facing: {
    prompt?: string | null;
    stimulus?: string | null;
    choices: Array<{ text?: string | null }>;
    correctAnswer?: string | null;
  },
): boolean {
  if (
    !hasFullQuestionCrop({
      figures: Array.isArray(item.figures) ? item.figures : [],
      prompt: facing.prompt ?? item.prompt,
      stimulus: facing.stimulus ?? item.stimulus,
    })
  ) {
    return false;
  }
  if (!explanationAgreesWithAnswerKey(item.officialExplanation, facing.correctAnswer || item.correctAnswer)) {
    return false;
  }
  if (facing.choices.length < 4) return false;
  return facing.choices.every((choice) => choice.text && !looksGarbledExtractText(choice.text));
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
 * Student-facing text for a hard item. Returns null when the stem, choices,
 * or math still do not render after notation repair.
 */
export function hardSatStudentFacing(item: RenderableHardSatInput): HardSatFacing | null {
  if (!isHardSatBankItem(item)) return null;
  if (isDeveloperSeededSatItem(item)) return null;
  if (
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
    const cropBacked = hardSatFullQuestionCropSalvage(item, facing);
    const rawParts = [item.prompt, item.stimulus, ...(item.choices ?? []).map((choice) => choice?.text)];
    const stillGarbled = rawParts.some((part) => {
      if (!part) return false;
      return looksGarbledExtractText(part) && looksGarbledExtractText(repairHardSatNotation(part));
    });
    if (stillGarbled && !cropBacked) return null;
    if (
      !cropBacked &&
      (looksGarbledExtractText(facing.prompt) || looksGarbledExtractText(facing.stimulus))
    ) {
      return null;
    }
    if (facing.choices.some((choice) => looksGarbledExtractText(choice.text))) return null;
    if (
      hasWrongFigureForStem({
        prompt: facing.prompt || item.prompt,
        stimulus: facing.stimulus ?? item.stimulus,
        figures: item.figures,
      })
    ) {
      return null;
    }
    return facing;
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
 * Hard bank items that still render: official SAT module 2 MCQ, complete
 * choices, and the shared student-usable gate. Developer seeds, garbled
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

function byQuestionNumber<T extends HardSatCandidate>(left: T, right: T): number {
  const questionDelta = left.questionNumber - right.questionNumber;
  if (questionDelta !== 0) return questionDelta;
  return left.sourceKey.localeCompare(right.sourceKey);
}

function takeAlternatingFromTests<T extends HardSatCandidate>(
  items: readonly T[],
  testNumbers: readonly number[],
  limit: number,
): T[] {
  const selected: T[] = [];
  for (const testNumber of testNumbers) {
    if (selected.length >= limit) break;
    const group = items.filter((item) => item.practiceTestNumber === testNumber);
    const rw = group.filter((item) => satSection(item.section) === "rw").sort(byQuestionNumber);
    const math = group.filter((item) => satSection(item.section) === "math").sort(byQuestionNumber);
    let rwIndex = 0;
    let mathIndex = 0;
    let preferRw = true;
    while (selected.length < limit) {
      const next = preferRw
        ? (rw[rwIndex++] ?? math[mathIndex++])
        : (math[mathIndex++] ?? rw[rwIndex++]);
      if (!next) break;
      selected.push(next);
      preferRw = !preferRw;
    }
  }
  return selected;
}

/**
 * Late module 2 items, earliest unseen practice test first.
 * When unseen tests cannot fill `minCount`, remaining slots come from
 * unseen question ids on tests the student has already touched.
 */
export function selectHardSatQuestions<T extends HardSatCandidate>(
  items: readonly T[],
  options: {
    targetCount?: number;
    minCount?: number;
    maxCount?: number;
    excludeSourceKeys?: ReadonlySet<string>;
    seenPracticeTests?: ReadonlySet<number>;
  } = {},
): T[] {
  const maxCount = options.maxCount ?? options.targetCount ?? DEFAULT_ROUTINE_PREWORK_QUESTIONS;
  const targetCount = Math.min(maxCount, options.targetCount ?? maxCount);
  const minCount = options.minCount ?? 0;
  const exclude = options.excludeSourceKeys ?? new Set<string>();
  const seenTests = options.seenPracticeTests ?? new Set<number>();
  const unique: T[] = [];
  const seenKeys = new Set<string>();
  for (const item of items) {
    if (!item.sourceKey || exclude.has(item.sourceKey) || seenKeys.has(item.sourceKey)) continue;
    if (!isHardSatBankItem(item)) continue;
    seenKeys.add(item.sourceKey);
    unique.push(item);
  }
  const testNumbers = [
    ...new Set(
      unique
        .map((item) => coercePracticeTestNumber(item.practiceTestNumber))
        .filter((value): value is number => value != null),
    ),
  ];
  const unseen = testNumbers.filter((testNumber) => !seenTests.has(testNumber)).sort((a, b) => a - b);
  const seen = testNumbers.filter((testNumber) => seenTests.has(testNumber)).sort((a, b) => a - b);
  let selected = takeAlternatingFromTests(unique, unseen, targetCount);
  if (selected.length < minCount) {
    const backfill = takeAlternatingFromTests(unique, seen, targetCount - selected.length);
    selected = selected.concat(backfill);
  }
  if (selected.length < minCount) {
    const chosen = new Set(selected.map((item) => item.sourceKey));
    const unnumbered = unique
      .filter((item) => coercePracticeTestNumber(item.practiceTestNumber) == null && !chosen.has(item.sourceKey))
      .sort(byQuestionNumber);
    for (const item of unnumbered) {
      if (selected.length >= targetCount) break;
      selected.push(item);
    }
  }
  return selected.slice(0, maxCount);
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
  } = {},
): {
  prework: T[];
  inSession: T[];
  preworkTimeLimitMinutes: number;
  inSessionTimeLimitMinutes: number;
} {
  const exclude = options.excludeSourceKeys ?? new Set<string>();
  const seenPracticeTests = options.seenPracticeTests ?? new Set<number>();
  const prework = selectHardSatQuestions(items, {
    targetCount: options.preworkTarget ?? DEFAULT_ROUTINE_PREWORK_QUESTIONS,
    minCount: options.preworkMin ?? ROUTINE_PREWORK_MIN_QUESTIONS,
    maxCount: options.preworkMax ?? ROUTINE_PREWORK_MAX_QUESTIONS,
    excludeSourceKeys: exclude,
    seenPracticeTests,
  });
  const inSessionExclude = new Set<string>(exclude);
  for (const item of prework) inSessionExclude.add(item.sourceKey);
  const inSessionMax = options.inSessionMax ?? HARD_SAT_IN_SESSION_MAX_QUESTIONS;
  const inSession = selectHardSatQuestions(items, {
    targetCount: inSessionMax,
    minCount: inSessionMax,
    maxCount: inSessionMax,
    excludeSourceKeys: inSessionExclude,
    seenPracticeTests,
  });
  return {
    prework,
    inSession,
    preworkTimeLimitMinutes: routinePreworkTimeLimitMinutes(prework.length),
    inSessionTimeLimitMinutes: HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  };
}
