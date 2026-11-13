import { isOfficialSatExtract } from "./sat-bank-diagnostic-quality.ts";
import { sessionPreworkDedupeSlot } from "./session-prework-dedupe.ts";

/** Tutor-held hard items for a student who is doing well in the session. */
export const HARD_RESERVE_DEFAULT = 5;
export const HARD_RESERVE_MAX = 10;
export const HARD_CHALLENGE_TITLE_PREFIX = "Hard challenge set (";

export type HardReserveCandidate = {
  id: string;
  sourceKey: string;
  examFamily?: string | null;
  sourceKind?: string | null;
  section?: string | null;
  /** False when the row is not from the renderable module-2 hard bank. */
  inHardPool?: boolean;
  linkedQuestionId?: string | null;
  prompt?: string | null;
  stimulus?: string | null;
  choices?: unknown;
};

export type HardReservePick<T> = {
  selected: T[];
  target: number;
  shortfall: number;
};

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

export function hardReserveTarget(requested?: number): number {
  if (requested == null || !Number.isFinite(requested)) return HARD_RESERVE_DEFAULT;
  return Math.min(HARD_RESERVE_MAX, Math.max(HARD_RESERVE_DEFAULT, Math.round(requested)));
}

/** Title carries "Hard" and the attached count. It is not SAT pre-work. */
export function hardChallengeSetTitle(count: number, sessionTitle: string): string {
  return `${HARD_CHALLENGE_TITLE_PREFIX}${count}) — ${sessionTitle}`;
}

export function isHardChallengeSetTitle(title?: string | null): boolean {
  return (title ?? "").trim().toLowerCase().startsWith(HARD_CHALLENGE_TITLE_PREFIX.toLowerCase());
}

/**
 * The reserve is a separate during-session row. The column is the marker.
 * The title remains a backstop for a row written before the column existed.
 */
export function isHardChallengeReserve(row: {
  hardChallengeReserve?: boolean | null;
  title?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  return row.hardChallengeReserve === true || isHardChallengeSetTitle(row.title);
}

function createdAtMs(value: Date | string | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Oldest during-session assignment that is not the hard reserve.
 * A session whose only during-session row is the reserve has none yet.
 */
export function resolveDuringSessionAssignment<T extends {
  hardChallengeReserve?: boolean | null;
  title?: string | null;
  createdAt?: Date | string | number | null;
}>(rows: readonly T[]): T | null {
  const candidates = rows.filter((row) => !isHardChallengeReserve(row));
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => createdAtMs(left.createdAt) - createdAtMs(right.createdAt))[0] ?? null;
}

/** Homework copy and hard in-session writes must not land on the reserve. */
export function duringSessionAcceptsSessionWork(row: {
  hardChallengeReserve?: boolean | null;
  title?: string | null;
} | null | undefined): boolean {
  return !isHardChallengeReserve(row);
}

export function decideHardReserveWrite(
  existing: readonly { title?: string | null; status?: string | null; hardChallengeReserve?: boolean | null }[],
): "keep" | "create" {
  const live = existing.some(
    (row) => (row.status ?? "").trim().toLowerCase() !== "archived" && isHardChallengeReserve(row),
  );
  return live ? "keep" : "create";
}

/**
 * Seeded draw from the renderable hard bank.
 * Official SAT extracts only. Short pools are returned as-is with a shortfall.
 */
export function selectHardReserve<T extends HardReserveCandidate>(
  items: readonly T[],
  options: {
    seed: string;
    target?: number;
    excludeSourceKeys?: ReadonlySet<string>;
    excludeIds?: ReadonlySet<string>;
    /** Omit for both sections. A single section drops the other. */
    sections?: readonly ("rw" | "math")[] | null;
  },
): HardReservePick<T> {
  const target = hardReserveTarget(options.target);
  const excludeKeys = options.excludeSourceKeys ?? new Set<string>();
  const excludeIds = options.excludeIds ?? new Set<string>();
  const allowed = options.sections?.filter((section) => section === "rw" || section === "math") ?? [];
  const restrict = allowed.length === 1 ? allowed[0] : null;
  const unique = new Map<string, T>();
  for (const item of items) {
    if (!item.sourceKey || unique.has(item.sourceKey)) continue;
    if (item.inHardPool === false) continue;
    if (restrict && item.section !== restrict) continue;
    if (excludeKeys.has(item.sourceKey) || excludeIds.has(item.id)) continue;
    if (
      !isOfficialSatExtract({
        examFamily: item.examFamily,
        sourceKind: item.sourceKind ?? "official_extract",
      })
    ) {
      continue;
    }
    unique.set(item.sourceKey, item);
  }
  const ordered = [...unique.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  const selected = shuffleWithSeed(ordered, `${options.seed}:hard-reserve`).slice(0, target);
  return { selected, target, shortfall: Math.max(0, target - selected.length) };
}

/** True when a reserve title would be treated as SAT pre-work. It must stay false. */
export function hardChallengeTitleIsPrework(title: string): boolean {
  return sessionPreworkDedupeSlot(title) !== null;
}
