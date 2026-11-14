export type SeenStudentQuestions = {
  questionIds: Set<string>;
  sourceKeys: Set<string>;
  practiceTests: Set<number>;
  fingerprints: Set<string>;
};

export function emptySeenStudentQuestions(): SeenStudentQuestions {
  return {
    questionIds: new Set(),
    sourceKeys: new Set(),
    practiceTests: new Set(),
    fingerprints: new Set(),
  };
}

/** Lowercased, tag-stripped, whitespace-collapsed text for within-student dedupe. */
export function normalizeQuizText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u200B/g, "")
    .replace(/<[^>]+>/g, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function choiceTexts(choices: unknown): string[] {
  if (!Array.isArray(choices)) return [];
  return choices
    .map((choice) =>
      normalizeQuizText(
        typeof choice === "string"
          ? choice
          : choice && typeof choice === "object" && "text" in choice
            ? String((choice as { text?: unknown }).text ?? "")
            : "",
      ),
    )
    .filter(Boolean)
    .sort();
}

/**
 * Stable fingerprint of prompt + choices (and stimulus when it is not already
 * in the prompt). Two rows with different ids but the same student-facing
 * wording compare equal, including session-local clone snapshots.
 */
export function questionContentFingerprint(input: {
  prompt?: string | null;
  stimulus?: string | null;
  choices?: unknown;
}): string {
  const prompt = normalizeQuizText(input.prompt);
  const stimulus = normalizeQuizText(input.stimulus);
  const body = !stimulus || prompt.includes(stimulus) ? prompt : `${stimulus} || ${prompt}`;
  return `${body} :: ${choiceTexts(input.choices).join("|")}`;
}

export function isEmptyQuestionFingerprint(fingerprint: string): boolean {
  return fingerprint === " :: ";
}

export function questionIsAlreadyAssignedToStudent(
  item: {
    questionId?: string | null;
    sourceKey?: string | null;
    prompt?: string | null;
    stimulus?: string | null;
    choices?: unknown;
  },
  seen: Pick<SeenStudentQuestions, "questionIds" | "sourceKeys" | "fingerprints">,
): boolean {
  if (item.questionId && seen.questionIds.has(item.questionId)) return true;
  if (item.sourceKey && seen.sourceKeys.has(item.sourceKey)) return true;
  const fingerprint = questionContentFingerprint(item);
  if (isEmptyQuestionFingerprint(fingerprint)) return false;
  return seen.fingerprints?.has(fingerprint) === true;
}

export function filterUnseenBankItems<
  T extends {
    linkedQuestionId?: string | null;
    sourceKey?: string | null;
    prompt?: string | null;
    stimulus?: string | null;
    choices?: unknown;
  },
>(
  items: readonly T[],
  seen: Pick<SeenStudentQuestions, "questionIds" | "sourceKeys" | "fingerprints">,
): T[] {
  return items.filter(
    (item) =>
      !questionIsAlreadyAssignedToStudent(
        {
          questionId: item.linkedQuestionId,
          sourceKey: item.sourceKey,
          prompt: item.prompt,
          stimulus: item.stimulus,
          choices: item.choices,
        },
        seen,
      ),
  );
}
