export const DEFAULT_PREWORK_TARGET_MINUTES = 60;
export const PREWORK_TOLERANCE_MINUTES = 8;
/** Official digital SAT total time (RW 64 + Math 70). Linear 120-item forms use this as a floor. */
export const DIGITAL_SAT_STANDARD_MINUTES = 134;
export const SAT_DIAGNOSTIC_TEST_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11] as const;

export type TimedBankItem = {
  id: string;
  section: "rw" | "math";
  skill: string;
  estimatedSeconds: number;
  position?: number;
};

export type TimeSelectionResult<T extends TimedBankItem> = {
  selected: T[];
  estimatedSeconds: number;
  targetSeconds: number;
  withinTolerance: boolean;
  leftoverCount: number;
};

function inBand(seconds: number, targetSeconds: number, toleranceSeconds: number): boolean {
  return seconds >= targetSeconds - toleranceSeconds && seconds <= targetSeconds + toleranceSeconds;
}

/**
 * Select bank items for a ~60 minute TIME target.
 * Collection order is preserved when `preferOriginalOrder` is true.
 * Mixed auto-select alternates RW/Math so we do not dump one half-paper module.
 */
export function selectQuestionsForTimeBudget<T extends TimedBankItem>(
  items: readonly T[],
  options: {
    targetMinutes?: number;
    toleranceMinutes?: number;
    preferOriginalOrder?: boolean;
  } = {},
): TimeSelectionResult<T> {
  const targetMinutes = options.targetMinutes ?? DEFAULT_PREWORK_TARGET_MINUTES;
  const toleranceMinutes = options.toleranceMinutes ?? PREWORK_TOLERANCE_MINUTES;
  const targetSeconds = Math.max(60, Math.round(targetMinutes * 60));
  const toleranceSeconds = Math.max(0, Math.round(toleranceMinutes * 60));
  const pool = [...items].filter((item) => item.estimatedSeconds > 0);
  if (options.preferOriginalOrder) {
    pool.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  const selected: T[] = [];
  let estimatedSeconds = 0;
  const take = (item: T) => {
    selected.push(item);
    estimatedSeconds += item.estimatedSeconds;
  };

  if (options.preferOriginalOrder) {
    for (const item of pool) {
      if (estimatedSeconds + item.estimatedSeconds > targetSeconds + toleranceSeconds) {
        if (estimatedSeconds >= targetSeconds - toleranceSeconds) break;
        if (selected.length === 0) take(item);
        break;
      }
      take(item);
    }
  } else {
    const rw = pool.filter((item) => item.section === "rw");
    const math = pool.filter((item) => item.section === "math");
    let rwIndex = 0;
    let mathIndex = 0;
    let preferRw = true;
    while (true) {
      const next = preferRw
        ? (rw[rwIndex++] ?? math[mathIndex++])
        : (math[mathIndex++] ?? rw[rwIndex++]);
      if (!next) break;
      if (estimatedSeconds + next.estimatedSeconds > targetSeconds + toleranceSeconds) {
        if (selected.length === 0) take(next);
        break;
      }
      take(next);
      preferRw = !preferRw;
    }
  }

  return {
    selected,
    estimatedSeconds,
    targetSeconds,
    withinTolerance: inBand(estimatedSeconds, targetSeconds, toleranceSeconds),
    leftoverCount: Math.max(0, pool.length - selected.length),
  };
}

export function formatEstimatedMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes} min`;
}

export function selectFullPracticeCollection<T extends TimedBankItem>(
  items: readonly T[],
): TimeSelectionResult<T> {
  const selected = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const estimatedSeconds = selected.reduce((sum, item) => sum + Math.max(0, item.estimatedSeconds), 0);
  const targetSeconds = Math.max(DIGITAL_SAT_STANDARD_MINUTES * 60, estimatedSeconds);
  return {
    selected,
    estimatedSeconds,
    targetSeconds,
    withinTolerance: selected.length > 0,
    leftoverCount: 0,
  };
}

export function diagnosticTimeLimitMinutes(estimatedSeconds: number): number {
  return Math.min(
    180,
    Math.max(DIGITAL_SAT_STANDARD_MINUTES, Math.round(estimatedSeconds / 60) || DIGITAL_SAT_STANDARD_MINUTES),
  );
}

export function preferSatDiagnosticCollection<T extends {
  examFamily: string;
  practiceTestNumber?: number | null;
  slug?: string | null;
  questionCount: number;
}>(collections: readonly T[]): T | null {
  const sat = collections.filter((collection) => {
    const n = collection.practiceTestNumber;
    const slug = collection.slug ?? "";
    const numbered = n != null && n >= 4 && n <= 11;
    const slugMatch = /sat-practice-test-([4-9]|1[01])\b/.test(slug);
    return collection.examFamily === "sat" && (numbered || slugMatch);
  });
  sat.sort((a, b) => {
    const countDelta = (b.questionCount ?? 0) - (a.questionCount ?? 0);
    if (countDelta !== 0) return countDelta;
    return (a.practiceTestNumber ?? 99) - (b.practiceTestNumber ?? 99);
  });
  return sat[0] ?? null;
}

export function shouldReplaceFirstSessionPrework(input: {
  homeworkKind?: string | null;
  questionCount: number;
  title?: string | null;
}): boolean {
  if (input.homeworkKind === "diagnostic" && input.questionCount >= 80) return false;
  return true;
}

export function isFullLengthDiagnosticSelection(input: {
  homeworkKind?: "diagnostic" | "routine" | null;
  questionCount: number;
  targetMinutes?: number | null;
}): boolean {
  return (
    input.homeworkKind === "diagnostic" &&
    input.questionCount >= 80 &&
    (input.targetMinutes == null || input.targetMinutes >= DIGITAL_SAT_STANDARD_MINUTES)
  );
}
