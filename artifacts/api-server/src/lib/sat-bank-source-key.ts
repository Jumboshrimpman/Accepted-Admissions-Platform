export type ExamFamily = "sat" | "psat";
export type ExamSection = "rw" | "math";

export type BankSourceIdentity = {
  examFamily: ExamFamily;
  practiceTestNumber?: number | null;
  formCode?: string | null;
  section: ExamSection;
  module: number;
  questionNumber: number;
};

export function normalizeExamFamily(value: string | null | undefined): ExamFamily | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "sat" || raw === "digital sat" || raw === "dsat") return "sat";
  if (raw === "psat" || raw.startsWith("psat")) return "psat";
  return null;
}

export function normalizeExamSection(value: string | null | undefined): ExamSection | null {
  const raw = (value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (
    raw === "rw" ||
    raw === "readingwriting" ||
    raw === "readingandwriting" ||
    raw === "english"
  ) {
    return "rw";
  }
  if (raw === "math" || raw === "mathematics") return "math";
  return null;
}

export function collectionSlug(input: {
  examFamily: ExamFamily;
  practiceTestNumber?: number | null;
  formCode?: string | null;
}): string {
  if (input.examFamily === "sat" && input.practiceTestNumber != null) {
    return `sat-practice-test-${input.practiceTestNumber}`;
  }
  const form = (input.formCode ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (form) return `${input.examFamily}-${form}`;
  if (input.practiceTestNumber != null) {
    return `${input.examFamily}-practice-test-${input.practiceTestNumber}`;
  }
  return input.examFamily;
}

export function collectionTitle(input: {
  examFamily: ExamFamily;
  practiceTestNumber?: number | null;
  formCode?: string | null;
  title?: string | null;
}): string {
  const provided = input.title?.trim();
  if (provided) return provided;
  if (input.examFamily === "sat" && input.practiceTestNumber != null) {
    return `SAT Practice Test ${input.practiceTestNumber}`;
  }
  const form = input.formCode?.trim();
  if (form) return `${input.examFamily.toUpperCase()} ${form}`;
  return input.examFamily === "sat" ? "SAT collection" : "PSAT collection";
}

export function bankSourceKey(input: BankSourceIdentity): string {
  const family = input.examFamily;
  const testCode =
    family === "sat" && input.practiceTestNumber != null
      ? String(input.practiceTestNumber)
      : (input.formCode ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "") ||
        (input.practiceTestNumber != null ? String(input.practiceTestNumber) : "unknown");
  return `${family}:${testCode}:${input.section}:${input.module}:${input.questionNumber}`;
}

export function defaultEstimatedSeconds(input: {
  section: ExamSection;
  questionType?: string | null;
  estimatedSeconds?: number | null;
}): number {
  if (input.estimatedSeconds && input.estimatedSeconds > 0) {
    return Math.round(input.estimatedSeconds);
  }
  if (input.section === "math") {
    return input.questionType === "spr" ? 120 : 95;
  }
  return 71;
}
