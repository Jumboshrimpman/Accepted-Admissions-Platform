export const MIN_SOURCE_EXTRACTED_TEXT_LENGTH = 40;

export const SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE =
  "Paste at least 40 characters of authorized source text before this source can be used. A URL is optional attribution only and cannot replace the pasted text.";

export function extractedSourceTextLength(text: string | null | undefined): number {
  return text?.trim().length ?? 0;
}

export function validateExtractedSourceText(
  text: string | null | undefined,
): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = text?.trim() ?? "";
  if (trimmed.length < MIN_SOURCE_EXTRACTED_TEXT_LENGTH) {
    return { ok: false, error: SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE };
  }
  return { ok: true, text: trimmed };
}

const CONCEPT_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "first",
  "from",
  "have",
  "into",
  "lesson",
  "more",
  "other",
  "should",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "using",
  "were",
  "which",
  "while",
  "with",
  "would",
]);

/** Enough distinct words for the experimental template-draft path, even from short pasted text. */
export function conceptsForTemplateDrafts(text: string, focus: string): string[] {
  const counts = new Map<string, number>();
  const words = text
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g) ?? [];
  for (const word of words) {
    if (CONCEPT_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const extracted = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([word]) => word)
    .slice(0, 16);
  const focusWords = focus.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  const concepts = [...new Set([...focusWords, ...extracted])];
  if (concepts.length >= 2) return concepts;
  return [...new Set([...concepts, ...focusWords, "practice", "example"])].slice(0, 16);
}
