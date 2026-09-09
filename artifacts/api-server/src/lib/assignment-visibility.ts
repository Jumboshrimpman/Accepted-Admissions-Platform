import { skillLabelForBank } from "./sat-bank-skill.ts";

export function isAssignmentListedForRole(
  role: string | null | undefined,
  status: string | null | undefined,
): boolean {
  if (role === "student" || role === "viewer") {
    return status !== "draft" && status !== "archived";
  }
  return true;
}

/** Course ids to query for the assignment list — never treat an explicit course as empty. */
export function courseIdsForAssignmentList(
  visibleCourseIds: readonly string[],
  courseId?: string | null,
): string[] {
  if (courseId) return [courseId];
  return [...visibleCourseIds];
}

export function assignmentDifficulty(
  value: string | null | undefined,
): "foundational" | "medium" | "hard" {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "hard") return "hard";
  if (normalized === "medium" || normalized === "moderate") return "medium";
  return "foundational";
}

export function assignmentChoices(
  value: unknown,
): Array<{ id: string; label: string; text: string }> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const choices = value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const rawId = row.id ?? row.label ?? String.fromCharCode(97 + index);
    const id = String(rawId).trim() || String.fromCharCode(97 + index);
    const label = String(row.label ?? id).trim() || id.toUpperCase();
    const text = String(row.text ?? row.value ?? "");
    return [{ id, label, text }];
  });
  return choices.length > 0 ? choices : undefined;
}

export function assignmentQuestionShape(
  question: {
    id: string;
    subject?: string | null;
    questionType?: string | null;
    prompt?: string | null;
    stimulus?: string | null;
    choices?: unknown;
    skill?: string | null;
    domain?: string | null;
    difficulty?: string | null;
    correctAnswer?: string | null;
    explanation?: string | null;
  },
  assignmentQuestion: { position: number; predictionFirst?: boolean | null },
  options?: { includeKeys?: boolean },
) {
  const shaped = {
    id: question.id,
    position: assignmentQuestion.position,
    subject: question.subject?.trim() || "SAT",
    questionType: question.questionType?.trim() || "multiple_choice",
    prompt: question.prompt?.trim() || "Question prompt is unavailable.",
    stimulus: question.stimulus ?? null,
    choices: assignmentChoices(question.choices),
    skill: skillLabelForBank({
      skill: question.skill,
      domain: question.domain,
      subject: question.subject,
    }),
    difficulty: assignmentDifficulty(question.difficulty),
    predictionFirst: Boolean(assignmentQuestion.predictionFirst),
  };
  if (!options?.includeKeys) return shaped;
  return {
    ...shaped,
    correctAnswer: question.correctAnswer?.trim() || "",
    explanation: question.explanation?.trim() || "",
  };
}

export function isFullLengthDiagnosticAssignment(input: {
  title?: string | null;
  homeworkKind?: string | null;
  questionCount?: number | null;
}): boolean {
  if (input.homeworkKind === "diagnostic") return true;
  const title = input.title?.trim().toLowerCase() ?? "";
  const count = input.questionCount ?? 0;
  if (title.includes("full-length sat diagnostic")) return true;
  if (title.includes("full sat practice diagnostic")) return true;
  return title.includes("diagnostic") && count >= 80;
}

export function pickDiagnosticKeeper<
  T extends {
    id: string;
    status: string;
    questionCount: number;
    attemptCount: number;
  },
>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((left, right) => {
    const statusScore = (status: string) =>
      status === "published" ? 2 : status === "archived" ? 0 : 1;
    const statusDelta = statusScore(right.status) - statusScore(left.status);
    if (statusDelta !== 0) return statusDelta;
    if (right.questionCount !== left.questionCount) {
      return right.questionCount - left.questionCount;
    }
    return right.attemptCount - left.attemptCount;
  })[0] ?? null;
}
