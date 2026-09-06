// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SAT_ESTIMATED_SCORE_LABEL,
  SAT_SCORING_METHODOLOGY,
  estimateSatScoreFromScoringGuide,
  formatEstimatedSatRange,
} from "./sat-scoring-guide.ts";

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
};

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

export function buildAttemptAnalysis(
  breakdown: SkillBreakdown[],
  items: AnalysisItem[],
  score: number,
  options: {
    assignmentTitle?: string | null;
    homeworkKind?: "diagnostic" | "routine" | null;
  } = {},
): AttemptAnalysis {
  const strengths = breakdown
    .filter((skill) => skill.accuracy >= 80)
    .sort((a, b) => b.accuracy - a.accuracy)
    .map((skill) => `${skill.skill} (${Math.round(skill.accuracy)}% accuracy)`);
  const weaknesses = breakdown
    .filter((skill) => skill.accuracy < 80)
    .sort((a, b) => a.accuracy - b.accuracy)
    .map((skill) => `${skill.skill} (${Math.round(skill.accuracy)}% accuracy)`);
  const mistakesBySkill = new Map<string, number>();
  for (const item of items) {
    if (!item.correct) {
      mistakesBySkill.set(item.skill, (mistakesBySkill.get(item.skill) ?? 0) + 1);
    }
  }
  const mistakePatterns = [...mistakesBySkill.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([skill, count]) => {
      const unanswered = items.some(
        (item) => !item.correct && item.skill === skill && !item.finalAnswer,
      );
      return `${skill}: ${count} ${count === 1 ? "miss" : "misses"}${unanswered ? " or unanswered item" : ""}`;
    });
  const nextFocus = (weaknesses.length > 0 ? weaknesses : strengths.slice().reverse())
    .slice(0, 3)
    .map((skill) => skill.replace(/ \(\d+% accuracy\)$/, ""));
  if (nextFocus.length === 0) {
    nextFocus.push("Keep practicing mixed SAT Reading & Writing sets.");
  }

  const projection = projectSatScores(items);
  const isDiagnostic =
    options.homeworkKind === "diagnostic" ||
    (options.homeworkKind !== "routine" &&
      /diagnostic|full sat|practice test/i.test(options.assignmentTitle ?? ""));
  const estimated = estimateSatScoreFromScoringGuide(items);
  const projectionLine =
    isDiagnostic && estimated.total != null
      ? ` Estimated SAT score range: ${formatEstimatedSatRange(estimated)}. ${SAT_SCORING_METHODOLOGY}`
      : "";

  const coaching =
    score >= 90
      ? "You handled this set cleanly. In the next session, stretch into harder variants so leftover time builds ceiling score rather than repeating easy wins."
      : score >= 80
        ? "You are building a strong foundation. Keep your accuracy steady while practicing under the time limit, and explain every miss out loud before you move on."
        : score >= 60
          ? "You have a useful foundation. Review the focus areas below, then retry a short mixed set under time so the same trap does not reappear in session."
          : "Start with the focus areas below and explain each missed answer before moving to another timed set. The session should rebuild those skills together.";

  const tutorBrief =
    mistakePatterns.length > 0
      ? ` Tutor focus: open with the ${nextFocus[0]} miss pattern, then coach the similar practice items generated for this meeting.`
      : " Tutor focus: homework is clean — use the hard-question bank to spend leftover time on ceiling work.";

  return {
    source: "deterministic",
    label: isDiagnostic
      ? SAT_ESTIMATED_SCORE_LABEL
      : "Adaptive skill analysis",
    provider: null,
    strengths:
      strengths.length > 0
        ? strengths
        : ["No skill reached 80% yet; every item gives us a useful starting point."],
    weaknesses:
      weaknesses.length > 0
        ? weaknesses
        : ["No major weakness identified in this set."],
    mistakePatterns:
      mistakePatterns.length > 0
        ? mistakePatterns
        : ["No incorrect responses in this attempt."],
    nextFocus,
    feedback: `${coaching}${projectionLine}${tutorBrief}`,
  };
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
