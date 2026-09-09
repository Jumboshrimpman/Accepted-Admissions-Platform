import type { AssignmentQuestion } from "@workspace/api-client-react";

export type FigurePrimaryPresentation = "text" | "figure_primary";

const SAT_BANK_FIGURE_COMMENT = /<!--\s*\/?sat-bank-figures\s*-->/gi;
const FIGURE_PRIMARY_COMMENT =
  /<!--\s*figure-primary(?:\s+src=(?:"([^"]+)"|'([^']+)'))?\s*-->/gi;
const ASCII_GRAPH = /\+[-+]{3,}|\|[-+|]{6,}|[0-9]+\+[-+]+/;
const SEE_FIGURE_CHOICE = /^(?:\(see figure\)|see figure)$/i;
const LETTER_LABELS = ["A", "B", "C", "D"] as const;

export function stripSatBankFigureComments(text: string | null | undefined): string {
  return (text ?? "")
    .replace(SAT_BANK_FIGURE_COMMENT, "")
    .replace(FIGURE_PRIMARY_COMMENT, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksGarbledQuizText(text: string | null | undefined): boolean {
  if (/<!--\s*\/?sat-bank-figures\s*-->/i.test(text ?? "")) return true;
  const value = stripSatBankFigureComments(text);
  if (!value) return false;
  if (ASCII_GRAPH.test(value)) return true;
  if (/[£]/.test(value) && /[=+\-]/.test(value)) return true;
  const letters = (value.match(/[A-Za-z]/g) ?? []).length;
  const symbols = (value.match(/[^A-Za-z0-9\s.,;:'"()?!\-$%]/g) ?? []).length;
  if (value.length >= 12 && letters > 0 && symbols >= Math.max(6, Math.ceil(letters * 0.7))) {
    return true;
  }
  return (value.match(/[=~<>_]{2,}|\.{3,}[^\s]|:\s*\.\.\.|-\s*<:/g) ?? []).length >= 2;
}

function hasUsableChoiceText(choices: AssignmentQuestion["choices"]): boolean {
  return (choices ?? []).filter((choice) => {
    const text = choice.text.trim();
    return text.length > 0 && !SEE_FIGURE_CHOICE.test(text);
  }).length >= 2;
}

export function letterMcqChoices(
  existing?: AssignmentQuestion["choices"],
): NonNullable<AssignmentQuestion["choices"]> {
  return LETTER_LABELS.map((label) => {
    const found = (existing ?? []).find(
      (choice) =>
        choice.id.toLowerCase() === label.toLowerCase() || choice.label.toUpperCase() === label,
    );
    return { id: found?.id || label.toLowerCase(), label, text: "" };
  });
}

export function isFigurePrimaryQuestion(
  question: Pick<AssignmentQuestion, "presentation" | "prompt" | "stimulus" | "choices" | "questionType"> & {
    figurePrimary?: boolean | null;
    figurePrimarySrc?: string | null;
  },
): boolean {
  if (question.presentation === "figure_primary" || question.figurePrimary === true) return true;
  if (question.figurePrimarySrc?.trim()) return true;
  if (/<!--\s*figure-primary/i.test(`${question.prompt ?? ""}\n${question.stimulus ?? ""}`)) {
    return true;
  }
  if (question.presentation === "text") return false;
  const images = /!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/.test(
    `${question.stimulus ?? ""}\n${question.prompt ?? ""}`,
  );
  const garbled =
    looksGarbledQuizText(question.prompt) || looksGarbledQuizText(question.stimulus);
  const spr = (question.questionType ?? "").toLowerCase() === "spr";
  const missingChoices = !hasUsableChoiceText(question.choices);
  if (garbled && (images || missingChoices || spr)) return true;
  if (images && missingChoices) return true;
  return false;
}

export function figurePrimaryChoices(
  question: Pick<AssignmentQuestion, "choices" | "presentation" | "prompt" | "stimulus" | "questionType">,
): NonNullable<AssignmentQuestion["choices"]> {
  if (!isFigurePrimaryQuestion(question)) {
    return question.choices ?? [];
  }
  return letterMcqChoices(question.choices);
}

export function displayAnswerLabel(
  answer: string | null | undefined,
  choices: Array<{ id: string; label: string; text: string }> | undefined,
): string {
  if (!answer) return "Not answered";
  const match = choices?.find(
    (choice) => choice.id === answer || choice.label.toLowerCase() === answer.toLowerCase(),
  );
  if (match?.text.trim() && !SEE_FIGURE_CHOICE.test(match.text)) {
    return match.text;
  }
  return (match?.label ?? answer).toUpperCase();
}
