/**
 * Curated SAT Reading & Writing bundles for Michelle Makarem × Sophia Lamas.
 * Questions are original hard SAT items (exam_family sat, never IELTS), plus
 * two official module 2 items in Bundle 1 that Michelle has not already seen.
 *
 * Booking auto-setup consumes the next unused bundle in order (1→2→3→4), then
 * falls back to the hard official picker. Slide decks stay on the SAT Prep I–IV
 * queue; this module does not edit deck content.
 */

import type { ParsedBankRecord, ExtractGaps } from "./sat-bank-import.ts";
import {
  MICHELLE_SOPHIA_LAMAS_CURATED_RW_ITEMS,
  MICHELLE_SOPHIA_LAMAS_CURATED_RW_SOURCE_PREFIX,
  type CuratedRwItem,
  type CuratedRwOriginalItem,
  type CuratedRwPhase,
} from "./michelle-sophia-lamas-curated-rw-data.ts";

export {
  MICHELLE_SOPHIA_LAMAS_CURATED_RW_ITEMS,
  MICHELLE_SOPHIA_LAMAS_CURATED_RW_SOURCE_PREFIX,
};
export type { CuratedRwItem, CuratedRwOriginalItem, CuratedRwPhase };

export const MICHELLE_SOPHIA_LAMAS_CURATED_BUNDLE_NUMBERS = [1, 2, 3, 4] as const;
export type CuratedRwBundleNumber = (typeof MICHELLE_SOPHIA_LAMAS_CURATED_BUNDLE_NUMBERS)[number];

export const MICHELLE_SOPHIA_LAMAS_CURATED_COLLECTION_SLUG = "michelle-sophia-lamas-curated-rw";
export const MICHELLE_SOPHIA_LAMAS_CURATED_COLLECTION_TITLE =
  "Michelle Sophia Lamas curated SAT English";
export const MICHELLE_SOPHIA_LAMAS_CURATED_FORM_CODE = "original-hard-michelle-sophia-lamas";

export const CURATED_RW_PREWORK_QUESTIONS = 40;
export const CURATED_RW_IN_SESSION_QUESTIONS = 15;
export const CURATED_RW_RESERVE_QUESTIONS = 5;

const GAPS: ExtractGaps = {
  skillDifficultyAbsent: false,
  missingPrompt: false,
  missingChoices: false,
  figuresIncomplete: false,
  spr: false,
  figurePrimary: false,
  notes: [],
};

const PHASE_OFFSET: Record<CuratedRwPhase, number> = {
  prework: 0,
  insession: 40,
  reserve: 55,
};

export function isMichelleSophiaLamasCuratedRwSourceKey(
  sourceKey: string | null | undefined,
): boolean {
  return (sourceKey ?? "").startsWith(MICHELLE_SOPHIA_LAMAS_CURATED_RW_SOURCE_PREFIX);
}

export function curatedRwBundleFromSourceKey(
  sourceKey: string | null | undefined,
): CuratedRwBundleNumber | null {
  const match = new RegExp(
    `^${MICHELLE_SOPHIA_LAMAS_CURATED_RW_SOURCE_PREFIX}b([1-4])-`,
  ).exec(sourceKey ?? "");
  if (!match) return null;
  return Number(match[1]) as CuratedRwBundleNumber;
}

export function isOriginalCuratedRwItem(item: CuratedRwItem): item is CuratedRwOriginalItem {
  return item.officialSourceKey == null;
}

export function curatedRwItemsForBundle(
  bundle: CuratedRwBundleNumber,
  phase?: CuratedRwPhase,
): CuratedRwItem[] {
  return MICHELLE_SOPHIA_LAMAS_CURATED_RW_ITEMS.filter((item) => {
    if (item.bundle !== bundle) return false;
    return phase ? item.phase === phase : true;
  });
}

export function curatedRwSourceKeysForBundle(bundle: CuratedRwBundleNumber): string[] {
  return curatedRwItemsForBundle(bundle).map((item) =>
    isOriginalCuratedRwItem(item) ? item.sourceKey : item.officialSourceKey,
  );
}

export function allCuratedRwSourceKeys(): string[] {
  return MICHELLE_SOPHIA_LAMAS_CURATED_BUNDLE_NUMBERS.flatMap((bundle) =>
    curatedRwSourceKeysForBundle(bundle),
  );
}

export type CuratedRwQueuePeer = {
  id: string;
  createdAt: Date;
  assignedBundle: CuratedRwBundleNumber | null;
};

export function nextCuratedRwBundle(
  usedBundles: Iterable<CuratedRwBundleNumber | null | undefined>,
): CuratedRwBundleNumber | null {
  const used = new Set(
    [...usedBundles].filter((bundle): bundle is CuratedRwBundleNumber => bundle != null),
  );
  return MICHELLE_SOPHIA_LAMAS_CURATED_BUNDLE_NUMBERS.find((bundle) => !used.has(bundle)) ?? null;
}

/**
 * Booking-order gap-fill, matching the SAT Prep I–IV deck queue: earlier
 * unassigned sessions reserve the next bundles so a later-created session
 * cannot consume Bundle 1 first.
 */
export function nextCuratedRwBundleForSession(args: {
  currentSessionId: string;
  currentCreatedAt: Date;
  peers: readonly CuratedRwQueuePeer[];
}): CuratedRwBundleNumber | null {
  const reserved = new Set(
    args.peers
      .map((peer) => peer.assignedBundle)
      .filter((bundle): bundle is CuratedRwBundleNumber => bundle != null),
  );
  const pendingEarlier = args.peers
    .filter((peer) => peer.assignedBundle == null)
    .filter((peer) => {
      const createdDelta = peer.createdAt.getTime() - args.currentCreatedAt.getTime();
      if (createdDelta < 0) return true;
      if (createdDelta > 0) return false;
      return peer.id < args.currentSessionId;
    })
    .sort((left, right) => {
      const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
      if (createdDelta !== 0) return createdDelta;
      return left.id.localeCompare(right.id);
    });
  for (const _peer of pendingEarlier) {
    const reservedBundle = nextCuratedRwBundle(reserved);
    if (reservedBundle) reserved.add(reservedBundle);
  }
  return nextCuratedRwBundle(reserved);
}

export function bundleAssignedFromSourceKeys(
  sourceKeys: Iterable<string | null | undefined>,
): CuratedRwBundleNumber | null {
  const counts = new Map<CuratedRwBundleNumber, number>();
  for (const key of sourceKeys) {
    const bundle = curatedRwBundleFromSourceKey(key);
    if (!bundle) continue;
    counts.set(bundle, (counts.get(bundle) ?? 0) + 1);
  }
  let best: CuratedRwBundleNumber | null = null;
  let bestCount = 0;
  for (const [bundle, count] of counts) {
    if (count > bestCount) {
      best = bundle;
      bestCount = count;
    }
  }
  // Require a real curated original (not just a stray official item).
  return bestCount >= 3 ? best : null;
}

function questionNumberFor(item: CuratedRwOriginalItem): number {
  return (item.bundle - 1) * 60 + PHASE_OFFSET[item.phase] + item.slot;
}

export function michelleSophiaLamasCuratedRwBankRecords(): ParsedBankRecord[] {
  return MICHELLE_SOPHIA_LAMAS_CURATED_RW_ITEMS.filter(isOriginalCuratedRwItem).map((item) => {
    const questionNumber = questionNumberFor(item);
    return {
      sourceKey: item.sourceKey,
      dedupKey: item.sourceKey,
      examFamily: "sat" as const,
      examVariant: "digital",
      practiceTestNumber: null,
      formCode: MICHELLE_SOPHIA_LAMAS_CURATED_FORM_CODE,
      section: "rw" as const,
      module: 2,
      questionNumber,
      position: questionNumber,
      collectionSlug: MICHELLE_SOPHIA_LAMAS_CURATED_COLLECTION_SLUG,
      collectionTitle: MICHELLE_SOPHIA_LAMAS_CURATED_COLLECTION_TITLE,
      prompt: item.prompt,
      stimulus: item.stimulus,
      choices: item.choices,
      correctAnswer: item.correctAnswer,
      officialExplanation: item.explanation,
      figures: [],
      scoring: {},
      skill: item.skill,
      domain: item.domain,
      difficulty: "hard",
      questionType: "mcq",
      estimatedSeconds: item.estimatedSeconds,
      sourceKind: "original_hard" as const,
      sourceFiles: {
        origin: "michelle-sophia-lamas-curated-rw",
        bundle: item.bundle,
        phase: item.phase,
        kind: item.kind,
        note: item.note,
        src: item.src,
      },
      assets: [],
      extractGaps: GAPS,
      assignable: true,
    };
  });
}

export function assertCuratedRwBundlesComplete(): void {
  for (const bundle of MICHELLE_SOPHIA_LAMAS_CURATED_BUNDLE_NUMBERS) {
    const prework = curatedRwItemsForBundle(bundle, "prework");
    const inSession = curatedRwItemsForBundle(bundle, "insession");
    const reserve = curatedRwItemsForBundle(bundle, "reserve");
    if (prework.length !== CURATED_RW_PREWORK_QUESTIONS) {
      throw new Error(`Bundle ${bundle} pre-work has ${prework.length} items`);
    }
    if (inSession.length !== CURATED_RW_IN_SESSION_QUESTIONS) {
      throw new Error(`Bundle ${bundle} in-session has ${inSession.length} items`);
    }
    if (reserve.length !== CURATED_RW_RESERVE_QUESTIONS) {
      throw new Error(`Bundle ${bundle} reserve has ${reserve.length} items`);
    }
  }
  const records = michelleSophiaLamasCuratedRwBankRecords();
  if (records.some((row) => row.examFamily !== "sat" || row.sourceKind !== "original_hard")) {
    throw new Error("Curated RW bank records must be exam_family sat and source_kind original_hard");
  }
  if (records.some((row) => /ielts/i.test(JSON.stringify(row)))) {
    throw new Error("Curated RW bank records must not mention IELTS");
  }
}
