import {
  hasUsableChoiceText,
  studentFacingFigurePrimaryFields,
} from "./sat-bank-figure-primary.ts";
import { skillLabelForBank } from "./sat-bank-skill.ts";
import { TAITO_STUDENT_EMAIL } from "./session-schedule.ts";
import { repairMichelleQuizMathText } from "./stacked-math-notation.ts";

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

const LETTER_CHOICE_IDS = ["a", "b", "c", "d"] as const;

export function isLetterMultipleChoiceAnswer(value: string | null | undefined): boolean {
  return /^[a-d]$/i.test(value?.trim() ?? "");
}

export function letterMultipleChoiceChoices(): Array<{ id: string; label: string; text: string }> {
  return LETTER_CHOICE_IDS.map((id) => ({
    id,
    label: id.toUpperCase(),
    text: id.toUpperCase(),
  }));
}

/** Shared with the student renderer. Other PRs can set this or `<!-- figure-primary src="…" -->`. */
export const FIGURE_PRIMARY_PRESENTATION = "figure_primary";

/** Prod SAT/PSAT import wraps figure markdown in these comments; they must never reach students. */
export function stripBankFigureComments(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<!--\s*\/?\s*sat-bank-figures\s*-->/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isUnfinishedHomeworkClientCopy(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  return (
    /homework was not finished/i.test(text) ||
    /unfinished prep/i.test(text) ||
    /live plan now carries the unfinished/i.test(text)
  );
}

export function studentSafeAssignmentInstructions(
  value: string | null | undefined,
): string {
  if (!isUnfinishedHomeworkClientCopy(value)) return value?.trim() || "";
  return "Work up to 15 of these items together. You can submit for results without answering every question.";
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
    correctAnswer?: string | null;
    explanation?: string | null;
    skill?: string | null;
    domain?: string | null;
    difficulty?: string | null;
    tags?: string[] | null;
    extractGaps?: Record<string, unknown> | null;
  },
  assignmentQuestion: { position: number; predictionFirst?: boolean | null },
  options?: { includeKeys?: boolean; repairStackedMath?: boolean },
) {
  const repairMath = (text: string) =>
    repairMichelleQuizMathText(text, Boolean(options?.repairStackedMath));
  const existingChoices = assignmentChoices(question.choices);
  const facing = studentFacingFigurePrimaryFields({
    prompt: question.prompt,
    stimulus: question.stimulus,
    choices: existingChoices ?? [],
    questionType: question.questionType,
    correctAnswer: question.correctAnswer,
    tags: question.tags,
    extractGaps: question.extractGaps,
  });
  const usableFacing = facing.choices && hasUsableChoiceText(facing.choices) ? facing.choices : undefined;
  const recoveredChoices =
    existingChoices && hasUsableChoiceText(existingChoices) ? existingChoices : usableFacing;
  const figurePrimary = facing.presentation === "figure_primary";
  const rawType = question.questionType?.trim() || "multiple_choice";
  const questionType = figurePrimary
    ? facing.questionType || "mcq"
    : recoveredChoices && recoveredChoices.length > 0
      ? "multiple_choice"
      : facing.questionType || rawType;
  const rawChoices = facing.choices ?? recoveredChoices;
  const shaped = {
    id: question.id,
    position: assignmentQuestion.position,
    subject: question.subject?.trim() || "SAT",
    questionType,
    prompt: figurePrimary
      ? repairMath(facing.prompt)
      : repairMath(stripBankFigureComments(facing.prompt) || "Question prompt is unavailable."),
    stimulus: figurePrimary
      ? facing.stimulus
        ? repairMath(facing.stimulus)
        : facing.stimulus
      : facing.stimulus
        ? repairMath(stripBankFigureComments(facing.stimulus))
        : null,
    choices: rawChoices?.map((choice) => ({ ...choice, text: repairMath(choice.text) })),
    skill: skillLabelForBank({
      skill: question.skill,
      domain: question.domain,
      subject: question.subject,
    }),
    difficulty: assignmentDifficulty(question.difficulty),
    predictionFirst: Boolean(assignmentQuestion.predictionFirst),
    presentation: facing.presentation,
  };
  if (!options?.includeKeys) return shaped;
  return {
    ...shaped,
    correctAnswer: question.correctAnswer?.trim() || "",
    explanation: repairMath(question.explanation?.trim() || ""),
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

/** Xavier capability-test scaffolding — session or "60-minute SAT pre-work — SAT capability test — Xavier". */
export function isXavierSatCapabilityCopy(title?: string | null): boolean {
  return (title ?? "").includes("SAT capability test — Xavier");
}

export function studentOwnsSessionAssignment(
  sessionClientUserId: string | null | undefined,
  studentUserId: string,
): boolean {
  return Boolean(sessionClientUserId) && sessionClientUserId === studentUserId;
}

function isTaitoStudentEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === TAITO_STUDENT_EMAIL;
}

/**
 * Students/viewers only see homework on their own sessions.
 * Taito never sees Xavier capability-test scaffolding, even if a leftover
 * seed still lists him as the capability-session client.
 */
export function studentCanListAssignment(input: {
  role?: string | null;
  studentUserId: string;
  studentEmail?: string | null;
  sessionClientUserId?: string | null;
  sessionTitle?: string | null;
  assignmentTitle?: string | null;
}): boolean {
  const role = input.role ?? "";
  if (role !== "student" && role !== "viewer") return true;
  if (!studentOwnsSessionAssignment(input.sessionClientUserId, input.studentUserId)) {
    return false;
  }
  const capability =
    isXavierSatCapabilityCopy(input.sessionTitle) ||
    isXavierSatCapabilityCopy(input.assignmentTitle);
  if (capability && isTaitoStudentEmail(input.studentEmail)) {
    return false;
  }
  return true;
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
