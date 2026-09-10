import { isSafeQuizImageSrc, looksPreformattedQuizText, normalizeQuizProse } from "./quiz-rich-text.ts";

export { normalizeQuizProse, looksPreformattedQuizText };

const FIGURE_COMMENT = /<!--\s*\/?\s*sat-bank-figures\s*-->/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
/** Contract for the figure-primary PR: one screenshot of question+choices, student picks A–D. */
export const FIGURE_PRIMARY_PRESENTATION = "figure_primary";
const FIGURE_PRIMARY_COMMENT =
  /<!--\s*figure-primary(?:\s+src=(?:"([^"]+)"|'([^']+)'))?\s*-->/i;
const LETTER_CHOICE_IDS = ["a", "b", "c", "d"] as const;

export type FigurePrimaryQuestionFields = {
  presentation?: string | null;
  figurePrimary?: boolean | null;
  figurePrimarySrc?: string | null;
  prompt?: string | null;
  stimulus?: string | null;
};

export type FigurePrimaryPresentation = {
  enabled: boolean;
  src: string | null;
};

export type QuizContentSegment =
  | { type: "text"; value: string }
  | { type: "image"; alt: string; src: string };

export function stripQuizHtmlComments(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(FIGURE_COMMENT, "").replace(HTML_COMMENT, "");
}

export function isUnfinishedHomeworkClientCopy(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  return (
    /homework was not finished/i.test(text) ||
    /unfinished prep/i.test(text) ||
    /live plan now carries the unfinished/i.test(text)
  );
}

export function isLiveListedSession(session: {
  bookingStatus?: string | null;
  status?: string | null;
  cancelledAt?: string | Date | null;
}): boolean {
  if (session.cancelledAt) return false;
  const booking = session.bookingStatus?.trim().toLowerCase() ?? "";
  if (booking === "cancelled" || booking === "canceled") return false;
  return (session.status ?? "").trim().toLowerCase() !== "archived";
}

export function parseQuizContent(value: string | null | undefined): QuizContentSegment[] {
  const cleaned = stripQuizHtmlComments(value).replace(/\r\n/g, "\n");
  if (!cleaned.trim()) return [];
  const segments: QuizContentSegment[] = [];
  let cursor = 0;
  for (const match of cleaned.matchAll(MARKDOWN_IMAGE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      const text = cleaned.slice(cursor, index);
      const normalized = looksPreformattedQuizText(text) ? text.trim() : normalizeQuizProse(text);
      if (normalized) segments.push({ type: "text", value: normalized });
    }
    const src = match[2]!.trim();
    if (src && isSafeQuizImageSrc(src)) {
      segments.push({ type: "image", alt: match[1] ?? "", src });
    }
    cursor = index + match[0].length;
  }
  if (cursor < cleaned.length) {
    const text = cleaned.slice(cursor);
    const normalized = looksPreformattedQuizText(text) ? text.trim() : normalizeQuizProse(text);
    if (normalized) segments.push({ type: "text", value: normalized });
  }
  return segments;
}

export function quizChoicesOrNone<T extends { id: string; label: string; text: string }>(
  choices: T[] | null | undefined,
): T[] | undefined {
  return choices && choices.length > 0 ? choices : undefined;
}

export function letterOnlyChoices(): Array<{ id: string; label: string; text: string }> {
  return LETTER_CHOICE_IDS.map((id) => ({
    id,
    label: id.toUpperCase(),
    text: id.toUpperCase(),
  }));
}

/**
 * Hook for figure-primary mode. Off unless another PR sets the flag, a
 * `figurePrimarySrc`, or `<!-- figure-primary src="…" -->`. Does not infer
 * from graphs or OCR failures.
 */
export function readFigurePrimaryPresentation(
  question: FigurePrimaryQuestionFields,
): FigurePrimaryPresentation {
  const haystack = `${question.stimulus ?? ""}\n${question.prompt ?? ""}`;
  const comment = FIGURE_PRIMARY_COMMENT.exec(haystack);
  const commentSrc = comment?.[1]?.trim() || comment?.[2]?.trim() || "";
  const explicitSrc = question.figurePrimarySrc?.trim() || "";
  const enabled =
    question.figurePrimary === true ||
    question.presentation === FIGURE_PRIMARY_PRESENTATION ||
    Boolean(explicitSrc) ||
    Boolean(comment);
  if (!enabled) return { enabled: false, src: null };
  const srcCandidate = explicitSrc || commentSrc;
  const src = srcCandidate && isSafeQuizImageSrc(srcCandidate) ? srcCandidate : null;
  return { enabled: true, src };
}
