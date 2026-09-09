const MISSING_EXTRACT_SKILL_LABELS = ["skill not in extract", "skill not in pdf"];

export function isMissingExtractSkill(skill: string | null | undefined): boolean {
  const value = skill?.trim() ?? "";
  if (!value) return true;
  return MISSING_EXTRACT_SKILL_LABELS.includes(value.toLowerCase());
}

/** Never surface the College Board extract placeholder on this dashboard. */
export function displaySkill(
  skill?: string | null,
  domain?: string | null,
): string {
  if (!isMissingExtractSkill(skill)) return skill!.trim();
  const fallback = domain?.trim() ?? "";
  if (fallback && !isMissingExtractSkill(fallback)) return fallback;
  return "General";
}

export function promptSnippet(prompt?: string | null, max = 36): string {
  const text = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const broken = sliced.replace(/\s+\S*$/, "").trimEnd();
  return `${(broken || sliced).trimEnd()}…`;
}

/** Unique, scannable miss-picker label — never skill-only. */
export function missPickerLabel(
  miss: { prompt?: string | null },
  index: number,
): string {
  const snippet = promptSnippet(miss.prompt);
  return snippet ? `Q${index + 1} · ${snippet}` : `Q${index + 1}`;
}

export function retrySourceLabel(source?: string | null): string {
  if (source === "ai") return "Original practice question";
  if (source === "blocked") return "No similar question available";
  return "Similar practice question";
}

export function retryOutcomeHeading(input: {
  outcome?: string | null;
  correct?: boolean | null;
}): string | null {
  if (!input.outcome || input.outcome === "pending") return null;
  if (input.correct === true || input.outcome === "mastered") return "Correct";
  return "Incorrect";
}

export function retryRecordedMessage(input: {
  correct: boolean;
  formattedCorrectAnswer?: string | null;
  explanation?: string | null;
}): string {
  if (input.correct) return "Correct.";
  const answer = input.formattedCorrectAnswer?.trim();
  const explanation = input.explanation?.trim();
  if (answer && explanation) {
    return `Incorrect. The correct answer is ${answer}. ${explanation}`;
  }
  if (answer) return `Incorrect. The correct answer is ${answer}.`;
  return "Incorrect.";
}
