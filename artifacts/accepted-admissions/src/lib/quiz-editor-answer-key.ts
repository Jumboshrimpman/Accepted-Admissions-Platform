/** Admin/tutor quiz editors must never invent a letter key. */

export type QuizEditorChoice = {
  id?: string | null;
  label?: string | null;
};

export function quizEditorChoiceValue(choice: QuizEditorChoice, index: number): string {
  const id = String(choice.id ?? "").trim();
  const label = String(choice.label ?? "").trim();
  return (id || label || String.fromCharCode(97 + index)).toLowerCase();
}

export function quizEditorLetterToken(answer: string | null | undefined): string {
  const token = (answer ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return /^[a-d]$/.test(token) ? token : "";
}

function choiceMatchesLetter(choice: QuizEditorChoice, letter: string): boolean {
  const id = String(choice.id ?? "").trim().toLowerCase();
  const label = String(choice.label ?? "").trim().toLowerCase();
  return id === letter || label === letter;
}

/**
 * Prefer the assignment payload (admin GET includes keys). Fall back to a
 * course-bank row only when that row actually has a matching a–d key.
 * Missing/invalid keys stay empty — never coerce to `"a"`.
 */
function matchingLetter(
  answer: string | null | undefined,
  choices: QuizEditorChoice[],
): string {
  const letter = quizEditorLetterToken(answer);
  if (!letter) return "";
  if (choices.length === 0) return letter;
  return choices.some((choice) => choiceMatchesLetter(choice, letter)) ? letter : "";
}

export function resolveQuizEditorAnswerKey(input: {
  assignmentAnswer?: string | null;
  bankAnswer?: string | null;
  choices?: QuizEditorChoice[] | null;
}): string {
  const choices = input.choices ?? [];
  const assignmentPresent = (input.assignmentAnswer ?? "").trim().length > 0;
  const assignmentLetter = matchingLetter(input.assignmentAnswer, choices);
  if (assignmentLetter) return assignmentLetter;
  if (assignmentPresent) return "";
  return matchingLetter(input.bankAnswer, choices);
}
