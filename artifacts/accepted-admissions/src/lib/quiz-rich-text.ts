import {
  embeddedQuizTable,
  looksGarbledQuizText,
  stripSatBankFigureComments,
} from "./quiz-figure-primary.ts";

export type QuizRichPart =
  | { type: "text"; value: string; preformatted?: boolean }
  | { type: "image"; alt: string; src: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "audio"; src: string; label: string };

/**
 * Listening audio token in a quiz stimulus or prompt:
 * `[[audio:/media/ielts-listening/part1.mp3|Part 1 recording]]`.
 * Only site-hosted `/media/` mp3/m4a/ogg/wav files are played.
 */
const AUDIO_RE = /\[\[audio:([^\]|\s]+)(?:\|([^\]\n]{0,120}))?\]\]/g;

export function isSafeQuizAudioSrc(src: string): boolean {
  return /^\/media\/[A-Za-z0-9._\-/]+\.(?:mp3|m4a|ogg|wav)$/i.test(src) && !src.includes("..");
}

/** First playable listening recording in the text, if any. */
export function quizAudioFromText(
  text: string | null | undefined,
): { src: string; label: string } | null {
  if (!text) return null;
  const matcher = new RegExp(AUDIO_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    const src = match[1]?.trim() ?? "";
    if (isSafeQuizAudioSrc(src)) return { src, label: match[2]?.trim() || "Listening recording" };
  }
  return null;
}

/** Remove audio tokens (the player is rendered separately). */
export function stripQuizAudioTokens(text: string): string {
  return text.replace(new RegExp(AUDIO_RE.source, "g"), "").replace(/^\s*\n/, "");
}

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

/**
 * IELTS-style forms, notes and option boxes keep their line breaks:
 * numbered gaps like "(7) ________" or 3+ lines such as "A  option" / "15  item".
 */
function lineListLabelValue(label: string): number {
  return /^\d+$/.test(label) ? Number(label) : 1000 + label.charCodeAt(0);
}

/**
 * IELTS-style papers: numbered gaps "(3) ____", or option boxes / item lists with
 * at least three consecutive lines labelled in sequence ("A  ...", "B  ...", "C  ..."
 * or "15 ...", "16 ...", "17 ..."). The server may collapse the double space.
 */
export function looksLineStructuredQuizText(text: string): boolean {
  if (/\(\d{1,2}\) _{5,}/.test(text)) return true;
  let run = 1;
  let previous: number | null = null;
  for (const line of text.split("\n")) {
    const match = /^(\d{1,2}|[A-H]) {1,3}[A-Za-z‘“'"][A-Za-z]/.exec(line.trim());
    const value = match ? lineListLabelValue(match[1]!) : null;
    if (value != null && previous != null && value === previous + 1) {
      run += 1;
      if (run >= 3) return true;
    } else {
      run = 1;
    }
    previous = value;
  }
  return false;
}

function studentTextPart(value: string): QuizRichPart | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (looksLineStructuredQuizText(trimmed)) {
    const lines = trimmed
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
    return { type: "text", value: lines };
  }
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
  if (looksLineStructuredQuizText(value)) {
    pushProse(parts, value, hideGarbledText);
    return;
  }
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
  options?: { hideGarbledText?: boolean; hideImages?: boolean; hideAudio?: boolean },
): QuizRichPart[] {
  if (!text) return [];
  if (new RegExp(AUDIO_RE.source).test(text)) {
    const parts: QuizRichPart[] = [];
    const matcher = new RegExp(AUDIO_RE.source, "g");
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text))) {
      parts.push(...splitQuizRichText(text.slice(lastIndex, match.index), options));
      const src = match[1]?.trim() ?? "";
      if (!options?.hideAudio && isSafeQuizAudioSrc(src)) {
        parts.push({ type: "audio", src, label: match[2]?.trim() || "Listening recording" });
      }
      lastIndex = match.index + match[0].length;
    }
    parts.push(...splitQuizRichText(text.slice(lastIndex), options));
    return parts;
  }
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
