import type { AssignmentQuestion } from "@workspace/api-client-react";

export type FigurePrimaryPresentation = "text" | "figure_primary";

const SAT_BANK_FIGURE_COMMENT = /<!--\s*\/?sat-bank-figures\s*-->/gi;
const FIGURE_PRIMARY_COMMENT =
  /<!--\s*figure-primary(?:\s+src=(?:"([^"]+)"|'([^']+)'))?\s*-->/gi;
const ASCII_GRAPH = /\+[-+]{3,}|\|[-+|]{6,}|[0-9]+\+[-+]+/;
const SEE_FIGURE_CHOICE = /^(?:\(see figure\)|see figure)$/i;
const LETTER_LABELS = ["A", "B", "C", "D"] as const;
const OCR_TILDE = /[~∼˜]/;
const OCR_DASH_RUN = /-{3,}|–{3,}|—{2,}/;
const MATH_LAYOUT_GLYPH = /[⎜⎟⎝⎠⎛⎞⎢⎥]/;
const MISSING_CARET_POLYNOMIAL =
  /(?:^|[=+\-,\s(])(?:[A-Za-z]|[2-9]\d*)?x2(?:\b|[+\-\s,)])/;
const MISSING_CARET_PAREN_POWER = /\([^)\n]{1,24}\)2\b/;
const MISSING_CARET_GROWTH = /\(\d+\.\d+\)x\b/;
const SMASHED_QUADRATIC_LEAD = /\b2\s+4x\b/;
const STRIPPED_TRIANGLE_SIDES = /(?:sides of length|right triangle)[\s\S]{0,160}\b2\s+2\s*,\s*6\s+2\b/i;
const STRIPPED_RADICAL_CHOICE = /^(?:8\s+2\s*\+\s*80|\d+\s*\+\s*\d+\s+2)$/;
const BROKEN_COORDINATE = /\(\s*,\s*x\s*y\s*\)/;
const STRAY_QUESTION_FOLLOWING = /\?\s+following\b/i;
const STACKED_FRACTION_ORPHAN = /\b14x\s*=\s*2\s*w\b|\n7y\s*(?:\n|$)/;
const ORPHAN_FX_AFTER_W = /expresses\s+w[\s\S]{0,80}\bf\(x\)\s*$/i;
const SPACED_PRODUCT_CHOICE = /^(?:[A-Za-z]\s+[A-Za-z]|\d{1,3}\s+[A-Za-z])$/;
const QUIZ_IMAGE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/;

export function stripSatBankFigureComments(text: string | null | undefined): string {
  return (text ?? "")
    .replace(SAT_BANK_FIGURE_COMMENT, "")
    .replace(FIGURE_PRIMARY_COMMENT, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksFailedMathLayoutDump(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  if (MATH_LAYOUT_GLYPH.test(value) || /[\uFFFD�]/.test(value)) return true;
  const slashes = (value.match(/[|\\/]/g) ?? []).length;
  if (value.length <= 96 && slashes >= 3 && /[=()]/.test(value)) return true;
  if (/\bF\s+\d/.test(value) && /=/.test(value) && value.length <= 64) return true;
  return false;
}

export function looksSpacedProductChoice(text: string | null | undefined): boolean {
  return SPACED_PRODUCT_CHOICE.test(cleanOcrChoiceText(text));
}

export function looksStrippedRadicalChoice(text: string | null | undefined): boolean {
  return STRIPPED_RADICAL_CHOICE.test(cleanOcrChoiceText(text));
}

export function looksBrokenMathOcr(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (looksFailedMathLayoutDump(raw)) return true;
  if (MISSING_CARET_GROWTH.test(raw) && !/\(\d+\.\d+\)\^x\b/.test(raw)) return true;
  if (MISSING_CARET_POLYNOMIAL.test(raw) && !/\bx\^2\b/.test(raw)) return true;
  if (MISSING_CARET_PAREN_POWER.test(raw) && !/\)\^2\b/.test(raw)) return true;
  if (SMASHED_QUADRATIC_LEAD.test(raw)) return true;
  if (STRIPPED_TRIANGLE_SIDES.test(raw)) return true;
  if (BROKEN_COORDINATE.test(raw)) return true;
  if (STRAY_QUESTION_FOLLOWING.test(raw)) return true;
  if (STACKED_FRACTION_ORPHAN.test(raw)) return true;
  if (ORPHAN_FX_AFTER_W.test(raw)) return true;
  return false;
}

export function looksGarbledQuizText(text: string | null | undefined): boolean {
  if (/<!--\s*\/?sat-bank-figures\s*-->/i.test(text ?? "")) return true;
  const value = stripSatBankFigureComments(text);
  if (!value) return false;
  if (looksBrokenMathOcr(value)) return true;
  if (ASCII_GRAPH.test(value)) return true;
  if (/[£]/.test(value) && /[=+\-]/.test(value)) return true;
  const letters = (value.match(/[A-Za-z]/g) ?? []).length;
  const symbols = (value.match(/[^A-Za-z0-9\s.,;:'"()?!\-$%]/g) ?? []).length;
  if (value.length >= 12 && letters > 0 && symbols >= Math.max(6, Math.ceil(letters * 0.7))) {
    return true;
  }
  return (value.match(/[=~<>_]{2,}|\.{3,}[^\s]|:\s*\.\.\.|-\s*<:/g) ?? []).length >= 2;
}

export function cleanOcrChoiceText(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[~\u223c˜]+/g, " ")
    .replace(/-{3,}|–{3,}|—{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksOcrGarbageChoice(text: string | null | undefined): boolean {
  const raw = (text ?? "").trim();
  if (!raw) return true;
  if (/^[~\-\s._]+$/.test(raw)) return true;
  const cleaned = cleanOcrChoiceText(raw);
  if (!cleaned) return true;
  return OCR_TILDE.test(cleaned) || OCR_DASH_RUN.test(cleaned);
}

export function isStudentReadableChoiceText(text: string | null | undefined): boolean {
  const raw = (text ?? "").trim();
  if (!raw || SEE_FIGURE_CHOICE.test(raw)) return false;
  const cleaned = cleanOcrChoiceText(raw);
  if (!cleaned || SEE_FIGURE_CHOICE.test(cleaned)) return false;
  if (OCR_TILDE.test(cleaned) || OCR_DASH_RUN.test(cleaned)) return false;
  if (looksFailedMathLayoutDump(raw) || looksFailedMathLayoutDump(cleaned)) return false;
  if (looksSpacedProductChoice(cleaned)) return false;
  if (looksStrippedRadicalChoice(cleaned)) return false;
  if (looksBrokenMathOcr(cleaned) && cleaned.length <= 96) return false;
  return true;
}

export function hasQuizFigure(
  question: Pick<AssignmentQuestion, "prompt" | "stimulus">,
): boolean {
  return QUIZ_IMAGE.test(`${question.stimulus ?? ""}\n${question.prompt ?? ""}`);
}

/** Hide mangled OCR when a crop is on screen — never stack both. */
export function shouldHideQuizOcrStem(
  question: Pick<AssignmentQuestion, "presentation" | "prompt" | "stimulus" | "choices" | "questionType"> & {
    figurePrimary?: boolean | null;
    figurePrimarySrc?: string | null;
  },
): boolean {
  const broken =
    looksBrokenMathOcr(question.prompt) ||
    looksGarbledQuizText(question.prompt) ||
    looksGarbledQuizText(question.stimulus);
  if (!broken) return false;
  return hasQuizFigure(question) || isFigurePrimaryQuestion(question);
}

export function shouldShowQuizChoices(
  question: Pick<AssignmentQuestion, "prompt" | "choices">,
): boolean {
  if (looksBrokenMathOcr(question.prompt)) return false;
  const dump = (question.choices ?? []).some((choice) => looksFailedMathLayoutDump(choice.text));
  if (dump) return false;
  return hasUsableChoiceText(question.choices);
}

export function hasUsableChoiceText(choices: AssignmentQuestion["choices"]): boolean {
  return (choices ?? []).filter((choice) => isStudentReadableChoiceText(choice.text)).length >= 2;
}

export function letterMcqChoices(
  existing?: AssignmentQuestion["choices"],
): NonNullable<AssignmentQuestion["choices"]> {
  return LETTER_LABELS.map((label) => {
    const found = (existing ?? []).find(
      (choice) =>
        choice.id.toLowerCase() === label.toLowerCase() || choice.label.toUpperCase() === label,
    );
    const text = cleanOcrChoiceText(found?.text);
    return {
      id: found?.id || label.toLowerCase(),
      label,
      text: isStudentReadableChoiceText(text) ? text : "",
    };
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
  if (looksBrokenMathOcr(question.prompt)) return [];
  if ((question.choices ?? []).some((choice) => looksFailedMathLayoutDump(choice.text))) {
    return [];
  }
  if (!isFigurePrimaryQuestion(question)) {
    return question.choices ?? [];
  }
  const letters = letterMcqChoices(question.choices);
  return hasUsableChoiceText(letters) ? letters : [];
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
