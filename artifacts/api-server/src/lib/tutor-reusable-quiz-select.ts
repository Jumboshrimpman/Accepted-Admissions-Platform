import { isAssignableBankItem, isTutorQuizMcq } from "./sat-bank-import.ts";
import { assignmentChoices } from "./assignment-visibility.ts";
import { isStudentUsableQuizItem, quizSectionFromBankMeta } from "./sat-bank-diagnostic-quality.ts";

export const TUTOR_QUIZ_MAX_QUESTIONS = 80;
export const TUTOR_QUIZ_SPR_NOTE =
  "Student-produced response (SPR) items cannot be added to tutor-built quizzes.";
export const TUTOR_QUIZ_UNUSABLE_NOTE =
  "Every selected question must be a complete student-usable multiple-choice item with a readable stem and A–D text.";

export { isTutorQuizMcq };

export type TutorQuizBankCandidate = {
  id: string;
  questionType: string;
  prompt: string;
  stimulus?: string | null;
  choices: unknown;
  correctAnswer: string;
  figures?: unknown;
  section?: string | null;
  subject?: string | null;
  domain?: string | null;
  extractGaps?: { missingPrompt?: boolean; missingChoices?: boolean; figurePrimary?: boolean } | null;
  estimatedSeconds?: number | null;
};

export function selectBankQuestionsForTutorQuiz<T extends TutorQuizBankCandidate>(
  rows: T[],
  requestedIds: string[],
): { selected: T[]; error?: string } {
  if (requestedIds.length === 0) {
    return { selected: [], error: "Select at least one multiple-choice question." };
  }
  if (requestedIds.length > TUTOR_QUIZ_MAX_QUESTIONS) {
    return {
      selected: [],
      error: `Choose at most ${TUTOR_QUIZ_MAX_QUESTIONS} questions.`,
    };
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const selected: T[] = [];
  const seen = new Set<string>();
  for (const id of requestedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = byId.get(id);
    if (!row) {
      return { selected: [], error: "One or more bank questions were not found." };
    }
    if (!isTutorQuizMcq(row.questionType)) {
      return { selected: [], error: TUTOR_QUIZ_SPR_NOTE };
    }
    const choices = assignmentChoices(row.choices) ?? [];
    if (
      !isAssignableBankItem({
        prompt: row.prompt,
        questionType: row.questionType,
        choices,
        correctAnswer: row.correctAnswer,
        extractGaps: row.extractGaps ?? undefined,
      }) ||
      !isStudentUsableQuizItem({
        id: row.id,
        prompt: row.prompt,
        stimulus: row.stimulus,
        choices,
        correctAnswer: row.correctAnswer,
        questionType: row.questionType,
        extractGaps: row.extractGaps ?? undefined,
        section: quizSectionFromBankMeta(row),
        figures: Array.isArray(row.figures) ? row.figures : [],
      })
    ) {
      return {
        selected: [],
        error: TUTOR_QUIZ_UNUSABLE_NOTE,
      };
    }
    selected.push(row);
  }
  return { selected };
}

export function tutorQuizTimeLimitMinutes(estimatedSeconds: number, questionCount: number): number {
  const fromEstimate = Math.round(estimatedSeconds / 60);
  return Math.min(180, Math.max(5, fromEstimate || Math.max(5, questionCount)));
}
