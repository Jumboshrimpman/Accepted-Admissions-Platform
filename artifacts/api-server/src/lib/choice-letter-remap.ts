export type ChoiceLetter = { id: string; text: string };

/** True when both lists carry the same choice texts, whatever order the letters are in. */
export function choiceTextsMatch(
  previous: readonly ChoiceLetter[],
  next: readonly ChoiceLetter[],
): boolean {
  if (previous.length === 0 || previous.length !== next.length) return false;
  const left = previous.map((choice) => choice.text).sort();
  const right = next.map((choice) => choice.text).sort();
  return left.every((text, index) => text === right[index]);
}

/**
 * Move a stored letter onto the choice text it already selected.
 * Non-letters and unknown ids stay as they were.
 */
export function remapStoredChoiceLetter(
  previous: readonly ChoiceLetter[],
  next: readonly ChoiceLetter[],
  answer: string | null | undefined,
): string | null | undefined {
  if (typeof answer !== "string") return answer;
  const trimmed = answer.trim();
  if (!trimmed) return answer;
  const from = previous.find((choice) => choice.id.toLowerCase() === trimmed.toLowerCase());
  if (!from) return answer;
  const to = next.find((choice) => choice.text === from.text);
  return to?.id ?? answer;
}
