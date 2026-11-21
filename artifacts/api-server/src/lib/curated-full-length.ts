/**
 * Opt-in serve gate for a quiz built from a checked transcription.
 * Bank OCR still has to pass the usual usable-item audit. A question
 * is included only when it carries this tag and a real prompt plus either
 * four choices or a student-produced response.
 */
export const CURATED_FULL_LENGTH_TAG = "curated-full-length";

export function isCuratedFullLengthPracticeQuestion(question: {
  tags?: string[] | null;
  questionType?: string | null;
  prompt?: string | null;
  correctAnswer?: string | null;
  choices?: unknown;
}): boolean {
  if (!(question.tags ?? []).includes(CURATED_FULL_LENGTH_TAG)) return false;
  const prompt = question.prompt?.trim() ?? "";
  const answer = question.correctAnswer?.trim() ?? "";
  if (prompt.length < 12 || !answer) return false;
  const type = (question.questionType ?? "").trim().toLowerCase();
  if (type === "spr" || type === "student_produced_response" || type === "free_response") {
    return true;
  }
  const letter = answer.split(";")[0]?.trim() ?? "";
  if (!/^[a-d]$/i.test(letter)) return false;
  if (!Array.isArray(question.choices) || question.choices.length < 4) return false;
  return question.choices.every((choice) => {
    if (!choice || typeof choice !== "object") return false;
    const text = String((choice as { text?: unknown }).text ?? "").trim();
    return text.length > 0;
  });
}
