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
const OCR_TILDE = /[~∼˜]/;
const OCR_DASH_RUN = /-{3,}|–{3,}|—{2,}/;
const BROKEN_STEM_PLACEHOLDER = /\(\s*\)\s*\?|which\s*\(\s*\)/i;
function isAsciiGraphLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (ASCII_GRAPH.test(trimmed)) return true;
  const symbols = (trimmed.match(/[+\-|~=]/g) ?? []).length;
  return trimmed.length >= 8 && symbols / trimmed.length > 0.4;
}
const LEADING_OCR_JUNK_LINE =
  /^(?:[._~=\-:]{2,}|\.{3,}.*|[A-Z]\s*[~_]{2,}.*|[PQRSTU]\s*$|[PQRSTU]\s+[._~=\-]{2,})$/;
const GEOMETRY_STEM = /\b(?:triangle|triangles|angle|similar|congruent|right triangle)\b/i;
const TABLE_STEM = /\b(?:the table|table shows|linear function|values of [xf]|f\s*\(\s*x\s*\))\b/i;
const GRAPH_STEM = /\b(?:scatterplot|scatter plot|the graph|the chart)\b/i;
const STEM_QUESTION =
  /\?|\b(?:which|what|how|find|complete the text|most nearly|according to|equation defines)\b/i;

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
  if (FIGURE_ONLY_ALT.test(alt)) return false;
  if (/figure\s+region/i.test(alt)) return false;
  if (GRAPH_ONLY_FILE.test(`${figure.path ?? ""} ${figure.url ?? ""}`)) return false;
  if (FULL_QUESTION_CROP.test(hay)) return true;
  if (/question[_\s-]?region|composite/i.test(role) && FULL_QUESTION_CROP.test(hay)) return true;
  return false;
}

export function hasFullQuestionCrop(input: {
  figures?: BankFigureLike[] | null;
  stimulus?: string | null;
  prompt?: string | null;
  figurePrimarySrc?: string | null;
}): boolean {
  if ((input.figures ?? []).some((figure) => resolveFigureUrl(figure) && isFullQuestionCrop(figure))) {
    return true;
  }
  const text = `${input.stimulus ?? ""}\n${input.prompt ?? ""}`;
  for (const match of text.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/g)) {
    if (isFullQuestionCrop({ alt: match[1], url: match[2] })) return true;
  }
  const src = readFigurePrimarySrc(input);
  if (src) return isFullQuestionCrop({ url: src, alt: "", path: src });
  return false;
}

export function referencesVisualStimulus(text: string | null | undefined): boolean {
  return VISUAL_STIMULUS_REF.test(stripSatBankFigureComments(text));
}

export function stripChartHeaderFragments(text: string | null | undefined): string {
  return prepareStudentExtractText(text);
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
  if (OCR_TILDE.test(cleaned) || OCR_DASH_RUN.test(cleaned)) return true;
  return false;
}

function tokenizeTableLine(line: string): string[] {
  if (/\t/.test(line) || / {2,}/.test(line)) {
    return line.split(/\s{2,}|\t/).map((cell) => cell.trim()).filter(Boolean);
  }
  return line.trim().split(/\s+/).filter(Boolean);
}

function looksTableCell(token: string): boolean {
  if (token.length > 36) return false;
  if (/[.?!]$/.test(token) && token.length > 12) return false;
  return /^(?:[A-Za-z][A-Za-z0-9()/%]*|\d+(?:\.\d+)?|f\(x\)|x|y)$/i.test(token);
}

export function extractPlainTextTable(text: string | null | undefined): {
  table: { headers: string[]; rows: string[][] } | null;
  remainder: string;
} {
  const lines = stripSatBankFigureComments(text).split("\n");
  let best: { start: number; end: number; columns: number } | null = null;
  let index = 0;
  while (index < lines.length) {
    const cells = tokenizeTableLine(lines[index] ?? "");
    if (cells.length < 2 || !cells.every(looksTableCell)) {
      index += 1;
      continue;
    }
    const columns = cells.length;
    let end = index + 1;
    while (end < lines.length) {
      const next = tokenizeTableLine(lines[end] ?? "");
      if (next.length !== columns || !next.every(looksTableCell)) break;
      end += 1;
    }
    if (end - index >= 3 && (!best || end - index > best.end - best.start)) {
      best = { start: index, end, columns };
    }
    index = end;
  }
  if (!best) return { table: null, remainder: stripSatBankFigureComments(text) };
  const block = lines.slice(best.start, best.end).map((line) => tokenizeTableLine(line));
  const remainder = [...lines.slice(0, best.start), ...lines.slice(best.end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    table: { headers: block[0] ?? [], rows: block.slice(1) },
    remainder,
  };
}

export function hasRecoveredDataTable(text: string | null | undefined): boolean {
  const extracted = extractPlainTextTable(text);
  return Boolean(extracted.table && extracted.table.rows.length >= 2);
}

export function formatRecoveredTable(table: { headers: string[]; rows: string[][] }): string {
  const width = table.headers.length;
  const lines = [table.headers.join("\t"), ...table.rows.map((row) => row.slice(0, width).join("\t"))];
  return lines.join("\n");
}

function stripAsciiAndOcrJunkLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (CHART_HEADER_LINE.test(trimmed)) return false;
      if (isAsciiGraphLine(trimmed)) return false;
      if (LEADING_OCR_JUNK_LINE.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

export function looksBrokenStemPlaceholders(text: string | null | undefined): boolean {
  return BROKEN_STEM_PLACEHOLDER.test(text ?? "");
}

export function prepareStudentExtractText(text: string | null | undefined): string {
  let value = stripSatBankFigureComments(text);
  if (!value) return "";
  value = stripAsciiAndOcrJunkLines(value);
  value = value
    .replace(/\(\s*\)\s*\?/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return value;
}

export function hasReadableStudentStem(input: {
  prompt?: string | null;
  stimulus?: string | null;
}): boolean {
  const extracted = extractPlainTextTable(`${input.prompt ?? ""}\n${input.stimulus ?? ""}`);
  const prose = prepareStudentExtractText(extracted.remainder).replace(/\s+/g, " ").trim();
  if (prose.length < 20) return false;
  if (/^note:\s*figures not drawn to scale\.?$/i.test(prose)) return false;
  if (looksBrokenStemPlaceholders(prose)) return false;
  if (looksGarbledExtractText(prose)) return false;
  return STEM_QUESTION.test(prose);
}

function figurePageKey(figure: BankFigureLike): string | null {
  const hay = `${figure.path ?? ""} ${figure.url ?? ""}`;
  const match = hay.match(/(?:^|[/_-])(p\d+)[-_]/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function figureHay(figure: BankFigureLike): string {
  return `${figure.alt ?? ""} ${figure.path ?? ""} ${figure.url ?? ""} ${figure.role ?? ""}`;
}

export function isOrphanFigureFragment(
  figure: BankFigureLike,
  siblings: BankFigureLike[] = [],
): boolean {
  const hay = figureHay(figure);
  if (/page[_\s-]?header|question[_\s-]?number|cropped?\s+fragment|corner\s+crop/i.test(hay)) {
    return true;
  }
  const page = figurePageKey(figure);
  if (!page) return false;
  const samePage = siblings.filter((other) => figurePageKey(other) === page && resolveFigureUrl(other));
  const isImg = /[-_]img\d+/i.test(hay);
  const hasDraw = samePage.some((other) => /[-_]draw\d+/i.test(figureHay(other)));
  return isImg && hasDraw;
}

function figuresMatchStem(
  figure: BankFigureLike,
  stem: string,
  recoveredTable: boolean,
): boolean {
  const hay = figureHay(figure);
  if (TABLE_STEM.test(stem) && !GEOMETRY_STEM.test(stem) && recoveredTable) {
    return /table/i.test(hay);
  }
  if (GEOMETRY_STEM.test(stem) && /scatter|graph|chart|plot/i.test(hay) && !/triangle|angle|similar/i.test(hay)) {
    return false;
  }
  if (GRAPH_STEM.test(stem) && /triangle|angle|similar/i.test(hay)) return false;
  return true;
}

export function selectStimulusFigures(
  figures: BankFigureLike[] | null | undefined,
  context?: { prompt?: string | null; stimulus?: string | null },
): BankFigureLike[] {
  const seen = new Set<string>();
  const usable = (figures ?? []).filter((figure) => {
    const url = resolveFigureUrl(figure);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  const stem = `${context?.prompt ?? ""}\n${context?.stimulus ?? ""}`;
  const recoveredTable = hasRecoveredDataTable(stem);
  const matching = usable.filter((figure) => figuresMatchStem(figure, stem, recoveredTable));
  const withoutOrphans = matching.filter((figure) => !isOrphanFigureFragment(figure, matching));
  const pool = withoutOrphans.length > 0 ? withoutOrphans : matching;
  const composite = pool.filter((figure) => isCompositeFigure(figure) || isFullQuestionCrop(figure));
  if (composite.length > 0) return composite.slice(0, 1);
  if (GEOMETRY_STEM.test(stem) || GRAPH_STEM.test(stem)) {
    const preferred = pool.filter((figure) => /[-_]draw\d+/i.test(figureHay(figure)));
    if (preferred.length > 0) return preferred.slice(0, 1);
    return pool.slice(0, 1);
  }
  return pool;
}

export function hasRenderableFigures(input: {
  figures?: BankFigureLike[] | null;
  stimulus?: string | null;
  prompt?: string | null;
}): boolean {
  return (
    selectStimulusFigures(input.figures, input).length > 0 || hasMarkdownOrMediaImage(input.stimulus)
  );
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
  const raw = stripSatBankFigureComments(text);
  const value = prepareStudentExtractText(text);
  if (!value) return Boolean(raw);
  if (looksBrokenStemPlaceholders(text) && looksBrokenStemPlaceholders(value)) return true;
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
  const raw = (text ?? "").trim();
  if (!raw || SEE_FIGURE_CHOICE.test(raw)) return false;
  if (looksOcrGarbageChoice(raw) && !cleanOcrChoiceText(raw)) return false;
  const value = cleanOcrChoiceText(raw);
  if (!value || SEE_FIGURE_CHOICE.test(value)) return false;
  if (OCR_TILDE.test(value) || OCR_DASH_RUN.test(value)) return false;
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
    const text = cleanOcrChoiceText(found?.text);
    return {
      id: found?.id?.trim().toLowerCase() || label.toLowerCase(),
      label,
      text: isStudentReadableChoiceText(text) ? text : "",
    };
  });
}

export function figurePrimaryStudentPrompt(prompt: string | null | undefined): string {
  const cleaned = prepareStudentExtractText(prompt);
  if (!cleaned || looksGarbledExtractText(cleaned)) return "";
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
 * Figure-primary is only for a full-question crop that still has complete,
 * non-garbage A–D text. Empty, tilde/dash, or missing-stem items stay out.
 */
export function shouldUseFigurePrimary(input: FigurePrimaryInput): boolean {
  const letter = isLetterAnswer(input.correctAnswer);
  const fullCrop = hasFullQuestionCrop(input);
  const completeChoices = hasCompleteLetterChoiceText(input.choices);
  const readableStem = hasReadableStudentStem(input);

  if (!letter) return false;
  if (!completeChoices) return false;
  if (!fullCrop) return false;
  if (completeChoices && readableStem && !looksGarbledExtractText(prepareStudentExtractText(input.prompt))) {
    return false;
  }
  if (!readableStem && prepareStudentExtractText(input.prompt).length < 20) return false;
  return isExplicitFigurePrimary(input) || looksGarbledExtractText(input.prompt);
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
  const cleanedChoices = record.choices.map((choice) => ({
    ...choice,
    text: isStudentReadableChoiceText(choice.text) ? cleanOcrChoiceText(choice.text) : choice.text,
  }));
  return {
    ...record,
    prompt: prepareStudentExtractText(record.prompt) || record.prompt,
    questionType: nextType,
    choices:
      figurePrimary && isLetterAnswer(record.correctAnswer)
        ? letterMcqChoices(cleanedChoices)
        : cleanedChoices,
    extractGaps: {
      ...record.extractGaps,
      figurePrimary,
      notes,
    },
    assignable:
      figurePrimary && isLetterAnswer(record.correctAnswer) && hasCompleteLetterChoiceText(record.choices)
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
  const cleanedChoices = (input.choices ?? []).map((choice, index) => ({
    id: (choice.id ?? choice.label ?? String.fromCharCode(97 + index)).toString().trim() ||
      String.fromCharCode(97 + index),
    label: (choice.label ?? choice.id ?? String.fromCharCode(65 + index)).toString(),
    text: isStudentReadableChoiceText(choice.text) ? cleanOcrChoiceText(choice.text) : "",
  }));
  const usableChoices = hasUsableChoiceText(cleanedChoices) ? cleanedChoices : undefined;
  if (!figurePrimary) {
    return {
      presentation: "text",
      prompt: prepareStudentExtractText(input.prompt) || "Question prompt is unavailable.",
      stimulus: stimulus ? prepareStudentExtractText(stimulus) || stimulus : null,
      choices: usableChoices,
      questionType: input.questionType?.trim() || "multiple_choice",
    };
  }
  return {
    presentation: FIGURE_PRIMARY,
    prompt: figurePrimaryStudentPrompt(input.prompt),
    stimulus: stimulus || null,
    choices: hasCompleteLetterChoiceText(cleanedChoices) ? letterMcqChoices(cleanedChoices) : undefined,
    questionType: "mcq",
  };
}
