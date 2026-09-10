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
  /\b(?:from the (?:graph|table|chart|figure|dot plot)|in the (?:graph|table|chart)|the (?:graph|table|chart|dot plot) (?:shows|above|represents)|data from the (?:graph|table|chart)|according to the (?:graph|table|chart)|shown (?:in|on) the (?:graph|table|chart|figure)|uses data from the (?:graph|table|chart))\b/i;
const SHORT_FUNCTION_WORDS = /^(?:a|an|the|to|of|in|on|or|and|for|as|at|by|is|it|be)$/i;
const CHART_HEADER_LINE = /^(?:State|Year|Age|Number|Percent|Category|Country|City)$/im;
const OCR_TILDE = /[~∼˜]/;
const OCR_DASH_RUN = /-{3,}|–{3,}|—{2,}/;
const BROKEN_STEM_PLACEHOLDER = /\(\s*\)\s*\?|which\s*\(\s*\)/i;
const MATH_LAYOUT_GLYPH = /[⎜⎟⎝⎠⎛⎞⎢⎥]/;
const MISSING_CARET_POLYNOMIAL =
  /(?:^|[=+\-,\s(])(?:[A-Za-z]|\d+)?x[2-9](?:\b|[+\-\s,)?])/;
const MISSING_CARET_PAREN_POWER = /\([^)\n]{1,24}\)2\b/;
const MISSING_CARET_GROWTH = /\(\d+\.\d+\)x\b/;
const SMASHED_QUADRATIC_LEAD = /\b2\s+4x\b/;
const STRIPPED_TRIANGLE_SIDES = /(?:sides of length|right triangle)[\s\S]{0,160}\b2\s+2\s*,\s*6\s+2\b/i;
const STRIPPED_RADICAL_CHOICE = /^(?:8\s+2\s*\+\s*80|\d+\s*\+\s*\d+\s+2)$/;
const BROKEN_COORDINATE = /\(\s*,\s*x\s*y\s*\)/;
const SMASHED_HX_LINE = /\bh\s+x(?:\s*$|\s*\n|\s+Which\b)/;
const EMPTY_PAREN_FOR_GIVEN = /\(\s*\)\s+for the given/i;
const EMPTY_FX_PARENS = /does\s+f\s*\(\s*x\s*\)\s*\(\s*\)|f\s*\(\s*x\s*\)\s*\(\s*\)\s*reach/i;
const LEADING_EQ_THEN_FX = /^=\s*(?:\([^)]+\)\s*)+f\s*\(\s*x\s*\)/m;
const SMASHED_VERTEX_LATEX =
  /2 \+ The function|The function\s+\(\s*[−-]?7\s*\)\s*3|metal\s+9\s*ball|f\s*\(\s*x\s*\)\s*=\s*1\s+x\b/i;
const SMASHED_CIRCLE_SQUARE = /\b2\s+2\s+(?:x|\()/;
const SMASHED_PRISM_AREA = /92\s*K\s*2\s*cm|K\s*2\s*cm\s*\.|2\s*cm\s*\.\s*square/i;
const SMASHED_SPACED_POLY = /[xy]\s+[xy](?:\s+[xy])?\s+\d(?:\s+\d){2,}\s*\?/;
const SMASHED_FX_AXIS = /\bf\s*X\s*-?2\s+2\b/i;
const SCRAMBLED_FUNCTION_DEFINED = /\bWhat\s*The function\b/;
const SMASHED_TABLE_CHOICE = /^x\s+\d+\s+\d+\s+\d+.*h\s*\(\s*x\s*\)/i;
const STRAY_QUESTION_FOLLOWING = /\?\s+following\b/i;
const STACKED_FRACTION_ORPHAN =
  /\b14x\s*=\s*2\s*w\b|\b19\s+7y\b|\b2\s+w\s*\+\s*19\s*7y\b|\n7y\s*(?:\n|$)/;
const ORPHAN_FX_AFTER_W = /expresses\s+w[\s\S]{0,80}\bf\(x\)\s*$/i;
const SPACED_PRODUCT_CHOICE = /^(?:[A-Za-z]\s+[A-Za-z]|\d{1,3}\s+[A-Za-z])$/;
const STRAY_VALUE_EQUALS_OF = /value\s*=\s*of\b/i;
const MISSING_SEGMENT_RELATION = /\b[A-Z]{2}\s+[A-Z]{2}\.\s*What is the value/i;
const AXIS_TICK_OCR = /(?:^|\n)\s*X\s+(?:u\s+)?-?\d+(?:\s+-?\d+){2,}/i;
const SMASHED_AXIS_TICKS = /\b246810\b|\bXu\d{3,}\b|\b12345678910\b/;
const AXIS_SEQUENCE_OCR =
  /(?:^|\n)\s*y\s*U?\s*1\s*2\s*3\s*4\s*5\s*6\s*7\s*8\s*9\s*10\b|\byU?12345678910\b|\by\s+U\s*12345678910\b/i;
const AXIS_LABEL_BLEED =
  /\b\d{1,2}(?:\s+\d{1,2}){3,}\s+(?:Diameter|inches)\b|\b\d{8,}Diameter\b/i;
const SMASHED_DISTRIBUTE = /[xy]\s*\d+\s*\(\s*[+\-]/;
const SMASHED_PERCENT_TABLE =
  /(?:%\s*){4,}|\b\d+\s*%\s+\d+\s*%\s+\d+\s*%/i;
const GARBLED_SIGNED_CHOICE = /=\s*[+\-]{2,}|\by\s*=\s*-\+/i;
const SMASHED_SLOPE_FRACTION = /slopeof1[–\-−]3|slope of 1[–\-−]3(?!\d)/i;
const BROKEN_WHERE_MODEL = /According to the [^,\n]{0,48}, where\s+model/i;
const BROKEN_END_OF_DOMAIN = /after the end of\s+0\s*[≤<]/i;
const LEAKED_NEXT_QUESTION =
  /Which expression is equivalent|Which of the following (?:systems|equations|is)|Select your answer|set a goal to walk|On a certain day,|Note:\s*Figure not drawn|lines m and n are parallel/i;
const CARET_H_OCR = /\^\s*h\b/;
const Y_FX_MISSING_EQUALS = /\by\s+f\s*\(\s*x\s*\)/;
const BROKEN_POINT_ZERO_FIVE = /point\s*,?\s*0(?:\s*,\s*0)?\s+5\b/i;
const RUN_ON_EQUATION =
  /([=≠]\s*-?\d+(?:\.\d+)?)\s+(?=(?:\d+\s+)?[A-Za-z]\s*[=≠])/g;
const GLUED_STEM_QUESTION = /(\d)\s*(?=(?:What|Which|Select)\b)/g;
const QUESTION_AS_OPERATOR = /[0-9x)]\s*\?\s*\d/;
// Q88 live: "16+30=190 xWhich equation..." — space before x, then the next sentence glued on.
// Also "16 + 30 = 190 x" at end of line. Do not match a legitimate "y = 3 x + 1".
const SMASHED_TRAILING_X_EQ = /=\s*\d+\s+x(?:\s*Which|[A-Z]|\s*$)/m;
const MISSING_OPERATOR_CHOICE =
  /^(?:[A-Za-z]\s+\d+|\d+\s+[A-Za-z])(?:\s*[+\-]\s*(?:\d+|[A-Za-z]))*\s*[=≤≥<>]|[=≤≥<>]\s*\d+\s+[A-Za-z]\s*$/;
const STEM_CITES_VISUAL =
  /\b(?:in the triangle shown|the triangle shown|the graph shown|the figure shown|the line graph|the dot plot|note:\s*figures? not drawn|the graph models|y-intercept of the graph|the scatterplot|line of best fit|the graph of the quadratic|vertex of the graph)\b/i;
const SMASHED_VISUAL_CITE =
  /figures?notdrawntoscale|thescatterplot|righttriangles[a-z]{0,6}ands?[a-z]{0,6}aresimilar|thetableshows|usesdatafromthetable/;
const LABELED_GEOMETRY =
  /\btriangles?\s+[A-Z]{3}\b/i;
function isAsciiGraphLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (ASCII_GRAPH.test(trimmed)) return true;
  const symbols = (trimmed.match(/[+\-|~=]/g) ?? []).length;
  return trimmed.length >= 8 && symbols / trimmed.length > 0.4;
}
const LEADING_OCR_JUNK_LINE =
  /^(?:[._~=\-:]{2,}|\.{3,}.*|[A-Z]\s*[~_]{2,}.*|[PQRSTU]\s*$|[PQRSTU]\s+[._~=\-]{2,}|X\s+(?:u\s+)?-?\d+(?:\s+-?\d+){2,}|246810)$/i;
const GEOMETRY_STEM = /\b(?:triangle|triangles|angle|similar|congruent|right triangle)\b/i;
const TABLE_STEM = /\b(?:the table|table shows|linear function|values of [xf]|f\s*\(\s*x\s*\))\b/i;
const GRAPH_STEM = /\b(?:scatterplot|scatter plot|the graph|the chart)\b/i;
const STEM_QUESTION =
  /\?|\b(?:which|what|how|find|complete the text|most nearly|according to|equation defines)\b/i;
const MODULE_BOILERPLATE =
  /^(?:DIRECTIONS|STOP)\b|\bGO ON TO THE NEXT(?:\s+PAGE)?\b|\bTHIS IS THE END OF\b|\bIf you finish before time is called\b|\bUnauthorized copying or reuse\b|\bModule\s+[12](?:\s+(?:Reading|Writing|Math))?\b/;
const SENTENCE_TABLE_HEADER =
  /^(?:which|what|how|the|for|this|that|best|most|complete)$/i;
const MATH_TABLE_HEADER = /^(?:x|y|f\(x\)|g\(x\)|h\(x\)|n|%|year|age|state|number|percent)$/i;
const CONTINGENCY_WORD = /\b(?:yes|no|total|male|female|men|women|agree|disagree)\b/i;

export function stripSatBankFigureComments(text: string | null | undefined): string {
  return (text ?? "")
    .replace(SAT_BANK_FIGURE_COMMENT, "")
    .replace(FIGURE_PRIMARY_COMMENT, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lowercase alphanumerics only — used to catch smashed OCR that lost spaces. */
export function compactExtractText(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
  const headers = block[0] ?? [];
  const rows = block.slice(1);
  if (!isPlausibleDataTable(headers, rows)) {
    return { table: null, remainder: stripSatBankFigureComments(text) };
  }
  const remainder = [...lines.slice(0, best.start), ...lines.slice(best.end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    table: { headers, rows },
    remainder,
  };
}

function isPlausibleDataTable(headers: string[], rows: string[][]): boolean {
  if (headers.length < 2 || rows.length < 2) return false;
  const cells = [...headers, ...rows.flat()];
  const numeric = cells.filter((cell) => /^-?\d+(?:\.\d+)?$/.test(cell)).length;
  const mathHeader = headers.some((header) => MATH_TABLE_HEADER.test(header));
  if (numeric === 0 && !mathHeader) return false;
  if (headers.some((header) => SENTENCE_TABLE_HEADER.test(header))) return false;
  return true;
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

/** Failed fraction / box-drawing / pipe dumps such as `w = − 19 ⎜⎜⎝ ⎟⎟⎠ y`. */
export function looksFailedMathLayoutDump(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  if (MATH_LAYOUT_GLYPH.test(value) || /[\uFFFD�]/.test(value)) return true;
  const slashes = (value.match(/[|\\/]/g) ?? []).length;
  if (value.length <= 96 && slashes >= 3 && /[=()]/.test(value)) return true;
  if (/\bF\s+\d/.test(value) && /=/.test(value) && value.length <= 64) return true;
  return false;
}

/** `b h`, `45 k` — OCR split a product that should be `bh` / `45k`. */
export function looksSpacedProductChoice(text: string | null | undefined): boolean {
  return SPACED_PRODUCT_CHOICE.test(cleanOcrChoiceText(text));
}

export function looksStrippedRadicalChoice(text: string | null | undefined): boolean {
  return STRIPPED_RADICAL_CHOICE.test(cleanOcrChoiceText(text));
}

/** `( + 15)`, trailing open `f(x) = (x+1`, or a dangling close. Keep `(-2, 3)`. */
export function looksIncompleteMathParens(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (/\(\s*[*/=]/.test(raw)) return true;
  if (/\(\s+[+\-]/.test(raw)) return true;
  let depth = 0;
  let sawParen = false;
  for (const ch of raw) {
    if (ch === "(") {
      depth += 1;
      sawParen = true;
    } else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return true;
    }
  }
  return sawParen && depth !== 0 && /[=<>≤≥]|f\s*\(|equation|expression/i.test(raw);
}

/**
 * Missing exponents, stripped radicals, stacked-fraction orphans, or
 * coordinate corruption that change the math a student would solve.
 */
export function looksBrokenMathOcr(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (looksIncompleteMathParens(raw)) return true;
  if (looksFailedMathLayoutDump(raw)) return true;
  if (MISSING_CARET_GROWTH.test(raw) && !/\(\d+\.\d+\)\^x\b/.test(raw)) return true;
  if (MISSING_CARET_POLYNOMIAL.test(raw) && !/\bx\^[2-9]\b/.test(raw)) return true;
  if (QUESTION_AS_OPERATOR.test(raw)) return true;
  if (SMASHED_TRAILING_X_EQ.test(raw)) return true;
  if (MISSING_CARET_PAREN_POWER.test(raw) && !/\)\^2\b/.test(raw)) return true;
  if (SMASHED_QUADRATIC_LEAD.test(raw)) return true;
  if (SMASHED_SLOPE_FRACTION.test(raw.replace(/\s+/g, ""))) return true;
  if (GARBLED_SIGNED_CHOICE.test(raw)) return true;
  if (STRIPPED_TRIANGLE_SIDES.test(raw)) return true;
  if (BROKEN_COORDINATE.test(raw)) return true;
  if (SMASHED_HX_LINE.test(raw)) return true;
  if (EMPTY_PAREN_FOR_GIVEN.test(raw)) return true;
  if (EMPTY_FX_PARENS.test(raw)) return true;
  if (LEADING_EQ_THEN_FX.test(raw)) return true;
  if (SMASHED_VERTEX_LATEX.test(raw)) return true;
  if (SMASHED_CIRCLE_SQUARE.test(raw)) return true;
  if (SMASHED_PRISM_AREA.test(raw)) return true;
  if (SMASHED_SPACED_POLY.test(raw)) return true;
  if (SMASHED_FX_AXIS.test(raw)) return true;
  if (SMASHED_DISTRIBUTE.test(raw)) return true;
  if (SCRAMBLED_FUNCTION_DEFINED.test(raw)) return true;
  if (STRAY_QUESTION_FOLLOWING.test(raw)) return true;
  if (STACKED_FRACTION_ORPHAN.test(raw)) return true;
  if (ORPHAN_FX_AFTER_W.test(raw)) return true;
  if (looksCorruptStemOcr(raw)) return true;
  return false;
}

/** Axis-tick dumps, missing PQ=QR, “value = of”, smashed November-2012 clauses. */
export function looksCorruptStemOcr(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (STRAY_VALUE_EQUALS_OF.test(raw)) return true;
  if (MISSING_SEGMENT_RELATION.test(raw)) return true;
  if (AXIS_TICK_OCR.test(raw)) return true;
  if (SMASHED_AXIS_TICKS.test(raw)) return true;
  if (AXIS_SEQUENCE_OCR.test(raw)) return true;
  if (AXIS_LABEL_BLEED.test(raw)) return true;
  if (BROKEN_WHERE_MODEL.test(raw)) return true;
  if (BROKEN_END_OF_DOMAIN.test(raw)) return true;
  if (CARET_H_OCR.test(raw)) return true;
  if (Y_FX_MISSING_EQUALS.test(raw) && !/\by\s*=\s*f\s*\(\s*x\s*\)/.test(raw)) return true;
  if (BROKEN_POINT_ZERO_FIVE.test(raw)) return true;
  if (looksPipeBackslashOcr(raw)) return true;
  return false;
}

/** Leftover `I \\` / `| / '` graph-line OCR under a stem. */
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

/** `T h e g r a p h s h o w s` — OCR split every letter. */
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

/** Choice D (or any choice) that leaked SAT module boilerplate. */
export function looksModuleBoilerplateChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  if (!value) return false;
  return MODULE_BOILERPLATE.test(value);
}

/** Contingency / frequency table dumped onto one or two OCR lines. */
export function looksExplodedOcrTable(text: string | null | undefined): boolean {
  const value = stripSatBankFigureComments(text);
  if (!value.trim()) return false;
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const compact = value.replace(/\s+/g, " ");
  const numbers = compact.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  if (CONTINGENCY_WORD.test(compact) && numbers.length >= 6 && lines.length <= 2) return true;
  if (
    CONTINGENCY_WORD.test(compact) &&
    numbers.length >= 8 &&
    /years old|live east|live west/i.test(compact)
  ) {
    return true;
  }
  const pipes = (compact.match(/\|/g) ?? []).length;
  if (pipes >= 8 && lines.length <= 2 && numbers.length >= 4) return true;
  const percents = (compact.match(/%/g) ?? []).length;
  if (percents >= 4 && numbers.length >= 4 && lines.length <= 3) return true;
  if (SMASHED_PERCENT_TABLE.test(compact) && numbers.length >= 4) return true;
  return false;
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

/** `s + 7 = 27 r = 3What is` → one equation per line, then the question. */
export function formatStudentStemText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(RUN_ON_EQUATION, "$1\n").replace(GLUED_STEM_QUESTION, "$1\n");
}

export function looksLeakedNextQuestionChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  return value.length > 40 && LEAKED_NEXT_QUESTION.test(value);
}

/** Stem actually cites a graph/table/shown figure — not a word-problem “triangle”. */
export function stemCitesVisual(text: string | null | undefined): boolean {
  const value = stripSatBankFigureComments(text);
  if (!value) return false;
  if (referencesVisualStimulus(value)) return true;
  if (STEM_CITES_VISUAL.test(value)) return true;
  if (LABELED_GEOMETRY.test(value) && /\b(?:similar|congruent|shown|angle)\b/i.test(value)) {
    return true;
  }
  if (TABLE_STEM.test(value) && /\b(?:table shows|the table)\b/i.test(value)) return true;
  const compact = compactExtractText(value);
  if (SMASHED_VISUAL_CITE.test(compact)) return true;
  if (compact.includes("scatterplot") || compact.includes("dotplot")) return true;
  if (compact.includes("figuresnotdrawn") || compact.includes("figurenotdrawn")) return true;
  if (compact.includes("righttriangles") && compact.includes("similar")) return true;
  if (compact.includes("thetable") && (compact.includes("shows") || compact.includes("usesdata"))) {
    return true;
  }
  return false;
}

export function hasMergedOrLeakedChoices(
  choices: Array<{ id?: string; label?: string; text?: string | null }> | null | undefined,
): boolean {
  const labels: string[] = [];
  for (const choice of choices ?? []) {
    const label = (choice.label ?? choice.id ?? "").toString().trim().toUpperCase();
    if (/^[A-D]$/.test(label)) labels.push(label);
    if (looksLeakedNextQuestionChoice(choice.text)) return true;
  }
  if (labels.length > 4) return true;
  return labels.length !== new Set(labels).size && labels.length > 4;
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
  return formatStudentStemText(value);
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
  const haystack = `${input.prompt ?? ""}\n${input.stimulus ?? ""}`;
  if (looksCharacterSpacedGarbage(prose) || looksCharacterSpacedGarbage(haystack)) return false;
  if (looksExplodedOcrTable(prose) || looksExplodedOcrTable(haystack)) return false;
  if (looksBrokenMathOcr(prose) || looksBrokenMathOcr(haystack)) {
    return false;
  }
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
  if (stemCitesVisual(stem) && /rectangle|perimeter of the triangle|third side/i.test(stem)) {
    if (/scatter|graph|chart|plot|temperature|altitude/i.test(hay)) return false;
  }
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
  const fullCrops = usable.filter((figure) => isFullQuestionCrop(figure));
  if (fullCrops.length > 0) return fullCrops.slice(0, 1);
  if (!stemCitesVisual(stem) && !recoveredTable) return [];
  const matching = usable.filter((figure) => figuresMatchStem(figure, stem, recoveredTable));
  const withoutOrphans = matching.filter((figure) => !isOrphanFigureFragment(figure, matching));
  const pool = withoutOrphans.length > 0 ? withoutOrphans : matching;
  const composite = pool.filter((figure) => isCompositeFigure(figure) || isFullQuestionCrop(figure));
  if (composite.length > 0) return composite.slice(0, 1);
  if (stemCitesVisual(stem) || GRAPH_STEM.test(stem)) {
    const preferred = pool.filter((figure) => /[-_]draw\d+/i.test(figureHay(figure)));
    if (preferred.length > 0) return preferred.slice(0, 1);
    return pool.slice(0, 1);
  }
  return pool.slice(0, 1);
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
      return letters.length >= 22 && /[a-z][A-Z]/.test(token);
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
  if (looksBrokenMathOcr(value) || looksBrokenMathOcr(raw)) return true;
  if (looksCharacterSpacedGarbage(value) || looksCharacterSpacedGarbage(raw)) return true;
  if (looksExplodedOcrTable(value) || looksExplodedOcrTable(raw)) return true;
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
  if (looksFailedMathLayoutDump(raw) || looksFailedMathLayoutDump(value)) return false;
  if (looksSpacedProductChoice(value)) return false;
  if (looksStrippedRadicalChoice(value)) return false;
  if (looksLeakedNextQuestionChoice(raw) || looksLeakedNextQuestionChoice(value)) return false;
  if (looksMissingOperatorChoice(raw) || looksMissingOperatorChoice(value)) return false;
  if (looksSmashedTableChoice(raw) || looksSmashedTableChoice(value)) return false;
  if (looksModuleBoilerplateChoice(raw) || looksModuleBoilerplateChoice(value)) return false;
  if (looksCharacterSpacedGarbage(raw) || looksCharacterSpacedGarbage(value)) return false;
  if (looksBrokenMathOcr(value) && value.length <= 96) return false;
  if (GARBLED_SIGNED_CHOICE.test(raw) || GARBLED_SIGNED_CHOICE.test(value)) return false;
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
  if (hasMergedOrLeakedChoices(choices)) return false;
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
    const text = formatStudentChoiceText(found?.text);
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
    text: isStudentReadableChoiceText(choice.text) ? formatStudentChoiceText(choice.text) : choice.text,
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
    text: isStudentReadableChoiceText(choice.text) ? formatStudentChoiceText(choice.text) : "",
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
