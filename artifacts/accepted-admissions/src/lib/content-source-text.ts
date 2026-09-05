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
