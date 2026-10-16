import type { BankChoice, ExtractGaps, ParsedBankRecord } from "./sat-bank-import.ts";
import { MATH_BY_DATE, type OriginalHardMathDraft } from "./original-hard-sat-math-drafts.ts";
import { RW_BY_DATE, type OriginalHardRwDraft } from "./original-hard-sat-rw-drafts.ts";
import { ORIGINAL_HARD_SAT_DATES } from "./sat-set-difficulty.ts";

/**
 * Individually authored hard digital SAT items for Nov 27, Dec 11, and Dec 18.
 * Multiple choice only. Nothing here runs at boot.
 */

const DATES = ORIGINAL_HARD_SAT_DATES;
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

export type OriginalHardMathItem = {
  dateKey: string;
  section: "math";
  questionNumber: number;
  sourceKey: string;
  prompt: string;
  stimulus: null;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
  difficultyNote: string;
  domain: string;
  skill: string;
  solve: () => number;
};

export type OriginalHardRwItem = {
  dateKey: string;
  section: "rw";
  questionNumber: number;
  sourceKey: string;
  prompt: string;
  stimulus: string;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
  difficultyNote: string;
  domain: string;
  skill: string;
};

function sourceKey(dateKey: string, section: "rw" | "math", questionNumber: number): string {
  return `original-hard-${dateKey}-${section}-${String(questionNumber).padStart(2, "0")}`;
}

/** FNV-1a of the item id, then a mixer so nearby question numbers do not share a cycle. */
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

function shuffledChoices(correct: string, distractors: readonly string[], id: string): {
  choices: BankChoice[];
  correctAnswer: string;
} {
  if (distractors.length !== 3) throw new Error("Expected three distractors.");
  if (distractors.includes(correct) || new Set(distractors).size !== 3) {
    throw new Error(`Distractors collided with ${correct}.`);
  }
  const slot = hashSeed(id) >>> 30;
  const rest = [distractors[0]!, distractors[1]!, distractors[2]!];
  let state = hashSeed(`${id}:choices`) || 1;
  for (let index = rest.length - 1; index > 0; index -= 1) {
    state = hashSeed(`${state}:${index}`) || 1;
    const swap = Math.floor((state / 4294967296) * (index + 1));
    const hold = rest[index]!;
    rest[index] = rest[swap]!;
    rest[swap] = hold;
  }
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

function buildMath(dateKey: string, drafts: readonly OriginalHardMathDraft[]): OriginalHardMathItem[] {
  if (drafts.length !== 35) throw new Error(`Expected 35 math items for ${dateKey}.`);
  return drafts.map((draft, index) => {
    const questionNumber = 35 - index;
    const solved = draft.solve();
    if (!Number.isInteger(solved) || solved < 0) {
      throw new Error(`${dateKey} math ${questionNumber} solved to ${solved}.`);
    }
    if (draft.wrong.includes(solved) || new Set(draft.wrong).size !== 3) {
      throw new Error(`${dateKey} math ${questionNumber} distractors collided.`);
    }
    const placed = shuffledChoices(String(solved), draft.wrong.map(String), sourceKey(dateKey, "math", questionNumber));
    const explanation = `${draft.because} The result is ${solved}.`;
    if (!explanation.includes(String(solved))) throw new Error("Explanation missed the result.");
    return {
      dateKey,
      section: "math",
      questionNumber,
      sourceKey: sourceKey(dateKey, "math", questionNumber),
      prompt: draft.prompt,
      stimulus: null,
      choices: placed.choices,
      correctAnswer: placed.correctAnswer,
      explanation,
      difficultyNote: draft.note,
      domain: draft.domain,
      skill: draft.skill,
      solve: draft.solve,
    };
  });
}

function buildRw(dateKey: string, drafts: readonly OriginalHardRwDraft[]): OriginalHardRwItem[] {
  if (drafts.length !== 35) throw new Error(`Expected 35 reading items for ${dateKey}.`);
  return drafts.map((draft, index) => {
    const questionNumber = 35 - index;
    const blanks = draft.stimulus.split("___").length - 1;
    if (blanks > 1) throw new Error(`${dateKey} rw ${questionNumber} has ${blanks} blanks.`);
    const placed = shuffledChoices(draft.correct, draft.wrong, sourceKey(dateKey, "rw", questionNumber));
    return {
      dateKey,
      section: "rw",
      questionNumber,
      sourceKey: sourceKey(dateKey, "rw", questionNumber),
      prompt: draft.prompt,
      stimulus: draft.stimulus,
      choices: placed.choices,
      correctAnswer: placed.correctAnswer,
      explanation: draft.explanation,
      difficultyNote: draft.note,
      domain: draft.domain,
      skill: draft.skill,
    };
  });
}

export function originalHardMathItems(): OriginalHardMathItem[] {
  return MATH_BY_DATE.flatMap((drafts, dateIndex) => buildMath(DATES[dateIndex]!, drafts));
}

export function originalHardRwItems(): OriginalHardRwItem[] {
  return RW_BY_DATE.flatMap((drafts, dateIndex) => buildRw(DATES[dateIndex]!, drafts));
}

function toRecord(item: {
  sourceKey: string;
  section: "rw" | "math";
  questionNumber: number;
  prompt: string;
  stimulus: string | null;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
  difficultyNote: string;
  domain: string;
  skill: string;
}): ParsedBankRecord {
  return {
    sourceKey: item.sourceKey,
    dedupKey: item.sourceKey,
    examFamily: "sat",
    examVariant: "digital",
    practiceTestNumber: null,
    formCode: "original-hard",
    section: item.section,
    module: 2,
    questionNumber: item.questionNumber,
    position: item.questionNumber,
    collectionSlug: "original-hard-sat",
    collectionTitle: "Original hard SAT",
    prompt: item.prompt,
    stimulus: item.stimulus,
    choices: item.choices,
    correctAnswer: item.correctAnswer,
    officialExplanation: item.explanation,
    figures: [],
    scoring: {},
    skill: item.skill,
    domain: item.domain,
    difficulty: "H",
    questionType: "mcq",
    estimatedSeconds: 90,
    sourceKind: "original_hard",
    sourceFiles: { origin: "original-hard-sat", difficultyNote: item.difficultyNote },
    assets: [],
    extractGaps: GAPS,
    assignable: true,
  };
}

export function originalHardSatBankRecords(): ParsedBankRecord[] {
  return [...originalHardRwItems(), ...originalHardMathItems()].map((item) => toRecord(item));
}
