import type { BankChoice, ExtractGaps, ParsedBankRecord } from "./sat-bank-import.ts";
import { MICHELLE_XAVIER_HARD_MATH_DRAFTS } from "./michelle-xavier-hard-math-drafts.ts";
import type { OriginalHardMathDraft } from "./original-hard-sat-math-drafts.ts";

const GAPS: ExtractGaps = {
  skillDifficultyAbsent: false,
  missingPrompt: false,
  missingChoices: false,
  figuresIncomplete: false,
  spr: false,
  figurePrimary: false,
  notes: [],
};
const LETTERS = ["a", "b", "c", "d"] as const;
export const MICHELLE_XAVIER_HARD_MATH_DATE_KEY = "2026-11-22";
export const MICHELLE_XAVIER_HARD_MATH_SOURCE_PREFIX = "original-hard-michelle-2026-11-22-math-";

export type MichelleXavierHardMathItem = OriginalHardMathDraft & {
  sourceKey: string;
  questionNumber: number;
  section: "math";
  stimulus: null;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
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

function placedChoices(correct: string, distractors: readonly string[], slot: number, id: string): {
  choices: BankChoice[];
  correctAnswer: string;
} {
  if (distractors.length !== 3) throw new Error("Expected three distractors.");
  if (distractors.includes(correct) || new Set(distractors).size !== 3) {
    throw new Error(`Distractors collided with ${correct}.`);
  }
  if (slot < 0 || slot > 3) throw new Error(`Bad slot for ${id}.`);
  const rest = shuffleWithSeed(distractors, `${id}:wrongs`);
  const texts = ["", "", "", ""];
  texts[slot] = correct;
  let next = 0;
  for (let index = 0; index < texts.length; index += 1) {
    if (texts[index]) continue;
    texts[index] = rest[next]!;
    next += 1;
  }
  return {
    choices: texts.map((text, index) => ({
      id: LETTERS[index]!,
      label: LETTERS[index]!.toUpperCase(),
      text,
    })),
    correctAnswer: LETTERS[slot]!,
  };
}

export function michelleXavierHardMathSourceKey(questionNumber: number): string {
  return `${MICHELLE_XAVIER_HARD_MATH_SOURCE_PREFIX}${String(questionNumber).padStart(2, "0")}`;
}

export function michelleXavierHardMathItems(): MichelleXavierHardMathItem[] {
  const drafts = MICHELLE_XAVIER_HARD_MATH_DRAFTS;
  if (drafts.length !== 60) {
    throw new Error(`Expected 60 Michelle Xavier hard math drafts, found ${drafts.length}.`);
  }
  return drafts.map((draft, index) => {
    const questionNumber = drafts.length - index;
    const solved = draft.solve();
    if (!Number.isInteger(solved)) {
      throw new Error(`Michelle Xavier math ${questionNumber} solved to ${solved}.`);
    }
    if (draft.wrong.includes(solved) || new Set(draft.wrong).size !== 3) {
      throw new Error(`Michelle Xavier math ${questionNumber} distractors collided.`);
    }
    const sourceKey = michelleXavierHardMathSourceKey(questionNumber);
    const slot = hashSeed(`${sourceKey}:slot`) % 4;
    const placed = placedChoices(String(solved), draft.wrong.map(String), slot, sourceKey);
    const explanation = draft.because.includes(String(solved)) || solved < 0
      ? draft.because
      : `${draft.because} The result is ${solved}.`;
    return {
      ...draft,
      sourceKey,
      questionNumber,
      section: "math" as const,
      stimulus: null,
      choices: placed.choices,
      correctAnswer: placed.correctAnswer,
      explanation,
    };
  });
}

export function michelleXavierHardMathBankRecords(): ParsedBankRecord[] {
  return michelleXavierHardMathItems().map((item) => ({
    sourceKey: item.sourceKey,
    dedupKey: item.sourceKey,
    examFamily: "sat",
    examVariant: "digital",
    practiceTestNumber: null,
    formCode: "original-hard-michelle",
    section: "math",
    module: 2,
    questionNumber: item.questionNumber,
    position: item.questionNumber,
    collectionSlug: "michelle-xavier-hard-math",
    collectionTitle: "Michelle Xavier hard SAT math",
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
    estimatedSeconds: 90,
    sourceKind: "original_hard",
    sourceFiles: { origin: "michelle-xavier-hard-math", difficultyNote: item.note },
    assets: [],
    extractGaps: GAPS,
    assignable: true,
  }));
}
