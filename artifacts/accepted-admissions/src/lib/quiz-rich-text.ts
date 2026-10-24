import {
  embeddedQuizTable,
  looksGarbledQuizText,
  stripSatBankFigureComments,
} from "./quiz-figure-primary.ts";

export type QuizRichPart =
  | { type: "text"; value: string; preformatted?: boolean }
  | { type: "image"; alt: string; src: string }
  | { type: "table"; headers: string[]; rows: string[][] };

const IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/g;
const CHART_HEADER_LINE = /^(?:State|Year|Age|Number|Percent|Category|Country|City)$/im;

export function isSafeQuizImageSrc(src: string): boolean {
  return /^https:\/\//i.test(src) || src.startsWith("/media/");
}

export function looksPreformattedQuizText(text: string): boolean {
  const lines = text.split("\n");
  if (lines.length < 3) return false;
  const symbolChars = (text.match(/[+|~_=<>*#\-]/g) ?? []).length;
  return symbolChars / Math.max(text.length, 1) > 0.12;
}

export function normalizeQuizProse(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .split("\n")
    .filter((line) => !CHART_HEADER_LINE.test(line.trim()))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\n(?!\n)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractPlainTextTable(text: string | null | undefined): {
  table: { headers: string[]; rows: string[][] } | null;
  remainder: string;
  before: string;
  after: string;
} {
  const trimmed = (text ?? "").trim();
  const embedded = embeddedQuizTable(text);
  if (!embedded) return { table: null, remainder: trimmed, before: trimmed, after: "" };
  const remainder = [embedded.before, embedded.after].filter(Boolean).join("\n\n");
  return {
    table: { headers: embedded.headers, rows: embedded.rows },
    remainder,
    before: embedded.before,
    after: embedded.after,
  };
}

function studentTextPart(value: string): QuizRichPart | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (looksPreformattedQuizText(trimmed)) {
    return { type: "text", value: trimmed, preformatted: true };
  }
  const normalized = normalizeQuizProse(trimmed);
  return normalized ? { type: "text", value: normalized } : null;
}

function pushProse(parts: QuizRichPart[], value: string, hideGarbledText?: boolean) {
  if (!value.trim()) return;
  const part = studentTextPart(value);
  if (part && !(hideGarbledText && looksGarbledQuizText(part.type === "text" ? part.value : ""))) {
    parts.push(part);
  }
}

function pushTextAndTables(parts: QuizRichPart[], value: string, hideGarbledText?: boolean) {
  const extracted = extractPlainTextTable(value);
  if (!extracted.table || extracted.table.rows.length < 2) {
    pushProse(parts, value, hideGarbledText);
    return;
  }
  pushProse(parts, extracted.before, hideGarbledText);
  parts.push({ type: "table", ...extracted.table });
  pushProse(parts, extracted.after, hideGarbledText);
}

/** Split quiz stimulus/prompt into text and markdown images. Unsafe URLs stay as text. */
export function splitQuizRichText(
  text: string | null | undefined,
  options?: { hideGarbledText?: boolean; hideImages?: boolean },
): QuizRichPart[] {
  if (!text) return [];
  text = stripSatBankFigureComments(text);
  if (!text) return [];
  const parts: QuizRichPart[] = [];
  let lastIndex = 0;
  const matcher = new RegExp(IMAGE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    if (match.index > lastIndex) {
      pushTextAndTables(parts, text.slice(lastIndex, match.index), options?.hideGarbledText);
    }
    const alt = match[1]?.trim() || "Figure";
    const src = match[2] ?? "";
    if (!options?.hideImages && src && isSafeQuizImageSrc(src)) {
      parts.push({ type: "image", alt, src });
    } else if (!options?.hideImages && match[0].trim()) {
      parts.push({ type: "text", value: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    pushTextAndTables(parts, text.slice(lastIndex), options?.hideGarbledText);
  }
  return parts;
}
