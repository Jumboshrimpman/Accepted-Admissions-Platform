/** Drop repeated bank rows that share an id or the same prompt. */
export function dedupeListedQuestions<T extends { id: string; prompt?: string | null }>(
  questions: readonly T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const question of questions) {
    const prompt = (question.prompt ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const promptKey = prompt ? `prompt:${prompt}` : "";
    if (seen.has(question.id) || (promptKey && seen.has(promptKey))) continue;
    seen.add(question.id);
    if (promptKey) seen.add(promptKey);
    unique.push(question);
  }
  return unique;
}
