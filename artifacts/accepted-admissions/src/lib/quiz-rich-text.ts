import { looksGarbledQuizText, stripSatBankFigureComments } from "./quiz-figure-primary.ts";

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

function isPlausibleDataTable(headers: string[], rows: string[][]): boolean {
  if (headers.length < 2 || rows.length < 2) return false;
  const cells = [...headers, ...rows.flat()];
  const numeric = cells.filter((cell) => /^-?\d+(?:\.\d+)?$/.test(cell)).length;
  const mathHeader = headers.some((header) =>
    /^(?:x|y|f\(x\)|g\(x\)|h\(x\)|n|%|year|age|state|number|percent)$/i.test(header),
  );
  if (numeric === 0 && !mathHeader) return false;
  if (headers.some((header) => /^(?:which|what|how|the|for|this|that|best|most|complete)$/i.test(header))) {
    return false;
  }
  if (headers.some((header) => /^-?\d+\.\d+$/.test(header))) return false;
  const hasYesNo = headers.some((header) => /^(?:yes|no)$/i.test(header));
  const hasNumericHeader = headers.some((header) => /^-?\d+(?:\.\d+)?$/.test(header));
  if (hasYesNo && hasNumericHeader) return false;
  return true;
}

export function extractPlainTextTable(text: string | null | undefined): {
  table: { headers: string[]; rows: string[][] } | null;
  remainder: string;
} {
  const lines = (text ?? "").split("\n");
  let best: { start: number; end: number } | null = null;
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
      best = { start: index, end };
    }
    index = Math.max(end, index + 1);
  }
  if (!best) return { table: null, remainder: (text ?? "").trim() };
  const block = lines.slice(best.start, best.end).map((line) => tokenizeTableLine(line));
  const headers = block[0] ?? [];
  const rows = block.slice(1);
  if (!isPlausibleDataTable(headers, rows)) {
    return { table: null, remainder: (text ?? "").trim() };
  }
  const remainder = [...lines.slice(0, best.start), ...lines.slice(best.end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { table: { headers, rows }, remainder };
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

function pushTextAndTables(parts: QuizRichPart[], value: string, hideGarbledText?: boolean) {
  const extracted = extractPlainTextTable(value);
  if (extracted.remainder) {
    const part = studentTextPart(extracted.remainder);
    if (part && !(hideGarbledText && looksGarbledQuizText(part.type === "text" ? part.value : ""))) {
      parts.push(part);
    }
  }
  if (extracted.table && extracted.table.rows.length >= 2) {
    parts.push({ type: "table", ...extracted.table });
  }
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
