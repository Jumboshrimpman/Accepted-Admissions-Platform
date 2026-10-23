/** College Board PDF extracts omit Bluebook skill/topic. Use the section instead. */

export const MISSING_EXTRACT_SKILL_LABELS = [
  "skill not in extract",
  "skill not in pdf",
] as const;

export function quizSubject(section: string, examFamily?: string | null): string {
  if ((examFamily ?? "").trim().toLowerCase() === "ielts") {
    return section === "writing" ? "IELTS Writing" : "IELTS Reading";
  }
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

const COARSE_SECTION_KEYS = new Set([
  "math",
  "sat math",
  "reading",
  "writing",
  "reading and writing",
  "sat reading and writing",
  "sat reading writing",
  "general",
  "english",
  "rw",
  "r and w",
]);

/** Normalize SAT Math / Math and RW aliases to a single comparison key. */
export function normalizeFocusKey(label: string | null | undefined): string {
  return (label ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Coarse section names are not skills. "Math", "SAT Math", and
 * "Reading and Writing" should never be dumped as a flagged-skill list.
 */
export function isCoarseSectionLabel(label: string | null | undefined): boolean {
  if (isMissingExtractSkill(label)) return true;
  return COARSE_SECTION_KEYS.has(normalizeFocusKey(label));
}

/** Distinct, tutor-useful focus labels — never Math + SAT Math + RW noise. */
/** Coaching filler must not be treated as a skill to practice. */
export function isGuidanceFiller(label: string | null | undefined): boolean {
  return /no major weakness|no repeated missed|no incorrect|those misses are/i.test(
    label ?? "",
  );
}

export function usefulFocusLabels(labels: readonly string[], limit = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.replace(/\s*\(\d+% accuracy\)\s*$/i, "").trim();
    if (!label || isCoarseSectionLabel(label) || isGuidanceFiller(label)) continue;
    const key = normalizeFocusKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

function isSatSubject(subject: string | null | undefined): boolean {
  const value = subject ?? "";
  return /\b(sat|psat)\b/i.test(value) && !/\bielts\b/i.test(value);
}

/** SAT Bluebook domain. The word "English" here is not an IELTS/English quiz. */
export function isStandardEnglishConventions(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "standard english conventions";
}

/**
 * IELTS/English comes from the quiz exam family, assignment title, or session
 * subject. Item domains are ignored. "Standard English Conventions" and SAT
 * subjects never count.
 */
export function isIeltsSkillContext(input: {
  section?: string | null;
  domain?: string | null;
  subject?: string | null;
  examFamily?: string | null;
  assignmentTitle?: string | null;
}): boolean {
  if (isStandardEnglishConventions(input.domain) || isStandardEnglishConventions(input.subject)) {
    return false;
  }
  const family = (input.examFamily ?? "").trim().toLowerCase();
  if (family === "sat" || family === "psat") return false;
  if (family === "ielts") return true;
  const subjectIsSat = isSatSubject(input.subject);
  const section = (input.section ?? "").trim().toLowerCase();
  if ((section === "reading" || section === "writing") && !subjectIsSat) return true;
  const identity = `${input.assignmentTitle ?? ""} ${input.subject ?? ""}`;
  if (/\bielts\b/i.test(identity)) return true;
  if (subjectIsSat) return false;
  return /\benglish\b/i.test(identity);
}

export function ieltsSkillFallback(input: {
  section?: string | null;
  domain?: string | null;
  subject?: string | null;
}): "IELTS Reading" | "IELTS Writing" {
  const blob = `${input.subject ?? ""} ${input.domain ?? ""} ${input.section ?? ""}`.toLowerCase();
  if (blob.includes("writing") && !blob.includes("reading")) return "IELTS Writing";
  return "IELTS Reading";
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
  const skill = input.skill?.trim() ?? "";
  if (skill && !isCoarseSectionLabel(skill)) return skill;
  const domain = input.domain?.trim() ?? "";
  if (domain && !isCoarseSectionLabel(domain)) return domain;
  if (isIeltsSkillContext(input)) return ieltsSkillFallback(input);
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
