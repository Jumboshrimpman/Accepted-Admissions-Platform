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

export type AnswerChoice = { id: string; label: string; text: string };

function normalizeAnswerToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[(\[]/, "")
    .replace(/[.)\]]+$/, "")
    .trim();
}

/** Resolve A/B/C, a/b/c, choice id, or full choice text to the matching option. */
export function matchAnswerChoice(
  answer: string | null | undefined,
  choices?: Array<AnswerChoice> | null,
): AnswerChoice | undefined {
  const raw = answer?.trim() ?? "";
  if (!raw || !choices?.length) return undefined;
  const needle = raw.toLowerCase();
  const token = normalizeAnswerToken(raw);
  return choices.find((choice) => {
    const id = choice.id.trim().toLowerCase();
    const label = choice.label.trim().toLowerCase();
    const text = choice.text.trim().toLowerCase();
    return (
      id === needle ||
      label === needle ||
      text === needle ||
      id === token ||
      label === token ||
      `${label}. ${text}` === needle ||
      `${id}. ${text}` === needle ||
      `${label}.${text}` === needle.replace(/\s+/g, "")
    );
  });
}

/** Format a stored answer (id, label, letter, or text) for display. */
export function formatAnswer(
  answer: string | null | undefined,
  choices?: Array<AnswerChoice> | null,
): string {
  const raw = answer?.trim() ?? "";
  const match = matchAnswerChoice(raw, choices);
  if (match) {
    const label = match.label.trim();
    const text = match.text.trim();
    if (label && text) return `${label}. ${text}`;
    return text || label || raw;
  }
  return raw;
}

export function firstPresentText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export type RetryFeedbackFields = {
  outcome?: string | null;
  correct?: boolean | null;
  studentAnswer?: string | null;
  correctAnswer?: string | null;
  explanation?: string | null;
};

/** Keep a just-graded result on the card when the refetch still omits reveal fields. */
export function mergeRetryFeedback<T extends RetryFeedbackFields>(
  retry: T,
  override?: RetryFeedbackFields | null,
): T {
  if (!override) return retry;
  const pending = !retry.outcome || retry.outcome === "pending";
  return {
    ...retry,
    outcome: pending ? override.outcome ?? retry.outcome : retry.outcome,
    correct: pending ? override.correct ?? retry.correct : retry.correct,
    studentAnswer: firstPresentText(retry.studentAnswer, override.studentAnswer),
    correctAnswer: firstPresentText(retry.correctAnswer, override.correctAnswer),
    explanation: firstPresentText(retry.explanation, override.explanation),
  };
}

/** Pending retries stay open; graded ones collapse unless the tutor expands them. */
export function retryDetailsExpanded(input: {
  outcome?: string | null;
  expanded?: boolean | null;
}): boolean {
  if (!input.outcome || input.outcome === "pending") return true;
  return input.expanded === true;
}
