import {
  DEFAULT_ROUTINE_PREWORK_QUESTIONS,
  SAT_DIAGNOSTIC_TEST_NUMBERS,
} from "./sat-bank-timing.ts";
import {
  coercePracticeTestNumber,
  hardSatSectionQuotas,
  isOfficialHardTailItem,
  satSection,
} from "./sat-set-difficulty.ts";

/**
 * Standard and hard-student routine pre-work: 40 questions from one official
 * SAT practice form (practice tests 4–11). PSAT rows are ignored.
 *
 * Unused forms are tried in ascending practice-test number. A form that cannot
 * supply the full count is skipped for the next unused form. When every form
 * in the pool has already been used, recycle from the lowest practice-test
 * number (seen-usage does not record timestamps, so this is not least-recent).
 * The draw is a seeded shuffle, never position order across the bank.
 */
export type RoutineFormQuestion = {
  id: string;
  section: string;
  examFamily?: string | null;
  practiceTestNumber?: unknown;
  position?: number | null;
  sourceKey?: string | null;
  linkedQuestionId?: string | null;
  prompt?: string | null;
  stimulus?: string | null;
  choices?: unknown;
};

export type RoutineFormPick<T> = {
  selected: T[];
  practiceTestNumber: number | null;
  recycled: boolean;
};

const OFFICIAL_SAT_FORMS = new Set<number>(SAT_DIAGNOSTIC_TEST_NUMBERS);

/** FNV-1a plus a mixer. Same construction as the original-hard item shuffles. */
function hashSeed(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let mixed = hash >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function shuffleWithSeed<T>(items: readonly T[], seedId: string): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const mixed = hashSeed(`${seedId}:${index}`) || 1;
    const swap = Math.floor((mixed / 4294967296) * (index + 1));
    const hold = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = hold;
  }
  return copy;
}

function byStableFormOrder<T extends RoutineFormQuestion>(left: T, right: T): number {
  const positionDelta = (left.position ?? 0) - (right.position ?? 0);
  if (positionDelta !== 0) return positionDelta;
  return (left.sourceKey ?? left.id).localeCompare(right.sourceKey ?? right.id);
}

function officialSatFormNumber(item: RoutineFormQuestion): number | null {
  if ((item.examFamily ?? "").trim().toLowerCase() !== "sat") return null;
  const practiceTestNumber = coercePracticeTestNumber(item.practiceTestNumber);
  if (practiceTestNumber == null || !OFFICIAL_SAT_FORMS.has(practiceTestNumber)) return null;
  if (satSection(item.section) == null) return null;
  return practiceTestNumber;
}

/**
 * 22 reading-and-writing and 18 math at the default count of 40, the digital
 * SAT's 54/44 share. A short section is filled from the other section.
 * The result is never longer than `target`.
 */
function drawBalancedFromForm<T extends RoutineFormQuestion>(
  items: readonly T[],
  seed: string,
  practiceTestNumber: number,
  target: number,
  sections?: readonly ("rw" | "math")[] | null,
): T[] {
  const quota = hardSatSectionQuotas(target, "sat", sections);
  const ordered = [...items].sort(byStableFormOrder);
  const rw = shuffleWithSeed(
    ordered.filter((item) => satSection(item.section) === "rw"),
    `${seed}:form:${practiceTestNumber}:rw`,
  );
  const math = shuffleWithSeed(
    ordered.filter((item) => satSection(item.section) === "math"),
    `${seed}:form:${practiceTestNumber}:math`,
  );
  const pickedRw = rw.slice(0, Math.min(quota.rw, rw.length));
  const pickedMath = math.slice(0, Math.min(quota.math, math.length));
  const selected = [...pickedRw, ...pickedMath];
  const need = target - selected.length;
  if (need > 0) {
    const extra = [...rw.slice(pickedRw.length), ...math.slice(pickedMath.length)];
    selected.push(...extra.slice(0, need));
  }
  return shuffleWithSeed(selected.slice(0, target), `${seed}:form:${practiceTestNumber}:order`);
}

export function selectRoutinePreworkFromOneForm<T extends RoutineFormQuestion>(
  items: readonly T[],
  options: {
    seed: string;
    usedPracticeTests?: ReadonlySet<number>;
    targetCount?: number;
    /**
     * Skip a form that cannot fill the target, including when it is the last
     * unused form, and take the next form that can. Used for a section-restricted
     * student whose filtered pool is short on one form. Omit for the mixed draw.
     */
    requireFullCount?: boolean;
  },
): RoutineFormPick<T> {
  const target = Math.min(
    DEFAULT_ROUTINE_PREWORK_QUESTIONS,
    Math.max(1, options.targetCount ?? DEFAULT_ROUTINE_PREWORK_QUESTIONS),
  );
  const used = options.usedPracticeTests ?? new Set<number>();
  const byForm = new Map<number, T[]>();
  for (const item of items) {
    const practiceTestNumber = officialSatFormNumber(item);
    if (practiceTestNumber == null) continue;
    const list = byForm.get(practiceTestNumber) ?? [];
    list.push(item);
    byForm.set(practiceTestNumber, list);
  }
  const forms = [...byForm.keys()].sort((left, right) => left - right);
  const drawn = new Map<number, T[]>();
  const draw = (practiceTestNumber: number) => {
    const cached = drawn.get(practiceTestNumber);
    if (cached) return cached;
    const selected = drawBalancedFromForm(
      byForm.get(practiceTestNumber) ?? [],
      options.seed,
      practiceTestNumber,
      target,
    );
    drawn.set(practiceTestNumber, selected);
    return selected;
  };
  if (options.requireFullCount) {
    const unusedFull = forms.filter(
      (practiceTestNumber) => !used.has(practiceTestNumber) && draw(practiceTestNumber).length >= target,
    );
    const full = unusedFull.length > 0
      ? unusedFull
      : forms.filter((practiceTestNumber) => draw(practiceTestNumber).length >= target);
    const practiceTestNumber = full[0];
    if (practiceTestNumber != null) {
      return {
        selected: draw(practiceTestNumber),
        practiceTestNumber,
        recycled: used.has(practiceTestNumber),
      };
    }
  }
  const unused = forms.filter((practiceTestNumber) => !used.has(practiceTestNumber));
  const recycled = unused.length === 0 && forms.length > 0;
  const candidates = unused.length > 0 ? unused : forms;
  let best: RoutineFormPick<T> | null = null;
  for (const practiceTestNumber of candidates) {
    const selected = draw(practiceTestNumber);
    if (selected.length >= target) {
      return { selected, practiceTestNumber, recycled };
    }
    if (!best || selected.length > best.selected.length) {
      best = { selected, practiceTestNumber, recycled };
    }
  }
  return best ?? { selected: [], practiceTestNumber: null, recycled: false };
}

export type MichelleHardPreworkPick<T> = RoutineFormPick<T> & {
  /** True when no single form could supply the full hard set. */
  widened: boolean;
};

/**
 * Michelle's later SAT pre-work: 40 hard-tail official module 2 items
 * (reading and writing q ≥ 15, math q ≥ 18). One leftover official form is
 * used first when that form can fill the set with hard-tail items only.
 * If no form can, leftover official hard-tail items are widened across
 * forms, then undated Michelle original hard items fill the remainder.
 * Early module 2 items, module 1, and foundational questions stay out.
 * Taito-dated originals stay out. Partial sets are not padded. Pass
 * `sections` to restrict the draw (math for Xavier, reading and writing
 * for Sophia Lamas).
 */
export function selectMichelleFutureHardPrework<
  T extends RoutineFormQuestion & { sourceKind?: string | null },
>(
  items: readonly T[],
  options: {
    seed: string;
    usedPracticeTests?: ReadonlySet<number>;
    excludeSourceKeys?: ReadonlySet<string>;
    targetCount?: number;
    sections?: readonly ("rw" | "math")[] | null;
  },
): MichelleHardPreworkPick<T> {
  const target = Math.min(
    DEFAULT_ROUTINE_PREWORK_QUESTIONS,
    Math.max(1, options.targetCount ?? DEFAULT_ROUTINE_PREWORK_QUESTIONS),
  );
  const used = options.usedPracticeTests ?? new Set<number>();
  const exclude = options.excludeSourceKeys ?? new Set<string>();
  const formNumber = (item: RoutineFormQuestion) => {
    const official = officialSatFormNumber(item);
    if (official != null) return official;
    const practiceTestNumber = coercePracticeTestNumber(item.practiceTestNumber);
    if (practiceTestNumber == null || !OFFICIAL_SAT_FORMS.has(practiceTestNumber)) return null;
    if (satSection(item.section) == null) return null;
    return practiceTestNumber;
  };
  const sectionOk = (item: T) => {
    if (!options.sections || options.sections.length === 0) return true;
    const section = satSection(item.section);
    return section != null && options.sections.includes(section);
  };
  const isTaitoDatedOriginal = (item: T) => {
    const key = item.sourceKey ?? "";
    return (
      (item.sourceKind ?? "").trim().toLowerCase() === "original_hard" &&
      /^original-hard-\d{4}-\d{2}-\d{2}-/.test(key) &&
      !key.startsWith("original-hard-michelle-")
    );
  };
  const isMichelleOriginal = (item: T) =>
    (item.sourceKind ?? "").trim().toLowerCase() === "original_hard" &&
    (item.sourceKey ?? "").startsWith("original-hard-michelle-");
  const officialEligible = items.filter((item) => {
    if ((item.sourceKind ?? "").trim().toLowerCase() === "original_hard") return false;
    if (formNumber(item) == null) return false;
    if (!isOfficialHardTailItem(item)) return false;
    if (item.sourceKey && exclude.has(item.sourceKey)) return false;
    return sectionOk(item);
  });
  const originalEligible = items.filter((item) => {
    if (!isMichelleOriginal(item) || isTaitoDatedOriginal(item)) return false;
    if (item.sourceKey && exclude.has(item.sourceKey)) return false;
    return sectionOk(item);
  });
  const byForm = new Map<number, T[]>();
  for (const item of officialEligible) {
    const practiceTestNumber = formNumber(item);
    if (practiceTestNumber == null) continue;
    const list = byForm.get(practiceTestNumber) ?? [];
    list.push(item);
    byForm.set(practiceTestNumber, list);
  }
  const forms = [...byForm.keys()].sort((left, right) => left - right);
  const drawForm = (practiceTestNumber: number) =>
    drawBalancedFromForm(
      byForm.get(practiceTestNumber) ?? [],
      options.seed,
      practiceTestNumber,
      target,
      options.sections,
    );

  const unusedFull = forms.filter(
    (practiceTestNumber) => !used.has(practiceTestNumber) && drawForm(practiceTestNumber).length >= target,
  );
  if (unusedFull[0] != null) {
    const practiceTestNumber = unusedFull[0];
    return {
      selected: drawForm(practiceTestNumber),
      practiceTestNumber,
      recycled: false,
      widened: false,
    };
  }

  const leftoverFull = forms.filter(
    (practiceTestNumber) => drawForm(practiceTestNumber).length >= target,
  );
  if (leftoverFull[0] != null) {
    const practiceTestNumber = leftoverFull[0];
    return {
      selected: drawForm(practiceTestNumber),
      practiceTestNumber,
      recycled: used.has(practiceTestNumber),
      widened: false,
    };
  }

  const officialDraw = drawBalancedFromForm(officialEligible, options.seed, 0, target, options.sections);
  if (officialDraw.length >= target) {
    return {
      selected: officialDraw,
      practiceTestNumber: null,
      recycled: forms.length > 0,
      widened: true,
    };
  }
  const usedKeys = new Set(officialDraw.flatMap((item) => (item.sourceKey ? [item.sourceKey] : [])));
  const originalFill = drawBalancedFromForm(
    originalEligible.filter((item) => !item.sourceKey || !usedKeys.has(item.sourceKey)),
    options.seed,
    0,
    target - officialDraw.length,
    options.sections,
  );
  return {
    selected: [...officialDraw, ...originalFill].slice(0, target),
    practiceTestNumber: null,
    recycled: forms.length > 0 || originalFill.length > 0,
    widened: true,
  };
}
