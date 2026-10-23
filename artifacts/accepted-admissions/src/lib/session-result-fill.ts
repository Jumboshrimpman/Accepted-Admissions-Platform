/** Stored agendas still mention misses. A clean result should not. */
export function tutorNotesForSubmittedResult(
  notes: string | null | undefined,
  input: { submitted: boolean; mistakeCount: number },
): string {
  const text = notes ?? "";
  if (!input.submitted || input.mistakeCount > 0 || !text.trim()) return text;
  return text
    .replace(/five words from diagnostic misses/gi, "five words from the diagnostic passages")
    .replace(
      /which of the four diagnostic passages hurt most/gi,
      "the set was clean, so re-read one paragraph for gist versus detail",
    );
}

export function missedPreworkEmptyCopy(submitted: boolean): string {
  return submitted
    ? "No misses on the submitted pre-work. Use leftover time on harder practice."
    : "No missed items yet. They appear here after the student submits pre-work.";
}

export function recommendedPracticeEmptyCopy(input: {
  submitted: boolean;
  mistakeCount: number;
}): string {
  if (input.submitted && input.mistakeCount === 0) {
    return "No miss-based recommendations. This result was clean, so harder practice is the live plan.";
  }
  if (input.submitted) {
    return "Miss-based recommendations are already in the live plan.";
  }
  return "Recommendations will appear after a completed result.";
}
