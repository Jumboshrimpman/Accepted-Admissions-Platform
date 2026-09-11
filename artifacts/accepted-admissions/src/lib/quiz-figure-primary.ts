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
const MISSING_CARET_GROWTH = /\(\d+\.\d+\)[A-Za-z]\b/;
const SMASHED_QUADRATIC_LEAD = /\b2\s+4x\b/;
const STRIPPED_TRIANGLE_SIDES = /(?:sides of length|right triangle)[\s\S]{0,160}\b2\s+2\s*,\s*6\s+2\b/i;
const STRIPPED_RADICAL_CHOICE = /^(?:8\s+2\s*\+\s*80|\d+\s*\+\s*\d+\s+2)$/;
const BROKEN_COORDINATE = /\(\s*,\s*x\s*y\s*\)|\bx\s*y\s*\(\s*,\s*\)|\(\s*,\s*\)/;
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
const SPACED_PRODUCT_CHOICE = /^(?:[A-Za-zπΠ]\s+[A-Za-zπΠ]|\d{1,3}\s+[A-Za-zπΠ])$/;
const QUIZ_IMAGE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/;
const STRAY_VALUE_EQUALS_OF = /value\s*=\s*of\b/i;
const MISSING_SEGMENT_RELATION = /\b[A-Z]{2}\s+[A-Z]{2}\.\s*(?:What|Which)\b/i;
const AXIS_TICK_OCR = /(?:^|\n)\s*X\s+(?:u\s+)?-?\d+(?:\s+-?\d+){2,}/i;
const SMASHED_AXIS_TICKS = /\b246810\b|\bXu\d{3,}\b|\b12345678910\b/;
const AXIS_LABEL_BLEED =
  /\b\d{1,2}(?:\s+\d{1,2}){3,}\s+(?:Diameter|inches)\b|\b\d{8,}Diameter\b/i;
const EXTRACTION_MARKER_COMPACT = /startreferencedcontent|endreferencedcontent/;
const SPACED_TRIANGLE_VERTICES = /\btriangles?\s+[A-Z](?:\s+[A-Z]){2}\b/i;
const SPACED_VERTEX_LABEL = /\b[A-Z](?:\s+[A-Z]){2}\b/g;
const DAT_PLOT_OCR = /\bda[tr]\s*plots?\b/i;
const REPEATED_ISOLATED_VAR = /\b([A-Za-z])\s+\1\b/;
const TRAILING_BINARY_OP = /[=+\-−×*/÷]\s*$/;
const EQUALS_THEN_PLUS = /=\s*\+\s/;
const ORPHAN_OPERATOR_EQUALS = /[+\-−×*/÷]\s*=/;
const SPACED_CHOICE_VARS = /^[A-Za-z](?:\s+[A-Za-z]){2,}\s*=/;
const DUPLICATED_MATH_IDENT = /\b([A-Za-z]{1,4})\s+\1\b/;
const SPACED_FUNCTION_NAME = /(?:^|\n)\s*[A-Za-z]\s+[A-Za-z]\s*=/;
const LEADING_EQ_SMASHED_VARS = /^=\s*\d+[^\n]{0,40}\b[A-Za-z]\s+[A-Za-z]\s*$/m;
const MISSING_CARET_GROWTH_SPACED = /\d+\.\d+\s+[A-Za-z](?:\s|$)/;
const MISSING_OPERATOR_STEM = /(?:^|\n)\s*[A-Za-z]\s+\d+\s*=/;
const STACKED_FRACTION_LINE = /=\s*[−-]?\d+\s+[A-Za-z]\s*\n\s*\d+/;
const LEADING_EQ_THEN_FX_VAR = /^=\s*.{0,48}\bf\s*\(\s*x\s*\)\s+[A-Za-z]/m;
const LEADING_INEQUALITY_SMASHED = /(?:^|\n)\s*[<>≤≥]\s*\d+[^\n]{0,28}\b[A-Za-z]\s+[A-Za-z]/;
const STACKED_EQ_NUMBERS = /=\s*\d+\s+\d+\s+[A-Za-z]/;
const SIN_COS_OCR = /\bsin\s+is\s+cos\b/i;
const SMASHED_TRIG_FN = /\b(?:sin|cos|tan)[A-Z](?:\s+\d+){0,3}\b/;
const BARE_EQ_AFTER_WORD = /\b(?:the|and|where|if|is)\s+=\s*-?\d/;
const TEO_LENGTH_OCR = /\bteo\s*length\b/i;
const HAS_HAVE_OCR = /\bhas\s*\(\s*have\s*\)/i;
const INCOMPLETE_TRAILING_ASK =
  /\b(?:what is the|of the|if [A-Z]{2}(?:\s+\d+)?|the solution to the given[^.?\n]*is)\s*$/i;
const MISSING_SEGMENT_MEASURE = /\b[A-Z]{2}\s+\d+\s+units\b/;
const SMASHED_IF_SEGMENT = /\bIf\s+[A-Z]{2}\s+\d+(?:\s+what\b|\s*$)/i;
const STRAY_COMPARISON_IN_PROSE = /\bexpression\s+[<>≤≥]\s+\w+/i;
/** Glued compact poly OCR: `2-4x-7x=` / `2 –4x –7x =`. Spaced `2 - 4x - 7x =` stays. */
const COMPACT_POLY_EQ = /(?:^|\n)\s*\d+\s*[+\-−–]\d+[A-Za-z]\s*[+\-−–]\d+[A-Za-z]\s*=/;
/**
 * Minus glued onto a coefficient×variable: `y −5x`, `y-5x`, `2 −4x`.
 * Compact SAT `x-7` / `4x-6` / `(x-7)` stays — those are not OCR smash.
 */
const GLUED_MINUS_ONTO_COEFF_VAR = /[A-Za-z0-9)\]]\s*[−–-]\d+[A-Za-z]/;
const MISSING_CARET_GROWTH_SUM = /\(1\s*\+\s*\d+(?:\.\d+)?\)[A-Za-z]\b/;
const GLUED_INEQUALITY_PAIR = /[xy]\s*[<>≤≥]=?\s*-?\d+(?:\.\d+)?[xy]\s*[<>≤≥]/;
/** `x > 0y > 0` / `0y` — digit glued onto the next variable. */
const GLUED_INEQUALITY_DIGIT_VAR = /\d[xy](?:\s*[<>≤≥]|$)/;
const INEQUALITY_ATOM = /[xy]\s*[<>≤≥]=?\s*-?\d+(?:\.\d+)?/gi;
const INEQUALITY_CONNECTOR = /\b(?:and|or)\b|[{},;]/;
const SMASHED_CHART_HEADERS =
  /average mass of plants[\s\S]{0,160}average mass of plants|grown in soil containing\s+Average mass/i;
const STACKED_SCALE_FRACTION_BOTTOM = /^(\d{1,3})\s+(times|of|the|as)\b/i;
const SMASHED_YX_PRODUCT = /\d+yx\b|\d+\s+y\s+x\b/;
const ISOLATED_I_GLYPHS = /(?:^|\n).*?\d\s+I\s+I(?:\s|$)|(?:^|\n)\s*I(?:\s+I)+\s*(?:\n|$)/;
const FLATTENED_PAREN_FRACTION = /\([^0-9)][^)]{0,24}\)[A-Za-z]/;
const MODULE_BOILERPLATE_SUFFIX =
  /\s+If you finish before time is called[\s\S]*$/i;
const FLATTENED_MIXED_ALNUM = /[A-Za-z]\d+[A-Za-z]/;
const SPACED_TRAILING_VAR_CHOICE = /^\d+[A-Za-z]\s+[A-Za-z]$/;
const TRAILING_COMMA_FRACTION = /^[−-]?\d+\/\d+,$/;
const MATH_TABLE_CITE =
  /\b(?:the table (?:shows|gives|above)|table shows|table gives|table above)\b/i;
const MATH_TABLE_CONTEXT =
  /\b(?:linear function|selected values|corresponding values|distribution of|exponential relationship|values of [xyf]|f\s*\(\s*x\s*\)|function f)\b/i;
const RW_TABLE_CITE = /\b(?:complete the text|most effectively uses data)\b/i;
const RW_OR_GENERIC_TABLE_CITE =
  /\b(?:uses data from the table|data from the table|from the table to complete)\b/i;
const CHART_HEADER_WITHOUT_TABLE_WORD =
  /\beffects of\b[\s\S]{0,100}\bon\b[\s\S]{0,160}\baverage mass\b|\baverage mass of plants\b|\bpoll results\b/i;
const LEADING_EQ_SPLIT_NUM = /^=\s*\d+\s*[+\-]\s*\d+\s+\d+/m;
const SPACED_FT_EQUALS = /\bf\s+t\s*=/;
const SMASHED_DISTRIBUTE = /[xy]\s*\d+\s*\(\s*[+\-]/;
const BROKEN_WHERE_MODEL = /According to the [^,\n]{0,48}, where\s+model/i;
const BROKEN_END_OF_DOMAIN = /after the end of\s+0\s*[≤<]/i;
const LEAKED_NEXT_QUESTION =
  /Which expression is equivalent|Which of the following (?:systems|equations|is|tables)|Select your answer|set a goal to walk|On a certain day,|Note:\s*Figure not drawn|lines m and n are parallel|The given (?:equation|system|function|inequality) relates|The solution to the given|The function f gives|monthly fee|crates in storage|facility charg|in dollars,\s*The function|Each side of equilateral|How many (?:distinct|Start referenced)|What is the (?:perimeter|value|length|area|slope)/i;
const CHOICE_DASH_TILDE_BLEED = /-{3,}~|–{3,}~|—{2,}~/;
const SMASHED_PI_STEM = /(?:^|\n|[,:;.])\s*[πΠ]\s+\d/;
const SMASHED_PI_CHOICE = /^(?:[πΠ]\s+\d+|\d+\s+[πΠ])$/;
const SPACED_DECIMAL_CHOICE = /(?:^|[^\d])-?\.\d+\s+\d|\d+\.\s+\d/;
const FLATTENED_XY_TABLE = /^(?:x\s+y|xy)\s+-?\d/i;
const FLATTENED_XY_COMPACT = /^xy-?\d/;
const MALFORMED_FRACTION_CHOICE = /^[−-]?\d+\s+\d+$/;
const SMASHED_RADICAL_RADIUS =
  /\bradius of [a-z]\s+\d|\barea of [a-z]\s+of\s+circle|\bradius of the \w+ is \d+\s+\d+\b/i;
const STRIPPED_RADICAL_MULTI = /^\d+\s+\d+\s+\d+$/;
const MISSING_CARET_LEADING = /(?:^|\n)\s*\d\s+[xy]\s*=/;
const STACKED_FRACTION_TOP = /^-?\d+(?:\s+[−+\-]\s*-?\d+)+\s*=/;
const STACKED_FRACTION_BOTTOM = /^[a-z](?:\s+[a-z]){1,5}$/i;
const CARET_H_OCR = /\^\s*h\b/;
const Y_FX_MISSING_EQUALS = /\by\s+f\s*\(\s*x\s*\)/;
const BROKEN_POINT_ZERO_FIVE = /point\s*,?\s*0(?:\s*,\s*0)?\s+5\b/i;
const RUN_ON_EQUATION =
  /([=≠]\s*-?\d+(?:\.\d+)?)\s+(?=(?:\d+\s+)?[A-Za-z]\s*[=≠])/g;
const GLUED_STEM_QUESTION = /(\d)\s*(?=(?:What|Which|Select)\b)/g;
const QUESTION_AS_OPERATOR = /[0-9x)]\s*\?\s*\d/;
// Q88 live: "16+30=190 xWhich equation..." — space before x, then the next sentence glued on.
// Also "16 + 30 = 190 x" at end of line. Do not match a legitimate "y = 3 x + 1".
const SMASHED_TRAILING_X_EQ = /=\s*\d+\s+x(?:\s+x|\s*Which|[A-Z]|\s*$)/m;
const MISSING_OPERATOR_CHOICE =
  /^(?:[A-Za-z]\s+\d+|\d+\s+[A-Za-z])(?:\s*[+\-]\s*(?:\d+|[A-Za-z]))*\s*[=≤≥<>]|[=≤≥<>]\s*\d+\s+[A-Za-z]\s*$/;
const STEM_CITES_VISUAL =
  /\b(?:in the triangle shown|the triangle shown|the graph shown|the figure shown|the circle shown|in the figure|the graph shows|the line graphed|the line graph|the dot plot|the dat plot|the histogram|note:\s*figures? not drawn|figures? not drawn to scale|the graph models|y-intercept of the (?:graph|line)|the scatterplot|uses data from the (?:graph|table|chart)|from the (?:graph|table|chart)|line of best fit|the graph of the quadratic|vertex of the graph)\b/i;
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

function compactExtractText(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function looksExtractionMarkerBleed(text: string | null | undefined): boolean {
  return EXTRACTION_MARKER_COMPACT.test(compactExtractText(text));
}

export function looksOcrFigureArt(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  const tildes = (raw.match(/[~∼˜]/g) ?? []).length;
  const commaRuns = raw.match(/,{3,}/g) ?? [];
  if (tildes >= 2 && commaRuns.length >= 1) return true;
  if (commaRuns.length >= 2) return true;
  if (tildes >= 3) return true;
  if (tildes >= 1 && /[\\/'`]/.test(raw) && /[.,]{2,}/.test(raw)) return true;
  return false;
}

export function looksAxisTickBleed(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (AXIS_LABEL_BLEED.test(raw)) return true;
  for (const line of raw.split("\n")) {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 4 || tokens.length > 12) continue;
    if (!tokens.every((token) => /^\d{1,2}$/.test(token))) continue;
    const nums = tokens.map(Number);
    let consecutive = 0;
    for (let index = 1; index < nums.length; index += 1) {
      if (Math.abs(nums[index] - nums[index - 1]) === 1) consecutive += 1;
    }
    if (consecutive >= 3) return true;
  }
  return DAT_PLOT_OCR.test(raw) && /\b\d{1,2}(?:\s+\d{1,2}){3,}\b/.test(raw);
}

export function looksSpacedGeometryLabels(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (SPACED_TRIANGLE_VERTICES.test(raw)) return true;
  const labels = raw.match(SPACED_VERTEX_LABEL) ?? [];
  return labels.length >= 2 && /triangle|similar|congruent|angle|figure/i.test(raw);
}

function looksOperatorStarvedEquation(text: string): boolean {
  const collapsed = text.replace(/([^\n])\n=\n?/g, "$1 =\n");
  for (const line of collapsed.split("\n")) {
    const trimmed = line.split(/\b(?:What|Which|How)\b/)[0]?.trim() ?? "";
    if (!trimmed || trimmed.length > 48 || !/=/.test(trimmed)) continue;
    const withoutUnary = trimmed.replace(/^[−\-]\s*/, "").replace(/=\s*[−\-]/g, "=");
    if (/[+\-−×*/÷^]/.test(withoutUnary)) continue;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const mathish = tokens.filter((token) => {
      const numeric = token.replace(/^[−–]/, "-");
      return token === "=" || /^[A-Za-z]$/.test(token) || /^-?\d/.test(numeric);
    });
    if (mathish.length >= 4) return true;
  }
  return false;
}

export function looksSmashedAlgebraText(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (looksOperatorStarvedEquation(raw)) return true;
  if (REPEATED_ISOLATED_VAR.test(raw) && (/=/.test(raw) || raw.length <= 48)) return true;
  if (SPACED_FUNCTION_NAME.test(raw)) return true;
  if (LEADING_EQ_SMASHED_VARS.test(raw)) return true;
  if (LEADING_EQ_THEN_FX_VAR.test(raw)) return true;
  if (MISSING_CARET_GROWTH_SPACED.test(raw) && /=/.test(raw)) return true;
  if (MISSING_OPERATOR_STEM.test(raw)) return true;
  if (STACKED_FRACTION_LINE.test(raw)) return true;
  if (LEADING_INEQUALITY_SMASHED.test(raw)) return true;
  if (STACKED_EQ_NUMBERS.test(raw)) return true;
  if (SIN_COS_OCR.test(raw)) return true;
  if (looksSmashedTrigToken(raw)) return true;
  if (COMPACT_POLY_EQ.test(raw)) return true;
  if (looksGluedMinusSpacing(raw)) return true;
  if (MISSING_CARET_GROWTH_SUM.test(raw) && !/\^/.test(raw)) return true;
  if (LEADING_EQ_SPLIT_NUM.test(raw)) return true;
  if (SPACED_FT_EQUALS.test(raw)) return true;
  if (MISSING_CARET_LEADING.test(raw)) return true;
  if (looksStackedFractionDump(raw)) return true;
  if (looksSmashedStackedFraction(raw)) return true;
  if (looksSmashedRadicalText(raw)) return true;
  if (looksSmashedPiToken(raw)) return true;
  if (SMASHED_YX_PRODUCT.test(raw)) return true;
  return false;
}

export function looksSmashedAlgebraChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  if (!value) return false;
  if (TRAILING_BINARY_OP.test(value) && /[A-Za-z]/.test(value)) return true;
  if (EQUALS_THEN_PLUS.test(value)) return true;
  if (ORPHAN_OPERATOR_EQUALS.test(value) && !/[<>≤≥]/.test(value)) return true;
  if (SPACED_CHOICE_VARS.test(value)) return true;
  if (DUPLICATED_MATH_IDENT.test(value) && /=/.test(value)) return true;
  if (looksOperatorStarvedEquation(value) && value.length <= 64) return true;
  if (REPEATED_ISOLATED_VAR.test(value) && /=/.test(value)) return true;
  if (looksGluedMinusSpacing(value)) return true;
  return false;
}

/**
 * Minus glued onto the next coefficient×variable (`5x`, `4x`).
 * COMPACT_POLY only saw two-term `2-4x-7x=`. Q82 `y −5x = 6` is one term.
 * Compact SAT juxtaposition stays: `x-7`, `4x-6`, `V(x)=x(x+9)(x-7)`, `x+7`, `21px`.
 * Spaced `2 - 4x` / `y - 5x` stay. Unary `−6x`, `= −6`, `(-7)` stay.
 */
export function looksGluedMinusSpacing(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  return GLUED_MINUS_ONTO_COEFF_VAR.test(raw);
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
  const value = cleanOcrChoiceText(text);
  return STRIPPED_RADICAL_CHOICE.test(value) || STRIPPED_RADICAL_MULTI.test(value);
}

/** `( + 15)`, trailing open `f(x) = (x+1`, or a dangling close. Keep `(-2, 3)`. */
export function looksIncompleteMathParens(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (/\(\s*[*/=]/.test(raw)) return true;
  if (/\(\s+[+\-−]/.test(raw)) return true;
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

export function looksBrokenMathOcr(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (looksIncompleteMathParens(raw)) return true;
  if (looksFailedMathLayoutDump(raw)) return true;
  if (MISSING_CARET_GROWTH.test(raw) && !/\(\d+\.\d+\)\^[A-Za-z]\b/.test(raw)) return true;
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
  if (looksSmashedAlgebraText(raw)) return true;
  return false;
}

export function looksCorruptStemOcr(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (STRAY_VALUE_EQUALS_OF.test(raw)) return true;
  if (MISSING_SEGMENT_RELATION.test(raw)) return true;
  if (MISSING_SEGMENT_MEASURE.test(raw)) return true;
  if (SMASHED_IF_SEGMENT.test(raw)) return true;
  if (BARE_EQ_AFTER_WORD.test(raw)) return true;
  if (TEO_LENGTH_OCR.test(raw)) return true;
  if (HAS_HAVE_OCR.test(raw)) return true;
  if (STRAY_COMPARISON_IN_PROSE.test(raw)) return true;
  if (INCOMPLETE_TRAILING_ASK.test(raw.trim())) return true;
  if (AXIS_TICK_OCR.test(raw)) return true;
  if (SMASHED_AXIS_TICKS.test(raw)) return true;
  if (AXIS_LABEL_BLEED.test(raw)) return true;
  if (looksAxisTickBleed(raw)) return true;
  if (looksSpacedGeometryLabels(raw)) return true;
  if (looksOcrFigureArt(raw)) return true;
  if (BROKEN_WHERE_MODEL.test(raw)) return true;
  if (BROKEN_END_OF_DOMAIN.test(raw)) return true;
  if (CARET_H_OCR.test(raw)) return true;
  if (Y_FX_MISSING_EQUALS.test(raw) && !/\by\s*=\s*f\s*\(\s*x\s*\)/.test(raw)) return true;
  if (BROKEN_POINT_ZERO_FIVE.test(raw)) return true;
  if (looksPipeBackslashOcr(raw)) return true;
  if (looksIsolatedIGlyphs(raw)) return true;
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

export function looksSmashedPiToken(text: string | null | undefined): boolean {
  return SMASHED_PI_STEM.test(text ?? "");
}

export function looksSmashedPiChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text).replace(/\bpi\b/gi, "π");
  return SMASHED_PI_CHOICE.test(value);
}

export function looksSpacedDecimalChoice(text: string | null | undefined): boolean {
  return SPACED_DECIMAL_CHOICE.test(cleanOcrChoiceText(text));
}

export function looksMalformedFractionChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  if (MALFORMED_FRACTION_CHOICE.test(value)) return true;
  return TRAILING_COMMA_FRACTION.test(value);
}

/** `cosQ`, `sinQ 18 18` — trig name glued to a vertex without parens/args. */
export function looksSmashedTrigToken(text: string | null | undefined): boolean {
  return SMASHED_TRIG_FN.test(text ?? "") || SMASHED_TRIG_FN.test(cleanOcrChoiceText(text));
}

/**
 * Two inequalities in one choice without `and`/`or`/brace/comma.
 * Covers `x>0y>0`, `x > 0y > 0`, bank `x > 0 y > 0`, and rematerialized
 * `x > 0\ny > 0` (admin single-line inputs smash the newline to `0y`).
 */
export function looksGluedInequalityChoice(text: string | null | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  const spaced = cleanOcrChoiceText(raw).replace(/\s+/g, " ");
  const collapsed = raw.replace(/\s+/g, "");
  if (GLUED_INEQUALITY_PAIR.test(spaced) || GLUED_INEQUALITY_PAIR.test(collapsed)) return true;
  if (GLUED_INEQUALITY_DIGIT_VAR.test(spaced) || GLUED_INEQUALITY_DIGIT_VAR.test(collapsed)) {
    return true;
  }
  const atoms = spaced.match(INEQUALITY_ATOM) ?? [];
  if (atoms.length < 2) return false;
  return !INEQUALITY_CONNECTOR.test(spaced) && !INEQUALITY_CONNECTOR.test(raw);
}

/** `42a(k+1)k`, `84ak2k`, `84a k` — slash dropped out of a fraction. */
export function looksFlattenedFractionChoice(text: string | null | undefined): boolean {
  const value = cleanOcrChoiceText(text);
  if (!value) return false;
  if (FLATTENED_PAREN_FRACTION.test(value)) return true;
  if (FLATTENED_MIXED_ALNUM.test(value) && !/\^/.test(value) && !/\//.test(value)) return true;
  return SPACED_TRAILING_VAR_CHOICE.test(value);
}

/**
 * Math stem cites a data table (`the table shows/gives`) that a student
 * must read. RW “uses data from the table to complete the text” is excluded.
 */
export function stemCitesMathDataTable(text: string | null | undefined): boolean {
  const value = stripSatBankFigureComments(text);
  if (!value || !/\btable\b/i.test(value)) return false;
  if (RW_TABLE_CITE.test(value)) return false;
  if (MATH_TABLE_CITE.test(value)) return true;
  if (MATH_TABLE_CONTEXT.test(value) && /\b(?:the table|table shows)\b/i.test(value)) return true;
  const compact = compactExtractText(value);
  return (
    compact.includes("thetableshows") ||
    compact.includes("thetablegives") ||
    compact.includes("thetableabove")
  );
}

export function stemCitesDataTable(text: string | null | undefined): boolean {
  const value = stripSatBankFigureComments(text);
  if (!value) return false;
  if (stemCitesMathDataTable(value)) return true;
  if (RW_OR_GENERIC_TABLE_CITE.test(value) || (RW_TABLE_CITE.test(value) && /\btable\b/i.test(value))) {
    return true;
  }
  if (CHART_HEADER_WITHOUT_TABLE_WORD.test(value)) return true;
  const compact = compactExtractText(value);
  return (
    compact.includes("usesdatafromthetable") ||
    compact.includes("datafromthetable") ||
    compact.includes("averagemassofplants") ||
    compact.includes("pollresults")
  );
}

export function looksSmashedRadicalText(text: string | null | undefined): boolean {
  return SMASHED_RADICAL_RADIUS.test(text ?? "");
}

export function looksSmashedYxToken(text: string | null | undefined): boolean {
  return SMASHED_YX_PRODUCT.test(text ?? "");
}

export function looksIsolatedIGlyphs(text: string | null | undefined): boolean {
  return ISOLATED_I_GLYPHS.test(text ?? "");
}

/** `12 −2 = −2` over `n t w` — stacked fraction OCR, not a readable equation. */
export function looksStackedFractionDump(text: string | null | undefined): boolean {
  const lines = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (STACKED_FRACTION_TOP.test(lines[index]) && STACKED_FRACTION_BOTTOM.test(lines[index + 1])) {
      return true;
    }
  }
  return false;
}

/**
 * Live Q85: `model is 1` / `10 times the length` — a scale-factor fraction
 * stacked as two lines with the bar dropped. Slash form `1/10 times` stays.
 */
export function looksSmashedStackedFraction(text: string | null | undefined): boolean {
  const lines = (text ?? "").split("\n");
  for (let index = 0; index < lines.length - 1; index += 1) {
    const top = (lines[index] ?? "").trim();
    const bottom = (lines[index + 1] ?? "").trim();
    if (!top || !bottom) continue;
    const topMatch = /(?:^|(?:\b(?:is|of|equals?|was|be)\s+))(\d{1,3})$/i.exec(top);
    const bottomMatch = STACKED_SCALE_FRACTION_BOTTOM.exec(bottom);
    if (!topMatch || !bottomMatch) continue;
    const numerator = Number(topMatch[1]);
    const denominator = Number(bottomMatch[1]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) continue;
    if (numerator < 1 || numerator > 12 || denominator <= numerator) continue;
    return true;
  }
  return false;
}

export function looksSmashedChartHeaders(text: string | null | undefined): boolean {
  return SMASHED_CHART_HEADERS.test(text ?? "");
}

export function looksSmashedTableChoice(text: string | null | undefined): boolean {
  const cleaned = cleanOcrChoiceText(text);
  if (!cleaned) return false;
  if (SMASHED_TABLE_CHOICE.test(cleaned)) return true;
  const compact = cleaned.replace(/\s+/g, "").toLowerCase();
  if (FLATTENED_XY_COMPACT.test(compact) && (compact.match(/\d/g) ?? []).length >= 6) {
    const lines = (text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.length <= 2;
  }
  if (FLATTENED_XY_TABLE.test(cleaned) && (cleaned.match(/-?\d+/g) ?? []).length >= 4) {
    const lines = (text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.length <= 2;
  }
  return false;
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
  if (
    CONTINGENCY_WORD.test(compact) &&
    numbers.length >= 8 &&
    /years old|live east|live west/i.test(compact)
  ) {
    return true;
  }
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

/** `s + 7 = 27 r = 3What is` → one equation per line, then the question. */
export function formatStudentStemText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(RUN_ON_EQUATION, "$1\n").replace(GLUED_STEM_QUESTION, "$1\n");
}

export function looksLeakedNextQuestionChoice(text: string | null | undefined): boolean {
  const raw = text ?? "";
  const value = cleanOcrChoiceText(text);
  if (value.length <= 40) return false;
  if (LEAKED_NEXT_QUESTION.test(value)) return true;
  return CHOICE_DASH_TILDE_BLEED.test(raw);
}

export function stemCitesVisual(text: string | null | undefined): boolean {
  const value = stripSatBankFigureComments(text);
  if (!value) return false;
  if (STEM_CITES_VISUAL.test(value)) return true;
  if (DAT_PLOT_OCR.test(value)) return true;
  if (looksSpacedGeometryLabels(value)) return true;
  if (LABELED_GEOMETRY.test(value) && /\b(?:similar|congruent|shown|angle)\b/i.test(value)) {
    return true;
  }
  if (stemCitesMathDataTable(value) || stemCitesDataTable(value)) return true;
  const compact = compactExtractText(value);
  if (compact.includes("datplot") || compact.includes("dotplot") || compact.includes("inthefigure")) {
    return true;
  }
  if (compact.includes("histogram")) return true;
  if (compact.includes("figuresnotdrawn") || compact.includes("figurenotdrawn")) return true;
  return /\b(?:the table|table shows)\b/i.test(value);
}

export function looksGarbledQuizText(text: string | null | undefined): boolean {
  if (/<!--\s*\/?sat-bank-figures\s*-->/i.test(text ?? "")) return true;
  if (looksExtractionMarkerBleed(text)) return true;
  if (looksOcrFigureArt(text)) return true;
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
    .replace(MODULE_BOILERPLATE_SUFFIX, "")
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
  if (looksSmashedPiChoice(raw) || looksSmashedPiChoice(cleaned)) return false;
  if (looksSpacedDecimalChoice(raw) || looksSpacedDecimalChoice(cleaned)) return false;
  if (looksMalformedFractionChoice(raw) || looksMalformedFractionChoice(cleaned)) return false;
  if (looksSmashedTrigToken(raw) || looksSmashedTrigToken(cleaned)) return false;
  if (looksGluedInequalityChoice(raw) || looksGluedInequalityChoice(cleaned)) return false;
  if (looksFlattenedFractionChoice(raw) || looksFlattenedFractionChoice(cleaned)) return false;
  if (looksModuleBoilerplateChoice(raw) || looksModuleBoilerplateChoice(cleaned)) return false;
  if (looksCharacterSpacedGarbage(raw) || looksCharacterSpacedGarbage(cleaned)) return false;
  if (looksSmashedAlgebraChoice(raw) || looksSmashedAlgebraChoice(cleaned)) return false;
  if (looksGluedMinusSpacing(raw) || looksGluedMinusSpacing(cleaned)) return false;
  if (looksSmashedYxToken(raw) || looksSmashedYxToken(cleaned)) return false;
  if (looksBrokenMathOcr(cleaned) && cleaned.length <= 96) return false;
  return true;
}

export function hasQuizFigure(
  question: Pick<AssignmentQuestion, "prompt" | "stimulus">,
): boolean {
  return QUIZ_IMAGE.test(`${question.stimulus ?? ""}\n${question.prompt ?? ""}`);
}

/** Recovered `x / f(x)` (or similar) data table in the stem — counts as the visual. */
export function hasRecoveredQuizTable(text: string | null | undefined): boolean {
  const lines = (text ?? "").split("\n");
  let header = false;
  let numericRows = 0;
  for (const line of lines) {
    const cells = line.trim().split(/\s+/).filter(Boolean);
    if (cells.length < 2 || cells.length > 6) continue;
    if (!cells.every((cell) => /^(?:[A-Za-z][A-Za-z0-9()/%]*|\d+(?:\.\d+)?|f\(x\)|x|y)$/i.test(cell))) {
      continue;
    }
    if (cells.some((cell) => /^(?:x|y|f\(x\)|g\(x\)|h\(x\))$/i.test(cell))) header = true;
    if (cells.some((cell) => /^-?\d+(?:\.\d+)?$/.test(cell))) numericRows += 1;
  }
  return header && numericRows >= 2;
}

function hasInlineNamedTableValues(text: string | null | undefined): boolean {
  const pairs = (text ?? "").match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\s+\d{2,}/g) ?? [];
  return pairs.length >= 2;
}

function hasUsableQuizTableData(text: string | null | undefined): boolean {
  if (looksSmashedChartHeaders(text)) return false;
  if (looksIsolatedIGlyphs(text) || looksPipeBackslashOcr(text)) {
    return hasRecoveredQuizTable(text);
  }
  return hasRecoveredQuizTable(text) || hasInlineNamedTableValues(text);
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
  question: Pick<AssignmentQuestion, "prompt" | "choices" | "presentation">,
): boolean {
  const figurePrimarySalvage = question.presentation === "figure_primary";
  if (
    !figurePrimarySalvage &&
    (looksBrokenMathOcr(question.prompt) || looksCorruptStemOcr(question.prompt))
  ) {
    return false;
  }
  const dump = (question.choices ?? []).some(
    (choice) =>
      looksFailedMathLayoutDump(choice.text) ||
      looksLeakedNextQuestionChoice(choice.text) ||
      looksMissingOperatorChoice(choice.text) ||
      looksModuleBoilerplateChoice(choice.text) ||
      looksCharacterSpacedGarbage(choice.text),
  );
  if (dump) return false;
  return hasCompleteLetterChoiceText(question.choices);
}

/** SAT A–D must all be present and readable. Two leftover keys are not enough. */
export function hasCompleteLetterChoiceText(
  choices: AssignmentQuestion["choices"],
): boolean {
  const labels = new Set<string>();
  for (const choice of choices ?? []) {
    if (!isStudentReadableChoiceText(choice.text)) continue;
    const label = (choice.label ?? choice.id ?? "").toString().trim().toUpperCase();
    if (/^[A-D]$/.test(label)) labels.add(label);
  }
  return labels.size >= 4;
}

/** Student-facing items must be answerable A–D. Never ship an unavailable-choice shell. */
export function isStudentAnswerableQuizQuestion(
  question: Pick<AssignmentQuestion, "prompt" | "stimulus" | "choices" | "presentation" | "questionType">,
): boolean {
  const figurePrimarySalvage =
    question.presentation === "figure_primary" &&
    hasQuizFigure(question) &&
    hasCompleteLetterChoiceText(question.choices);
  const stimulusText = (question.stimulus ?? "").replace(/!\[[^\]]*\]\([^)]+\)/g, " ");
  if (!figurePrimarySalvage) {
    if (looksBrokenMathOcr(question.prompt) || looksCorruptStemOcr(question.prompt)) return false;
    if (looksGarbledQuizText(question.prompt) || looksGarbledQuizText(stimulusText)) return false;
  }
  const stem = `${question.prompt ?? ""}\n${stimulusText}`;
  const tableHaystack = `${question.prompt ?? ""}\n${stimulusText}`;
  if (stemCitesDataTable(stem) && !hasUsableQuizTableData(tableHaystack)) {
    return false;
  }
  if (stemCitesMathDataTable(stem) && !hasUsableQuizTableData(tableHaystack)) {
    return false;
  }
  const mathVisualCite =
    stemCitesVisual(stem) &&
    (stemCitesMathDataTable(stem) ||
      /\b(?:xy[- ]plane|vertex of the graph|scatterplot|dot plot|histogram|in the (?:figure|triangle|graph)|the triangle shown|the graph shown)\b/i.test(
        stem,
      ));
  if (mathVisualCite && !hasUsableQuizTableData(tableHaystack) && question.presentation !== "figure_primary") {
    return false;
  }
  if (
    stemCitesVisual(stem) &&
    !hasQuizFigure(question) &&
    !hasRecoveredQuizTable(tableHaystack) &&
    !hasUsableQuizTableData(tableHaystack)
  ) {
    return false;
  }
  const raw = isFigurePrimaryQuestion(question)
    ? figurePrimaryChoices(question)
    : (question.choices ?? []).map((choice) => ({
        ...choice,
        text: formatStudentChoiceText(choice.text),
      }));
  const choices = raw.filter((choice) => isStudentReadableChoiceText(choice.text));
  return shouldShowQuizChoices({ ...question, choices }) && hasCompleteLetterChoiceText(choices);
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
  if (looksBrokenMathOcr(question.prompt) && question.presentation !== "figure_primary") return [];
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
