import {
  isCoarseSectionLabel,
  isFillerAnalysis,
  normalizeFocusKey,
} from "./submission-alert-display.ts";

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

export function parseAccuracyHint(label: string | null | undefined): number | null {
  const match = (label ?? "").match(/(\d+)\s*%\s*accuracy/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function usableGuidanceTheme(label: string | null | undefined): string | null {
  if (!label?.trim() || hasExtractPlaceholder(label)) return null;
  const stripped = stripSkillMeta(label);
  if (!stripped || hasExtractPlaceholder(stripped) || isCoarseSectionLabel(stripped)) {
    return null;
  }
  if (stripped.length > 48 || /^(practice |review |keep the next )/i.test(stripped)) {
    return null;
  }
  return stripped;
}

/** Coarse SAT section, for coaching — never a dumped skill name. */
export function sectionThemeFromLabel(label: string | null | undefined): string | null {
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

export type ClientGuidanceCluster = {
  label: string;
  kind?: "skill" | "domain" | "section" | "prompt" | string;
  missCount: number;
  examples?: string[];
};

export type ClientGuidanceSection = {
  section?: string;
  label: string;
  accuracy: number;
  missCount: number;
};

export type ClientGuidanceAnalysis = {
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  nextFocus?: string[] | null;
  feedback?: string | null;
  sessionOpener?: string | null;
  missClusters?: ClientGuidanceCluster[] | null;
  sectionBreakdown?: ClientGuidanceSection[] | null;
};

export type ClientAdaptiveGuidance = {
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

function kindRank(kind: ClientGuidanceCluster["kind"]): number {
  if (kind === "skill") return 0;
  if (kind === "domain") return 1;
  if (kind === "prompt") return 2;
  return 3;
}

function bestCluster(
  clusters: ClientGuidanceCluster[] | null | undefined,
): ClientGuidanceCluster | null {
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
  rows: ClientGuidanceSection[] | null | undefined,
): ClientGuidanceSection | null {
  return (
    [...(rows ?? [])]
      .filter((row) => row.missCount > 0 || row.accuracy < 80)
      .sort((left, right) => left.accuracy - right.accuracy || right.missCount - left.missCount)[0] ??
    null
  );
}

function strongestSection(
  rows: ClientGuidanceSection[] | null | undefined,
): ClientGuidanceSection | null {
  return (
    [...(rows ?? [])].sort(
      (left, right) => right.accuracy - left.accuracy || left.missCount - right.missCount,
    )[0] ?? null
  );
}

function firstCleanSentence(text: string | null | undefined): string | null {
  if (!text?.trim() || isFillerAnalysis(text) || hasExtractPlaceholder(text)) return null;
  const first = text.split(/(?<=\.)\s+/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (!first || hasExtractPlaceholder(first)) return null;
  return first.slice(0, 180) || null;
}

export function clientAdaptiveGuidance(
  analysis: ClientGuidanceAnalysis | null | undefined,
): ClientAdaptiveGuidance {
  const cluster = bestCluster(analysis?.missClusters);
  const weakSection = weakestSection(analysis?.sectionBreakdown);
  const accuracy =
    parseAccuracyHint(analysis?.weaknesses?.[0]) ??
    parseAccuracyHint(analysis?.nextFocus?.[0]) ??
    weakSection?.accuracy ??
    null;
  const theme =
    firstUsableTheme(analysis?.nextFocus) ??
    firstUsableTheme(analysis?.weaknesses) ??
    (cluster && usableGuidanceTheme(cluster.label) ? cluster.label : null);
  const sectionTheme =
    weakSection?.label ??
    sectionThemeFromLabel(analysis?.weaknesses?.[0]) ??
    sectionThemeFromLabel(analysis?.nextFocus?.[0]) ??
    (cluster?.kind === "section" ? cluster.label : null);

  const noRepeatedMiss = /no major weakness|no repeated missed skill/i.test(
    analysis?.weaknesses?.[0] ?? "",
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
      firstCleanSentence(analysis?.sessionOpener) ??
      firstCleanSentence(analysis?.feedback) ??
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

  const rawStrength = analysis?.strengths?.[0] ?? "";
  const strengthTheme = usableGuidanceTheme(rawStrength);
  const strongSection = strongestSection(analysis?.sectionBreakdown);
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

export function displaySessionFocus(
  currentFocus: string | null | undefined,
  analysis: ClientGuidanceAnalysis | null | undefined,
  fallback: string,
): string {
  if (analysis) {
    const fromAnalysis = clientCurrentFocus(analysis, "");
    if (fromAnalysis) return fromAnalysis;
  }
  if (
    currentFocus?.trim() &&
    !hasExtractPlaceholder(currentFocus) &&
    usableGuidanceTheme(currentFocus)
  ) {
    return currentFocus.trim();
  }
  const section = sectionThemeFromLabel(currentFocus);
  if (section) return `Practice ${section} next.`;
  return fallback;
}

export function clientCurrentFocus(
  analysis: ClientGuidanceAnalysis | null | undefined,
  fallback: string,
): string {
  const cluster = bestCluster(analysis?.missClusters);
  const theme =
    firstUsableTheme(analysis?.nextFocus) ??
    firstUsableTheme(analysis?.weaknesses) ??
    (cluster && usableGuidanceTheme(cluster.label) ? cluster.label : null) ??
    weakestSection(analysis?.sectionBreakdown)?.label ??
    sectionThemeFromLabel(analysis?.nextFocus?.[0]) ??
    sectionThemeFromLabel(analysis?.weaknesses?.[0]) ??
    null;
  if (theme) return `Practice ${theme} next.`;
  return fallback;
}

export function toClientAdaptiveGuidance<T extends ClientGuidanceAnalysis>(analysis: T): T {
  const copy = clientAdaptiveGuidance(analysis);
  return {
    ...analysis,
    strengths: [copy.strength],
    weaknesses: [copy.missedSkill],
    nextFocus: [copy.nextPractice],
  };
}
