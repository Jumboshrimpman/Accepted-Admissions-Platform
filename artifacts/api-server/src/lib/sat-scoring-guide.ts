/**
 * Estimated SAT scoring from College Board scoring-guide methodology.
 *
 * Official SAT scoring guides (content/college-board scoring PDFs) convert:
 *   1. raw score = number correct (no wrong-answer penalty)
 *   2. raw → section score 200–800 via a test-specific table
 *   3. total = Reading & Writing + Math (400–1600)
 *
 * These bank packs are the linear paper/digital 120-item form (66 RW + 54 Math),
 * not Bluebook adaptive modules (54 RW + 44 Math). Exact per-test tables were
 * not extracted from the scoring-guide PDFs, so we apply the official method
 * with a published-style conversion and report a RANGE. Do not label this as
 * official College Board adaptive digital scoring.
 */

export const LINEAR_SAT_RW_MAX = 66;
export const LINEAR_SAT_MATH_MAX = 54;
export const SAT_SECTION_MIN = 200;
export const SAT_SECTION_MAX = 800;
export const SAT_SCORE_TABLE_VARIANCE = 40;

export const SAT_SCORING_METHODOLOGY =
  "Estimated from College Board scoring-guide methodology for linear paper/digital SAT practice: raw correct answers convert to 200–800 section scores (no wrong-answer penalty). This is not an official College Board adaptive digital SAT score.";

export const SAT_ESTIMATED_SCORE_LABEL =
  "Estimated SAT score range (College Board scoring guide, linear practice)";

export type SatSectionKey = "rw" | "math";

export type EstimatedSatScore = {
  total: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  readingWriting: number | null;
  math: number | null;
  rawReadingWriting: number;
  rawMath: number;
  maxReadingWriting: number;
  maxMath: number;
  label: string;
  methodology: string;
};

function clampSection(value: number): number {
  return Math.max(SAT_SECTION_MIN, Math.min(SAT_SECTION_MAX, Math.round(value / 10) * 10));
}

/**
 * Official scoring guides use a raw→scale table that is roughly linear through
 * the middle of the 200–800 band and compressed at the tails. Anchors follow
 * published SAT Practice Test scoring-guide shape (0 → 200, near-max → 800).
 */
export function convertRawToSectionScore(raw: number, maxRaw: number): number {
  if (maxRaw <= 0) return SAT_SECTION_MIN;
  const bounded = Math.max(0, Math.min(maxRaw, raw));
  const ratio = bounded / maxRaw;
  // Slightly compressed tails, matching typical College Board conversion tables.
  const curved = ratio <= 0.15 ? ratio * 0.85 : ratio >= 0.92 ? 0.88 + (ratio - 0.92) * 1.5 : ratio;
  return clampSection(SAT_SECTION_MIN + curved * (SAT_SECTION_MAX - SAT_SECTION_MIN));
}

export function classifySatSection(item: {
  subject?: string | null;
  domain?: string | null;
  skill?: string | null;
  section?: string | null;
}): SatSectionKey | "other" {
  if (item.section === "math" || item.section === "rw") return item.section;
  const haystack = `${item.subject ?? ""} ${item.domain ?? ""} ${item.skill ?? ""}`.toLowerCase();
  if (
    haystack.includes("math") ||
    haystack.includes("algebra") ||
    haystack.includes("geometry") ||
    haystack.includes("problem-solving")
  ) {
    return "math";
  }
  if (
    haystack.includes("reading") ||
    haystack.includes("writing") ||
    haystack.includes("english") ||
    haystack.includes("grammar") ||
    haystack.includes("evidence") ||
    haystack.includes("transition") ||
    haystack.includes("inference") ||
    haystack.includes("boundary")
  ) {
    return "rw";
  }
  return "other";
}

export function estimateSatScoreFromScoringGuide(
  items: Array<{
    correct: boolean;
    subject?: string | null;
    domain?: string | null;
    skill?: string | null;
    section?: string | null;
  }>,
): EstimatedSatScore {
  const buckets = {
    rw: { correct: 0, total: 0 },
    math: { correct: 0, total: 0 },
    other: { correct: 0, total: 0 },
  };
  for (const item of items) {
    const section = classifySatSection(item);
    buckets[section].total += 1;
    if (item.correct) buckets[section].correct += 1;
  }

  const rwTotal = buckets.rw.total > 0 ? buckets.rw.total : buckets.other.total;
  const rwCorrect = buckets.rw.total > 0 ? buckets.rw.correct : buckets.other.correct;
  const mathTotal = buckets.math.total;
  const mathCorrect = buckets.math.correct;

  const readingWriting =
    rwTotal > 0 ? convertRawToSectionScore(rwCorrect, rwTotal) : null;
  const math = mathTotal > 0 ? convertRawToSectionScore(mathCorrect, mathTotal) : null;

  let total: number | null = null;
  if (readingWriting != null && math != null) total = readingWriting + math;
  else if (readingWriting != null) total = readingWriting * 2;
  else if (math != null) total = math * 2;

  const rangeLow = total == null ? null : clampTotal(total - SAT_SCORE_TABLE_VARIANCE);
  const rangeHigh = total == null ? null : clampTotal(total + SAT_SCORE_TABLE_VARIANCE);

  return {
    total,
    rangeLow,
    rangeHigh,
    readingWriting,
    math,
    rawReadingWriting: rwCorrect,
    rawMath: mathCorrect,
    maxReadingWriting: rwTotal,
    maxMath: mathTotal,
    label: SAT_ESTIMATED_SCORE_LABEL,
    methodology: SAT_SCORING_METHODOLOGY,
  };
}

function clampTotal(value: number): number {
  return Math.max(400, Math.min(1600, Math.round(value / 10) * 10));
}

export function formatEstimatedSatRange(score: EstimatedSatScore): string {
  if (score.rangeLow == null || score.rangeHigh == null || score.total == null) {
    return "Estimated SAT score is not available for this set.";
  }
  const parts = [`${score.rangeLow}–${score.rangeHigh}`];
  if (score.readingWriting != null) parts.push(`R&W ~${score.readingWriting}`);
  if (score.math != null) parts.push(`Math ~${score.math}`);
  return `${parts[0]} (mid ~${score.total}; ${parts.slice(1).join(", ")})`;
}
