import { questionGenerationStatus } from "./question-generation.ts";

export type RetryCandidate = {
  id: string;
  sourceKey: string;
  skill: string;
  section: "rw" | "math";
  module: number;
  questionNumber: number;
};

export type RetryDecision =
  | { kind: "bank"; candidate: RetryCandidate; reason: string }
  | { kind: "ai"; status: ReturnType<typeof questionGenerationStatus>; reason: string }
  | { kind: "blocked"; status: ReturnType<typeof questionGenerationStatus>; reason: string };

/**
 * Bank-first similar retry. Unused same-skill / same-section item wins.
 * AI is only offered when OPENAI is configured. Never reveals the answer.
 */
export function decideRetrySource(input: {
  source: Pick<RetryCandidate, "id" | "skill" | "section" | "sourceKey">;
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
  const sameSkill = unused.filter(
    (item) => item.skill.toLowerCase() === input.source.skill.toLowerCase(),
  );
  const sameSection = unused.filter((item) => item.section === input.source.section);
  const candidate = sameSkill[0] ?? sameSection[0] ?? unused[0];
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

export function retryOutcomeFromAnswer(input: {
  studentAnswer: string | null | undefined;
  correctAnswer: string;
}): { correct: boolean; outcome: "mastered" | "still_struggling" } {
  const given = (input.studentAnswer ?? "").trim().toLowerCase();
  const expected = input.correctAnswer.trim().toLowerCase();
  const correct = Boolean(given) && given === expected;
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
