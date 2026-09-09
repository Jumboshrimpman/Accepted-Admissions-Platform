// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SAT_ESTIMATED_SCORE_LABEL,
  SAT_SCORING_METHODOLOGY,
  estimateSatScoreFromScoringGuide,
  formatEstimatedSatRange,
} from "./sat-scoring-guide.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isCoarseSectionLabel,
  isMissingExtractSkill,
  normalizeFocusKey,
  usefulFocusLabels,
} from "./sat-bank-skill.ts";

export type SkillBreakdown = {
  skill: string;
  correct: number;
  total: number;
  accuracy: number;
};

export type AnalysisItem = {
  correct: boolean;
  skill: string;
  finalAnswer?: string | null;
  domain?: string | null;
  subject?: string | null;
  prompt?: string | null;
};

export type SectionBreakdownRow = {
  section: "rw" | "math" | "other";
  label: string;
  accuracy: number;
  correct: number;
  total: number;
  missCount: number;
};

export type MissCluster = {
  label: string;
  kind: "skill" | "domain" | "section" | "prompt";
  missCount: number;
  examples: string[];
};

export type AttemptAnalysis = {
  source: "deterministic" | "provider";
  label: string;
  provider: string | null;
  strengths: string[];
  weaknesses: string[];
  mistakePatterns: string[];
  nextFocus: string[];
  feedback: string;
  sessionOpener?: string;
  skipRehash?: string[];
  sectionBreakdown?: SectionBreakdownRow[];
  missClusters?: MissCluster[];
};

/**
 * Contract for a tutor-facing post-submission brief. Deterministic analysis
 * follows this; a provider should return the same structured fields.
 */
export const TUTOR_SESSION_ANALYSIS_PROMPT = `You are briefing a SAT tutor for a live session after a student submitted homework.

Return JSON with:
- sessionOpener: which wrong answers to review first (cluster + 1–2 prompt snippets)
- skipRehash: high-accuracy areas the tutor should not reopen
- sectionBreakdown: RW vs Math accuracy, correct/total, missCount
- missClusters: top miss themes with counts (Bluebook skill, else domain/module, else section). Include up to 2 prompt examples per cluster. Never list "Skill not in extract" or dump coarse section labels (Math, SAT Math, Reading and Writing) as if they were skills.
- nextFocus: 1–3 distinct useful themes (not Math + SAT Math + RW)
- strengths / weaknesses / mistakePatterns: short scannable lines with counts
- feedback: 2–4 concrete sentences. Do not write filler like "start with the focus areas below" when focus areas are only section labels.

Prioritize concrete miss themes a tutor can open with. What NOT to rehash matters as much as what to review.`;

export type ScoreProjection = {
  readingWriting: number | null;
  math: number | null;
  total: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  label?: string;
  methodology?: string;
};

function clampScore(value: number): number {
  return Math.max(200, Math.min(800, Math.round(value / 10) * 10));
}

export function projectSatSectionScore(accuracyPercent: number): number {
  // Smooth Digital-SAT-style projection from accuracy onto the 200–800 band.
  const normalized = Math.max(0, Math.min(100, accuracyPercent)) / 100;
  return clampScore(200 + normalized * 600);
}

export function classifySection(item: AnalysisItem): "rw" | "math" | "other" {
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
    haystack.includes("boundary") ||
    haystack.includes("craft") ||
    haystack.includes("expression") ||
    haystack.includes("information")
  ) {
    return "rw";
  }
  return "other";
}

export function projectSatScores(items: AnalysisItem[]): ScoreProjection {
  const estimated = estimateSatScoreFromScoringGuide(
    items.map((item) => ({
      correct: item.correct,
      subject: item.subject,
      domain: item.domain,
      skill: item.skill,
    })),
  );
  return {
    readingWriting: estimated.readingWriting,
    math: estimated.math,
    total: estimated.total,
    rangeLow: estimated.rangeLow,
    rangeHigh: estimated.rangeHigh,
    label: estimated.label,
    methodology: estimated.methodology,
  };
}

function promptSnippet(prompt: string | null | undefined, max = 48): string {
  const text = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const broken = sliced.replace(/\s+\S*$/, "").trimEnd();
  return `${(broken || sliced).trimEnd()}…`;
}

function clusterKeyForItem(item: AnalysisItem): {
  label: string;
  kind: MissCluster["kind"];
} {
  const skill = item.skill?.trim() ?? "";
  if (skill && !isCoarseSectionLabel(skill)) {
    return { label: skill, kind: "skill" };
  }
  const domain = item.domain?.trim() ?? "";
  if (domain && !isCoarseSectionLabel(domain)) {
    return { label: domain, kind: "domain" };
  }
  const section = classifySection(item);
  if (section === "math") return { label: "SAT Math", kind: "section" };
  if (section === "rw") return { label: "Reading and Writing", kind: "section" };
  return { label: skill || "General", kind: "section" };
}

function sectionLabel(section: SectionBreakdownRow["section"]): string {
  if (section === "math") return "Math";
  if (section === "rw") return "Reading and Writing";
  return "Other";
}

export function buildSectionBreakdown(items: AnalysisItem[]): SectionBreakdownRow[] {
  const buckets = new Map<
    SectionBreakdownRow["section"],
    { correct: number; total: number }
  >();
  for (const item of items) {
    const section = classifySection(item);
    const current = buckets.get(section) ?? { correct: 0, total: 0 };
    current.total += 1;
    if (item.correct) current.correct += 1;
    buckets.set(section, current);
  }
  return (["rw", "math", "other"] as const)
    .filter((section) => (buckets.get(section)?.total ?? 0) > 0)
    .map((section) => {
      const value = buckets.get(section)!;
      return {
        section,
        label: sectionLabel(section),
        accuracy: value.total === 0 ? 0 : (value.correct / value.total) * 100,
        correct: value.correct,
        total: value.total,
        missCount: value.total - value.correct,
      };
    });
}

export function buildMissClusters(items: AnalysisItem[], limit = 4): MissCluster[] {
  const buckets = new Map<
    string,
    { label: string; kind: MissCluster["kind"]; examples: string[]; missCount: number }
  >();
  for (const item of items) {
    if (item.correct) continue;
    const { label, kind } = clusterKeyForItem(item);
    const key = `${kind}:${label.toLowerCase()}`;
    const current = buckets.get(key) ?? { label, kind, examples: [], missCount: 0 };
    current.missCount += 1;
    const snippet = promptSnippet(item.prompt);
    if (snippet && !current.examples.includes(snippet) && current.examples.length < 2) {
      current.examples.push(snippet);
    }
    buckets.set(key, current);
  }
  return [...buckets.values()]
    .sort((a, b) => {
      if (b.missCount !== a.missCount) return b.missCount - a.missCount;
      const kindRank = { skill: 0, domain: 1, prompt: 2, section: 3 };
      if (kindRank[a.kind] !== kindRank[b.kind]) {
        return kindRank[a.kind] - kindRank[b.kind];
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
}

function formatClusterLine(cluster: MissCluster): string {
  const examples =
    cluster.examples.length > 0 ? ` — ${cluster.examples.map((item) => `“${item}”`).join("; ")}` : "";
  return `${cluster.label}: ${cluster.missCount} ${cluster.missCount === 1 ? "miss" : "misses"}${examples}`;
}

function formatSectionLine(rows: SectionBreakdownRow[]): string {
  return rows
    .map(
      (row) =>
        `${row.label} ${Math.round(row.accuracy)}% (${row.missCount} miss${row.missCount === 1 ? "" : "es"})`,
    )
    .join(" · ");
}

function isFillerFeedback(feedback: string | null | undefined): boolean {
  if (!feedback?.trim()) return true;
  return /start with the focus areas below/i.test(feedback);
}

export function compactTutorPreview(feedback: string | null | undefined): string | null {
  if (!feedback?.trim() || isFillerFeedback(feedback)) return null;
  const tutor = feedback.match(/Tutor focus:\s*(.+?)(?:\s+Estimated SAT|\s*$)/i);
  if (tutor?.[1]?.trim()) return tutor[1].replace(/\s+/g, " ").trim();
  const first = feedback.split(/(?<=\.)\s+/)[0]?.trim() ?? feedback.trim();
  return first.slice(0, 240) || null;
}

const EXTRACT_PLACEHOLDER = /skill not in (extract|pdf)/i;

export function hasExtractPlaceholder(text: string | null | undefined): boolean {
  return EXTRACT_PLACEHOLDER.test(text ?? "");
}

export function stripSkillMeta(label: string): string {
  return label
    .replace(
      /\s*\((?:\d+%\s*(?:accuracy)?(?:\s*·\s*\d+\/\d+)?|\d+\s*miss(?:es)?)\)\s*$/i,
      "",
    )
    .trim();
}

function parseAccuracyHint(label: string | null | undefined): number | null {
  const match = (label ?? "").match(/(\d+)\s*%\s*accuracy/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function usableGuidanceTheme(label: string | null | undefined): string | null {
  if (!label?.trim() || hasExtractPlaceholder(label) || isMissingExtractSkill(label)) {
    return null;
  }
  const stripped = stripSkillMeta(label);
  if (!stripped || hasExtractPlaceholder(stripped) || isCoarseSectionLabel(stripped)) {
    return null;
  }
  if (stripped.length > 48 || /^(practice |review |keep the next )/i.test(stripped)) {
    return null;
  }
  return stripped;
}

function sectionThemeFromLabel(label: string | null | undefined): string | null {
  if (!label?.trim() || hasExtractPlaceholder(label)) return null;
  const stripped = stripSkillMeta(label);
  if (!stripped || hasExtractPlaceholder(stripped)) return null;
  const key = normalizeFocusKey(stripped);
  if (key === "math" || key === "sat math") return "Math";
  if (
    key === "reading" ||
    key === "writing" ||
    key === "reading and writing" ||
    key === "sat reading and writing" ||
    key === "sat reading writing" ||
    key === "english" ||
    key === "rw" ||
    key === "r and w"
  ) {
    return "Reading and Writing";
  }
  return null;
}

export type QualitativeGuidanceInput = {
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  nextFocus?: string[] | null;
  feedback?: string | null;
  sessionOpener?: string | null;
  missClusters?: Array<{
    label: string;
    kind?: MissCluster["kind"];
    missCount: number;
  }> | null;
  sectionBreakdown?: Array<{
    section?: string;
    label: string;
    accuracy: number;
    missCount: number;
  }> | null;
};

export type QualitativeGuidance = {
  strength: string;
  missedSkill: string;
  nextPractice: string;
};

function firstUsableTheme(values: Array<string | null | undefined> | null | undefined): string | null {
  for (const value of values ?? []) {
    const theme = usableGuidanceTheme(value);
    if (theme) return theme;
  }
  return null;
}

function accuracySuffix(accuracy: number | null): string {
  return accuracy == null ? "" : ` (about ${Math.round(accuracy)}% accuracy)`;
}

function kindRank(kind: MissCluster["kind"] | undefined): number {
  if (kind === "skill") return 0;
  if (kind === "domain") return 1;
  if (kind === "prompt") return 2;
  return 3;
}

function bestCluster(
  clusters: QualitativeGuidanceInput["missClusters"],
): NonNullable<QualitativeGuidanceInput["missClusters"]>[number] | null {
  const ranked = [...(clusters ?? [])].sort((left, right) => {
    if (kindRank(left.kind) !== kindRank(right.kind)) {
      return kindRank(left.kind) - kindRank(right.kind);
    }
    return right.missCount - left.missCount;
  });
  return (
    ranked.find((cluster) => usableGuidanceTheme(cluster.label)) ??
    ranked.find((cluster) => cluster.kind === "section" && cluster.label.trim()) ??
    null
  );
}

function weakestSection(
  rows: QualitativeGuidanceInput["sectionBreakdown"],
): NonNullable<QualitativeGuidanceInput["sectionBreakdown"]>[number] | null {
  return (
    [...(rows ?? [])]
      .filter((row) => row.missCount > 0 || row.accuracy < 80)
      .sort((left, right) => left.accuracy - right.accuracy || right.missCount - left.missCount)[0] ??
    null
  );
}

function strongestSection(
  rows: QualitativeGuidanceInput["sectionBreakdown"],
): NonNullable<QualitativeGuidanceInput["sectionBreakdown"]>[number] | null {
  return (
    [...(rows ?? [])].sort(
      (left, right) => right.accuracy - left.accuracy || left.missCount - right.missCount,
    )[0] ?? null
  );
}

function firstCleanSentence(text: string | null | undefined): string | null {
  if (!text?.trim() || isFillerFeedback(text) || hasExtractPlaceholder(text)) return null;
  const first = text.split(/(?<=\.)\s+/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (!first || hasExtractPlaceholder(first)) return null;
  return first.slice(0, 180) || null;
}

/** Student-facing coaching — never a raw extract placeholder or coarse skill dump. */
export function qualitativeClientCopy(input: QualitativeGuidanceInput): QualitativeGuidance {
  const cluster = bestCluster(input.missClusters);
  const weakSection = weakestSection(input.sectionBreakdown);
  const accuracy =
    parseAccuracyHint(input.weaknesses?.[0]) ??
    parseAccuracyHint(input.nextFocus?.[0]) ??
    weakSection?.accuracy ??
    null;
  const theme =
    firstUsableTheme(input.nextFocus) ??
    firstUsableTheme(input.weaknesses) ??
    (cluster && usableGuidanceTheme(cluster.label) ? cluster.label : null);
  const sectionTheme =
    weakSection?.label ??
    sectionThemeFromLabel(input.weaknesses?.[0]) ??
    sectionThemeFromLabel(input.nextFocus?.[0]) ??
    (cluster?.kind === "section" ? cluster.label : null);

  const noRepeatedMiss = /no major weakness|no repeated missed skill/i.test(
    input.weaknesses?.[0] ?? "",
  );

  let missedSkill: string;
  if (theme) {
    missedSkill = `${theme} is where most misses landed${accuracySuffix(accuracy)}. Open those explanations and say why the right answer works.`;
  } else if (sectionTheme) {
    missedSkill = `${sectionTheme} is the leak in this set${accuracySuffix(accuracy)}. Review those wrong answers before another timed drill.`;
  } else if (accuracy != null) {
    missedSkill = `Accuracy is still around ${Math.round(accuracy)}% on this set. Review each miss and explain the official answer before another timed drill.`;
  } else if (noRepeatedMiss) {
    missedSkill = "No repeated missed skill yet. Keep building from the published session plan.";
  } else {
    missedSkill =
      firstCleanSentence(input.sessionOpener) ??
      firstCleanSentence(input.feedback) ??
      "Review the missed questions from this set and explain each right answer before another timed drill.";
  }

  let nextPractice: string;
  if (theme) {
    nextPractice = `Practice ${theme} next — those misses are the fastest way to raise this set.`;
  } else if (sectionTheme) {
    nextPractice = `Practice ${sectionTheme} next: redo the misses untimed, then check why the correct choice works.`;
  } else if (noRepeatedMiss) {
    nextPractice = "Continue with the published session plan, then stretch into harder variants.";
  } else {
    nextPractice =
      "Keep the next drill short and targeted: reopen the missed items, explain them, then try a similar set.";
  }

  const rawStrength = input.strengths?.[0] ?? "";
  const strengthTheme = usableGuidanceTheme(rawStrength);
  const strongSection = strongestSection(input.sectionBreakdown);
  let strength: string;
  if (strengthTheme && !hasExtractPlaceholder(rawStrength)) {
    strength = rawStrength.trim();
  } else if (strongSection && strongSection.accuracy >= 70) {
    strength = `${strongSection.label} was the stronger section in this set.`;
  } else {
    strength = "Keep building your baseline — no skip-it strength yet.";
  }

  return { strength, missedSkill, nextPractice };
}

export function toClientAdaptiveGuidance<T extends QualitativeGuidanceInput>(analysis: T): T {
  const copy = qualitativeClientCopy(analysis);
  return {
    ...analysis,
    strengths: [copy.strength],
    weaknesses: [copy.missedSkill],
    nextFocus: [copy.nextPractice],
  };
}

export function clientCurrentFocusLine(
  analysis: QualitativeGuidanceInput | null | undefined,
  fallback: string,
): string {
  if (!analysis) return fallback;
  const copy = qualitativeClientCopy(analysis);
  const cluster = bestCluster(analysis.missClusters);
  const theme =
    firstUsableTheme(analysis.nextFocus) ??
    firstUsableTheme(analysis.weaknesses) ??
    (cluster && usableGuidanceTheme(cluster.label) ? cluster.label : null) ??
    weakestSection(analysis.sectionBreakdown)?.label ??
    sectionThemeFromLabel(analysis.nextFocus?.[0]) ??
    sectionThemeFromLabel(analysis.weaknesses?.[0]) ??
    null;
  if (theme) return `Practice ${theme} next.`;
  if (!hasExtractPlaceholder(copy.nextPractice)) return copy.nextPractice;
  return fallback;
}

export function tutorAlertFields(analysis: AttemptAnalysis | null | undefined): {
  analysisPreview: string | null;
  nextFocus: string[];
  sessionOpener: string | null;
  skipRehash: string[];
  sectionBreakdown: SectionBreakdownRow[];
  missClusters: MissCluster[];
} {
  if (!analysis) {
    return {
      analysisPreview: null,
      nextFocus: [],
      sessionOpener: null,
      skipRehash: [],
      sectionBreakdown: [],
      missClusters: [],
    };
  }
  const nextFocus = usefulFocusLabels(analysis.nextFocus ?? []);
  const sessionOpener = analysis.sessionOpener?.trim() || null;
  return {
    analysisPreview: sessionOpener ?? compactTutorPreview(analysis.feedback),
    nextFocus,
    sessionOpener,
    skipRehash: analysis.skipRehash ?? [],
    sectionBreakdown: analysis.sectionBreakdown ?? [],
    missClusters: (analysis.missClusters ?? []).slice(0, 4),
  };
}

export function buildAttemptAnalysis(
  breakdown: SkillBreakdown[],
  items: AnalysisItem[],
  score: number,
  options: {
    assignmentTitle?: string | null;
    homeworkKind?: "diagnostic" | "routine" | null;
  } = {},
): AttemptAnalysis {
  const sectionBreakdown = buildSectionBreakdown(items);
  const missClusters = buildMissClusters(items);
  const usefulBreakdown = breakdown.filter((row) => !isCoarseSectionLabel(row.skill));
  const strengths = usefulBreakdown
    .filter((skill) => skill.accuracy >= 80)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 3)
    .map((skill) => `${skill.skill} (${Math.round(skill.accuracy)}% · ${skill.correct}/${skill.total})`);
  const clusterWeaknesses = missClusters
    .filter((cluster) => cluster.kind !== "section" || missClusters.every((item) => item.kind === "section"))
    .slice(0, 3)
    .map((cluster) => `${cluster.label} (${cluster.missCount} miss${cluster.missCount === 1 ? "" : "es"})`);
  const breakdownWeaknesses = usefulBreakdown
    .filter((skill) => skill.accuracy < 80)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, 3)
    .map((skill) => `${skill.skill} (${Math.round(skill.accuracy)}% · ${skill.correct}/${skill.total})`);
  const weaknesses = clusterWeaknesses.length > 0 ? clusterWeaknesses : breakdownWeaknesses;
  const mistakePatterns =
    missClusters.length > 0
      ? missClusters.map(formatClusterLine)
      : ["No incorrect responses in this attempt."];
  const nextFocus = usefulFocusLabels([
    ...missClusters.filter((cluster) => cluster.kind !== "section").map((cluster) => cluster.label),
    ...usefulBreakdown
      .filter((skill) => skill.accuracy < 80)
      .sort((a, b) => a.accuracy - b.accuracy)
      .map((skill) => skill.skill),
  ]);

  const topCluster = missClusters[0] ?? null;
  const sessionOpener =
    topCluster == null
      ? "Homework is clean. Skip miss review and use leftover time on harder bank items."
      : `Open with the ${topCluster.missCount} ${topCluster.label} miss${topCluster.missCount === 1 ? "" : "es"} first${
          topCluster.examples.length > 0
            ? ` — start at “${topCluster.examples[0]}”${
                topCluster.examples[1] ? `, then “${topCluster.examples[1]}”` : ""
              }`
            : ""
        }. Do not start a new timed set until those explanations are solid.`;

  const skipRehash = strengths.slice(0, 3);
  const sectionLine = formatSectionLine(sectionBreakdown);

  const isDiagnostic =
    options.homeworkKind === "diagnostic" ||
    (options.homeworkKind !== "routine" &&
      /diagnostic|full sat|practice test/i.test(options.assignmentTitle ?? ""));
  const estimated = estimateSatScoreFromScoringGuide(items);
  const projectionLine =
    isDiagnostic && estimated.total != null
      ? ` Estimated SAT score range: ${formatEstimatedSatRange(estimated)}. ${SAT_SCORING_METHODOLOGY}`
      : "";

  const concreteTheme = topCluster?.label ?? nextFocus[0] ?? null;
  const coaching =
    topCluster == null
      ? "You handled this set cleanly. In the next session, stretch into harder variants so leftover time builds ceiling score rather than repeating easy wins."
      : score >= 80
        ? `You are building a strong foundation. Explain the ${concreteTheme} misses out loud before another timed set${sectionLine ? ` (${sectionLine})` : ""}.`
        : `The live session should open on ${concreteTheme} (${topCluster.missCount} miss${topCluster.missCount === 1 ? "" : "es"})${sectionLine ? `. Section split: ${sectionLine}` : ""}. Review those wrong answers before moving on.`;

  const skipLine =
    skipRehash.length > 0
      ? ` Do not rehash ${skipRehash.map((item) => item.replace(/\s*\(.*\)$/, "")).join(", ")}.`
      : "";

  const built = {
    source: "deterministic" as const,
    label: isDiagnostic ? SAT_ESTIMATED_SCORE_LABEL : "Adaptive skill analysis",
    provider: null,
    strengths:
      strengths.length > 0
        ? strengths
        : [
            sectionBreakdown.length > 1
              ? `${[...sectionBreakdown].sort((a, b) => b.accuracy - a.accuracy)[0]!.label} was the stronger section — still below a skip-it threshold.`
              : "No skill reached 80% yet; every miss is a useful starting point.",
          ],
    weaknesses:
      weaknesses.length > 0 ? weaknesses : ["No major weakness identified in this set."],
    mistakePatterns,
    nextFocus,
    feedback: `${coaching}${skipLine}${projectionLine} ${sessionOpener}`,
    sessionOpener,
    skipRehash,
    sectionBreakdown,
    missClusters,
  };
  return toClientAdaptiveGuidance(built);
}

export type SessionPrepMode =
  | "awaiting_homework"
  | "complete_homework_in_session"
  | "mistake_focus"
  | "hard_bank"
  | "ready";

export function describeSessionPrepMode(mode: SessionPrepMode): string {
  switch (mode) {
    case "complete_homework_in_session":
      return "Homework was not finished. The live plan now carries the unfinished prep so the student and tutor can complete it together.";
    case "mistake_focus":
      return "Homework misses were converted into similar in-session practice. Open with those skills and review every explanation together.";
    case "hard_bank":
      return "Homework was complete with no misses. The live plan carries a hard-question bank for leftover time.";
    case "awaiting_homework":
      return "Waiting on the before-session assignment. Once it is submitted, the live plan will auto-adapt.";
    case "ready":
      return "The live session plan is ready.";
  }
}
