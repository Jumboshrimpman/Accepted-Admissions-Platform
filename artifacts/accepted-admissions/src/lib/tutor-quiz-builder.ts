import { isSafeQuizImageSrc } from "./quiz-rich-text.ts";

export type PickerBankQuestion = {
  id: string;
  sourceKey: string;
  prompt: string;
  stimulus?: string | null;
  skill?: string | null;
  domain?: string | null;
  section: string;
  questionType: string;
  assignable?: boolean;
  choices?: Array<{ id: string; label: string; text: string }>;
  figures?: Array<{ url?: string | null; path?: string | null; alt?: string | null }>;
};

export const TUTOR_QUIZ_SPR_NOTE =
  "Student-produced response (SPR) items are hidden and cannot be added to tutor-built quizzes.";

export function isPickerMcq(question: Pick<PickerBankQuestion, "questionType">): boolean {
  const type = question.questionType.trim().toLowerCase();
  return type !== "spr" && type !== "student_produced_response" && type !== "free_response";
}

export function bankQuestionSearchHaystack(question: PickerBankQuestion): string {
  return [
    question.prompt,
    question.stimulus,
    question.sourceKey,
    question.skill,
    question.domain,
    question.section,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterBankQuestionsForPicker(
  questions: PickerBankQuestion[],
  query: string,
): PickerBankQuestion[] {
  const needle = query.trim().toLowerCase();
  return questions.filter((question) => {
    if (!isPickerMcq(question) || question.assignable === false) return false;
    if (!needle) return true;
    return bankQuestionSearchHaystack(question).includes(needle);
  });
}

export function moveSelectedId(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  const current = copy[index]!;
  copy[index] = copy[next]!;
  copy[next] = current;
  return copy;
}

export function compactFigureSrc(question: PickerBankQuestion): string | null {
  for (const figure of question.figures ?? []) {
    const url = figure.url?.trim() ?? "";
    if (url && isSafeQuizImageSrc(url)) return url;
  }
  return null;
}

export function choiceLabel(choice: { label: string; id: string }): string {
  return (choice.label || choice.id).trim().toUpperCase();
}
