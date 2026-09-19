import { IELTS_STYLE_EXAM_FAMILY, IELTS_STYLE_SOURCE_KIND } from "./ielts-style-bank-content.ts";
import { isStudentUsableEnglishQuizItem } from "./sat-bank-diagnostic-quality.ts";
import { isTutorQuizMcq } from "./sat-bank-import.ts";

export const IELTS_STYLE_DIAGNOSTIC_COUNT = 24;
export const IELTS_STYLE_ROUTINE_COUNT = 12;

export function isIeltsStyleBankRow(row: {
  examFamily?: string | null;
  sourceKind?: string | null;
}): boolean {
  return (
    (row.examFamily ?? "").trim().toLowerCase() === IELTS_STYLE_EXAM_FAMILY &&
    (row.sourceKind ?? "").trim() === IELTS_STYLE_SOURCE_KIND
  );
}

export function ieltsStyleSourceKey(input: {
  section: "reading" | "writing";
  module: number;
  questionNumber: number;
}): string {
  return `ielts-style-original-${input.section}-m${input.module}-q${input.questionNumber}`;
}

export { isStudentUsableEnglishQuizItem };

export function canAssignCleanEnglishQuizSet(
  selected: readonly Parameters<typeof isStudentUsableEnglishQuizItem>[0][],
): boolean {
  if (selected.length === 0) return false;
  return selected.every((item) => isStudentUsableEnglishQuizItem(item));
}

export function selectIeltsStylePreworkItems<
  T extends { id: string; module: number; questionType: string; formCode?: string | null },
>(
  pool: readonly T[],
  input: { homeworkKind: "diagnostic" | "routine"; setIndex?: number },
): T[] {
  const mcq = pool.filter((row) => isTutorQuizMcq(row.questionType) && row.questionType !== "writing_task");
  if (input.homeworkKind === "diagnostic") {
    return mcq.filter((row) => row.module === 1).slice(0, IELTS_STYLE_DIAGNOSTIC_COUNT);
  }
  const routineModule = input.setIndex === 2 ? 3 : 2;
  const preferred = mcq.filter((row) => row.module === routineModule);
  if (preferred.length > 0) return preferred.slice(0, IELTS_STYLE_ROUTINE_COUNT);
  return mcq.filter((row) => row.module !== 1).slice(0, IELTS_STYLE_ROUTINE_COUNT);
}
