import { questionGenerationStatus } from "./question-generation.ts";

export type RetryCandidate = {
  id: string;
  sourceKey: string;
  skill: string | null;
  section: "rw" | "math";
  module: number;
  questionNumber: number;
  difficulty?: string | null;
};

export type RetryDecision =
  | { kind: "bank"; candidate: RetryCandidate; reason: string }
  | { kind: "ai"; status: ReturnType<typeof questionGenerationStatus>; reason: string }
  | { kind: "blocked"; status: ReturnType<typeof questionGenerationStatus>; reason: string };

const DIFFICULTY_RANK: Record<string, number> = {
  foundational: 1,
  easy: 1,
  medium: 2,
  hard: 3,
};

function difficultyDistance(left?: string | null, right?: string | null): number {
  if (!left || !right) return 50;
  const a = DIFFICULTY_RANK[left.toLowerCase()];
  const b = DIFFICULTY_RANK[right.toLowerCase()];
  if (a == null || b == null) return 50;
  return Math.abs(a - b);
}

function pickPreferred(
  candidates: readonly RetryCandidate[],
  sourceDifficulty?: string | null,
): RetryCandidate | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((left, right) => {
    const byDifficulty =
      difficultyDistance(left.difficulty, sourceDifficulty) -
      difficultyDistance(right.difficulty, sourceDifficulty);
    if (byDifficulty !== 0) return byDifficulty;
    return left.questionNumber - right.questionNumber;
  })[0];
}

/**
 * Bank-first similar retry. Unused same-skill / same-section item wins.
 * When several unused matches remain, prefer the closest known difficulty.
 * AI is only offered when OPENAI is configured. Never reveals the answer.
 */
export function decideRetrySource(input: {
  source: Pick<RetryCandidate, "id" | "skill" | "section" | "sourceKey" | "difficulty">;
  unusedBank: readonly RetryCandidate[];
  usedSourceKeys?: ReadonlySet<string>;
  env?: NodeJS.ProcessEnv;
}): RetryDecision {
  const used = input.usedSourceKeys ?? new Set<string>();
  const unused = input.unusedBank.filter(
    (item) =>
      item.id !== input.source.id &&
      item.sourceKey !== input.source.sourceKey &&
      !used.has(item.sourceKey),
  );
  const sourceSkill = (input.source.skill ?? "").trim();
  const sameSkill = sourceSkill
    ? unused.filter((item) => (item.skill ?? "").toLowerCase() === sourceSkill.toLowerCase())
    : [];
  const sameSection = unused.filter((item) => item.section === input.source.section);
  const candidate =
    pickPreferred(sameSkill, input.source.difficulty) ??
    pickPreferred(sameSection, input.source.difficulty) ??
    pickPreferred(unused, input.source.difficulty);
  if (candidate) {
    return {
      kind: "bank",
      candidate,
      reason: sameSkill[0]
        ? `Unused bank item for ${input.source.skill}. Official explanation stays on the original miss.`
        : "Unused similar bank item in the same section. Official content is not regenerated.",
    };
  }
  const status = questionGenerationStatus(input.env);
  if (status.available) {
    return {
      kind: "ai",
      status,
      reason:
        "No unused similar bank question remains. An analogous original item can be drafted with OpenAI. Official wording is not copied.",
    };
  }
  return {
    kind: "blocked",
    status,
    reason:
      "No unused similar bank question remains, and OPENAI_API_KEY is not configured. Retry is blocked rather than inventing a question.",
  };
}

export function acceptedAnswerForms(correctAnswer: string): string[] {
  return correctAnswer
    .split(";")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function answersMatch(
  studentAnswer: string | null | undefined,
  correctAnswer: string,
): boolean {
  const given = (studentAnswer ?? "").trim().toLowerCase();
  if (!given) return false;
  const forms = acceptedAnswerForms(correctAnswer);
  if (forms.includes(given)) return true;
  const numeric = Number(given);
  if (Number.isFinite(numeric) && forms.some((form) => Number(form) === numeric)) {
    return true;
  }
  return false;
}

export function retryOutcomeFromAnswer(input: {
  studentAnswer: string | null | undefined;
  correctAnswer: string;
}): { correct: boolean; outcome: "mastered" | "still_struggling" } {
  const correct = answersMatch(input.studentAnswer, input.correctAnswer);
  return { correct, outcome: correct ? "mastered" : "still_struggling" };
}

export function studentRetryShape<T extends { correctAnswer?: string; officialExplanation?: string; explanation?: string }>(
  question: T,
): Omit<T, "correctAnswer" | "officialExplanation" | "explanation"> {
  const {
    correctAnswer: _correct,
    officialExplanation: _official,
    explanation: _explanation,
    ...safe
  } = question;
  return safe;
}
