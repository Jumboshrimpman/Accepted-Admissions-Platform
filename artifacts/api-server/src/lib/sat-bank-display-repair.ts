/**
 * Read-time repairs for known College Board extract mistakes.
 * These do not write the database. Already-materialized rows pick them up
 * when a question is shaped for a student or a PDF.
 */

const STRAY_NUMBERED_VALUE =
  /([^\n])\n+[ \t]*(\d+)\.\s+(What is the value of x\s*\??)/gi;

const FLIPPED_FOUR_X_STEM = /x\s*\/\s*4\s*\+\s*1\s*=\s*33/;

/** Join "is\\n60. What is the value of x ?" so the result is not a fake question number. */
export function repairStrayNumberedQuestionFragment(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(STRAY_NUMBERED_VALUE, "$1 $2. $3");
}

/**
 * Practice test 11 math module 1 question 2 was extracted as `x/4 + 1 = 33`.
 * The printed equation is `4x+1=33`, and the choices are `4x = …`.
 */
export function repairFlippedFourXText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/x\s*\/\s*4\s*\+\s*1\s*=\s*33/g, "4x+1=33")
    .replace(/x\s*\/\s*4\s*=\s*(-?\d+)/g, "4x=$1");
}

type BankChoice = { id?: string; label?: string; text?: string };

export function repairKnownSatBankQuestion<
  T extends {
    prompt?: string | null;
    stimulus?: string | null;
    choices?: unknown;
    explanation?: string | null;
    officialExplanation?: string | null;
  },
>(question: T): T {
  const joinedPrompt = repairStrayNumberedQuestionFragment(question.prompt);
  const flipped =
    FLIPPED_FOUR_X_STEM.test(joinedPrompt) && /same solution/i.test(joinedPrompt);
  const fix = (value: string | null | undefined) => {
    const joined = repairStrayNumberedQuestionFragment(value);
    return flipped ? repairFlippedFourXText(joined) : joined;
  };
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => {
        if (!choice || typeof choice !== "object") return choice;
        const row = choice as BankChoice;
        if (typeof row.text !== "string") return choice;
        return { ...row, text: fix(row.text) };
      })
    : question.choices;
  return {
    ...question,
    prompt: fix(joinedPrompt),
    stimulus: question.stimulus == null ? question.stimulus : fix(question.stimulus),
    choices,
    ...(Object.prototype.hasOwnProperty.call(question, "explanation")
      ? { explanation: fix(question.explanation) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(question, "officialExplanation")
      ? { officialExplanation: fix(question.officialExplanation) }
      : {}),
  };
}
