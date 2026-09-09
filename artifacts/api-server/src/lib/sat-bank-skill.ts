/** College Board PDF extracts omit Bluebook skill/topic. Use the section instead. */

export const MISSING_EXTRACT_SKILL_LABELS = [
  "skill not in extract",
  "skill not in pdf",
] as const;

export function quizSubject(section: string): string {
  return section === "math" ? "SAT Math" : "SAT Reading & Writing";
}

/** Coarse skill/domain label when the official extract has no Bluebook skill. */
export function sectionSkillLabel(section: string | null | undefined): string {
  return section === "math" ? "SAT Math" : "Reading and Writing";
}

export function isMissingExtractSkill(skill: string | null | undefined): boolean {
  const value = skill?.trim() ?? "";
  if (!value) return true;
  return MISSING_EXTRACT_SKILL_LABELS.includes(
    value.toLowerCase() as (typeof MISSING_EXTRACT_SKILL_LABELS)[number],
  );
}

function inferSection(input: {
  section?: string | null;
  domain?: string | null;
  subject?: string | null;
}): "math" | "rw" | null {
  const section = (input.section ?? "").trim().toLowerCase();
  if (section === "math") return "math";
  if (section === "rw") return "rw";
  const haystack = `${input.subject ?? ""} ${input.domain ?? ""}`.toLowerCase();
  if (haystack.includes("math")) return "math";
  if (haystack.includes("reading") || haystack.includes("writing")) return "rw";
  return null;
}

/**
 * Student/tutor-facing skill. Real Bluebook skills pass through; empty or
 * extract placeholders become the section label (or domain, if already set).
 */
export function skillLabelForBank(input: {
  skill?: string | null;
  section?: string | null;
  domain?: string | null;
  subject?: string | null;
}): string {
  if (!isMissingExtractSkill(input.skill)) return input.skill!.trim();
  const domain = input.domain?.trim() ?? "";
  if (domain && !isMissingExtractSkill(domain)) return domain;
  const section = inferSection(input);
  return section ? sectionSkillLabel(section) : "General";
}

/** Admin bank panel: section label plus an honest "not in PDF" note. */
export function adminBankSkillLabel(
  skill: string | null | undefined,
  section?: string | null,
): string {
  if (skill?.trim() && !isMissingExtractSkill(skill)) return skill.trim();
  return `${sectionSkillLabel(section)} · not in PDF`;
}

export function skillBreakdownFromItems(
  items: ReadonlyArray<{ skill: string; correct: boolean }>,
): Array<{ skill: string; correct: number; total: number; accuracy: number }> {
  const bySkill = new Map<string, { correct: number; total: number }>();
  for (const item of items) {
    const current = bySkill.get(item.skill) ?? { correct: 0, total: 0 };
    current.total += 1;
    if (item.correct) current.correct += 1;
    bySkill.set(item.skill, current);
  }
  return [...bySkill.entries()].map(([skill, value]) => ({
    skill,
    ...value,
    accuracy: value.total === 0 ? 0 : (value.correct / value.total) * 100,
  }));
}

export function attemptResultHasPlaceholderSkill(result: {
  items?: ReadonlyArray<{ skill?: string | null }>;
  breakdown?: ReadonlyArray<{ skill?: string | null }>;
}): boolean {
  return (
    Boolean(result.items?.some((item) => isMissingExtractSkill(item.skill))) ||
    Boolean(result.breakdown?.some((row) => isMissingExtractSkill(row.skill)))
  );
}
