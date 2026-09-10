import { looksGarbledQuizText, stripSatBankFigureComments } from "./quiz-figure-primary.ts";

export type QuizRichPart =
  | { type: "text"; value: string; preformatted?: boolean }
  | { type: "image"; alt: string; src: string };

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

function studentTextPart(value: string): QuizRichPart | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (looksPreformattedQuizText(trimmed)) {
    return { type: "text", value: trimmed, preformatted: true };
  }
  const normalized = normalizeQuizProse(trimmed);
  return normalized ? { type: "text", value: normalized } : null;
}

/** Split quiz stimulus/prompt into text and markdown images. Unsafe URLs stay as text. */
export function splitQuizRichText(
  text: string | null | undefined,
  options?: { hideGarbledText?: boolean },
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
      const value = text.slice(lastIndex, match.index);
      const part = studentTextPart(value);
      if (part && !(options?.hideGarbledText && looksGarbledQuizText(part.value))) {
        parts.push(part);
      }
    }
    const alt = match[1]?.trim() || "Figure";
    const src = match[2] ?? "";
    if (src && isSafeQuizImageSrc(src)) {
      parts.push({ type: "image", alt, src });
    } else if (match[0].trim()) {
      parts.push({ type: "text", value: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    const part = studentTextPart(text.slice(lastIndex));
    if (part && !(options?.hideGarbledText && looksGarbledQuizText(part.value))) {
      parts.push(part);
    }
  }
  return parts;
}
