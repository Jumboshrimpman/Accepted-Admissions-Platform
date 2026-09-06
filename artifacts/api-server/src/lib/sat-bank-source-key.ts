export type ExamFamily = "sat" | "psat";
export type ExamSection = "rw" | "math";

export type BankSourceIdentity = {
  examFamily: ExamFamily;
  examVariant?: string | null;
  practiceTestNumber?: number | null;
  formCode?: string | null;
  section: ExamSection;
  module: number;
  questionNumber: number;
};

export function normalizeExamVariant(
  value: string | null | undefined,
  examFamily?: ExamFamily | null,
): string | null {
  const raw = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!raw) return examFamily ?? null;
  if (raw === "sat" || raw === "dsat" || raw === "digital_sat") return "sat";
  if (raw === "psat10" || raw === "psat_10" || raw === "10") return "psat10";
  if (raw === "psat8_9" || raw === "psat89" || raw === "8_9" || raw === "89") return "psat8_9";
  if (raw === "psat_nmsqt_10" || raw === "psatnmsqt10" || raw === "nmsqt_10") return "psat_nmsqt_10";
  if (raw === "psat_nmsqt" || raw === "nmsqt" || raw === "psatnmsqt") return "psat_nmsqt";
  if (raw.startsWith("psat")) return raw;
  return raw;
}

/** Chief of Staff stable id: `{examVariant}-pt{N}-{rw|math}-m{1|2}-q{N}` */
export function extractStableId(input: {
  examVariant: string;
  practiceTestNumber: number;
  section: ExamSection;
  module: number;
  questionNumber: number;
}): string {
  return `${input.examVariant}-pt${input.practiceTestNumber}-${input.section}-m${input.module}-q${input.questionNumber}`;
}

/**
 * Dedup across packs. The 4-tuple (family, test#, section, module, q#) collides
 * across PSAT variants (8/9 PT1 vs 10 PT1 vs NMSQT PT1), so examVariant is required.
 */
export function bankDedupKey(input: BankSourceIdentity): string {
  const variant =
    normalizeExamVariant(input.examVariant, input.examFamily) ??
    input.examFamily;
  const test =
    input.practiceTestNumber != null
      ? String(input.practiceTestNumber)
      : (input.formCode ?? "").trim().toLowerCase() || "unknown";
  return `${input.examFamily}:${variant}:${test}:${input.section}:${input.module}:${input.questionNumber}`;
}

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
  examVariant?: string | null;
  practiceTestNumber?: number | null;
  formCode?: string | null;
  packId?: string | null;
}): string {
  const pack = (input.packId ?? "").trim().toLowerCase();
  if (pack) return pack.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-");
  const variant = normalizeExamVariant(input.examVariant, input.examFamily);
  if (variant === "sat" && input.practiceTestNumber != null) {
    return `sat-practice-test-${input.practiceTestNumber}-digital`;
  }
  if (variant === "psat10" && input.practiceTestNumber != null) {
    return `psat-10-practice-test-${input.practiceTestNumber}`;
  }
  if (variant === "psat8_9" && input.practiceTestNumber != null) {
    return `psat-8-9-practice-test-${input.practiceTestNumber}`;
  }
  if (variant === "psat_nmsqt_10" && input.practiceTestNumber != null) {
    return `psat-nmsqt-10-practice-test-${input.practiceTestNumber}`;
  }
  if (variant === "psat_nmsqt" && input.practiceTestNumber != null) {
    return `psat-nmsqt-practice-test-${input.practiceTestNumber}`;
  }
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
  examVariant?: string | null;
  practiceTestNumber?: number | null;
  formCode?: string | null;
  title?: string | null;
}): string {
  const provided = input.title?.trim();
  if (provided) return provided;
  const variant = normalizeExamVariant(input.examVariant, input.examFamily);
  const n = input.practiceTestNumber;
  if (variant === "sat" && n != null) return `SAT Practice Test ${n}`;
  if (variant === "psat10" && n != null) return `PSAT 10 Practice Test ${n}`;
  if (variant === "psat8_9" && n != null) return `PSAT 8/9 Practice Test ${n}`;
  if (variant === "psat_nmsqt_10" && n != null) {
    return `PSAT/NMSQT & PSAT 10 Practice Test ${n}`;
  }
  if (variant === "psat_nmsqt" && n != null) return `PSAT/NMSQT Practice Test ${n}`;
  if (input.examFamily === "sat" && n != null) return `SAT Practice Test ${n}`;
  const form = input.formCode?.trim();
  if (form) return `${input.examFamily.toUpperCase()} ${form}`;
  return input.examFamily === "sat" ? "SAT collection" : "PSAT collection";
}

export function bankSourceKey(input: BankSourceIdentity): string {
  const variant = normalizeExamVariant(input.examVariant, input.examFamily);
  if (variant && input.practiceTestNumber != null) {
    return extractStableId({
      examVariant: variant,
      practiceTestNumber: input.practiceTestNumber,
      section: input.section,
      module: input.module,
      questionNumber: input.questionNumber,
    });
  }
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
