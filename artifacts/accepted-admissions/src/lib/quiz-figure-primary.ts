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
  /(?:^|[=+\-,\s(])(?:[A-Za-z]|\d+)?x[2-9](?:\b|[+\-\s,)?])/;
const MISSING_CARET_PAREN_POWER = /\([^)\n]{1,24}\)2\b/;
const MISSING_CARET_GROWTH = /\(\d+\.\d+\)x\b/;
const SMASHED_QUADRATIC_LEAD = /\b2\s+4x\b/;
const STRIPPED_TRIANGLE_SIDES = /(?:sides of length|right triangle)[\s\S]{0,160}\b2\s+2\s*,\s*6\s+2\b/i;
const STRIPPED_RADICAL_CHOICE = /^(?:8\s+2\s*\+\s*80|\d+\s*\+\s*\d+\s+2)$/;
const BROKEN_COORDINATE = /\(\s*,\s*x\s*y\s*\)/;
const SMASHED_HX_LINE = /(?:^|\n)\s*h\s+x\s*(?:\n|$)/;
const EMPTY_PAREN_FOR_GIVEN = /\(\s*\)\s+for the given/i;
const EMPTY_FX_PARENS = /does\s+f\s*\(\s*x\s*\)\s*\(\s*\)|f\s*\(\s*x\s*\)\s*\(\s*\)\s*reach/i;
const LEADING_EQ_THEN_FX = /^=\s*(?:\([^)]+\)\s*)+f\s*\(\s*x\s*\)/m;
const SMASHED_VERTEX_LATEX = /2 \+ The function\s+\(\s*\)|The function\s+\(\s*\)\s*\(\s*[−-]?7\)/i;
const SCRAMBLED_FUNCTION_DEFINED = /\bWhat The function\b/;
const SMASHED_TABLE_CHOICE = /^x\s+\d+\s+\d+\s+\d+.*h\s*\(\s*x\s*\)/i;
const STRAY_QUESTION_FOLLOWING = /\?\s+following\b/i;
const STACKED_FRACTION_ORPHAN = /\b14x\s*=\s*2\s*w\b|\n7y\s*(?:\n|$)/;
const ORPHAN_FX_AFTER_W = /expresses\s+w[\s\S]{0,80}\bf\(x\)\s*$/i;
const SPACED_PRODUCT_CHOICE = /^(?:[A-Za-z]\s+[A-Za-z]|\d{1,3}\s+[A-Za-z])$/;
const QUIZ_IMAGE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/;
const STRAY_VALUE_EQUALS_OF = /value\s*=\s*of\b/i;
const MISSING_SEGMENT_RELATION = /\b[A-Z]{2}\s+[A-Z]{2}\.\s*What is the value/i;
const AXIS_TICK_OCR = /(?:^|\n)\s*X\s+(?:u\s+)?-?\d+(?:\s+-?\d+){2,}/i;
const SMASHED_AXIS_TICKS = /\b246810\b|\bXu\d{3,}\b/;
const BROKEN_WHERE_MODEL = /According to the [^,\n]{0,48}, where\s+model/i;
const BROKEN_END_OF_DOMAIN = /after the end of\s+0\s*[≤<]/i;
const LEAKED_NEXT_QUESTION =
  /Which expression is equivalent|Which of the following (?:systems|equations|is)|Select your answer|set a goal to walk|On a certain day,|Note:\s*Figure not drawn|lines m and n are parallel/i;
const CARET_H_OCR = /\^\s*h\b/;
const Y_FX_MISSING_EQUALS = /\by\s+f\s*\(\s*x\s*\)/;
const BROKEN_POINT_ZERO_FIVE = /point\s*,\s*0\s+5\b/i;
const QUESTION_AS_OPERATOR = /[0-9x)]\s*\?\s*\d/;
const SMASHED_TRAILING_X_EQ = /=\s*\d+\s+x\s*$/m;
const MISSING_OPERATOR_CHOICE =
  /^(?:[A-Za-z]\s+\d+|\d+\s+[A-Za-z])(?:\s*[+\-]\s*(?:\d+|[A-Za-z]))*\s*[=≤≥<>]|[=≤≥<>]\s*\d+\s+[A-Za-z]\s*$/;
const STEM_CITES_VISUAL =
  /\b(?:in the triangle shown|the triangle shown|the graph shown|the figure shown|the graph shows|the line graph|the dot plot|note:\s*figure not drawn|the graph models|y-intercept of the graph|uses data from the (?:graph|table|chart)|from the (?:graph|table|chart))\b/i;
const LABELED_GEOMETRY = /\btriangles?\s+[A-Z]{3}\b/i;
const MODULE_BOILERPLATE =
  /^(?:DIRECTIONS|STOP)\b|\bGO ON TO THE NEXT(?:\s+PAGE)?\b|\bTHIS IS THE END OF\b|\bIf you finish before time is called\b|\bUnauthorized copying or reuse\b|\bModule\s+[12](?:\s+(?:Reading|Writing|Math))?\b/;
const CONTINGENCY_WORD = /\b(?:yes|no|total|male|female|men|women|agree|disagree)\b/i;

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
  if (MISSING_CARET_POLYNOMIAL.test(raw) && !/\bx\^[2-9]\b/.test(raw)) return true;
  if (QUESTION_AS_OPERATOR.test(raw)) return true;
  if (SMASHED_TRAILING_X_EQ.test(raw)) return true;
  if (MISSING_CARET_PAREN_POWER.test(raw) && !/\)\^2\b/.test(raw)) return true;
  if (SMASHED_QUADRATIC_LEAD.test(raw)) return true;
  if (STRIPPED_TRIANGLE_SIDES.test(raw)) return true;
  if (BROKEN_COORDINATE.test(raw)) return true;
  if (SMASHED_HX_LINE.test(raw)) return true;
  if (EMPTY_PAREN_FOR_GIVEN.test(raw)) return true;
  if (EMPTY_FX_PARENS.test(raw)) return true;
  if (LEADING_EQ_THEN_FX.test(raw)) return true;
  if (SMASHED_VERTEX_LATEX.test(raw)) return true;
  if (SCRAMBLED_FUNCTION_DEFINED.test(raw)) return true;
  if (STRAY_QUESTION_FOLLOWING.test(raw)) return true;
  if (STACKED_FRACTION_ORPHAN.test(raw)) return true;
  if (ORPHAN_FX_AFTER_W.test(raw)) return true;
  if (looksCorruptStemOcr(raw)) return true;
  return false;
}

export function looksCorruptStemOcr(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (STRAY_VALUE_EQUALS_OF.test(raw)) return true;
  if (MISSING_SEGMENT_RELATION.test(raw)) return true;
  if (AXIS_TICK_OCR.test(raw)) return true;
  if (SMASHED_AXIS_TICKS.test(raw)) return true;
  if (BROKEN_WHERE_MODEL.test(raw)) return true;
  if (BROKEN_END_OF_DOMAIN.test(raw)) return true;
  if (CARET_H_OCR.test(raw)) return true;
  if (Y_FX_MISSING_EQUALS.test(raw) && !/\by\s*=\s*f\s*\(\s*x\s*\)/.test(raw)) return true;
  if (BROKEN_POINT_ZERO_FIVE.test(raw)) return true;
  if (looksPipeBackslashOcr(raw)) return true;
  return false;
}

export function looksPipeBackslashOcr(text: string | null | undefined): boolean {
  return (text ?? "").split("\n").some((line) => {
    const compact = line.trim().replace(/\s+/g, "");
    if (compact.length < 2) return false;
    if (!/^[I|\\/'`]+$/.test(compact)) return false;
    return /[|\\/]/.test(compact);
  });
}

export function looksMissingOperatorChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  if (!value) return false;
  if (/[*/÷^]/.test(value)) return false;
  if (/\b[A-Za-z]\s*[/÷]\s*-?\d/.test(value)) return false;
  return MISSING_OPERATOR_CHOICE.test(value);
}

export function looksSmashedTableChoice(text: string | null | undefined): boolean {
  return SMASHED_TABLE_CHOICE.test(cleanOcrChoiceText(text));
}

export function looksCharacterSpacedGarbage(text: string | null | undefined): boolean {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  let run = 0;
  let maxRun = 0;
  let singles = 0;
  for (const word of words) {
    if (/^[A-Za-z]$/.test(word)) {
      run += 1;
      singles += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  if (maxRun >= 6) return true;
  return words.length >= 10 && singles / words.length >= 0.55;
}

export function looksModuleBoilerplateChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  if (!value) return false;
  return MODULE_BOILERPLATE.test(value);
}

export function looksExplodedOcrTable(text: string | null | undefined): boolean {
  const value = stripSatBankFigureComments(text);
  if (!value.trim()) return false;
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const compact = value.replace(/\s+/g, " ");
  const numbers = compact.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  if (CONTINGENCY_WORD.test(compact) && numbers.length >= 6 && lines.length <= 2) return true;
  const pipes = (compact.match(/\|/g) ?? []).length;
  return pipes >= 8 && lines.length <= 2 && numbers.length >= 4;
}

/** `x > 0 y > 0` → one inequality per line so a student can read the system. */
export function formatStudentChoiceText(text: string | null | undefined): string {
  const cleaned = cleanOcrChoiceText(text);
  if (!cleaned) return "";
  return cleaned.replace(
    /([xy]\s*[<>≤≥]=?\s*-?\d+(?:\.\d+)?)(?:\s+)(?=[xy]\s*[<>≤≥])/gi,
    "$1\n",
  );
}

export function looksLeakedNextQuestionChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  return value.length > 40 && LEAKED_NEXT_QUESTION.test(value);
}

export function stemCitesVisual(text: string | null | undefined): boolean {
  const value = stripSatBankFigureComments(text);
  if (!value) return false;
  if (STEM_CITES_VISUAL.test(value)) return true;
  if (LABELED_GEOMETRY.test(value) && /\b(?:similar|congruent|shown|angle)\b/i.test(value)) {
    return true;
  }
  return /\b(?:the table|table shows)\b/i.test(value);
}

export function looksGarbledQuizText(text: string | null | undefined): boolean {
  if (/<!--\s*\/?sat-bank-figures\s*-->/i.test(text ?? "")) return true;
  const value = stripSatBankFigureComments(text);
  if (!value) return false;
  if (looksBrokenMathOcr(value)) return true;
  if (looksCharacterSpacedGarbage(value)) return true;
  if (looksExplodedOcrTable(value)) return true;
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
  if (looksLeakedNextQuestionChoice(raw) || looksLeakedNextQuestionChoice(cleaned)) return false;
  if (looksMissingOperatorChoice(raw) || looksMissingOperatorChoice(cleaned)) return false;
  if (looksSmashedTableChoice(raw) || looksSmashedTableChoice(cleaned)) return false;
  if (looksModuleBoilerplateChoice(raw) || looksModuleBoilerplateChoice(cleaned)) return false;
  if (looksCharacterSpacedGarbage(raw) || looksCharacterSpacedGarbage(cleaned)) return false;
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
    looksCorruptStemOcr(question.prompt) ||
    looksGarbledQuizText(question.prompt) ||
    looksGarbledQuizText(question.stimulus);
  if (!broken) return false;
  return hasQuizFigure(question) || isFigurePrimaryQuestion(question);
}

function isExplicitFigurePrimaryQuestion(
  question: Pick<AssignmentQuestion, "presentation" | "prompt" | "stimulus"> & {
    figurePrimary?: boolean | null;
    figurePrimarySrc?: string | null;
  },
): boolean {
  if (question.presentation === "figure_primary" || question.figurePrimary === true) return true;
  if (question.figurePrimarySrc?.trim()) return true;
  return /<!--\s*figure-primary/i.test(`${question.prompt ?? ""}\n${question.stimulus ?? ""}`);
}

/** Page-neighbor crop on a clean word problem that never cites a figure. */
export function shouldHideMismatchedQuizFigures(
  question: Pick<AssignmentQuestion, "presentation" | "prompt" | "stimulus" | "choices" | "questionType"> & {
    figurePrimary?: boolean | null;
    figurePrimarySrc?: string | null;
  },
): boolean {
  if (!hasQuizFigure(question)) return false;
  const stem = `${question.prompt ?? ""}\n${(question.stimulus ?? "").replace(/!\[[^\]]*\]\([^)]+\)/g, " ")}`;
  const broken =
    looksCorruptStemOcr(stem) ||
    looksBrokenMathOcr(question.prompt) ||
    looksGarbledQuizText(question.prompt);
  if (broken) return false;
  if (stemCitesVisual(stem)) return false;
  if (isExplicitFigurePrimaryQuestion(question) && !stripSatBankFigureComments(question.prompt)) {
    return false;
  }
  return true;
}

export function shouldShowQuizChoices(
  question: Pick<AssignmentQuestion, "prompt" | "choices">,
): boolean {
  if (looksBrokenMathOcr(question.prompt) || looksCorruptStemOcr(question.prompt)) return false;
  const dump = (question.choices ?? []).some(
    (choice) =>
      looksFailedMathLayoutDump(choice.text) ||
      looksLeakedNextQuestionChoice(choice.text) ||
      looksMissingOperatorChoice(choice.text) ||
      looksModuleBoilerplateChoice(choice.text) ||
      looksCharacterSpacedGarbage(choice.text),
  );
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
    const text = formatStudentChoiceText(found?.text);
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
  if (isExplicitFigurePrimaryQuestion(question)) return true;
  if (question.presentation === "text") return false;
  const images = /!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/.test(
    `${question.stimulus ?? ""}\n${question.prompt ?? ""}`,
  );
  const garbled =
    looksGarbledQuizText(question.prompt) || looksGarbledQuizText(question.stimulus);
  const stem = `${question.prompt ?? ""}\n${(question.stimulus ?? "").replace(/!\[[^\]]*\]\([^)]+\)/g, " ")}`;
  const cleanUncited =
    !garbled &&
    !looksCorruptStemOcr(question.prompt) &&
    !looksBrokenMathOcr(question.prompt) &&
    !stemCitesVisual(stem);
  if (cleanUncited) return false;
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
