import {
  isFullLengthDiagnosticAssignment,
  pickDiagnosticKeeper,
} from "./assignment-visibility.ts";
import { isPostSessionFollowUpTitle } from "./post-session-follow-up.ts";
import {
  inferSessionPreworkKind,
  sessionPreworkDedupeSlot,
  sessionPreworkSubjectFamily,
} from "./session-prework-dedupe.ts";

export const IN_SESSION_HOMEWORK_COMPLETION_TITLE = "In-session homework completion";
export const MAX_IN_SESSION_HOMEWORK_QUESTIONS = 15;

export type SessionHomeworkCandidate = {
  deliveryPhase?: string | null;
  status?: string | null;
  title?: string | null;
};

/** Session homework status lists: one row per assignment, no archived leftovers. */
export type StatusHomeworkCandidate = {
  id?: string;
  assignmentId?: string;
  title?: string | null;
  status?: string | null;
  subject?: string | null;
  homeworkKind?: string | null;
  questionCount?: number | null;
  attemptCount?: number | null;
  deliveryPhase?: string | null;
  createdAt?: Date | string | number | null;
  /**
   * `session_prework_plans.assignmentId` for this row's session.
   * A bank pre-work stays beside seeded topic homework only when it is this id.
   */
  planAssignmentId?: string | null;
};

export function statusHomeworkId(item: StatusHomeworkCandidate): string | null {
  return item.assignmentId ?? item.id ?? null;
}

/** Same-title or same full-length diagnostic copies left by reset/reassign. */
export function isDuplicateSessionPrework(
  keeper: StatusHomeworkCandidate,
  candidate: StatusHomeworkCandidate,
): boolean {
  const keeperId = statusHomeworkId(keeper);
  const candidateId = statusHomeworkId(candidate);
  if (!keeperId || !candidateId || keeperId === candidateId) return false;
  if (candidate.status === "archived") return false;
  if (
    candidate.deliveryPhase === "during_session" ||
    keeper.deliveryPhase === "during_session"
  ) {
    return false;
  }
  const keeperDiagnostic = isFullLengthDiagnosticAssignment({
    title: keeper.title,
    homeworkKind: keeper.homeworkKind,
    questionCount: keeper.questionCount,
  });
  const candidateDiagnostic = isFullLengthDiagnosticAssignment({
    title: candidate.title,
    homeworkKind: candidate.homeworkKind,
    questionCount: candidate.questionCount,
  });
  if (keeperDiagnostic && candidateDiagnostic) return true;
  const keeperTitle = keeper.title?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  const candidateTitle = candidate.title?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (Boolean(keeperTitle) && keeperTitle === candidateTitle) return true;
  const keeperSlot = sessionPreworkDedupeSlot(keeper.title);
  const candidateSlot = sessionPreworkDedupeSlot(candidate.title);
  if (
    keeperSlot !== null &&
    keeperSlot === candidateSlot &&
    inferSessionPreworkKind(keeper) === inferSessionPreworkKind(candidate) &&
    sessionPreworkSubjectFamily(keeper) === sessionPreworkSubjectFamily(candidate) &&
    sessionPreworkSubjectFamily(keeper) !== "other"
  ) {
    return true;
  }
  return false;
}

function listedCreatedAtMs(value: StatusHomeworkCandidate["createdAt"]): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** The plan's chosen bank pre-work. It stays listed beside seeded topic homework. */
function isPlanChosenBankPrework(item: StatusHomeworkCandidate): boolean {
  const id = statusHomeworkId(item);
  if (!id || !item.planAssignmentId || id !== item.planAssignmentId) return false;
  return sessionPreworkDedupeSlot(item.title) === "sat-bank-prework";
}

/**
 * List collapse. Same-slot copies still collapse. A bank pre-work that is not
 * the session plan also collapses with seeded topic homework (the pre-slot rule),
 * so extra bank copies stay hidden.
 */
function collapsesWithListedHomework(
  keeper: StatusHomeworkCandidate,
  candidate: StatusHomeworkCandidate,
): boolean {
  if (isDuplicateSessionPrework(keeper, candidate)) return true;
  if (candidate.status === "archived" || keeper.status === "archived") return false;
  if (
    candidate.deliveryPhase === "during_session" ||
    keeper.deliveryPhase === "during_session"
  ) {
    return false;
  }
  const keeperSlot = sessionPreworkDedupeSlot(keeper.title);
  const candidateSlot = sessionPreworkDedupeSlot(candidate.title);
  if (keeperSlot === null || candidateSlot === null || keeperSlot === candidateSlot) {
    return false;
  }
  return (
    inferSessionPreworkKind(keeper) === inferSessionPreworkKind(candidate) &&
    sessionPreworkSubjectFamily(keeper) === sessionPreworkSubjectFamily(candidate) &&
    sessionPreworkSubjectFamily(keeper) !== "other"
  );
}

/**
 * Has questions, then attempts, then createdAt, then id.
 * createdAt replaces the largest-id tie-break. An untouched newer copy does
 * not outrank homework the student already started.
 */
function pickListedStatusKeeper<T extends StatusHomeworkCandidate>(current: T, incoming: T): T {
  const currentQuestions = (current.questionCount ?? 0) > 0 ? 1 : 0;
  const incomingQuestions = (incoming.questionCount ?? 0) > 0 ? 1 : 0;
  if (incomingQuestions !== currentQuestions) {
    return incomingQuestions > currentQuestions ? incoming : current;
  }
  const attemptDelta = (incoming.attemptCount ?? 0) - (current.attemptCount ?? 0);
  if (attemptDelta !== 0) return attemptDelta > 0 ? incoming : current;
  const createdDelta = listedCreatedAtMs(incoming.createdAt) - listedCreatedAtMs(current.createdAt);
  if (createdDelta !== 0) return createdDelta > 0 ? incoming : current;
  const currentId = statusHomeworkId(current) ?? "";
  const incomingId = statusHomeworkId(incoming) ?? "";
  return incomingId.localeCompare(currentId) > 0 ? incoming : current;
}

/**
 * Student/tutor Homework status & results: hide archived reset leftovers,
 * dedupe by assignment id, and keep one current full-length diagnostic.
 */
export function selectStatusHomework<T extends StatusHomeworkCandidate>(
  items: readonly T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const id = statusHomeworkId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (item.status === "archived") continue;
    unique.push(item);
  }
  const diagnostics = unique.filter((item) =>
    isFullLengthDiagnosticAssignment({
      title: item.title,
      homeworkKind: item.homeworkKind,
      questionCount: item.questionCount,
    }),
  );
  const afterDiagnostics = (() => {
    if (diagnostics.length <= 1) return unique;
    const keeper = pickDiagnosticKeeper(
      diagnostics.map((item) => ({
        id: statusHomeworkId(item)!,
        status: item.status ?? "published",
        questionCount: item.questionCount ?? 0,
        attemptCount: item.attemptCount ?? 0,
      })),
    );
    const keeperId = keeper?.id;
    return unique.filter((item) => {
      const isDiagnostic = isFullLengthDiagnosticAssignment({
        title: item.title,
        homeworkKind: item.homeworkKind,
        questionCount: item.questionCount,
      });
      return !isDiagnostic || statusHomeworkId(item) === keeperId;
    });
  })();
  const planChosenBanks = afterDiagnostics.filter(isPlanChosenBankPrework);
  const planChosenIds = new Set(
    planChosenBanks
      .map((item) => statusHomeworkId(item))
      .filter((id): id is string => Boolean(id)),
  );
  const collapsible = afterDiagnostics.filter(
    (item) => !planChosenIds.has(statusHomeworkId(item) ?? ""),
  );
  const kept: T[] = [];
  for (const item of collapsible) {
    const duplicateOf = kept.find((keeper) => collapsesWithListedHomework(keeper, item));
    if (!duplicateOf) {
      kept.push(item);
      continue;
    }
    if (pickListedStatusKeeper(duplicateOf, item) !== duplicateOf) {
      const index = kept.indexOf(duplicateOf);
      kept.splice(index, 1, item);
    }
  }
  for (const pinned of planChosenBanks) {
    const id = statusHomeworkId(pinned);
    if (!id || kept.some((item) => statusHomeworkId(item) === id)) continue;
    kept.push(pinned);
  }
  return kept;
}

export type WrongAnswerCandidate = {
  correct: boolean;
};

export function wrongAnswersOnly<T extends WrongAnswerCandidate>(items: readonly T[]): T[] {
  return items.filter((item) => item.correct === false);
}

export function isInSessionHomeworkCompletion(input: {
  deliveryPhase?: string | null;
  title?: string | null;
}): boolean {
  return (
    input.deliveryPhase === "during_session" &&
    (input.title ?? "").trim() === IN_SESSION_HOMEWORK_COMPLETION_TITLE
  );
}

/** Immediate Check answer is only for live session work, never timed pre-work/diagnostics. */
export function allowsInSessionPerQuestionFeedback(input: {
  deliveryPhase?: string | null;
}): boolean {
  return input.deliveryPhase === "during_session";
}

/** Prefer unanswered homework items, then the rest of the set, never more than 15. */
export function selectInSessionHomeworkQuestionIds(
  sourceQuestionIds: readonly string[],
  options: {
    unansweredIds?: readonly string[];
    alreadyAttachedIds?: readonly string[];
    maxCount?: number;
  } = {},
): string[] {
  const maxCount = options.maxCount ?? MAX_IN_SESSION_HOMEWORK_QUESTIONS;
  const already = new Set(options.alreadyAttachedIds ?? []);
  const remainingSlots = Math.max(0, maxCount - already.size);
  if (remainingSlots === 0) return [];
  const source = sourceQuestionIds.filter((id) => !already.has(id));
  const unansweredSet = new Set(options.unansweredIds ?? []);
  const unanswered = source.filter((id) => unansweredSet.has(id));
  const rest = source.filter((id) => !unansweredSet.has(id));
  return [...unanswered, ...rest].slice(0, remainingSlots);
}

/** Prefer the live session pre-work copy. Archived replace/remove leftovers must not hide missed items. */
export function selectActivePrework<T extends SessionHomeworkCandidate>(
  assignments: readonly T[],
): T | null {
  return (
    assignments.find(
      (item) =>
        item.deliveryPhase === "before_session" &&
        item.status !== "archived" &&
        !isPostSessionFollowUpTitle(item.title),
    ) ?? null
  );
}

/** Show Clear & redo for live homework that has any attempt, including empty/glitched in-session work. */
export function canShowClearHomework(input: {
  deliveryPhase?: string | null;
  assignmentStatus?: string | null;
  attemptId?: string | null;
}): boolean {
  if (input.assignmentStatus === "archived") return false;
  return Boolean(input.attemptId);
}

export function hydrateMistakePrompts<T extends { questionId: string; prompt?: string | null }>(
  mistakes: readonly T[],
  promptsByQuestionId: Map<string, string>,
): Array<T & { prompt: string }> {
  return mistakes.map((item) => ({
    ...item,
    prompt: item.prompt?.trim() || promptsByQuestionId.get(item.questionId) || "",
  }));
}
