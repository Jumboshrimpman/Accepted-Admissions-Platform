export type QuizRichPart =
  | { type: "text"; value: string }
  | { type: "image"; alt: string; src: string };

const IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/media\/[^)\s]+)\)/g;

export function isSafeQuizImageSrc(src: string): boolean {
  return /^https:\/\//i.test(src) || src.startsWith("/media/");
}

/** Split quiz stimulus/prompt into text and markdown images. Unsafe URLs stay as text. */
export function splitQuizRichText(text: string | null | undefined): QuizRichPart[] {
  if (!text) return [];
  const parts: QuizRichPart[] = [];
  let lastIndex = 0;
  const matcher = new RegExp(IMAGE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    if (match.index > lastIndex) {
      const value = text.slice(lastIndex, match.index).trim();
      if (value) parts.push({ type: "text", value });
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
    const value = text.slice(lastIndex).trim();
    if (value) parts.push({ type: "text", value });
  }
  return parts;
}
