export type FigurePrimaryChoice = { id: string; label: string; text: string };

export type BankFigureLike = {
  url?: string;
  path?: string;
  alt?: string;
  role?: string;
  kind?: string;
  primary?: boolean;
};

export type FigurePrimaryInput = {
  prompt?: string | null;
  stimulus?: string | null;
  choices?: Array<{ id?: string; label?: string; text?: string }> | null;
  figures?: BankFigureLike[] | null;
  questionType?: string | null;
  correctAnswer?: string | null;
  extractGaps?: Record<string, unknown> | null;
  extractionNotes?: string[] | null;
  tags?: string[] | null;
  presentation?: string | null;
  figurePrimary?: boolean | null;
  figurePrimarySrc?: string | null;
};

export const FIGURE_PRIMARY = "figure_primary" as const;
export const SEE_FIGURE_CHOICE = /^(?:\(see figure\)|see figure)$/i;
const LETTER_LABELS = ["A", "B", "C", "D"] as const;
const SAT_BANK_FIGURE_COMMENT = /<!--\s*\/?sat-bank-figures\s*-->/gi;
const FIGURE_PRIMARY_COMMENT =
  /<!--\s*figure-primary(?:\s+src=(?:"([^"]+)"|'([^']+)'))?\s*-->/gi;
const ASCII_GRAPH = /\+[-+]{3,}|\|[-+|]{6,}|[0-9]+\+[-+]+/;
const COMPOSITE_HINT =
  /question[_\s-]?region|composite|full[_\s-]?question|question[_\s-]?block|primary/i;
const FULL_QUESTION_CROP =
  /including\s+(?:the\s+)?(?:choices|a[–-]d)|full[_\s-]?question|question[_\s-]?block/i;
const QUESTION_FILE = /(?:^|[/_-])question(?:-region)?\.(?:png|jpe?g|webp|gif)/i;
const GRAPH_ONLY_FILE = /[-_](?:draw|left|right|graph|table|fig)\d*/i;
const FIGURE_NOTE = /figure|graph|scatterplot|sign chart|table not recovered/i;
const VISUAL_STIMULUS_REF =
  /\b(?:from the (?:graph|table|chart|figure)|in the (?:graph|table|chart)|the (?:graph|table|chart) (?:shows|above)|data from the (?:graph|table|chart)|according to the (?:graph|table|chart)|shown (?:in|on) the (?:graph|table|chart|figure)|uses data from the (?:graph|table|chart))\b/i;
const SHORT_FUNCTION_WORDS = /^(?:a|an|the|to|of|in|on|or|and|for|as|at|by|is|it|be)$/i;
const CHART_HEADER_LINE = /^(?:State|Year|Age|Number|Percent|Category|Country|City)$/im;

export function stripSatBankFigureComments(text: string | null | undefined): string {
  return (text ?? "")
    .replace(SAT_BANK_FIGURE_COMMENT, "")
    .replace(FIGURE_PRIMARY_COMMENT, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readFigurePrimarySrc(input: FigurePrimaryInput): string | null {
  const explicit = input.figurePrimarySrc?.trim() ?? "";
  if (explicit && (/^https?:\/\//i.test(explicit) || explicit.startsWith("/media/"))) {
    return explicit;
  }
  const haystack = `${input.stimulus ?? ""}\n${input.prompt ?? ""}`;
  const match = /<!--\s*figure-primary(?:\s+src=(?:"([^"]+)"|'([^']+)'))?\s*-->/i.exec(haystack);
  const src = (match?.[1] || match?.[2] || "").trim();
  if (src && (/^https?:\/\//i.test(src) || src.startsWith("/media/"))) return src;
  return null;
}

export function primaryAnswerToken(answer: string | null | undefined): string {
  return (answer ?? "").split(";")[0]?.trim() ?? "";
}

export function isLetterAnswer(answer: string | null | undefined): boolean {
  return /^[a-d]$/i.test(primaryAnswerToken(answer));
}

export function normalizeLetterAnswer(answer: string | null | undefined): string {
  const raw = answer ?? "";
  if (!isLetterAnswer(raw)) return raw;
  return primaryAnswerToken(raw).toLowerCase();
}

export function hasMarkdownOrMediaImage(text: string | null | undefined): boolean {
  return /!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/.test(text ?? "");
}

export function resolveFigureUrl(figure: BankFigureLike | null | undefined): string | null {
  const url = figure?.url?.trim() ?? "";
  if (/^https?:\/\//i.test(url) || url.startsWith("/media/")) return url;
  return null;
}

export function isCompositeFigure(figure: BankFigureLike): boolean {
  if (figure.primary === true) return true;
  const role = `${figure.role ?? ""} ${figure.kind ?? ""}`;
  if (/question[_\s-]?region|composite/i.test(role)) return true;
  return COMPOSITE_HINT.test(`${figure.alt ?? ""} ${figure.path ?? ""} ${figure.url ?? ""}`);
}

/**
 * True only when the crop is the full SAT item (stem + A–D), not a bare
 * graph/table. "Question figure region page 11" and `p10-draw1.png` are
 * figure-only and must not unlock letter-only figure-primary.
 */
const FIGURE_ONLY_ALT =
  /\b(?:diagram|graph|table|chart|scatterplot|line graph|bar chart|figure from)\b/i;

export function isFullQuestionCrop(figure: BankFigureLike): boolean {
  const alt = figure.alt ?? "";
  const role = `${figure.role ?? ""} ${figure.kind ?? ""}`;
  const hay = `${alt} ${figure.path ?? ""} ${figure.url ?? ""}`;
  if (/question[_\s-]?region|composite/i.test(role)) return true;
  if (FULL_QUESTION_CROP.test(hay)) return true;
  if (/question\s+region/i.test(alt) && !/figure\s+region/i.test(alt)) return true;
  if (FIGURE_ONLY_ALT.test(alt)) return false;
  if (/figure\s+region/i.test(alt)) return false;
  if (GRAPH_ONLY_FILE.test(`${figure.path ?? ""} ${figure.url ?? ""}`)) return false;
  if (QUESTION_FILE.test(hay)) return true;
  return false;
}

export function hasFullQuestionCrop(input: {
  figures?: BankFigureLike[] | null;
  stimulus?: string | null;
  prompt?: string | null;
  figurePrimarySrc?: string | null;
}): boolean {
  if (readFigurePrimarySrc(input)) return true;
  if ((input.figures ?? []).some((figure) => resolveFigureUrl(figure) && isFullQuestionCrop(figure))) {
    return true;
  }
  const text = `${input.stimulus ?? ""}\n${input.prompt ?? ""}`;
  for (const match of text.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/g)) {
    if (isFullQuestionCrop({ alt: match[1], url: match[2] })) return true;
  }
  return false;
}

export function referencesVisualStimulus(text: string | null | undefined): boolean {
  return VISUAL_STIMULUS_REF.test(stripSatBankFigureComments(text));
}

export function stripChartHeaderFragments(text: string | null | undefined): string {
  return stripSatBankFigureComments(text)
    .split("\n")
    .filter((line) => !CHART_HEADER_LINE.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function selectStimulusFigures(figures: BankFigureLike[] | null | undefined): BankFigureLike[] {
  const usable = (figures ?? []).filter((figure) => resolveFigureUrl(figure));
  const composite = usable.filter(isCompositeFigure);
  return composite.length > 0 ? composite : usable;
}

export function hasRenderableFigures(input: {
  figures?: BankFigureLike[] | null;
  stimulus?: string | null;
}): boolean {
  return selectStimulusFigures(input.figures).length > 0 || hasMarkdownOrMediaImage(input.stimulus);
}

export function looksTruncatedChoiceText(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (value.length < 20) return false;
  if (/[.?!,"”']$/.test(value)) return false;
  const last = value.split(/\s+/).pop() ?? "";
  return last.length <= 2 && !SHORT_FUNCTION_WORDS.test(last);
}

function textWithoutMedia(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\/media\/\S+/gi, " ");
}

export function looksSmashedOrTruncatedExtract(text: string | null | undefined): boolean {
  const value = textWithoutMedia(stripChartHeaderFragments(text));
  if (!value) return false;
  if (
    value.split(/\s+/).some((token) => {
      const letters = token.replace(/[^A-Za-z]/g, "");
      return letters.length >= 28 && /[a-z][A-Z]/.test(token);
    })
  ) {
    return true;
  }
  const letters = (value.match(/[A-Za-z]/g) ?? []).length;
  const spaces = (value.match(/\s/g) ?? []).length;
  if (letters >= 80 && spaces < letters * 0.12) return true;
  if (value.length >= 40 && looksTruncatedChoiceText(value)) return true;
  return false;
}

export function looksGarbledExtractText(text: string | null | undefined): boolean {
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
  const junkRuns = value.match(/[=~<>_]{2,}|\.{3,}[^\s]|:\s*\.\.\.|-\s*<:/g) ?? [];
  if (junkRuns.length >= 2) return true;
  return looksSmashedOrTruncatedExtract(value);
}

export function isStudentReadableChoiceText(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value || SEE_FIGURE_CHOICE.test(value)) return false;
  if (looksTruncatedChoiceText(value)) return false;
  if (looksSmashedOrTruncatedExtract(value)) return false;
  return true;
}

export function hasUsableChoiceText(
  choices: Array<{ text?: string | null }> | null | undefined,
): boolean {
  const usable = (choices ?? []).filter((choice) => isStudentReadableChoiceText(choice.text));
  return usable.length >= 2;
}

/** Clean SAT MCQ path: all four A–D options have readable text. */
export function hasCompleteLetterChoiceText(
  choices: Array<{ id?: string; label?: string; text?: string | null }> | null | undefined,
): boolean {
  const labels = new Set<string>();
  for (const choice of choices ?? []) {
    if (!isStudentReadableChoiceText(choice.text)) continue;
    const label = (choice.label ?? choice.id ?? "").toString().trim().toUpperCase();
    if (/^[A-D]$/.test(label)) labels.add(label);
  }
  return labels.size >= 4;
}

export function letterMcqChoices(
  existing?: Array<{ id?: string; label?: string; text?: string }> | null,
): FigurePrimaryChoice[] {
  return LETTER_LABELS.map((label) => {
    const found = (existing ?? []).find((choice) => {
      const id = (choice.id ?? "").trim().toLowerCase();
      const choiceLabel = (choice.label ?? "").trim().toUpperCase();
      return id === label.toLowerCase() || choiceLabel === label;
    });
    const text = (found?.text ?? "").trim();
    return {
      id: found?.id?.trim().toLowerCase() || label.toLowerCase(),
      label,
      text: isStudentReadableChoiceText(text) ? text : "",
    };
  });
}

export function figurePrimaryStudentPrompt(prompt: string | null | undefined): string {
  const cleaned = stripChartHeaderFragments(prompt);
  if (!cleaned || looksGarbledExtractText(prompt)) return "";
  return cleaned;
}

function notesFrom(input: FigurePrimaryInput): string[] {
  const gaps = input.extractGaps ?? {};
  const fromGaps = Array.isArray(gaps.notes)
    ? gaps.notes.filter((item): item is string => typeof item === "string")
    : [];
  return [...fromGaps, ...(input.extractionNotes ?? [])];
}

export function isExplicitFigurePrimary(input: FigurePrimaryInput): boolean {
  if (input.presentation === FIGURE_PRIMARY || input.figurePrimary === true) return true;
  if (input.extractGaps?.figurePrimary === true) return true;
  if (readFigurePrimarySrc(input)) return true;
  if (input.tags?.includes(FIGURE_PRIMARY) || input.tags?.includes("figure-primary")) return true;
  return notesFrom(input).some((note) => /figure[_\s-]?primary/i.test(note));
}

/**
 * Prefer a full-question crop + A–D when OCR/text is unusable or the item was
 * misclassified as SPR but the official key is a letter.
 *
 * Graph/table-only crops never unlock letter-only mode. Clean A–D copy stays
 * a text MCQ even when a figure exists.
 */
export function shouldUseFigurePrimary(input: FigurePrimaryInput): boolean {
  const letter = isLetterAnswer(input.correctAnswer);
  const fullCrop = hasFullQuestionCrop(input);
  const completeChoices = hasCompleteLetterChoiceText(input.choices);
  const readableStem =
    stripChartHeaderFragments(input.prompt).length >= 12 &&
    !looksGarbledExtractText(input.prompt) &&
    !looksGarbledExtractText(input.stimulus);

  if (completeChoices && readableStem) return false;
  if (!letter) return false;
  if (!fullCrop) return false;

  if (isExplicitFigurePrimary(input)) return true;

  const garbled =
    looksGarbledExtractText(input.prompt) || looksGarbledExtractText(input.stimulus);
  const missingPrompt = stripSatBankFigureComments(input.prompt).length < 4;
  const missingChoices = !hasUsableChoiceText(input.choices);
  const spr = (input.questionType ?? "").toLowerCase() === "spr";
  const notes = notesFrom(input);
  const figureNoted =
    input.extractGaps?.figuresIncomplete === true || notes.some((note) => FIGURE_NOTE.test(note));

  if (spr && (garbled || missingPrompt || figureNoted || missingChoices)) return true;
  if (garbled) return true;
  if (missingPrompt || missingChoices || figureNoted) return true;
  return false;
}

export function applyFigurePrimaryToRecord<
  T extends {
    prompt: string;
    stimulus: string | null;
    choices: FigurePrimaryChoice[];
    questionType: string;
    correctAnswer: string;
    figures: BankFigureLike[];
    extractGaps: Record<string, unknown> & {
      figurePrimary?: boolean;
      notes?: string[];
      missingPrompt?: boolean;
      missingChoices?: boolean;
      figuresIncomplete?: boolean;
      spr?: boolean;
    };
    assignable?: boolean;
  },
>(record: T): T {
  const figurePrimary = shouldUseFigurePrimary({
    prompt: record.prompt,
    stimulus: record.stimulus,
    choices: record.choices,
    figures: record.figures,
    questionType: record.questionType,
    correctAnswer: record.correctAnswer,
    extractGaps: record.extractGaps,
  });
  const notes = Array.isArray(record.extractGaps.notes) ? [...record.extractGaps.notes] : [];
  if (figurePrimary && !notes.some((note) => /figure[_\s-]?primary/i.test(note))) {
    notes.push("figure_primary: serve the full question crop (including A–D) instead of OCR");
  }
  const nextType =
    figurePrimary && isLetterAnswer(record.correctAnswer) ? "mcq" : record.questionType;
  const nextChoices =
    figurePrimary && isLetterAnswer(record.correctAnswer)
      ? letterMcqChoices(record.choices)
      : record.choices;
  return {
    ...record,
    questionType: nextType,
    choices: nextChoices,
    extractGaps: {
      ...record.extractGaps,
      figurePrimary,
      notes,
    },
    assignable:
      figurePrimary && isLetterAnswer(record.correctAnswer)
        ? true
        : record.assignable,
  };
}

export function studentFacingFigurePrimaryFields(input: FigurePrimaryInput): {
  presentation: "figure_primary" | "text";
  prompt: string;
  stimulus: string | null;
  choices: FigurePrimaryChoice[] | undefined;
  questionType: string;
} {
  const figurePrimary = shouldUseFigurePrimary(input);
  const explicitSrc = readFigurePrimarySrc(input);
  const stimulus = explicitSrc
    ? `![Question region](${explicitSrc})`
    : stripSatBankFigureComments(input.stimulus);
  if (!figurePrimary) {
    return {
      presentation: "text",
      prompt:
        stripChartHeaderFragments(input.prompt) || "Question prompt is unavailable.",
      stimulus: stimulus ? stripChartHeaderFragments(stimulus) || stimulus : null,
      choices: hasUsableChoiceText(input.choices)
        ? (input.choices ?? []).map((choice, index) => ({
            id: (choice.id ?? choice.label ?? String.fromCharCode(97 + index)).toString().trim() ||
              String.fromCharCode(97 + index),
            label: (choice.label ?? choice.id ?? String.fromCharCode(65 + index)).toString(),
            text: choice.text ?? "",
          }))
        : undefined,
      questionType: input.questionType?.trim() || "multiple_choice",
    };
  }
  return {
    presentation: FIGURE_PRIMARY,
    prompt: figurePrimaryStudentPrompt(input.prompt),
    stimulus: stimulus || null,
    choices: letterMcqChoices(input.choices),
    questionType: "mcq",
  };
}
